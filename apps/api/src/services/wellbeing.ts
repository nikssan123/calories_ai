import type { DayContext } from '../time.ts';
import { addDays, localDateFor } from '../time.ts';
import { dailyIntake, linearSlope } from './adaptive.ts';
import { listWeights } from './log.ts';
import { MIN_TARGET_KCAL } from './targets.ts';

/**
 * The two things the app should notice about a person rather than about their
 * data.
 *
 * Everything else in this codebase optimises: the adaptive pass moves a target
 * toward what the scale says, the kitchen fits a recipe into what is left, the
 * review names a pattern. All of that is the right behaviour for someone who is
 * fine, and the wrong behaviour for someone who is not — an optimiser pointed at
 * a person eating 900 kcal a day will cheerfully help them eat less.
 *
 * Nothing here gates anything. Consistent with how email verification gates
 * nothing: the app keeps working, it keeps logging, it just stops pushing in a
 * direction that hurts. A tracker that locks someone out is a tracker they stop
 * opening, and the log is the only thing here with any value.
 *
 * This module and `adaptive.ts` import each other, which is deliberate and safe:
 * they are two halves of one judgement — what the data says, and whether to act
 * on it — and everything crossing the boundary is a hoisted function called at
 * request time. Nothing is read at module scope.
 */

/** A week is the shortest window where "how much are they eating" is a fact. */
export const WELLBEING_WINDOW_DAYS = 7;

/**
 * Below this many logged days the mean is an artefact of which days got logged.
 * Four of seven is enough to be a habit rather than a couple of quiet days.
 */
export const MIN_DAYS_FOR_INTAKE_CHECK = 4;

/**
 * Weekly loss beyond this share of bodyweight stops being fat and starts being
 * muscle and water. 1% is the standard clinical ceiling and it scales with the
 * person, which a flat kg figure does not: 1 kg a week is unremarkable at 140 kg
 * and alarming at 50.
 */
export const MAX_SAFE_LOSS_FRACTION = 0.01;

export interface Wellbeing {
  /**
   * They have been eating under the floor the app will not target below.
   *
   * The floor exists in `targets.ts` to protect the arithmetic. This is the
   * other half: noticing when somebody is living below it anyway.
   */
  intake_below_floor: boolean;
  /** Losing faster than roughly 1% of bodyweight a week, sustained. */
  losing_too_fast: boolean;
  /** Plain mean of logged days in the window. Null when too few to mean anything. */
  mean_intake_kcal: number | null;
  days_logged: number;
  /** Signed, so a gain is positive. Null when the scale was not read enough. */
  loss_pct_per_week: number | null;
}

const NOTHING_TO_REPORT: Wellbeing = {
  intake_below_floor: false,
  losing_too_fast: false,
  mean_intake_kcal: null,
  days_logged: 0,
  loss_pct_per_week: null,
};

/**
 * Both checks over the last week, from the data already in the log.
 *
 * The window ends yesterday for the same reason `estimateTdee`'s does: today is
 * a partial day almost every time this runs, and a breakfast counted as a whole
 * day's intake would report half the population as under-eating every morning.
 */
export async function checkWellbeing(
  userId: string,
  ctx: DayContext,
  today = localDateFor(new Date(), ctx),
): Promise<Wellbeing> {
  const to = addDays(today, -1);
  const from = addDays(to, -(WELLBEING_WINDOW_DAYS - 1));

  const [intake, weights] = await Promise.all([
    dailyIntake(userId, from, to),
    // A fortnight, not a week: a slope needs a span to be read across, and
    // seven days of a noisy scale is mostly water.
    listWeights(userId, { from: addDays(to, -13), to }),
  ]);

  if (intake.length < MIN_DAYS_FOR_INTAKE_CHECK) {
    // Not enough logging to say anything about them. Silence is the honest
    // answer — someone who logs twice a week is not someone who eats twice a
    // week, and treating the gap as data would fire this at almost everyone.
    return { ...NOTHING_TO_REPORT, days_logged: intake.length };
  }

  /*
   * A plain mean, unlike `estimateTdee`'s. The confidence weighting there
   * exists to damp a TDEE estimate toward the days that were logged carefully;
   * applying it here would quietly discount exactly the person whose logging is
   * vague, which is not a person this check should be less worried about.
   */
  const meanIntake = intake.reduce((sum, day) => sum + day.kcal, 0) / intake.length;

  const lossPct = weeklyLossFraction(weights);

  return {
    intake_below_floor: meanIntake < MIN_TARGET_KCAL,
    losing_too_fast: lossPct !== null && lossPct < -MAX_SAFE_LOSS_FRACTION,
    mean_intake_kcal: Math.round(meanIntake),
    days_logged: intake.length,
    loss_pct_per_week: lossPct === null ? null : Math.round(lossPct * 1000) / 10,
  };
}

/**
 * Weekly weight change as a share of bodyweight, from the least-squares slope
 * rather than first-versus-last — two weigh-ins either side of a salty dinner
 * can imply anything, and the slope is what `estimateTdee` already trusts.
 */
function weeklyLossFraction(
  weights: Array<{ local_date: string; weight_kg: number }>,
): number | null {
  if (weights.length < 4) return null;

  const origin = weights[0]!.local_date;
  const slopePerDay = linearSlope(
    weights.map((w) => ({
      x: Math.round(
        (Date.parse(`${w.local_date}T00:00:00Z`) - Date.parse(`${origin}T00:00:00Z`)) / 86_400_000,
      ),
      y: w.weight_kg,
    })),
  );
  if (slopePerDay === null) return null;

  const current = weights.at(-1)!.weight_kg;
  if (current <= 0) return null;
  return (slopePerDay * 7) / current;
}
