import type { ActivityLevel, Goal, Sex, TargetBasis, Targets, TargetSource } from '@ct/shared';
import { targetInputsChanged } from '@ct/shared';
// Both derived rather than stored, and both now shared with the clients: the
// phone has to draw the quality panel for a day it cannot fetch, and both
// clients have to know whether the save they just made could have moved a
// target before they report a number for it.
export { qualityTargetsFor, targetInputsChanged } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { latestWeight } from './log.ts';
import { recentStepAverage } from './metrics.ts';

/*
 * The arithmetic itself lives in `@ct/shared`, so that the phone can draw a plan
 * before there is an account to save it to. Re-exported under the same names,
 * so nothing on the server had to learn where it went.
 */
export {
  activityFromSteps,
  ageFrom,
  bmiFor,
  calculateTargets,
  effectiveGoal,
  FALLBACK_TARGETS,
  GOAL_TDEE_FACTOR,
  isUnderweight,
  macrosFor,
  MAX_PROTEIN_ENERGY_SHARE,
  measuredActivityLevel,
  MIN_GAIN_SURPLUS_KCAL,
  MIN_HEALTHY_BMI,
  MIN_TARGET_KCAL,
  predictTdee,
  proteinAnchorKg,
  targetKcalFor,
  type BmiBasis,
  type MacroBasis,
  type TargetInputs,
} from '@ct/shared';
import {
  calculateTargets,
  FALLBACK_TARGETS,
  GOAL_TDEE_FACTOR,
  macrosFor,
  targetKcalFor,
} from '@ct/shared';

/** The row in force on a given day, or null when this account has never had one. */
async function storedTargetsForDate(userId: string, localDate: string): Promise<Targets | null> {
  return queryOne<Targets>(
    `SELECT kcal, protein_g, carbs_g, fat_g, is_custom, source
       FROM targets
      WHERE user_id = $1 AND effective_from <= $2
   ORDER BY effective_from DESC
      LIMIT 1`,
    [userId, localDate],
  );
}

/** The target that was in force on a given day — not necessarily today's. */
export async function targetsForDate(userId: string, localDate: string): Promise<Targets> {
  return (await storedTargetsForDate(userId, localDate)) ?? FALLBACK_TARGETS;
}

/**
 * The same learned maintenance, aimed at a different goal.
 *
 * Recovered by undoing the old goal's factor rather than by re-reading a
 * fortnight of logs to answer a question the number on file already answers.
 * Exact unless the floor clamped the row it came from, in which case the
 * maintenance comes out a little high — which is the direction to be wrong in,
 * and the next pass corrects it either way.
 */
function regoal(
  current: Targets,
  from: Goal | null,
  to: Goal | null,
  weightKg: number | null,
  heightCm: number | null,
): Targets {
  const maintenance = current.kcal / GOAL_TDEE_FACTOR[from ?? 'maintain'];
  const kcal = targetKcalFor(maintenance, to, { weight_kg: weightKg, height_cm: heightCm });
  return {
    kcal,
    ...macrosFor(kcal, { weight_kg: weightKg, height_cm: heightCm, goal: to }),
    is_custom: false,
    source: 'adaptive',
  };
}

/**
 * Re-points the target at a profile that has just changed. The one path for it:
 * the settings screen and the conversation both land here, because they were
 * two copies of this and the copies had already begun to differ.
 */
export async function retargetFromProfile(
  userId: string,
  before: TargetBasis,
  after: TargetBasis,
  localDate: string,
  reason: string,
): Promise<void> {
  const existing = await storedTargetsForDate(userId, localDate);

  // A number the user typed is not ours to move — the same rule the adaptive
  // pass keeps.
  if (existing?.is_custom) return;

  /*
   * A patch that touched none of the five is a patch the formula cannot react
   * to: a renamed account, a flipped notification switch, pounds instead of
   * kilos. Recomputing anyway wrote an identical row over the top of whatever
   * was there, which was harmless for exactly as long as the only thing ever
   * there was this same formula's output — and stopped being harmless the day
   * the adaptive pass started writing rows of its own.
   */
  if (existing && !targetInputsChanged(before, after)) return;

  const weight = await latestWeight(userId);

  /*
   * A measured target is rebased, never replaced.
   *
   * An `adaptive` row carries weeks of convergence: the pass moves it at most
   * 200 kcal at a time towards what this person's own intake and scale say they
   * burn, and Mifflin-St Jeor is the placeholder it has been correcting all
   * along. Recomputing the formula over the top of it throws away a measurement
   * in favour of the population average it beat — and none of the fields that
   * can change here are inputs to a measurement anyway. Height and activity
   * level feed a prediction we no longer need; what they actually burn was
   * observed with those already priced in.
   *
   * The goal is the exception, and the only one: it moves the target without
   * moving what they burn. So it is re-applied to the maintenance the pass
   * learned, and everything else is left standing.
   */
  if (existing?.source === 'adaptive') {
    if (before.goal === after.goal) return;
    const rebased = regoal(existing, before.goal, after.goal, weight?.weight_kg ?? null, after.height_cm);
    await setTargets(userId, localDate, rebased, reason);
    return;
  }

  const targets = calculateTargets({
    sex: after.sex,
    birth_date: after.birth_date,
    height_cm: after.height_cm,
    weight_kg: weight?.weight_kg ?? null,
    activity_level: after.activity_level,
    goal: after.goal,
    /*
     * Only reached on the formula path, which is the only place it can do any
     * good. The `adaptive` branch above returns before this: a measured target
     * already has the walking priced into it — the scale saw it — and handing
     * that branch a step average would be offering a better prior to something
     * that has stopped needing one.
     */
    measured_steps: await recentStepAverage(userId, localDate),
  });
  await setTargets(userId, localDate, targets, reason);
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
