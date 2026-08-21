import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  BarcodeLogRequest,
  ChatRequest,
  DeleteAccountRequest,
  Meal,
  ProfileUpdate,
  RepeatRequest,
  WorkoutRequest,
} from '@ct/shared';
import { AUTH_HELP, authDescription, hasSubscriptionAuth } from '../ai/client.ts';
import { env } from '../env.ts';
import { generateWeeklyReview } from '../ai/review.ts';
import { runTurn } from '../ai/run.ts';
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
} from '../services/barcode.ts';
import { attachBody, recordBodyFailure, recordSupportEmail } from '../services/support.ts';
import { deleteAccount } from '../services/admin.ts';
import { proposeTargets } from '../services/adaptive.ts';
import { listMessages } from '../services/chat.ts';
import { mealTemplates, repeatFoodEntry } from '../services/history.ts';
import { savePhoto, readPhoto, readPhotoById, verifyPhotoUrl } from '../services/photos.ts';
import { EMAIL_UNSUBSCRIBE_SECRET, getSecret, PHOTO_URL_SECRET } from '../services/secrets.ts';
import { SESSION_COOKIE } from '../services/auth.ts';
import {
  deleteExerciseEntry,
  deleteFoodEntry,
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
import { listExerciseTypes, logWorkout } from '../services/workouts.ts';
import { messageActions, replaceActions } from '../services/chat.ts';
import { TurnInProgressError } from '../services/turn-lock.ts';
import { addDays, dateRange, localDateFor } from '../time.ts';
import { stripDataUrl } from './body.ts';
import { BARCODE_BURST, CHAT_LIMIT, DELETE_ACCOUNT_LIMIT, REVIEW_LIMIT } from './limits.ts';

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

  app.post('/chat', { config: { rateLimit: CHAT_LIMIT } }, async (request, reply) => {
    const parsed = ChatRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    }
    if (!hasSubscriptionAuth() && !process.env.ANTHROPIC_API_KEY) {
      return reply.status(503).send({ error: AUTH_HELP });
    }

    const { userId, ...ctx } = await getUserContext(request.userId!);
    const profile = await getUser(userId);

    let photo: { id: string; mediaType: string; base64: string } | null = null;
    if (parsed.data.photo_base64) {
      const mediaType = parsed.data.photo_media_type ?? 'image/jpeg';
      const base64 = stripDataUrl(parsed.data.photo_base64);
      const saved = await savePhoto(userId, mediaType, base64);
      photo = { id: saved.id, mediaType, base64 };
    }

    try {
      return await runTurn({ userId, ctx, profile, text: parsed.data.text, photo });
    } catch (error) {
      // Not a failure, and not logged as one: they have a turn in flight and
      // pressed send again. A fast, honest rejection is the right answer for a
      // path somebody is watching — queueing it would move the wait, not
      // remove it.
      if (error instanceof TurnInProgressError) {
        return reply.status(429).send({ error: error.message });
      }
      request.log.error({ err: error }, 'chat turn failed');
      return reply.status(502).send({ error: (error as Error).message });
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

  // ---- Manual corrections from the Today screen -----------------------------

  const FoodPatch = z.object({
    meal: Meal.optional(),
    description: z.string().min(1).optional(),
    eaten_at: z.string().optional(),
  });

  app.patch('/entries/food/:id', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const id = (request.params as any).id as string;
    const parsed = FoodPatch.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid patch' });

    const updated = await updateFoodEntry(userId, id, {
      meal: parsed.data.meal,
      description: parsed.data.description,
      eatenAt: parsed.data.eaten_at ? new Date(parsed.data.eaten_at) : undefined,
      ctx,
    });
    if (!updated) return reply.status(404).send({ error: 'Entry not found' });
    return updated;
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

    const entry = await repeatFoodEntry(userId, (request.params as any).id, ctx, {
      meal: parsed.data.meal,
      eatenAt: parsed.data.eaten_at ? new Date(parsed.data.eaten_at) : undefined,
    });
    if (!entry) return reply.status(404).send({ error: 'Entry not found' });
    return reply.status(201).send(entry);
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

      const { userId, ...ctx } = await getUserContext(request.userId!);
      try {
        const product = await lookupBarcode((request.params as any).code);
        if (!product) return reply.status(404).send({ error: 'Nobody has catalogued that one yet' });

        const entry = await logScannedProduct(userId, product, {
          grams: parsed.data.grams,
          servings: parsed.data.servings,
          meal: parsed.data.meal,
          eatenAt: parsed.data.eaten_at ? new Date(parsed.data.eaten_at) : undefined,
          ctx,
        });
        return reply.status(201).send(entry);
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
  });

  app.post('/weight', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const parsed = WeightBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid weight' });

    const measuredAt = parsed.data.measured_at ? new Date(parsed.data.measured_at) : new Date();
    return logWeight(userId, parsed.data.weight_kg, measuredAt, ctx);
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
      profile.goal !== null;
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

  /** Generate this week's review now rather than waiting for Monday. */
  app.post('/reviews/run', { config: { rateLimit: REVIEW_LIMIT } }, async (request, reply) => {
    if (!hasSubscriptionAuth() && !process.env.ANTHROPIC_API_KEY) {
      return reply.status(503).send({ error: AUTH_HELP });
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
  app.get('/photos/:id', async (request, reply) => {
    const photoId = (request.params as any).id as string;
    const { exp, sig } = (request.query as any) ?? {};

    if (sig !== undefined) {
      const secret = await getSecret(PHOTO_URL_SECRET);
      if (!verifyPhotoUrl(photoId, exp, sig, secret)) {
        return reply.status(403).send({ error: 'This photo link has expired.' });
      }
      const photo = await readPhotoById(photoId);
      if (!photo) return reply.status(404).send({ error: 'Photo not found' });
      return reply.type(photo.mediaType).send(photo.bytes);
    }

    if (request.userId === null) return reply.status(401).send({ error: 'Not signed in.' });
    const photo = await readPhoto(request.userId, photoId);
    if (!photo) return reply.status(404).send({ error: 'Photo not found' });
    return reply.type(photo.mediaType).send(photo.bytes);
  });

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
