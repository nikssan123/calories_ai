import type {
  ActivityLevel,
  Goal,
  QualityTargets,
  Sex,
  Targets,
  TargetSource,
} from '@ct/shared';
import { query, queryOne } from '../db.ts';

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** §10: a starting point, deliberately not presented as the final word. */
export const GOAL_KCAL_DELTA: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

/** Nobody's target goes below this, however the arithmetic comes out. */
export const MIN_TARGET_KCAL = 1200;

export interface TargetInputs {
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
}

/** Sensible defaults when setup hasn't happened yet — the app still works on day one. */
export const FALLBACK_TARGETS: Targets = {
  kcal: 2200,
  protein_g: 150,
  carbs_g: 230,
  fat_g: 73,
  is_custom: false,
  source: 'calculated',
};

/** Mifflin-St Jeor × activity. Population maintenance, before any goal delta. */
export function predictTdee(inputs: TargetInputs): number | null {
  const { sex, height_cm, weight_kg, activity_level } = inputs;
  const age = ageFrom(inputs.birth_date);
  if (!sex || !height_cm || !weight_kg || age === null) return null;

  const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + (sex === 'male' ? 5 : -161);
  return bmr * ACTIVITY_MULTIPLIER[activity_level ?? 'moderate'];
}

/**
 * Splits an energy target into macros. Protein is anchored to bodyweight, fat to
 * a share of energy, carbs take the rest — so a changed calorie number produces
 * a coherent macro set rather than three numbers that no longer add up.
 */
export function macrosFor(
  kcal: number,
  weightKg: number | null,
  goal: Goal | null,
): Pick<Targets, 'protein_g' | 'carbs_g' | 'fat_g'> {
  const protein_g = weightKg
    ? Math.round(weightKg * (goal === 'lose' ? 2.0 : 1.8))
    : Math.round((kcal * 0.3) / 4);
  const fat_g = Math.round((kcal * 0.28) / 9);
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { protein_g, carbs_g, fat_g };
}

/**
 * The diet-quality panel that goes with an energy target.
 *
 * Derived, never stored: these are a deterministic function of the calorie
 * number with nothing personal in them, so keeping a row per user would only
 * create a copy that could disagree with the target it was computed from.
 *
 * Three of the four are ceilings and one is a floor, and each says so in its
 * own shape rather than leaving a screen to remember which is which. The
 * figures are the ordinary population guidance:
 *
 * - fiber   14 g per 1000 kcal, which is where every dietary guideline lands.
 * - sodium  2300 mg flat, and flat on purpose — salt intake does not scale with
 *           appetite, and scaling it would hand a bigger allowance to exactly
 *           the person eating the most processed food.
 * - sat fat under 10% of energy.
 * - sugar   under 10% of energy, counting what is added rather than what is in
 *           a piece of fruit. Nothing here can tell those apart, which is why
 *           this is the softest of the four and the prompt says so.
 */
export function qualityTargetsFor(kcal: number): QualityTargets {
  return {
    fiber_g: { value: Math.round((kcal / 1000) * 14), direction: 'floor' },
    sodium_mg: { value: 2300, direction: 'ceiling' },
    sat_fat_g: { value: Math.round((kcal * 0.1) / 9), direction: 'ceiling' },
    sugar_g: { value: Math.round((kcal * 0.1) / 4), direction: 'ceiling' },
  };
}

export function calculateTargets(inputs: TargetInputs): Targets {
  const tdee = predictTdee(inputs);
  if (tdee === null) return FALLBACK_TARGETS;

  const kcal = Math.max(
    MIN_TARGET_KCAL,
    Math.round((tdee + GOAL_KCAL_DELTA[inputs.goal ?? 'maintain']) / 10) * 10,
  );

  return {
    kcal,
    ...macrosFor(kcal, inputs.weight_kg, inputs.goal),
    is_custom: false,
    source: 'calculated',
  };
}

export function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

/** The target that was in force on a given day — not necessarily today's. */
export async function targetsForDate(userId: string, localDate: string): Promise<Targets> {
  const row = await queryOne<{
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    is_custom: boolean;
    source: TargetSource;
  }>(
    `SELECT kcal, protein_g, carbs_g, fat_g, is_custom, source
       FROM targets
      WHERE user_id = $1 AND effective_from <= $2
   ORDER BY effective_from DESC
      LIMIT 1`,
    [userId, localDate],
  );
  return row ?? FALLBACK_TARGETS;
}

/** Writes a new versioned target row, replacing any set earlier the same day. */
export async function setTargets(
  userId: string,
  localDate: string,
  targets: Targets,
  reason: string,
): Promise<void> {
  await query(
    `DELETE FROM targets WHERE user_id = $1 AND effective_from = $2`,
    [userId, localDate],
  );
  await query(
    `INSERT INTO targets (user_id, effective_from, kcal, protein_g, carbs_g, fat_g, is_custom, source, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      userId,
      localDate,
      targets.kcal,
      targets.protein_g,
      targets.carbs_g,
      targets.fat_g,
      targets.is_custom,
      targets.source ?? 'calculated',
      reason,
    ],
  );
}
