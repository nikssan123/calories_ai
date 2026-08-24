import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  BarcodeLogRequest,
  ChatRequest,
  DeleteAccountRequest,
  ExerciseCategory,
  LogFoodRequest,
  Meal,
  METERS,
  PhotoUploadRequest,
  SaveRoutineRequest,
  SaveScheduleRequest,
  ProfileUpdate,
  RepeatRequest,
  WorkoutRequest,
  type Allowance,
  type Entitlements,
} from '@ct/shared';
import { authDescription } from '../ai/client.ts';
import { authErrorFor, laneFor } from '../ai/providers/index.ts';
import { env } from '../env.ts';
import { generateWeeklyReview } from '../ai/review.ts';
import { runTurn, type RunTurnInput } from '../ai/run.ts';
import { exerciseCard, foodCard } from '../ai/tools.ts';
import { itemShape } from '../ai/shapes.ts';
import { sendAccountDeletedEmail } from '../email/notify.ts';
import {
  fetchReceivedEmail,
  isReceivedEmail,
  parseAddress,
  verifyWebhookSignature,
} from '../email/inbound.ts';
import { verifyUnsubscribe } from '../email/unsubscribe.ts';
import {
  BarcodeUnavailableError,
  InvalidBarcodeError,
  InvalidPortionError,
  logScannedProduct,
  lookupBarcode,
  portionPhrase,
} from '../services/barcode.ts';
import { attachBody, recordBodyFailure, recordSupportEmail } from '../services/support.ts';
import { deleteAccount } from '../services/admin.ts';
import { proposeTargets } from '../services/adaptive.ts';
import { insertMessage, listMessages } from '../services/chat.ts';
import { mealTemplates, repeatFoodEntry } from '../services/history.ts';
import {
  claimPhoto,
  presignPhotoRead,
  readPhoto,
  readPhotoById,
  reservePhotoUpload,
  savePhoto,
  verifyPhotoUrl,
  type PhotoDelivery,
} from '../services/photos.ts';
import { EMAIL_UNSUBSCRIBE_SECRET, getSecret, PHOTO_URL_SECRET } from '../services/secrets.ts';
import { SESSION_COOKIE } from '../services/auth.ts';
import {
  createFoodEntry,
  deleteExerciseEntry,
  deleteFoodEntry,
  DuplicateEntryError,
  getFoodEntry,
  latestWeight,
  logWeight,
  updateFoodEntry,
} from '../services/log.ts';
import { buildFullReviewStats, latestReview, listReviews } from '../services/reviews.ts';
import { buildCalendar, buildExerciseSummary } from '../services/calendar.ts';
import { buildDaySummary, buildProgress, currentLocalDate } from '../services/summary.ts';
import { calculateTargets, setTargets, targetsForDate } from '../services/targets.ts';
import {
  authenticate,
  findUserByEmail,
  getUser,
  getUserContext,
  markOnboarded,
  missingProfileFields,
  setNudgeEmails,
  setWeeklyReviewEmails,
  updateUser,
} from '../services/user.ts';
import { forgetPushToken, registerPushToken } from '../services/push-tokens.ts';
import { applyEvent, type RevenueCatEvent } from '../services/billing.ts';
import { limitsFor, tiers } from '../services/plans.ts';
import {
  allowanceFor,
  PlanLimitError,
  requireAllowance,
  turnsInWindow,
} from '../services/usage.ts';
import { lastWorkout, listExerciseTypes, logWorkout, updateWorkout } from '../services/workouts.ts';
import {
  deleteRoutine,
  listRoutines,
  saveRoutine,
  saveSchedule,
  weekSchedule,
} from '../services/routines.ts';
import { messageActions, refreshEntryCards, replaceActions } from '../services/chat.ts';
import { TurnInProgressError } from '../services/turn-lock.ts';
import { ModelBusyError } from '../ai/token-bucket.ts';
import { addDays, dateRange, inferMeal, localDateFor } from '../time.ts';
import { stripDataUrl } from './body.ts';
import { openEventStream } from './sse.ts';
import { BARCODE_BURST, CHAT_LIMIT, DELETE_ACCOUNT_LIMIT, REVIEW_BURST } from './limits.ts';

/**
 * The three ways a scan can fail, told apart.
 *
 * A code that did not scan cleanly and a portion that cannot be resolved are
 * both the caller's to fix, so they are 400s carrying the sentence to show. An
 * unreachable catalogue is nobody's fault and is deliberately *not* a 404 — the
 * client's miss path says "nobody has catalogued that", which would be a lie
 * about an outage and would send someone hunting for a product that is there.
 */
