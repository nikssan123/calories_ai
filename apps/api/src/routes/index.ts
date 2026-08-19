import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ChatRequest, ProfileUpdate } from '@ct/shared';
import { query } from '../db.ts';
import { AUTH_HELP, authDescription, hasSubscriptionAuth } from '../ai/client.ts';
import { runTurn } from '../ai/run.ts';
import { savePhoto, readPhoto } from '../services/photos.ts';
import {
  deleteExerciseEntry,
  deleteFoodEntry,
  getFoodEntry,
  latestWeight,
  logWeight,
  updateFoodEntry,
} from '../services/log.ts';
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

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true,
    auth: authDescription(),
  }));

  // ---- The core loop -------------------------------------------------------

  app.post('/chat', async (request, reply) => {
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
      const result = await runTurn({
        userId,
        ctx,
        profile,
        text: parsed.data.text,
        photo,
      });
      return result;
    } catch (error) {
      request.log.error({ err: error }, 'chat turn failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  app.get('/chat/history', async (request) => {
    const userId = request.userId!;
    const limit = Math.min(Number((request.query as any)?.limit ?? 50), 200);
    const rows = await query<any>(
      `SELECT id, role, content, photo_id, created_at FROM (
         SELECT id, role, content, photo_id, created_at
           FROM chat_messages WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2
       ) recent ORDER BY created_at ASC`,
      [userId, limit],
    );
    return {
      messages: rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        photo_id: r.photo_id,
        created_at: new Date(r.created_at).toISOString(),
      })),
    };
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
    meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
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
