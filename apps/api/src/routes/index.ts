import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ChatRequest, DeleteAccountRequest, Meal, ProfileUpdate, RepeatRequest } from '@ct/shared';
import { AUTH_HELP, authDescription, hasSubscriptionAuth } from '../ai/client.ts';
import { generateWeeklyReview } from '../ai/review.ts';
import { runTurn } from '../ai/run.ts';
import { sendAccountDeletedEmail } from '../email/notify.ts';
import { verifyUnsubscribe } from '../email/unsubscribe.ts';
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
  getUser,
  getUserContext,
  markOnboarded,
  missingProfileFields,
  setWeeklyReviewEmails,
  updateUser,
} from '../services/user.ts';
import { addDays, dateRange, localDateFor } from '../time.ts';

/**
 * Ceilings on the two routes that spend money. Everything else is a database
 * read and needs no limit — throttling the dashboard would only break polling.
 */
const CHAT_LIMIT = { max: 40, timeWindow: '1 hour' };
const REVIEW_LIMIT = { max: 5, timeWindow: '1 day' };

/**
 * Not about money: this one verifies a password, which is deliberately slow,
 * and is the only irreversible thing an account can do to itself.
 */
const DELETE_ACCOUNT_LIMIT = { max: 5, timeWindow: '15 minutes' };

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
    // No email means no password to check against — the pre-accounts placeholder
    // row, and later a provider-only sign-in. Refusing is the safe answer while
    // there is no second way to prove who is asking.
    if (!profile.email) {
      return reply.status(400).send({ error: 'This account cannot be deleted from here.' });
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

    await setWeeklyReviewEmails(u as string, false);
    return { ok: true as const, message: 'You will not get the weekly review by email again.' };
  });
}

/** A calendar bound is only trusted when it is exactly a plain ISO date. */
function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function stripDataUrl(value: string): string {
  const comma = value.indexOf(',');
  return value.startsWith('data:') && comma !== -1 ? value.slice(comma + 1) : value;
}

function clampNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
