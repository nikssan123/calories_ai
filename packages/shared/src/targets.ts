import type { ActivityLevel, Goal, Sex, Targets } from './index.ts';

/**
 * How a calorie target is worked out from a profile.
 *
 * This lived in `apps/api/src/services/targets.ts` for as long as the server
 * was the only thing that ever turned answers into a number. Onboarding moved
 * in front of sign-up (GLOW-UP.md), and the plan reveal is now drawn for
 * somebody who has no account yet — so the phone has to do the same arithmetic
 * with nobody to ask. Writing it twice would give two figures that disagree the
 * moment the account is created and the server recalculates, which is the one
 * moment a new user is watching the number most closely. One copy, here, in the
 * only package both sides import; the server re-exports it unchanged.
 *
 * Everything is pure, and `ageFrom` is the only thing that reads a clock.
 */

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Least to most, so a measured level can be compared against a declared one. */
const ACTIVITY_ORDER: ActivityLevel[] = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
];

/**
 * Daily step counts, and the activity level each one is evidence for.
 *
 * Tudor-Locke and Bassett's bands, which are the ones every step-based
 * classification in the field descends from: under 5,000 is sedentary, 5,000 to
 * 7,499 low active, 7,500 to 9,999 somewhat active, 10,000 to 12,499 active,
 * and above that highly active. They map onto this app's five levels one for
 * one, which is not a coincidence — both scales are five bands over the same
 * range of human behaviour.
 *
 * Read as a floor and never as a total. See `measuredActivityLevel`.
 */
const ACTIVITY_STEPS: { steps: number; level: ActivityLevel }[] = [
  { steps: 12_500, level: 'very_active' },
  { steps: 10_000, level: 'active' },
  { steps: 7_500, level: 'moderate' },
  { steps: 5_000, level: 'light' },
  { steps: 0, level: 'sedentary' },
];

/** The band a step average falls in, with no opinion about what was declared. */
export function activityFromSteps(steps: number): ActivityLevel {
  return ACTIVITY_STEPS.find((band) => steps >= band.steps)!.level;
}

/**
 * The activity level to compute with, given what they said and what they walked.
 *
 * The asymmetry below is the whole of this function, and it comes from what a
 * pedometer can and cannot see. Steps are ambulatory movement only: a cyclist,
 * a swimmer and somebody who lifts four times a week can all be genuinely
 * active at three thousand steps a day. So a step count is **evidence of a
 * floor on activity, never a measure of it**, and it is allowed to act like one:
 *
 * - **Upward, freely.** Thirteen thousand steps a day *is* an active person,
 *   whatever they picked off a dropdown at onboarding. There is no way to walk
 *   that far and not have spent the energy, so the measurement simply wins.
 * - **Downward, one notch at most.** A declared "very active" at three thousand
 *   steps might be somebody who over-claimed, and might be a cyclist. Those are
 *   not distinguishable from here, and the cost of guessing wrong is a target
 *   several hundred calories under what somebody actually burns. One notch is
 *   the hedge; `adaptive.ts` closes the rest of the gap from the scale, which
 *   is the only instrument that sees all of it.
 *
 * The declared level is therefore not overwritten anywhere — not here, and not
 * on the profile. It is a claim about their whole life, including training this
 * cannot see, and the arithmetic borrows from it rather than replacing it.
 */
export function measuredActivityLevel(
  declared: ActivityLevel | null,
  steps: number | null,
): ActivityLevel {
  const stated = declared ?? 'moderate';
  if (steps === null) return stated;

  const walked = activityFromSteps(steps);
  const statedAt = ACTIVITY_ORDER.indexOf(stated);
  const walkedAt = ACTIVITY_ORDER.indexOf(walked);

  /* Up as far as the walking proves; down by one, and no further. */
  return ACTIVITY_ORDER[Math.max(walkedAt, statedAt - 1)]!;
}

/**
 * §10: a starting point, deliberately not presented as the final word.
 *
 * A share of maintenance rather than a flat number of calories, because a flat
 * number is two different prescriptions depending on who reads it. Against the
 * ~2,900 kcal a young active man burns, 500 is a 17% cut; against the ~1,925 of
 * a sedentary woman in her fifties it is 26% — so the person with the least
 * room to give was being handed the harshest deficit, purely as an artefact of
 * subtracting a constant. A multiplier hands everybody the same cut.
 */
export const GOAL_TDEE_FACTOR: Record<Goal, number> = {
  lose: 0.8,
  maintain: 1,
  gain: 1.12,
};

/** Nobody's target goes below this, however the arithmetic comes out. */
export const MIN_TARGET_KCAL = 1200;

/**
 * The most of the day's energy protein may claim.
 *
 * The anchor below is a figure per kilo, and a figure per kilo knows nothing
 * about the size of the target it has to fit inside. This is the half of the
 * rule that does: whatever the anchor asks for, protein does not get to crowd
 * the rest of the day out. It is also what keeps `carbs_g` honest — see
 * `macrosFor`.
 */
export const MAX_PROTEIN_ENERGY_SHARE = 0.35;

