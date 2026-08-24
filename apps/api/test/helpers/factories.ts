import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.ts';
import { query, queryOne } from '../../src/db.ts';
import { createFoodEntry, logWeight, type FoodItemInput } from '../../src/services/log.ts';
import { setTargets } from '../../src/services/targets.ts';
import type { DayContext } from '../../src/time.ts';
import type { Confidence, Meal, Targets } from '@ct/shared';

export const DEFAULT_CTX: DayContext = { timezone: 'Europe/Sofia', dayStartHour: 4 };

export interface TestUser {
  id: string;
  email: string;
  password: string;
  ctx: DayContext;
}

let sequence = 0;

/**
 * A complete, onboarded account. Profile fields are filled in because almost
 * every interesting path (targets, adaptive, reviews) is gated on them.
 */
export async function createUser(overrides: Record<string, unknown> = {}): Promise<TestUser> {
  sequence += 1;
  const email = (overrides.email as string) ?? `user${sequence}@example.com`;

  const fields: Record<string, unknown> = {
    email,
    password_hash: 'scrypt$00$00',
    display_name: 'Test',
    sex: 'male',
    birth_date: '1990-01-01',
    height_cm: 180,
    target_weight_kg: 78,
    activity_level: 'moderate',
    goal: 'lose',
    timezone: DEFAULT_CTX.timezone,
    // Set, not null: a null here is "onboarding has not asked yet", which would
    // make every fixture look like a half-finished account.
    units: 'metric',
    // Same bargain as `units` above: set rather than null, so a fixture does not
    // look like an account nobody has ever asked about its language.
    locale: 'en',
    day_start_hour: DEFAULT_CTX.dayStartHour,
    is_setup_complete: true,
    onboarding_completed_at: new Date().toISOString(),
    // Confirmed, like every account that existed when the email migration ran.
    // A test about what happens *before* confirmation overrides this to null.
    email_verified_at: new Date().toISOString(),
    ...overrides,
  };

  const columns = Object.keys(fields);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (${columns.join(', ')})
     VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING id`,
    Object.values(fields),
  );

  return {
    id: row!.id,
    email,
    password: 'correct-horse',
    ctx: {
      timezone: (fields.timezone as string) ?? DEFAULT_CTX.timezone,
      dayStartHour: (fields.day_start_hour as number) ?? DEFAULT_CTX.dayStartHour,
    },
  };
}

/** An app instance with a signed-in session cookie for `user`. */
export async function appFor(user: TestUser): Promise<{ app: FastifyInstance; cookie: string }> {
  const app = await buildApp({ logger: false });
  await app.ready();
  const { createSession } = await import('../../src/services/auth.ts');
  const { token } = await createSession(user.id);
  return { app, cookie: `ct_session=${token}` };
}

/**
 * Confirms an account's address without going through the email.
 *
 * For the many tests whose subject is something else entirely and which only
 * need to get past the verification gate — `createUser` is already confirmed,
 * but an account created through `POST /auth/signup` deliberately is not.
 */
export async function confirmEmail(userId: string): Promise<void> {
  await query('UPDATE users SET email_verified_at = now() WHERE id = $1', [userId]);
}

/**
 * The six digits from the confirmation email that was just sent.
 *
 * Read from the captured message rather than from the database, because the
 * database only has the hash — and because taking it from the email is the same
 * path a person takes, so a template that stopped printing the code would fail
 * these tests rather than quietly passing them.
 */
export function codeFromEmail(text: string): string {
  const match = /\b(\d{6})\b/.exec(text);
  if (!match) throw new Error(`No six-digit code in the email:\n${text}`);
  return match[1]!;
}

export async function anonymousApp(): Promise<FastifyInstance> {
  const app = await buildApp({ logger: false });
  await app.ready();
  return app;
}

export interface MealSpec {
  date: string;
  meal?: Meal;
  description?: string;
  kcal: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  confidence?: Confidence;
  hour?: number;
  /**
   * The diet-quality panel. Left off by default, which is the interesting
   * default: an un-estimated meal is what most of the log looks like, and a
   * fixture that always carries fiber would never exercise the coverage path.
   */
  fiber_g?: number;
  sodium_mg?: number;
  sat_fat_g?: number;
  sugar_g?: number;
}

/**
 * One food entry landing on an exact `local_date`. Building the timestamp from
 * the date and a midday hour keeps the day-boundary logic out of the fixture —
 * tests that care about boundaries construct their own instants.
 */
export async function addMeal(user: TestUser, spec: MealSpec) {
  const eatenAt = new Date(`${spec.date}T${String(spec.hour ?? 12).padStart(2, '0')}:00:00Z`);
  const items: FoodItemInput[] = [
    {
      name: spec.description ?? 'Test food',
      quantity_g: 200,
      quantity_desc: null,
      kcal: spec.kcal,
      protein_g: spec.protein_g ?? Math.round(spec.kcal * 0.075),
      carbs_g: spec.carbs_g ?? Math.round(spec.kcal * 0.1),
      fat_g: spec.fat_g ?? Math.round(spec.kcal * 0.03),
      fiber_g: spec.fiber_g ?? null,
      sodium_mg: spec.sodium_mg ?? null,
      sat_fat_g: spec.sat_fat_g ?? null,
      sugar_g: spec.sugar_g ?? null,
    },
  ];
  return createFoodEntry({
    userId: user.id,
    meal: spec.meal ?? 'lunch',
    eatenAt,
    description: spec.description ?? 'Test meal',
    confidence: spec.confidence ?? 'medium',
    source: 'text',
    items,
    ctx: user.ctx,
  });
}

export async function addWeight(user: TestUser, date: string, kg: number) {
  return logWeight(user.id, kg, new Date(`${date}T09:00:00Z`), user.ctx);
}

export async function setUserTargets(
  user: TestUser,
  date: string,
  targets: Partial<Targets> = {},
) {
  await setTargets(
    user.id,
    date,
    {
      kcal: 2200,
      protein_g: 160,
      carbs_g: 220,
      fat_g: 70,
      is_custom: false,
      source: 'calculated',
      ...targets,
    },
    'test fixture',
  );
}

/**
 * A fortnight the adaptive pass will accept: consistent intake and a steady
 * downward weight trend, both dense enough to clear every guardrail.
 */
export async function seedAdaptiveWindow(
  user: TestUser,
  options: {
    endDate: string;
    days?: number;
    kcalPerDay?: number;
    startWeightKg?: number;
    kgPerWeek?: number;
    confidence?: Confidence;
  },
) {
  const days = options.days ?? 14;
  const kcal = options.kcalPerDay ?? 2200;
  const startWeight = options.startWeightKg ?? 85;
  const perDay = (options.kgPerWeek ?? -0.5) / 7;

  const end = Date.parse(`${options.endDate}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const index = days - 1 - i;
    await addMeal(user, {
      date,
      kcal,
      protein_g: 160,
      confidence: options.confidence ?? 'high',
      description: `Day ${index} meal`,
    });
    await addWeight(user, date, round2(startWeight + perDay * index));
  }
}

export async function countRows(table: string, userId: string): Promise<number> {
  const rows = await query<{ n: string }>(
    `SELECT count(*) AS n FROM ${table} WHERE user_id = $1`,
    [userId],
  );
  return Number(rows[0]!.n);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
