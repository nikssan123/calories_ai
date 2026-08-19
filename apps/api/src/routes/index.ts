import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ChatRequest, Meal, ProfileUpdate, RepeatRequest } from '@ct/shared';
import { AUTH_HELP, authDescription, hasSubscriptionAuth } from '../ai/client.ts';
import { generateWeeklyReview } from '../ai/review.ts';
import { runTurn } from '../ai/run.ts';
import { proposeTargets } from '../services/adaptive.ts';
import { listMessages } from '../services/chat.ts';
import { mealTemplates, repeatFoodEntry } from '../services/history.ts';
import { savePhoto, readPhoto } from '../services/photos.ts';
import {
  deleteExerciseEntry,
  deleteFoodEntry,
  getFoodEntry,
  latestWeight,
  logWeight,
  updateFoodEntry,
} from '../services/log.ts';
import { buildFullReviewStats, latestReview, listReviews } from '../services/reviews.ts';
import { buildDaySummary, buildProgress, currentLocalDate } from '../services/summary.ts';
import { calculateTargets, setTargets, targetsForDate } from '../services/targets.ts';
import {
  getUser,
  getUserContext,
  markOnboarded,
  missingProfileFields,
  updateUser,
} from '../services/user.ts';
import { localDateFor } from '../time.ts';

/**
 * Ceilings on the two routes that spend money. Everything else is a database
 * read and needs no limit — throttling the dashboard would only break polling.
 */
const CHAT_LIMIT = { max: 40, timeWindow: '1 hour' };
const REVIEW_LIMIT = { max: 5, timeWindow: '1 day' };

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

  app.get('/photos/:id', async (request, reply) => {
    const userId = request.userId!;
    const photo = await readPhoto(userId, (request.params as any).id);
    if (!photo) return reply.status(404).send({ error: 'Photo not found' });
    return reply.type(photo.mediaType).send(photo.bytes);
  });
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
