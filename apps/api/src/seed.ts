/**
 * Fills the database with a few weeks of plausible history so the Today and
 * Progress screens have something to show before you've used the app for real.
 *
 *   pnpm --filter @ct/api seed          # add demo data
 *   pnpm --filter @ct/api seed -- --reset  # wipe all logged data first
 */
import { isEntrypoint, runAsScript } from './cli.ts';
import { pool, query, queryOne } from './db.ts';
import { getUserContext } from './services/user.ts';
import { createExerciseEntry, createFoodEntry, logWeight } from './services/log.ts';
import { addDays, type DayContext, localDateFor } from './time.ts';

export const DEFAULT_SEED_DAYS = 21;

export interface SeedOptions {
  days?: number;
  /** Starting weight in kg; it trends down across the window. */
  startWeightKg?: number;
  /** Fixed jitter source, so a test can seed the same history twice. */
  random?: () => number;
  /** Anchor for "now". Tests pass a fixed instant. */
  now?: Date;
}

/**
 * Writes `days` of history ending yesterday. Extracted from the CLI so tests can
 * build a realistic window — the adaptive pass needs a fortnight of intake and
 * weigh-ins before it will say anything, and hand-rolling that in every test
 * would be worse than sharing this.
 */
export async function seedHistory(
  userId: string,
  ctx: DayContext,
  options: SeedOptions = {},
): Promise<number> {
  const days = options.days ?? DEFAULT_SEED_DAYS;
  const random = options.random ?? Math.random;
  const startWeight = options.startWeightKg ?? 83.6;
  const now = options.now ?? new Date();

  for (let daysAgo = days; daysAgo >= 1; daysAgo--) {
    const at = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const jitter = () => (random() - 0.5) * 2;
    const hourOf = (hour: number) => {
      const out = new Date(at);
      out.setHours(hour, Math.floor(random() * 50), 0, 0);
      return out;
    };

    await logWeight(userId, round1(startWeight - (days - daysAgo) * 0.055 + jitter() * 0.2), at, ctx);

    await createFoodEntry({
      userId,
      meal: 'breakfast',
      eatenAt: hourOf(8),
      description: 'Eggs, toast and feta',
      confidence: 'medium',
      source: 'text',
      items: [
        { name: 'Eggs', quantity_g: 100, quantity_desc: '2 large', kcal: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.9 },
        { name: 'Bread', quantity_g: 60, quantity_desc: '2 slices', kcal: 158, protein_g: 5.2, carbs_g: 29, fat_g: 2 },
        { name: 'Feta', quantity_g: 40, quantity_desc: null, kcal: 106, protein_g: 5.7, carbs_g: 1.6, fat_g: 8.6 },
      ],
      ctx,
    });

    await createFoodEntry({
      userId,
      meal: 'lunch',
      eatenAt: hourOf(13),
      description: 'Chicken, rice and salad',
      confidence: 'low',
      source: 'text',
      items: [
        { name: 'Chicken breast', quantity_g: 200, quantity_desc: '~200g', kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7.2 },
        { name: 'Cooked rice', quantity_g: 180, quantity_desc: '~180g', kcal: 234, protein_g: 4.9, carbs_g: 50.4, fat_g: 0.5 },
        { name: 'Salad with olive oil', quantity_g: 110, quantity_desc: 'side salad', kcal: 115, protein_g: 1.2, carbs_g: 4, fat_g: 10.6 },
      ],
      ctx,
    });

    await createFoodEntry({
      userId,
      meal: 'dinner',
      eatenAt: hourOf(19),
      description: 'Salmon, potatoes and greens',
      confidence: 'medium',
      source: 'text',
      items: [
        { name: 'Salmon fillet', quantity_g: 180, quantity_desc: '~180g', kcal: 374, protein_g: 36.5, carbs_g: 0, fat_g: 24.5 },
        { name: 'Potatoes', quantity_g: 250, quantity_desc: '~250g', kcal: 215, protein_g: 5, carbs_g: 49, fat_g: 0.3 },
        { name: 'Green beans', quantity_g: 150, quantity_desc: 'a big handful', kcal: 52, protein_g: 2.7, carbs_g: 10.5, fat_g: 0.2 },
      ],
      ctx,
    });

    // Vary the afternoon snack so adherence isn't identical every day — the
    // Progress screen is only interesting if some days miss.
    const scale = 0.5 + random() * 0.9;
    await createFoodEntry({
      userId,
      meal: 'snack',
      eatenAt: hourOf(16),
      description: 'Protein shake and fruit',
      confidence: 'high',
      source: 'quick',
      items: [
        {
          name: 'Whey protein with milk',
          quantity_g: null,
          quantity_desc: '1 scoop in 300ml milk',
          kcal: round1(310 * scale),
          protein_g: round1(38 * scale),
          carbs_g: round1(18 * scale),
          fat_g: round1(8 * scale),
        },
        { name: 'Banana', quantity_g: 120, quantity_desc: '1 medium', kcal: 107, protein_g: 1.3, carbs_g: 27, fat_g: 0.4 },
      ],
      ctx,
    });

    // Roughly every other day.
    if (daysAgo % 2 === 0) {
      await createExerciseEntry({
        userId,
        description: daysAgo % 4 === 0 ? '45 min weight training' : '5km run',
        performedAt: hourOf(18),
        durationMin: daysAgo % 4 === 0 ? 45 : 28,
        kcalBurned: daysAgo % 4 === 0 ? 260 : 310,
        confidence: 'low',
        source: 'text',
        ctx,
      });
    }
  }

  return days;
}

/** Removes everything this user has logged, leaving the account itself intact. */
export async function clearUserData(userId: string): Promise<void> {
  // food_items and chat rows cascade from their parents.
  await query('DELETE FROM food_entries WHERE user_id = $1', [userId]);
  await query('DELETE FROM exercise_entries WHERE user_id = $1', [userId]);
  await query('DELETE FROM weight_entries WHERE user_id = $1', [userId]);
  await query('DELETE FROM chat_messages WHERE user_id = $1', [userId]);
}

/**
 * The CLI body. It neither exits the process nor closes the pool — those belong
 * to the entrypoint below, so importing this module stays inert.
 */
export async function main(argv: string[] = process.argv): Promise<void> {
  const reset = argv.includes('--reset');

  // Seed the account whose email is given, else the only account there is.
  const emailArg = argv.find((a) => a.startsWith('--email='))?.slice('--email='.length);
  const target = await queryOne<{ id: string; email: string | null }>(
    emailArg
      ? 'SELECT id, email FROM users WHERE lower(email) = lower($1)'
      : 'SELECT id, email FROM users ORDER BY created_at ASC LIMIT 1',
    emailArg ? [emailArg] : [],
  );
  if (!target) {
    throw new Error(
      emailArg
        ? `No account with email ${emailArg}.`
        : 'No users yet — create an account in the app first, then re-run seed.',
    );
  }
  console.log(`seeding ${target.email ?? target.id}`);

  const { userId, ...ctx } = await getUserContext(target.id);

  if (reset) {
    await clearUserData(userId);
    console.log('cleared existing log data');
  }

  const today = localDateFor(new Date(), ctx);
  const existing = await query<{ n: string }>(
    'SELECT count(*) AS n FROM food_entries WHERE user_id = $1',
    [userId],
  );
  if (Number(existing[0]!.n) > 0 && !reset) {
    console.log('data already present — pass --reset to replace it');
    return;
  }

  const days = await seedHistory(userId, ctx);
  console.log(`seeded ${days} days of history up to ${addDays(today, -1)}`);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

if (isEntrypoint(import.meta.url)) void runAsScript(main, () => pool.end());