/** Fat's share of energy. The remainder, after protein, is carbohydrate. */
const FAT_ENERGY_SHARE = 0.28;

/**
 * The top of the healthy BMI range, used as a ceiling on the weight protein is
 * calculated from. See `proteinAnchorKg`.
 */
const REFERENCE_BMI = 25;

export interface TargetInputs {
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  /**
   * Their recent daily step average, when their phone has been reporting one.
   *
   * Optional, and null for everybody whose phone is not counting — which is
   * most people and every Android user today. Absent, the arithmetic is exactly
   * what it was before this field existed, which is the property that makes it
   * safe to add here rather than behind a flag.
   *
   * It reaches only `ACTIVITY_MULTIPLIER`, through `measuredActivityLevel`, and
   * never becomes a calorie of its own. A step is not a burn; it is evidence
   * about which multiplier this person's body has been living at. See
   * `services/metrics.ts`.
   */
  measured_steps?: number | null;
}

/** What `macrosFor` needs to split an energy target. `TargetInputs` satisfies it. */
export interface MacroBasis {
  weight_kg: number | null;
  height_cm: number | null;
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

/**
 * Mifflin-St Jeor × activity. Population maintenance, before any goal adjustment.
 *
 * The multiplier was the one pure guess left in this formula: five levels
 * spanning 1.2 to 1.9 — well over a thousand kcal of spread for a typical BMR —
 * decided by a dropdown answered once at onboarding and never revisited. Where
 * a phone has been counting, `measuredActivityLevel` corrects it against what
 * the person actually did, which is the whole reason the step feed exists.
 */
export function predictTdee(inputs: TargetInputs): number | null {
  const { sex, height_cm, weight_kg, activity_level } = inputs;
  const age = ageFrom(inputs.birth_date);
  if (!sex || !height_cm || !weight_kg || age === null) return null;

  const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + (sex === 'male' ? 5 : -161);
  return bmr * ACTIVITY_MULTIPLIER[measuredActivityLevel(activity_level, inputs.measured_steps ?? null)];
}

/** Maintenance, aimed at a goal, floored and rounded the way a target is. */
export function targetKcalFor(tdee: number, goal: Goal | null): number {
  return Math.max(
    MIN_TARGET_KCAL,
    Math.round((tdee * GOAL_TDEE_FACTOR[goal ?? 'maintain']) / 10) * 10,
  );
}

/**
 * The weight to hang the protein figure on.
 *
 * Scale weight is the wrong anchor above a healthy BMI. Two grams per kilo is
 * guidance written about lean mass, and fat mass does not eat: applied whole to
 * 97 kg it asks for 194 g of protein a day — the better part of a kilo of
 * chicken, and on a 1,420 kcal target, 55% of the entire day.
 *
 * Capped at what the top of the healthy range weighs at their height, rather
 * than at any notion of what they personally ought to weigh. Someone already at
 * or below it is their own best anchor and keeps exactly the figure they had.
 */
export function proteinAnchorKg(weightKg: number, heightCm: number | null): number {
  if (!heightCm) return weightKg;
  const meters = heightCm / 100;
  return Math.min(weightKg, REFERENCE_BMI * meters * meters);
}

/**
 * Splits an energy target into macros. Protein is anchored to bodyweight, fat to
 * a share of energy, carbs take the rest — so a changed calorie number produces
 * a coherent macro set rather than three numbers that no longer add up.
 *
 * Carbs taking "the rest" is only true while there is a rest to take, which is
 * what `MAX_PROTEIN_ENERGY_SHARE` guarantees: 35% to protein and 28% to fat
 * leaves 37% of the day for carbohydrate no matter who is asking. Without that
 * ceiling the residual went where the arithmetic sent it — 17% for the person
 * above, zero for someone heavier — and the floor underneath it quietly broke
 * the promise in the paragraph above rather than reporting it.
 */
export function macrosFor(
  kcal: number,
  basis: MacroBasis,
): Pick<Targets, 'protein_g' | 'carbs_g' | 'fat_g'> {
  const { weight_kg, height_cm, goal } = basis;
  const perKg = goal === 'lose' ? 2.0 : 1.8;
  const anchored = weight_kg
    ? proteinAnchorKg(weight_kg, height_cm) * perKg
    : (kcal * 0.3) / 4;

  // Floored rather than rounded on the ceiling side, so that a cap named for a
  // maximum is one.
  const protein_g = Math.min(
    Math.round(anchored),
    Math.floor((kcal * MAX_PROTEIN_ENERGY_SHARE) / 4),
  );
  const fat_g = Math.round((kcal * FAT_ENERGY_SHARE) / 9);
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { protein_g, carbs_g, fat_g };
}

export function calculateTargets(inputs: TargetInputs): Targets {
  const tdee = predictTdee(inputs);
  if (tdee === null) return FALLBACK_TARGETS;

  const kcal = targetKcalFor(tdee, inputs.goal);
  return {
    kcal,
    ...macrosFor(kcal, inputs),
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
