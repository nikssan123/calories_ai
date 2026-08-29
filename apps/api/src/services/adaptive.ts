import type { AdaptiveBlocker, AdaptiveProposal, Confidence, TdeeEstimate } from '@ct/shared';
import { query } from '../db.ts';
import { addDays, type DayContext, localDateFor } from '../time.ts';
import { latestWeight, listWeights } from './log.ts';
import {
  MIN_TARGET_KCAL,
  macrosFor,
  predictTdee,
  setTargets,
  targetKcalFor,
  targetsForDate,
} from './targets.ts';
import { getUser } from './user.ts';
import { checkWellbeing } from './wellbeing.ts';

/**
 * Adaptive targets. Mifflin-St Jeor predicts what a population of people your
 * size burns; this measures what *you* burn, by reading the only experiment that
 * matters — what you ate and what the scale did about it.
 *
 * Energy balance over a window:
 *
 *     TDEE = mean daily intake − (weight change per day × kcal per kg)
 *
 * Lose 0.5 kg in a week on 2,000 kcal and you were burning ~2,550. The estimate
 * is calibrated against *logged* intake rather than true intake, so a consistent
 * under-logger converges on a target that works for the way they log. That is
 * deliberate: the useful number is the one that produces the intended trend.
 */

/** Energy in a kilogram of body mass. 7,700 is the convention for fat tissue. */
export const KCAL_PER_KG = 7700;

export const ADAPTIVE_WINDOW_DAYS = 14;

/** Below these the estimate is noise, and a noisy target is worse than a stale one. */
export const MIN_LOGGED_DAYS = 10;
export const MIN_WEIGH_INS = 4;
export const MIN_WEIGH_IN_SPAN_DAYS = 10;

/**
 * The most the target may move in one pass. Bodyweight carries several kilos of
 * water noise, so a single fortnight can imply an absurd TDEE; capping the step
 * lets successive weeks converge instead of oscillate.
 */
export const MAX_STEP_KCAL = 200;

/** Smaller than this is within the noise of the estimate — leave the target alone. */
export const MIN_MEANINGFUL_STEP_KCAL = 40;

/** How far the observed TDEE may sit from the predicted one before we disbelieve it. */
export const SANITY_BAND = 0.35;

/** §"every entry carries a confidence flag so uncertain days can be weighted down". */
const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1, medium: 0.8, low: 0.5 };

export interface DailyIntake {
  local_date: string;
  kcal: number;
  protein_g: number;
  /** 0.5-1, from the confidence of the entries that make up the day. */
  weight: number;
}

/**
 * Per-day intake with a confidence weight. A day built from weighed, packaged
 * food counts fully; a day of vague restaurant estimates counts about half.
 */
export async function dailyIntake(
  userId: string,
  from: string,
  to: string,
): Promise<DailyIntake[]> {
  const rows = await query<{
    local_date: string;
    kcal: number;
    protein_g: number;
    high: number;
    medium: number;
    low: number;
  }>(
    `SELECT e.local_date,
            COALESCE(SUM(i.kcal), 0)      AS kcal,
            COALESCE(SUM(i.protein_g), 0) AS protein_g,
            COALESCE(SUM(i.kcal) FILTER (WHERE e.confidence = 'high'), 0)   AS high,
            COALESCE(SUM(i.kcal) FILTER (WHERE e.confidence = 'medium'), 0) AS medium,
            COALESCE(SUM(i.kcal) FILTER (WHERE e.confidence = 'low'), 0)    AS low
       FROM food_entries e
       LEFT JOIN food_items i ON i.entry_id = e.id
      WHERE e.user_id = $1 AND e.local_date BETWEEN $2 AND $3
   GROUP BY e.local_date
     HAVING COALESCE(SUM(i.kcal), 0) > 0
   ORDER BY e.local_date ASC`,
    [userId, from, to],
  );

  return rows.map((r) => {
    const total = Number(r.high) + Number(r.medium) + Number(r.low);
    const weighted =
      Number(r.high) * CONFIDENCE_WEIGHT.high +
      Number(r.medium) * CONFIDENCE_WEIGHT.medium +
      Number(r.low) * CONFIDENCE_WEIGHT.low;
    return {
      local_date: r.local_date,
      kcal: Number(r.kcal),
      protein_g: Number(r.protein_g),
      weight: total > 0 ? weighted / total : CONFIDENCE_WEIGHT.medium,
    };
  });
}

/**
 * Least-squares slope of y against x. Returns null when every point shares one
 * x, which would otherwise divide by zero.
 */
export function linearSlope(points: Array<{ x: number; y: number }>): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.x - meanX) * (p.y - meanY);
    denominator += (p.x - meanX) ** 2;
  }
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function weightedMean(values: Array<{ value: number; weight: number }>): number | null {
  const totalWeight = values.reduce((s, v) => s + v.weight, 0);
  if (totalWeight === 0) return null;
  return values.reduce((s, v) => s + v.value * v.weight, 0) / totalWeight;
}