function barcodeFailure(error: unknown, reply: FastifyReply) {
  if (error instanceof InvalidBarcodeError || error instanceof InvalidPortionError) {
    return reply.status(400).send({ error: error.message });
  }
  if (error instanceof BarcodeUnavailableError) {
    return reply.status(502).send({ error: error.message });
  }
  throw error;
}

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true,
    auth: authDescription(),
  }));

  // ---- The core loop -------------------------------------------------------

  /**
   * Everything a turn needs, or the reply that says why it cannot have one.
   *
   * Shared by `/chat` and `/chat/stream` because the two differ only in how the
   * answer comes back — the validation, the auth check and the photo write are
   * the same work, and the day they disagree about which formats are allowed or
   * where a photo is stored is a bug nobody would think to look for.
   *
   * The photo is saved here rather than inside the turn so it survives a turn
   * that fails: the bytes are already uploaded, and making somebody take the
   * picture again because the model was busy is the wrong trade.
   */
  async function prepareTurn(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ input: RunTurnInput; allowance: Allowance } | null> {
    const parsed = ChatRequest.safeParse(request.body);
    if (!parsed.success) {
      await reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return null;
    }

    const { userId, ...ctx } = await getUserContext(request.userId!);
    const profile = await getUser(userId);

    // After the profile rather than before it, because the lane is now a
    // per-user decision and the question is whether *their* lane can run — not
    // whether Claude credentials of some kind exist somewhere. The old form was
    // a Claude-shaped question asked on behalf of whichever provider is
    // configured, and it 503s a correctly configured `openai` deployment.
    const authError = authErrorFor(laneFor(profile.email));
    if (authError) {
      await reply.status(503).send({ error: authError });
      return null;
    }

    /*
     * The entitlement, before anything is claimed, presigned or decoded.
     *
     * A photo turn and a text turn spend different meters — a scan costs six
     * times a message — so which one is being asked for has to be decided here
     * rather than inside `runTurn`, where the bytes have already been fetched.
     * `photo_key`/`photo_base64` is the same signal `runTurn` uses to pick the
     * turn kind, read one step earlier.
     *
     * 402 rather than 429. The client has to tell "your plan is spent" from
     * "you are going too fast", because the first is a paywall and the second
     * is a retry, and answering both with the same status is how a limit ends
     * up looking like a bug. The allowance rides along so the screen can say
     * what was spent and when it comes back without asking a second endpoint.
     */
    const wantsPhoto = Boolean(parsed.data.photo_key || parsed.data.photo_base64);
    let allowance: Allowance;
    try {
      allowance = await requireAllowance(userId, profile.plan, wantsPhoto ? 'photo' : 'chat');
    } catch (error) {
      if (error instanceof PlanLimitError) {
        await reply.status(402).send({ error: error.message, allowance: error.allowance });
        return null;
      }
      throw error;
    }

    /*
     * Two ways in, and the difference is only where the bytes came from.
     *
     * `photo_key` names an object the client already PUT to the bucket, so
     * nothing multi-megabyte was ever in this request. The model still needs the
     * bytes, so they are read back here — but read back from the bucket in one
     * hop, rather than carried through a JSON body a third larger than the file
     * while an API worker waits on a phone's uplink.
     *
     * `photo_base64` is the older way and stays: a local-disk deployment has no
     * bucket to upload to, and an app already on somebody's phone goes on
     * speaking it.
     */
    const mediaType = parsed.data.photo_media_type ?? 'image/jpeg';
    let photo: RunTurnInput['photo'] = null;

    if (parsed.data.photo_key) {
      const claimed = await claimPhoto(userId, parsed.data.photo_key, mediaType);
      if (!claimed?.storageKey) {
        await reply.status(400).send({ error: 'That photo upload could not be found.' });
        return null;
      }
      // A presigned read rather than the bytes. They went phone-to-bucket on the
      // way in and go bucket-to-model on the way out, so the whole image never
      // enters this process in either direction.
      const url = await presignPhotoRead(claimed.storageKey);
      if (!url) {
        await reply.status(400).send({ error: 'That photo upload could not be read.' });
        return null;
      }
      photo = { id: claimed.id, mediaType, url };
    } else if (parsed.data.photo_base64) {
      /*
       * Bytes, which is either a local-disk deployment doing the only thing it
       * can or a client whose upload failed. The second is worth a line in the
       * log: it is invisible from the outside — the meal still gets logged —
       * and a bucket that has stopped accepting writes would otherwise be
       * noticed only by whoever next read the bandwidth bill.
       */
      if (parsed.data.photo_upload_failed) {
        request.log.warn(
          { userId },
          'photo upload to the bucket failed; the client fell back to base64',
        );
      }
      const base64 = stripDataUrl(parsed.data.photo_base64);
      const saved = await savePhoto(userId, mediaType, base64);
      photo = { id: saved.id, mediaType, base64 };
    }

    /*
     * The allowance rides back out with the reply, and it is the *post*-turn
     * number: `requireAllowance` counted what had been spent before this turn
     * was permitted, and this turn is about to be spent. Adding one here rather
     * than counting again after the fact is not a shortcut — the ledger row is
     * written inside `runTurn`, so a second count would race it and could
     * truthfully report a turn that has already happened as not having.
     */
    return {
      input: { userId, ctx, profile, text: parsed.data.text, photo },
      allowance: { ...allowance, used: allowance.used + 1 },
    };
  }

  /*
   * One ceiling across both chat routes, not one each.
   *
   * @fastify/rate-limit keeps a separate counter per *route config*, so the
   * obvious `config: { rateLimit: CHAT_LIMIT }` on each of `/chat` and
   * `/chat/stream` would hand every account two buckets of forty and a client
   * that alternated between them eighty turns an hour. That is the same trap
   * `RECIPE_BURST` documents in `limits.ts`, and it is invisible: each route
   * enforces exactly the number it was given.
   *
   * `app.rateLimit()` builds a standalone limiter whose store is keyed on
   * nothing route-specific, so attaching the *same* handler to both routes puts
   * them in one bucket — which is what a "turns per hour" entitlement has to
   * mean. Built once, deliberately: a second call would allocate a second
   * in-process cache and quietly restore the bug.
   *
   * On `onRequest` rather than `preHandler` so a throttled photo turn is
   * refused before twenty-five megabytes of base64 are parsed.
   */
  const chatLimit = app.rateLimit(CHAT_LIMIT);

  app.post('/chat', { onRequest: chatLimit }, async (request, reply) => {
    const prepared = await prepareTurn(request, reply);
    if (!prepared) return reply;

    try {
      return { ...(await runTurn(prepared.input)), allowance: prepared.allowance };
    } catch (error) {
      // Not a failure, and not logged as one: they have a turn in flight and
      // pressed send again. A fast, honest rejection is the right answer for a
      // path somebody is watching — queueing it would move the wait, not
      // remove it.
      if (error instanceof TurnInProgressError) {
        return reply.status(429).send({ error: error.message });
      }
      /*
       * The same answer, for the other reason a turn is refused before it
       * starts: the model's per-minute token budget is spent. Not a failure
       * either — at the volumes the metered lane exists to serve, being briefly
       * over the ceiling is ordinary operation — and it carries a `retry-after`
       * because unlike the turn lease, this one knows exactly when capacity
       * returns.
       */
      if (error instanceof ModelBusyError) {
        return reply
          .status(429)
          .header('retry-after', String(error.retryAfterSeconds))
          .send({ error: error.message });
      }
      request.log.error({ err: error }, 'chat turn failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  /**
   * The same turn, told as it happens.
   *
   * A turn is twenty seconds. Silence for twenty seconds reads as broken, and a
   * long photo turn is also where an idle proxy starts thinking about closing
   * the connection. Both are answered by saying something.
   *
   * A separate route rather than content negotiation on `/chat`: the plain one
   * is what the native client and every script use, and a route that changes
   * shape depending on a header is a route that gets tested in one shape and
   * deployed in the other. They share `prepareTurn` and `runTurn`, which is
   * where all the behaviour actually lives.
   *
   * Two things about the shape are load-bearing.
   *
   * **The head is written late.** Once a 200 and `text/event-stream` are on the
   * wire the status is spent, and every failure after that has to be an event
   * inside a successful response — which is a worse answer for the failures
   * that arrive *before* anything has been sent. Both refusals are of that
   * kind: the turn lease rejects a double-tapped send before the provider is
   * called at all, and the token bucket rejects a turn there is no per-minute
   * budget for before anything goes on the wire. Deferring the head until the
   * first event keeps both of them real 429s with a real `retry-after`,
   * exactly as on `/chat`.
   *
   * **A vanished reader does not cancel the turn.** The tools have already
   * written to the log by the time most of this is streamed, and the message is
   * committed at the very end; abandoning a turn because a phone changed
   * network would leave the meal logged and the reply lost. So writes go quiet
   * and the turn runs to completion — which is precisely what `reconcile` in
   * the web client comes back to find.
   */
  app.post('/chat/stream', { onRequest: chatLimit }, async (request, reply) => {
    const prepared = await prepareTurn(request, reply);
    if (!prepared) return reply;

    const stream = openEventStream(request, reply);

    try {
      const turn = await runTurn(prepared.input, (event) => stream.send(event));
      const response = { ...turn, allowance: prepared.allowance };
      stream.send({ type: 'done', response });
      return stream.close();
    } catch (error) {
      if (!stream.started) {
        // Nothing has gone out yet, so the status line is still ours to write
        // and these stay ordinary HTTP failures.
        if (error instanceof TurnInProgressError) {
          return reply.status(429).send({ error: error.message });
        }
        if (error instanceof ModelBusyError) {
          return reply
            .status(429)
            .header('retry-after', String(error.retryAfterSeconds))
            .send({ error: error.message });
        }
        request.log.error({ err: error }, 'chat turn failed');
        return reply.status(502).send({ error: (error as Error).message });
      }
      request.log.error({ err: error }, 'chat turn failed mid-stream');
      stream.send({ type: 'error', error: (error as Error).message });
      return stream.close();
    }
  });

  app.get('/chat/history', async (request) => {
    const limit = Number((request.query as any)?.limit ?? 50);
    return { messages: await listMessages(request.userId!, Number.isFinite(limit) ? limit : 50) };
  });

  // ---- Today / Progress ----------------------------------------------------

  app.get('/day', async (request) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const date = (request.query as any)?.date as string | undefined;
    const localDate = date ?? (await currentLocalDate(ctx));
    return buildDaySummary(userId, localDate);
  });

  /**
   * A meal typed in rather than described.
   *
   * The only create path on the API that needs neither a model nor a
   * catalogue, which is what makes it the one an offline phone can queue. See
   * OFFLINE.md — the outbox is built on this route behaving well when it is
   * called twice with the same `client_id`.
   *
   * `confidence: 'high'` is not flattery. Every other source is an estimate of
   * what somebody ate; this is somebody stating it. The figures are as good as
   * whatever they read them off, and the app has no grounds to second-guess a
   * number a person typed on purpose.
   *
   * No chat card is written. A manual entry is not a turn — nothing in the
   * conversation asked a question this answers, and inventing a message so the
   * journal has something to show would put words in the model's mouth.
   */
  app.post('/entries/food', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const parsed = LogFoodRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid entry' });
    }

    const eatenAt = parsed.data.eaten_at ? new Date(parsed.data.eaten_at) : new Date();
    if (Number.isNaN(eatenAt.getTime())) {
      return reply.status(400).send({ error: 'That is not a time we can read.' });
    }

    try {
      const entry = await createFoodEntry({
        userId,
        meal: parsed.data.meal ?? inferMeal(eatenAt, ctx.timezone),
        eatenAt,
        description: parsed.data.description,
        note: parsed.data.note ?? null,
        confidence: 'high',
        source: 'manual',
        photoId: null,
        items: parsed.data.items,
        clientId: parsed.data.client_id ?? null,
        ctx,
      });
      return reply.status(201).send(entry);
    } catch (error) {
      /*
       * 409 rather than a retry-shaped status on purpose. The key was spent and
       * the entry it was spent on is gone, which means the user deleted the
       * meal while its own retry was in flight. There is nothing to send back
       * and nothing for the client to fix — it should drop the intent, not keep
       * trying to resurrect a meal somebody removed.
       */
      if (error instanceof DuplicateEntryError) {
        return reply.status(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get('/progress', async (request) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const days = Math.min(Math.max(Number((request.query as any)?.days ?? 30), 7), 365);
    return buildProgress(userId, ctx, days);
  });

  app.get('/progress/exercise', async (request) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const days = Math.min(Math.max(Number((request.query as any)?.days ?? 30), 7), 365);
    return buildExerciseSummary(userId, ctx, days);
  });

  /**
   * A window of days for the History grid. Bounded at a year: the grid is drawn
   * a month at a time, and an unbounded range is a full table scan per cell.
   */
  app.get('/calendar', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const q = request.query as any;
    const today = await currentLocalDate(ctx);
    const to = isDate(q?.to) ? q.to : today;
    const from = isDate(q?.from) ? q.from : addDays(to, -34);

    if (from > to) return reply.status(400).send({ error: '`from` is after `to`.' });
    if (dateRange(from, to).length > 366) {
      return reply.status(400).send({ error: 'Range is longer than a year.' });
    }
    return buildCalendar(userId, from, to);
  });

  // ---- Manual corrections -----------------------------------------------------

  /*
   * A card is submitted from memory, and memory is wrong about the third set.
   *
   * Everything the journal draws as a receipt can be corrected here without
   * going through the model: the user already knows what they meant, and asking
   * a language model to re-read "make that 8 reps not 10" is a slower and less
   * reliable way to change one integer. The model keeps its own correction
   * tools for the conversational case — this is for the card that is already on
   * screen with the wrong number on it.
   *
   * These are PATCHes onto the existing row rather than a delete and a re-log.
   * The entry id is pointed at from the journal, from a routine and from the
   * day's totals, and a correction that mints a new id silently orphans all
   * three.
   */

  const FoodPatch = z.object({
    meal: Meal.optional(),
    description: z.string().min(1).optional(),
    eaten_at: z.string().optional(),
    confidence: z.enum(['high', 'medium', 'low']).optional(),
    note: z.string().nullable().optional(),
    /**
     * The complete corrected item list, or absent to leave the food alone.
     *
     * Whole-list rather than per-item, for the same reason the model's
     * `update_food_entry` works this way: an item has no identity worth
     * addressing — it is "the rice" until the moment somebody splits it in two
     * — so a patch that tried to name one would need an id the client has no
     * stable way to hold.
     */
    items: z.array(z.object(itemShape)).min(1).optional(),
  });

  app.patch('/entries/food/:id', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const id = (request.params as any).id as string;
    const parsed = FoodPatch.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid patch' });

    const updated = await updateFoodEntry(userId, id, {
      meal: parsed.data.meal,
      description: parsed.data.description,
      confidence: parsed.data.confidence,
      note: parsed.data.note,
      items: parsed.data.items,
      eatenAt: parsed.data.eaten_at ? new Date(parsed.data.eaten_at) : undefined,
      ctx,
    });
    if (!updated) return reply.status(404).send({ error: 'Entry not found' });

    /*
     * The journal is redrawn to match. A correction is not a turn, so nothing
     * in the conversation would otherwise hear about it, and the card that
     * logged this meal would go on showing the figure it was logged with while
     * the Today screen shows the corrected one.
     */
    await refreshEntryCards(
      userId,
      updated.id,
      foodCard(updated, await buildDaySummary(userId, updated.local_date), ctx.units),
      `${updated.meal}: ${updated.description} — ${Math.round(updated.kcal)} kcal`,
    );
    return updated;
  });

  /**
   * A counted session, corrected.
   *
   * Takes the same body the card posted in the first place, because it is the
   * same card: an edit reopens the form with its own answers in it, and what
   * comes back is a whole session rather than a diff. `message_id` is ignored
   * here — the message that asked the question was rewritten into a receipt
   * when the session was first logged, and there is no question left to answer.
   */
  app.patch('/entries/exercise/:id', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const parsed = WorkoutRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid workout' });
    }

    const entry = await updateWorkout({
      entryId: (request.params as any).id as string,
      userId,
      category: parsed.data.category,
      exercises: parsed.data.exercises,
      durationMin: parsed.data.duration_min ?? null,
      performedAt: parsed.data.performed_at ? new Date(parsed.data.performed_at) : undefined,
      routineId: parsed.data.routine_id ?? null,
      ctx,
    });
    if (!entry) return reply.status(404).send({ error: 'Entry not found' });

    // Same as the meal above: redraw the receipt this session already left in
    // the conversation, or it goes on showing the sets it was logged with.
    await refreshEntryCards(
      userId,
      entry.id,
      exerciseCard(entry),
      `${entry.description} — ~${Math.round(entry.kcal_burned)} kcal`,
    );
    return entry;
  });

  /*
   * Where to reach this person's phone.
   *
   * Registered on every cold start the app has permission for, not once at
   * install: a token is not permanent — a reinstall, a restore from backup or a
   * cleared app can mint a new one — and an address that is only ever written
   * down once is an address that goes stale silently.
   *
   * The upsert is on the token, so signing into a second account on the same
   * phone moves the device rather than duplicating it. Nobody should ever be
   * buzzed with somebody else's food log.
   */
  app.post('/notifications/device', async (request, reply) => {
    const userId = request.userId!;
    const body = (request.body ?? {}) as { token?: unknown; platform?: unknown };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const platform = body.platform;
    if (!token) return reply.status(400).send({ error: 'A token is required' });
    if (platform !== 'ios' && platform !== 'android') {
      return reply.status(400).send({ error: 'platform must be ios or android' });
    }
    await registerPushToken(userId, { token, platform });
    return { ok: true };
  });

  /*
   * Signing out gives the address up.
   *
   * Not merely tidy: the phone keeps its token across accounts, so a device
   * left registered to the person who just signed out would keep buzzing with
   * their nudges in somebody else's pocket.
   */
  app.delete('/notifications/device', async (request, reply) => {
    const userId = request.userId!;
    const body = (request.body ?? {}) as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) return reply.status(400).send({ error: 'A token is required' });
    await forgetPushToken(userId, token);
    return { ok: true };
  });

  app.delete('/entries/food/:id', async (request, reply) => {
    const userId = request.userId!;
    const ok = await deleteFoodEntry(userId, (request.params as any).id);
    if (!ok) return reply.status(404).send({ error: 'Entry not found' });
    return { ok: true };
  });

  app.delete('/entries/exercise/:id', async (request, reply) => {
    const userId = request.userId!;
    const ok = await deleteExerciseEntry(userId, (request.params as any).id);
    if (!ok) return reply.status(404).send({ error: 'Entry not found' });
    return { ok: true };
  });

  app.get('/entries/food/:id', async (request, reply) => {
    const userId = request.userId!;
    const entry = await getFoodEntry(userId, (request.params as any).id);
    if (!entry) return reply.status(404).send({ error: 'Entry not found' });
    return entry;
  });

  // ---- Repeat a meal -------------------------------------------------------

  /** The things this user actually eats, most-repeated first. */
  app.get('/history/meals', async (request) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const q = request.query as any;
    const meal = Meal.safeParse(q?.meal);

    return {
      meals: await mealTemplates(userId, ctx, {
        query: q?.query || null,
        meal: meal.success ? meal.data : null,
        daysBack: clampNumber(q?.days, 90, 1, 365),
        limit: clampNumber(q?.limit, 12, 1, 50),
      }),
    };
  });

  /** Clones a past entry to now. The copy is independent of the original. */
  app.post('/entries/food/:id/repeat', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const parsed = RepeatRequest.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid repeat request' });

    try {
      const entry = await repeatFoodEntry(userId, (request.params as any).id, ctx, {
        meal: parsed.data.meal,
        eatenAt: parsed.data.eaten_at ? new Date(parsed.data.eaten_at) : undefined,
        clientId: parsed.data.client_id,
      });
      if (!entry) return reply.status(404).send({ error: 'Entry not found' });
      return reply.status(201).send(entry);
    } catch (error) {
      if (error instanceof DuplicateEntryError) {
        return reply.status(409).send({ error: error.message });
      }
      throw error;
    }
  });

  // ---- Barcodes ------------------------------------------------------------

  /**
   * What is in the packet. Never how much of it was eaten.
   *
   * A 404 is the interesting reply rather than the error case: most of a real
   * trolley is supermarket own-brands nobody has catalogued, and the client
   * answers this one by offering to photograph the nutrition panel instead —
   * a flow that already exists and already works.
   */
  app.get('/barcode/:code', { config: { rateLimit: BARCODE_BURST } }, async (request, reply) => {
    try {
      const product = await lookupBarcode((request.params as any).code);
      if (!product) return reply.status(404).send({ error: 'Nobody has catalogued that one yet' });
      return product;
    } catch (error) {
      return barcodeFailure(error, reply);
    }
  });

  /**
   * The portion, which is the whole feature.
   *
   * Deliberately a second request rather than a `grams` parameter on the
   * lookup. A scan that could log would log the wrong amount — a barcode says
   * what is in 100g and nothing whatever about how much of the jar somebody
   * ate — so the card in between, where a person picks, is not a step to be
   * optimised away.
   *
   * No model call and no rate limit beyond the burst: the numbers came off a
   * printed label and the amount was typed by the user, so this is arithmetic.
   */
  app.post(
    '/barcode/:code/log',
    { config: { rateLimit: BARCODE_BURST } },
    async (request, reply) => {
      const parsed = BarcodeLogRequest.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid portion' });
      }

      const { userId, units, ...ctx } = await getUserContext(request.userId!);
      try {
        const product = await lookupBarcode((request.params as any).code);
        if (!product) return reply.status(404).send({ error: 'Nobody has catalogued that one yet' });

        const entry = await logScannedProduct(userId, product, {
          grams: parsed.data.grams,
          servings: parsed.data.servings,
          meal: parsed.data.meal,
          eatenAt: parsed.data.eaten_at ? new Date(parsed.data.eaten_at) : undefined,
          ctx,
          units,
        });

        /*
         * And into the conversation, which is where this app keeps what it did.
         *
         * A scan is the one log that happens without a turn — the model is not
         * called, so nothing was ever going to write it down. That left a meal
         * that appeared in the ring and the day and nowhere in the journal: a
         * hole in the record for anyone scrolling back, and no way to correct
         * the portion from the place every other meal is corrected. So the
         * server writes the message itself, carrying the same card the
         * `log_barcode` tool draws when the model does this in conversation.
         *
         * The sentence says the portion because the card cannot: a scan is one
         * item, and the card only lists items when there is more than one — so
         * "30 g" would otherwise be nowhere on screen, on the feature whose
         * entire point is the amount.
         */
        const day = await buildDaySummary(userId, entry.local_date);
        const portion = portionPhrase(entry.items[0]?.quantity_g ?? 0, parsed.data.servings, units);
        const message = await insertMessage(
          userId,
          'assistant',
          `Scanned — ${entry.description}, ${portion}.`,
          null,
          { kind: 'scan', barcode: product.barcode },
          [
            {
              kind: 'food_logged',
              entry_id: entry.id,
              summary: `${entry.meal}: ${entry.description} — ${Math.round(entry.kcal)} kcal`,
              card: foodCard(entry, day, units),
            },
          ],
        );

        return reply.status(201).send({ entry, message });
      } catch (error) {
        return barcodeFailure(error, reply);
      }
    },
  );

  // ---- Workouts ------------------------------------------------------------

  /**
   * The exercise catalogue: built-ins plus whatever this account has invented.
   * A plain database read — the picker has to be instant, and nothing here
   * needs a model.
   */
  app.get('/exercise/types', async (request) => {
    const category = (request.query as any)?.category ?? null;
    return { types: await listExerciseTypes(request.userId!, category) };
  });

  /**
   * The last session of a kind, so the card can offer it back.
   *
   * Null rather than a 404 when there isn't one: "you have not done this before"
   * is an ordinary answer to this question, not a failure, and the card draws
   * differently for it rather than showing an error.
   */
  app.get('/exercise/last', async (request, reply) => {
    const parsed = ExerciseCategory.safeParse((request.query as any)?.category);
    if (!parsed.success) return reply.status(400).send({ error: 'Unknown category' });
    return { workout: await lastWorkout(request.userId!, parsed.data) };
  });

  // ---- Routines ------------------------------------------------------------

  /**
   * The workouts this account has saved, most recently used first.
   *
   * Carries each exercise's previous numbers with it, so tapping a routine
   * fills the whole grid without a second request. That round trip is the
   * difference between the card being instant and the card being something you
   * wait for while standing in a gym.
   */
  app.get('/routines', async (request) => {
    const raw = (request.query as any)?.category ?? null;
    const category = raw === null ? null : ExerciseCategory.safeParse(raw);
    if (category && !category.success) {
      return { routines: [] };
    }
    return {
      routines: await listRoutines(request.userId!, {
        category: category ? category.data : null,
        withPrevious: true,
      }),
    };
  });

  /**
   * Saves one, or replaces the one that already has this name.
   *
   * The ordinary caller is the button on a freshly logged session, which sends
   * `from_entry_id` and a name the server suggested a moment earlier.
   */
  app.post('/routines', async (request, reply) => {
    const parsed = SaveRoutineRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid routine' });
    }
    try {
      const routine = await saveRoutine({
        userId: request.userId!,
        name: parsed.data.name,
        emoji: parsed.data.emoji ?? null,
        category: parsed.data.category ?? null,
        fromEntryId: parsed.data.from_entry_id ?? null,
        exercises: parsed.data.exercises ?? null,
        durationMin: parsed.data.duration_min ?? null,
      });
      return reply.status(201).send(routine);
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  /**
   * The training week — what they set, with what the app inferred filling in.
   *
   * Ahead of `/routines/:id` in the file so "schedule" is never read as an id.
   */
  app.get('/routines/schedule', async (request) => {
    return { week: await weekSchedule(request.userId!) };
  });

  app.put('/routines/schedule', async (request, reply) => {
    const parsed = SaveScheduleRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid schedule' });
    }
    return { week: await saveSchedule(request.userId!, parsed.data.days) };
  });

  app.delete('/routines/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const gone = await deleteRoutine(request.userId!, id);
    if (!gone) return reply.status(404).send({ error: 'No such routine' });
    return reply.status(204).send();
  });

  /**
   * A session, counted rather than described.
   *
   * No rate limit and no model call: the card collected everything already, and
   * this is arithmetic over what the user typed. That is the whole reason the
   * card exists rather than three more turns of conversation.
   */
  app.post('/exercise/workout', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const parsed = WorkoutRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid workout' });
    }

    const entry = await logWorkout({
      userId,
      category: parsed.data.category,
      exercises: parsed.data.exercises,
      durationMin: parsed.data.duration_min ?? null,
      performedAt: parsed.data.performed_at ? new Date(parsed.data.performed_at) : undefined,
      routineId: parsed.data.routine_id ?? null,
      ctx,
    });

    /*
     * Turn the question that prompted this into a receipt. Answering a card
     * has to change it, or reopening the app shows the same question again and
     * invites logging the session twice.
     */
    if (parsed.data.message_id) {
      const existing = await messageActions(userId, parsed.data.message_id);
      if (existing) {
        await replaceActions(
          userId,
          parsed.data.message_id,
          existing.map((action) =>
            action.card?.type === 'workout_prompt'
              ? {
                  kind: 'exercise_logged' as const,
                  entry_id: entry.id,
                  summary: `${entry.description} — ~${Math.round(entry.kcal_burned)} kcal`,
                  card: {
                    type: 'exercise' as const,
                    entry_id: entry.id,
                    description: entry.description,
                    confidence: entry.confidence,
                    kcal_burned: Math.round(entry.kcal_burned),
                    duration_min: entry.duration_min,
                    distance_km: entry.distance_km,
                    category: entry.category,
                    sets: entry.sets,
                  },
                }
              : action,
          ),
        );
      }
    }

    return reply.status(201).send(entry);
  });

  // ---- Weight --------------------------------------------------------------

  const WeightBody = z.object({
    weight_kg: z.number().positive().max(500),
    measured_at: z.string().optional(),
    /**
     * The day to file it under, for a correction to a past weigh-in.
     *
     * A weight row is keyed by the day rather than the instant, and that day is
     * the user's — their timezone, their `day_start_hour`. Naming it directly
     * is the only way a client can be sure a correction lands on the row it was
     * looking at; deriving it from an invented timestamp is the arithmetic that
     * puts it on the day before.
     */
    local_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  });

  app.post('/weight', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const parsed = WeightBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid weight' });

    const measuredAt = parsed.data.measured_at ? new Date(parsed.data.measured_at) : new Date();
    const entry = await logWeight(
      userId,
      parsed.data.weight_kg,
      measuredAt,
      ctx,
      parsed.data.local_date,
    );

    /*
     * A weigh-in that replaced an earlier one redraws the card that announced
     * it. The upsert keeps the row's id, so the stored action still points at
     * it — without this the journal would go on showing the figure that was
     * corrected, next to a trend that has already moved.
     */
    const trend = await buildProgress(userId, ctx, 30);
    await refreshEntryCards(
      userId,
      entry.id,
      {
        type: 'weight',
        weight_kg: entry.weight_kg,
        change_7d_kg: trend.weight.change_7d_kg,
        series: trend.weight.series,
        local_date: entry.local_date,
      },
      `Weight ${entry.weight_kg} kg on ${entry.local_date}`,
    );
    return entry;
  });

  // ---- Entitlements ---------------------------------------------------------

  /**
   * What this account is entitled to, and what the other tiers hold.
   *
   * `/entitlements` rather than the obvious `/plan`, which is already taken —
   * by the *meal* plan, in `kitchen.ts`. Registering a second `GET /plan` does
   * not shadow it or merge with it; Fastify refuses to boot at all, which is at
   * least a loud way to find out.
   *
   * The one request behind every surface that has an opinion about money: the
   * wall in the journal, the locked kitchen, the plan row in settings. All of
   * them need more than one meter at a time and two of them need the *next*
   * tier as well, so this answers the whole question rather than one fifth of
   * it five times.
   *
   * The five counts run in parallel because four of the five are `period:
   * 'ever'` or `allowed: null` on the free tier — the common case — and those
   * cost either one indexed count or nothing at all. Serialised they would
   * still be fast; in parallel this is one round trip's worth of latency for a
   * screen somebody is waiting on.
   */
  app.get('/entitlements', async (request) => {
    const allowances = await Promise.all(
      METERS.map((meter) => allowanceFor(request.userId!, request.plan, meter)),
    );
    return { plan: request.plan, allowances, tiers: tiers() } satisfies Entitlements;
  });

  // ---- Profile & targets ---------------------------------------------------

  app.get('/profile', async (request) => getUser(request.userId!));

  app.patch('/profile', async (request, reply) => {
    const parsed = ProfileUpdate.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid profile' });

    const userId = request.userId!;
    const profile = await updateUser(userId, parsed.data);

    // Recalculate targets whenever an input to the calculation changes, unless
    // the user has taken manual control of them.
    const ctx = { timezone: profile.timezone, dayStartHour: profile.day_start_hour };
    const today = localDateFor(new Date(), ctx);
    const existing = await targetsForDate(userId, today);

    if (!existing.is_custom) {
      const weight = await latestWeight(userId);
      const targets = calculateTargets({
        sex: profile.sex,
        birth_date: profile.birth_date,
        height_cm: profile.height_cm,
        weight_kg: weight?.weight_kg ?? null,
        activity_level: profile.activity_level,
        goal: profile.goal,
      });
      await setTargets(userId, today, targets, 'recalculated from profile');
    }

    const complete =
      profile.sex !== null &&
      profile.birth_date !== null &&
      profile.height_cm !== null &&
      profile.goal !== null &&
      profile.units !== null;
    if (complete && !profile.is_setup_complete) await markOnboarded(userId);

    return getUser(userId);
  });

  /**
   * Closing your own account, and everything in it.
   *
   * Both stores require this to be reachable from inside the app rather than by
   * emailing someone, which is why it is a route and not an admin errand. The
   * password is re-checked here for the reason given on DeleteAccountRequest:
   * a live session is precisely what a stolen phone already holds.
   *
   * Sessions cascade with the user row, so this also signs out every other
   * device the moment it succeeds — there is nothing left for them to resolve.
   */
  app.delete('/account', { config: { rateLimit: DELETE_ACCOUNT_LIMIT } }, async (request, reply) => {
    const parsed = DeleteAccountRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Enter your password to confirm.' });
    }

    const userId = request.userId!;
    const profile = await getUser(userId);
    // No email means no password to check against — the pre-accounts
    // placeholder row. Refusing is the safe answer while there is no second way
    // to prove who is asking.
    if (!profile.email) {
      return reply.status(400).send({ error: 'This account cannot be deleted from here.' });
    }

    /*
     * An account that signs in with Google has no password to re-check, and
     * that must not leave it undeletable — both app stores require this to be
     * reachable from inside the product, and "unless you signed in with Google"
     * is not an exemption they grant.
     *
     * The way out is the one that already exists. "Forgot your password" needs
     * no old password to start and proves the mailbox instead, which is a
     * stronger claim than the session this request already has. So the answer
     * says so plainly rather than refusing, and the door it points at is one
     * step away.
     */
    const account = await findUserByEmail(profile.email);
    if (!account?.password_hash) {
      return reply.status(400).send({
        error:
          'This account signs in with Google and has no password to confirm with. ' +
          'Set one first from “Forgot your password?”, then come back.',
      });
    }

    if ((await authenticate(profile.email, parsed.data.password)) !== userId) {
      return reply.status(403).send({ error: 'That password is not correct.' });
    }

    // Read before the row is destroyed, because the confirmation goes to an
    // address that is about to stop existing as far as this database is
    // concerned.
    const recipient = { email: profile.email, name: profile.display_name };

    const summary = await deleteAccount(userId);
    if (!summary) return reply.status(404).send({ error: 'Account not found' });

    /*
     * A receipt, and the last thing this address ever hears from us.
     *
     * Sent after the deletion rather than before, so it can only ever describe
     * something that actually happened — and deliberately not allowed to affect
     * the outcome: an account that has been erased stays erased whether or not
     * the email about it made it out of the building.
     */
    await sendAccountDeletedEmail(
      {
        email: recipient.email,
        name: recipient.name,
        // Counts, not paths — for the same reason the response below carries
        // counts: the server's own disk layout is nobody else's business.
        counts: { ...summary, photos: summary.photos.length },
      },
      request.log,
    );

    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    // Counts, not the file paths the admin view gets: the server's own layout
    // is not something to hand back to a client.
    return {
      food_entries: summary.food_entries,
      chat_messages: summary.chat_messages,
      photos: summary.photos.length,
    };
  });

  app.get('/onboarding', async (request) => {
    const profile = await getUser(request.userId!);
    const missing = missingProfileFields(profile);
    return { complete: profile.is_setup_complete && missing.length === 0, missing };
  });

  /**
   * What the adaptive pass would do right now, without doing it. The Progress
   * screen shows this so the next target change is never a surprise.
   */
  app.get('/targets/adaptive', async (request) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    return proposeTargets(userId, ctx);
  });

  // ---- Weekly reviews ------------------------------------------------------

  app.get('/reviews', async (request) => {
    const limit = clampNumber((request.query as any)?.limit, 12, 1, 52);
    return { reviews: await listReviews(request.userId!, limit) };
  });

  app.get('/reviews/latest', async (request, reply) => {
    const review = await latestReview(request.userId!);
    if (!review) return reply.status(404).send({ error: 'No review yet' });
    return review;
  });

  /** The numbers a review would be written from. Cheap; no model involved. */
  app.get('/reviews/preview', async (request) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const { stats } = await buildFullReviewStats(userId, ctx);
    return stats;
  });

  /**
   * What a store says happened, arriving through RevenueCat.
   *
   * Public — see `PUBLIC_PREFIXES` — because the caller is a server with no
   * session, so the shared secret is the whole of the authentication. That
   * makes the missing-secret branch a refusal rather than a warning: the body
   * of this request names an account and a tier, so an endpoint that cannot
   * authenticate its caller is a free-subscription dispenser for anyone who
   * finds the path.
   *
   * **Answers 200 to almost everything.** A non-2xx makes RevenueCat redeliver,
   * which is right for "we were down" and wrong for every other outcome here —
   * an event for a deleted account, a product this build has never heard of, or
   * a type invented since this was written are all permanent, and retrying them
   * for hours changes nothing except the log. Only a genuine failure to record
   * the event earns a 500. What happened is in the `reason` field, and in
   * `billing_events` regardless.
   */
  app.post('/billing/revenuecat', async (request, reply) => {
    const secret = env.billing.revenueCatSecret;
    if (!secret) {
      request.log.warn('billing webhook received but REVENUECAT_WEBHOOK_SECRET is not set');
      return reply.status(503).send({ error: 'Billing is not configured.' });
    }

    const offered = request.headers.authorization ?? '';
    // Constant-time, because a plain `!==` leaks the secret one byte at a time
    // to anyone willing to time a few thousand requests. Length is compared
    // first since timingSafeEqual throws on a mismatch — that comparison is not
    // constant-time, but the length of a secret is not the secret.
    const a = Buffer.from(offered);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      request.log.warn({ ip: request.ip }, 'billing webhook failed authentication');
      return reply.status(401).send({ error: 'Bad credentials.' });
    }

    const event = (request.body as { event?: RevenueCatEvent } | null)?.event;
    if (!event?.id || !event.type || !event.app_user_id) {
      return reply.status(400).send({ error: 'Malformed event.' });
    }

    try {
      const result = await applyEvent(event, { acceptSandbox: env.billing.acceptSandbox });
      // Logged at info rather than debug: this is the audit trail for money,
      // and the reasons that are *not* `ok` are the ones somebody will be
      // reading back when a customer says they paid and got nothing.
      request.log.info(
        { eventId: event.id, type: event.type, ...result },
        'billing event processed',
      );
      return { ok: true, ...result };
    } catch (error) {
      // The one case worth a retry: we could not write it down. Everything else
      // above is a decision; this is an outage.
      request.log.error({ err: error, eventId: event.id }, 'billing event failed');
      return reply.status(500).send({ error: 'Could not record that event.' });
    }
  });

  /**
   * Generate this week's review now rather than waiting for Monday.
   *
   * The plan check comes before the rate limiter's ceiling because they answer
   * different questions and, on `free`, the limiter's answer is misleading: a
   * ceiling of zero makes every request a 429, which tells someone to come back
   * later for a feature that is never coming back. Not included is 402.
   */
  app.post('/reviews/run', { config: { rateLimit: REVIEW_BURST } }, async (request, reply) => {
    const perDay = limitsFor(request.plan).reviewsPerDay;
    if (perDay === 0) {
      return reply.status(402).send({ error: 'Weekly reviews are part of Plus.' });
    }
    // Spent for today, which — unlike the line above — genuinely does come back
    // tomorrow, so it is the one refusal on this route that is a 429.
    if ((await turnsInWindow(request.userId!, ['review'], 1)) >= perDay) {
      return reply.status(429).send({ error: `That is all ${perDay} reviews for today.` });
    }
    const authError = authErrorFor(laneFor((await getUser(request.userId!)).email));
    if (authError) {
      return reply.status(503).send({ error: authError });
    }
    try {
      return await generateWeeklyReview(request.userId!);
    } catch (error) {
      request.log.error({ err: error }, 'weekly review failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  // ---- Photos --------------------------------------------------------------

  /**
   * Two ways in, because an image element cannot send a header.
   *
   * A signed URL authorises itself and needs no session — that is the only path
   * React Native has, since `<Image>` does its own fetching. An unsigned request
   * still works for the browser, whose cookie rides along on the `<img>` fetch
   * without being asked. This route is therefore public in `app.ts` and does its
   * own checking; neither branch may serve a photo the caller has no claim to.
   */
  /**
   * Somewhere to put a photo that is not this process.
   *
   * Answers with nulls rather than an error when the deployment has no bucket:
   * that is a local-disk install, which is a working configuration and not a
   * failure, and the client's correct response is to send the bytes the old way.
   */
  app.post('/photos/upload-url', async (request, reply) => {
    if (request.userId === null) return reply.status(401).send({ error: 'Not signed in.' });

    const parsed = PhotoUploadRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    }

    const ticket = await reservePhotoUpload(request.userId, parsed.data.media_type);
    return reply.send({
      key: ticket?.key ?? null,
      url: ticket?.url ?? null,
      expires_in_seconds: ticket?.expiresInSeconds ?? null,
    });
  });

  app.get('/photos/:id', async (request, reply) => {
    const photoId = (request.params as any).id as string;
    const { exp, sig } = (request.query as any) ?? {};

    if (sig !== undefined) {
      const secret = await getSecret(PHOTO_URL_SECRET);
      if (!verifyPhotoUrl(photoId, exp, sig, secret)) {
        return reply.status(403).send({ error: 'This photo link has expired.' });
      }
      return send(reply, await readPhotoById(photoId));
    }

    if (request.userId === null) return reply.status(401).send({ error: 'Not signed in.' });
    return send(reply, await readPhoto(request.userId, photoId));
  });

  /**
   * The same ending for both branches above, once each has established that the
   * caller may have this photo.
   *
   * A photo in a bucket is a redirect rather than a proxied body: the bucket
   * serves it for free and we do not, and the authorisation this route exists
   * to perform has already happened by the time the 302 is written. The
   * short-lived presigned URL is what carries it the rest of the way, so this
   * is a handoff between two signatures rather than a hole in one.
   *
   * `no-store` on the redirect itself, because the presigned URL inside it
   * expires in minutes while the photo does not — a cached 302 would turn into
   * a broken image long before the link that produced it went stale.
   */
  function send(reply: FastifyReply, photo: PhotoDelivery | null) {
    if (!photo) return reply.status(404).send({ error: 'Photo not found' });
    if (photo.kind === 'redirect') {
      return reply.header('cache-control', 'private, no-store').redirect(photo.url, 302);
    }
    return reply.type(photo.mediaType).send(photo.bytes);
  }

  // ---- Email preferences ---------------------------------------------------

  /**
   * Unsubscribing, from the link at the bottom of the email.
   *
   * Public, and it has to be. Whoever is following this link is reading their
   * mail, not using the app, and quite possibly on a device that has never had
   * a session here — a sign-in wall between someone and the "stop emailing me"
   * button is the single most reliable way to convert an unsubscribe into a
   * spam report. The HMAC in the query string is what stands in for the
   * session, and all it can buy is silence.
   *
   * POST rather than GET because a link preview fetcher would otherwise
   * unsubscribe people who merely received the email — and because RFC 8058
   * one-click, which is what Gmail's own button posts, requires it.
   */
  app.post('/email/unsubscribe', async (request, reply) => {
    const { u, s } = (request.query as any) ?? {};
    const secret = await getSecret(EMAIL_UNSUBSCRIBE_SECRET);

    if (!verifyUnsubscribe(u, s, secret)) {
      return reply.status(403).send({ error: 'That unsubscribe link is not valid.' });
    }

    /*
     * Both preferences, from the one link.
     *
     * There is exactly one unsubscribe button in every product email and one
     * person pressing it, and what they mean by it is "stop". Turning off only
     * the mail they happened to be reading and then sending them the other kind
     * next week is the behaviour that earns a spam report — and a preference
     * centre offering to unsubscribe from some of it is the thing people press
     * this button to escape.
     */
    await Promise.all([
      setWeeklyReviewEmails(u as string, false),
      setNudgeEmails(u as string, false),
    ]);
    return { ok: true as const, message: 'You will not get product email from us again.' };
  });

  /**
   * Mail arriving at the domain, posted here by Resend.
   *
   * Registered inside its own scope so it can keep the raw body: Fastify hands
   * routes a parsed object, and a signature computed over a re-serialised one
   * will not match — key order and whitespace are not preserved by a round trip
   * through JSON.parse. Content-type parsers are per-plugin in Fastify, so this
   * affects nothing but the route below it.
   */
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (request, body, done) => {
        (request as unknown as { rawBody: string }).rawBody = body as string;
        try {
          done(null, JSON.parse(body as string));
        } catch (error) {
          done(error as Error, undefined);
        }
      },
    );

    scope.post('/email/inbound', async (request, reply) => {
      const secret = env.email.webhookSecret;
      // No secret means no way to tell Resend from anyone else who found this
      // URL, and a public write endpoint that cannot authenticate its caller
      // should refuse rather than trust.
      if (!secret) {
        request.log.warn('inbound email received but RESEND_WEBHOOK_SECRET is not set');
        return reply.status(503).send({ error: 'Inbound email is not configured.' });
      }

      const headers = request.headers;
      const verified = verifyWebhookSignature({
        id: headers['svix-id'] as string | undefined,
        timestamp: headers['svix-timestamp'] as string | undefined,
        signature: headers['svix-signature'] as string | undefined,
        body: (request as unknown as { rawBody: string }).rawBody,
        secret,
      });
      if (!verified) {
        request.log.warn({ ip: request.ip }, 'inbound email failed signature verification');
        return reply.status(401).send({ error: 'Bad signature.' });
      }

      const event = request.body;
      // Resend posts delivery events down the same pipe. Anything that is not a
      // received message is acknowledged and dropped — a 4xx would only make
      // Svix retry something we are never going to want.
      if (!isReceivedEmail(event)) return { ok: true as const, stored: false };

      const from = parseAddress(event.data.from);
      const id = await recordSupportEmail({
        providerId: event.data.email_id,
        fromEmail: from.email,
        fromName: from.name,
        toEmail: (event.data.to?.[0] ?? '').toLowerCase(),
        subject: event.data.subject ?? null,
        attachments: event.data.attachments?.length ?? 0,
        receivedAt: event.created_at ? new Date(event.created_at) : new Date(),
      });

      // Null means we have seen this message before, so there is no body to go
      // and fetch and nothing to update.
      if (id === null) return { ok: true as const, stored: false };

      /*
       * The metadata is already safe on disk; the body is best effort from here.
       *
       * Deliberately not allowed to fail the request: a non-2xx would have Svix
       * redeliver a message that is already stored, and the redelivery would hit
       * the same failing fetch. Better a row with a visible gap in it than a
       * retry loop and an email nobody knows arrived.
       */
      try {
        await attachBody(id, await fetchReceivedEmail(event.data.email_id));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordBodyFailure(id, message);
        request.log.error({ err: error, emailId: event.data.email_id }, 'could not fetch body');
      }

      return { ok: true as const, stored: true };
    });
  });
}

/** A calendar bound is only trusted when it is exactly a plain ISO date. */
function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clampNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