function dayIndex(isoDate: string, origin: string): number {
  return Math.round(
    (Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${origin}T00:00:00Z`)) / 86_400_000,
  );
}

export interface EstimateResult {
  estimate: TdeeEstimate | null;
  blocked_by: AdaptiveBlocker | null;
}

/**
 * Reads the window and, if there is enough of it, solves for TDEE. Returns the
 * reason it could not rather than throwing — the caller shows it to the user.
 */
export async function estimateTdee(
  userId: string,
  ctx: DayContext,
  windowDays = ADAPTIVE_WINDOW_DAYS,
  today = localDateFor(new Date(), ctx),
): Promise<EstimateResult> {
  // The window ends yesterday. Today is a partial day almost every time this
  // runs — a breakfast logged against a whole day's worth of nothing — and
  // counting it would drag the intake mean down, and with it the estimated
  // maintenance and the target. Weekly, in the same direction, forever.
  const to = addDays(today, -1);
  const from = addDays(to, -(windowDays - 1));

  const [intake, weights, user] = await Promise.all([
    dailyIntake(userId, from, to),
    listWeights(userId, { from, to }),
    getUser(userId),
  ]);

  if (intake.length < MIN_LOGGED_DAYS) {
    return { estimate: null, blocked_by: 'not_enough_logged_days' };
  }
  if (weights.length < MIN_WEIGH_INS) {
    return { estimate: null, blocked_by: 'not_enough_weigh_ins' };
  }

  const span = dayIndex(weights.at(-1)!.local_date, weights[0]!.local_date);
  if (span < MIN_WEIGH_IN_SPAN_DAYS) {
    return { estimate: null, blocked_by: 'weigh_in_span_too_short' };
  }

  const meanIntake = weightedMean(intake.map((d) => ({ value: d.kcal, weight: d.weight })))!;
  const slopePerDay =
    linearSlope(
      weights.map((w) => ({ x: dayIndex(w.local_date, from), y: w.weight_kg })),
    ) ?? 0;

  const observed = meanIntake - slopePerDay * KCAL_PER_KG;
  const predicted =
    predictTdee({
      sex: user.sex,
      birth_date: user.birth_date,
      height_cm: user.height_cm,
      weight_kg: weights.at(-1)!.weight_kg,
      activity_level: user.activity_level,
      goal: user.goal,
    }) ?? observed;

  // Three things make an estimate trustworthy: how much of the window was
  // logged, how confident those logs were, and how many times the scale was
  // read. Their product scales how far the target is allowed to move.
  const coverage = Math.min(1, intake.length / windowDays);
  const confidence = intake.reduce((s, d) => s + d.weight, 0) / intake.length;
  const scale = Math.min(1, weights.length / (windowDays / 2));
  const quality = round2(coverage * confidence * scale);

  return {
    estimate: {
      observed_tdee_kcal: Math.round(observed),
      predicted_tdee_kcal: Math.round(predicted),
      mean_intake_kcal: Math.round(meanIntake),
      weight_change_kg_per_week: round2(slopePerDay * 7),
      window_days: windowDays,
      days_logged: intake.length,
      weigh_ins: weights.length,
      quality,
    },
    blocked_by: null,
  };
}

/**
 * Turns an estimate into the target row it implies, with every guardrail
 * applied. Nothing is written — `applyAdaptiveTargets` does that.
 */
export async function proposeTargets(
  userId: string,
  ctx: DayContext,
  today = localDateFor(new Date(), ctx),
): Promise<AdaptiveProposal> {
  const [current, user, weight] = await Promise.all([
    targetsForDate(userId, today),
    getUser(userId),
    latestWeight(userId),
  ]);

  const unchanged = (blocked: AdaptiveBlocker, estimate: TdeeEstimate | null, why: string) => ({
    eligible: false,
    blocked_by: blocked,
    estimate,
    current,
    proposed: current,
    delta_kcal: 0,
    explanation: why,
  });

  // A number the user typed is not ours to move.
  if (current.is_custom) {
    return unchanged('custom_targets', null, 'Your targets are set manually, so this leaves them alone.');
  }

  /*
   * Read before the estimate, because it is a fact about the person rather than
   * about the data, and it outranks every guardrail below.
   */
  const wellbeing = await checkWellbeing(userId, ctx, today);

  const { estimate, blocked_by } = await estimateTdee(userId, ctx, ADAPTIVE_WINDOW_DAYS, today);
  if (!estimate) {
    return unchanged(blocked_by!, null, BLOCKER_TEXT[blocked_by!]);
  }

  // A fortnight of water weight can imply a TDEE of 900 or 5,000. Disbelieve
  // anything that far from the formula rather than acting on it.
  //
  // Someone eating far too little is exactly the person whose observed
  // maintenance lands outside the band, so without the first branch this
  // guardrail quietly swallows the case and reports a complaint about data
  // quality to the one person who needed to be told something else.
  const drift = Math.abs(estimate.observed_tdee_kcal - estimate.predicted_tdee_kcal);
  if (drift > estimate.predicted_tdee_kcal * SANITY_BAND) {
    return wellbeing.intake_below_floor
      ? unchanged('intake_below_floor', estimate, BLOCKER_TEXT.intake_below_floor)
      : unchanged(
          'estimate_out_of_range',
          estimate,
          `The last ${estimate.window_days} days imply ${estimate.observed_tdee_kcal} kcal maintenance, too far from the expected ${estimate.predicted_tdee_kcal} to trust yet.`,
        );
  }

  const goal = user.goal ?? 'maintain';
  const ideal = targetKcalFor(estimate.observed_tdee_kcal, goal);
  const raw = clamp(ideal - current.kcal, -MAX_STEP_KCAL * estimate.quality, MAX_STEP_KCAL * estimate.quality);

  /*
   * The one guardrail here that is about the person rather than the data.
   *
   * Everything above asks "is this estimate trustworthy". This asks "should we
   * act on it at all" — and for someone whose logged week already sits under
   * the floor, the honest answer to a downward step is no. Left alone the pass
   * would read a low intake as a low maintenance and lower the target to match,
   * every week, in the same direction, which is the exact shape of the harm.
   *
   * Clamped rather than blocked outright, so an *upward* move still lands. That
   * asymmetry is the whole point: the pass is allowed to help someone eat more.
   */
  const step = wellbeing.intake_below_floor ? Math.max(0, raw) : raw;

  const kcal = Math.max(MIN_TARGET_KCAL, Math.round((current.kcal + step) / 10) * 10);
  const delta = kcal - current.kcal;

  if (wellbeing.intake_below_floor && delta <= 0) {
    return unchanged('intake_below_floor', estimate, BLOCKER_TEXT.intake_below_floor);
  }

  if (Math.abs(delta) < MIN_MEANINGFUL_STEP_KCAL) {
    return unchanged(
      'change_too_small',
      estimate,
      `Your target is already within ${Math.abs(delta)} kcal of what the data says. Left as is.`,
    );
  }

  const direction = delta > 0 ? 'up' : 'down';
  const trend =
    estimate.weight_change_kg_per_week === 0
      ? 'holding steady'
      : `${estimate.weight_change_kg_per_week > 0 ? 'up' : 'down'} ${Math.abs(estimate.weight_change_kg_per_week)} kg/week`;

  return {
    eligible: true,
    blocked_by: null,
    estimate,
    current,
    proposed: {
      kcal,
      ...macrosFor(kcal, {
        weight_kg: weight?.weight_kg ?? null,
        height_cm: user.height_cm,
        goal: user.goal,
      }),
      is_custom: false,
      source: 'adaptive',
    },
    delta_kcal: delta,
    explanation: `Averaging ${estimate.mean_intake_kcal} kcal and ${trend} puts your maintenance near ${estimate.observed_tdee_kcal}, so the target moves ${direction} ${Math.abs(delta)} to ${kcal}.`,
  };
}

const BLOCKER_TEXT: Record<AdaptiveBlocker, string> = {
  not_enough_logged_days: `Needs at least ${MIN_LOGGED_DAYS} logged days in the last ${ADAPTIVE_WINDOW_DAYS} before it can measure anything.`,
  not_enough_weigh_ins: `Needs at least ${MIN_WEIGH_INS} weigh-ins in the last ${ADAPTIVE_WINDOW_DAYS} days — the scale is half the equation.`,
  weigh_in_span_too_short: `Your weigh-ins are bunched too close together to read a trend; ${MIN_WEIGH_IN_SPAN_DAYS} days between the first and last is the minimum.`,
  custom_targets: 'Your targets are set manually, so this leaves them alone.',
  estimate_out_of_range: 'The estimate is too far from expectation to act on yet.',
  change_too_small: 'Your target already matches what the data says.',
  intake_below_floor: `Your logged intake this week is under ${MIN_TARGET_KCAL} kcal a day, so this is not lowering your target. If that is not what you have actually been eating, log the days you missed; if it is, it is worth talking to a doctor or a dietitian rather than cutting further.`,
};

/** Proposes, and writes the row when the proposal is eligible. */
export async function applyAdaptiveTargets(
  userId: string,
  ctx: DayContext,
  today = localDateFor(new Date(), ctx),
): Promise<{ proposal: AdaptiveProposal; applied: boolean }> {
  const proposal = await proposeTargets(userId, ctx, today);
  if (!proposal.eligible) return { proposal, applied: false };

  await setTargets(userId, today, proposal.proposed, proposal.explanation);
  return { proposal, applied: true };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
