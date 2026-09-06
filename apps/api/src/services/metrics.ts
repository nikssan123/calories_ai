import type { DailySteps, StepsSummary } from '@ct/shared';
import { STEP_SYNC_WINDOW_DAYS } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { addDays } from '../time.ts';

/**
 * What a device counted, as opposed to what a person logged.
 *
 * Everything here writes to `daily_metrics` and nothing here writes to
 * `exercise_entries`, and that separation is the feature rather than an
 * implementation detail. The argument is in full in INTEGRATIONS.md
 * §"The constraint that shapes everything" and in short on migration 044; what
 * matters at this layer is that there is no function below which turns a step
 * into a calorie, and adding one would be a regression rather than a feature.
 *
 * What steps are actually for, in the order the value lands:
 *
 *   1. Telling somebody's activity level from what they do instead of from what
 *      they picked off a dropdown at onboarding and never revisited. That is a
 *      1.2-to-1.9 multiplier in `predictTdee` — well over a thousand kcal of
 *      spread on one untested answer.
 *   2. Keeping `adaptive.ts` from disbelieving a good measurement. `SANITY_BAND`
 *      rejects an observed TDEE more than 35% from the predicted one, and the
 *      predicted one rests on that same dropdown; a sedentary person who picked
 *      "moderate" has their honest estimate thrown out week after week.
 *   3. Giving the agent a cause for a plateau other than "eat less".
 *
 * None of the three needs a calorie figure, and none of them touches `net_kcal`.
 */

/** Rows are stored per source; this is the one the phone's pedometer writes. */
export const DEVICE_SOURCE = 'device';

/**
 * A day's count, recorded or corrected.
 *
 * An upsert because re-sending is the normal path and not a repair. A step
 * count is not an event: today's figure is still climbing at three in the
 * afternoon, and yesterday's is only final once the day has turned over. The
 * client re-reads its window on every foreground and sends it whole, so the
 * same day arrives many times and the last word wins.
 *
 * `GREATEST` rather than a plain overwrite, and this is the one line here worth
 * arguing about. A pedometer's history is a monotone thing — a day's count only
 * goes up — so a lower figure for a day already recorded is not a correction,
 * it is a device that has lost some of its history. Android in particular
 * resets its step sensor on reboot, and iOS returns a short window that a
 * restore from backup can truncate. Taking the max means a phone that reboots
 * at lunchtime cannot halve a day that was already counted, and the only way to
 * be wrong is to keep a figure that was genuinely too high — which no sensor
 * has any way to produce.
 */
export async function recordSteps(
  userId: string,
  days: DailySteps[],
): Promise<void> {
  const rows = dedupe(days);
  if (rows.length === 0) return;

  /*
   * One statement rather than a loop, because a foreground sync sends a week at
   * a time and seven round trips to write seven small integers is seven times
   * the latency for no gain. `unnest` keeps it to a single parameterised call
   * however many days arrive.
   */
  await query(
    `INSERT INTO daily_metrics (user_id, local_date, source, steps)
     SELECT $1, d.local_date::date, d.source, d.steps
       FROM unnest($2::text[], $3::text[], $4::int[])
         AS d(local_date, source, steps)
     ON CONFLICT (user_id, local_date, source)
     DO UPDATE SET steps     = GREATEST(daily_metrics.steps, EXCLUDED.steps),
                   synced_at = now()`,
    [
      userId,
      rows.map((d) => d.local_date),
      rows.map((d) => d.source),
      rows.map((d) => d.steps),
    ],
  );
}

/**
 * One row per day and source, keeping the highest count for each.
 *
 * Not defensive tidying — without it a client that repeats a day in one payload
 * gets a 500. Postgres refuses an `ON CONFLICT DO UPDATE` that would touch the
 * same row twice in a single statement ("cannot affect row a second time"), and
 * a payload is a list from a phone rather than a set from a database. Folding
 * duplicates with the same `GREATEST` the upsert uses means a repeated day
 * lands on the same answer either way.
 */
function dedupe(days: DailySteps[]): { local_date: string; source: string; steps: number }[] {
  const byKey = new Map<string, { local_date: string; source: string; steps: number }>();

  for (const day of days) {
    const source = day.source || DEVICE_SOURCE;
    const steps = Math.round(day.steps);
    const key = `${day.local_date}\u0000${source}`;
    const seen = byKey.get(key);
    if (seen === undefined || steps > seen.steps) {
      byKey.set(key, { local_date: day.local_date, source, steps });
    }
  }

  return [...byKey.values()];
}

/**
 * One day's steps, for the day summary.
 *
 * Null rather than zero when nothing was reported, and the distinction is
 * carried all the way to the screen — see `DaySummary.steps`. Nobody has ever
 * walked exactly nought steps, so a zero drawn under the word "steps" reads as
 * a claim about the person when it is really a fact about their phone.
 *
 * `MAX` across sources for the same reason the key holds several: a phone in a
 * pocket and a watch on a wrist both counted the same walk, and the higher of
 * the two is the one that saw more of it. Summing them would double a day for
 * anybody carrying both, which is the mistake this table's key exists to make
 * visible rather than to hide.
 */
export async function stepsForDay(userId: string, localDate: string): Promise<number | null> {
  const row = await queryOne<{ steps: string | null }>(
    `SELECT MAX(steps) AS steps
       FROM daily_metrics
      WHERE user_id = $1 AND local_date = $2`,
    [userId, localDate],
  );
  return row?.steps == null ? null : Number(row.steps);
}

/**
 * A window of days, newest last, for the chart and for the agent's day context.
 *
 * Days with no reading are absent rather than zeroed, which is why `average`
 * has to be computed here instead of by whoever draws it: the caller sees a
 * sparse array and cannot tell a quiet day from a missing one without knowing
 * how the query was written.
 */
export async function stepsSummary(
  userId: string,
  today: string,
  days = 30,
): Promise<StepsSummary> {
  const from = addDays(today, -(days - 1));
  const rows = await query<{ local_date: string; steps: string }>(
    `SELECT local_date::text AS local_date, MAX(steps) AS steps
       FROM daily_metrics
      WHERE user_id = $1
        AND local_date BETWEEN $2 AND $3
        AND steps IS NOT NULL
   GROUP BY local_date
   ORDER BY local_date ASC`,
    [userId, from, today],
  );

  const series: DailySteps[] = rows.map((r) => ({
    local_date: r.local_date,
    steps: Number(r.steps),
    source: DEVICE_SOURCE,
  }));

  /*
   * Today is excluded from the average. It is the one day in the window that is
   * guaranteed to be incomplete — a reading taken at nine in the morning is a
   * third of a day — and including it drags every average down by an amount
   * that depends on what time somebody happened to open the app. The chart
   * still draws it; only the number that gets compared against leaves it out.
   */
  const settled = series.filter((d) => d.local_date !== today);
  const average =
    settled.length > 0
      ? Math.round(settled.reduce((sum, d) => sum + d.steps, 0) / settled.length)
      : null;

  return { days: series, average };
}

/**
 * The recent daily average, for anything that wants one number.
 *
 * A week rather than the chart's month, and the reason is that this is meant to
 * answer "what is this person doing *now*" — the input to an activity level and
 * to the agent's read on a plateau. A month smooths over exactly the change
 * that is worth noticing.
 *
 * Null when the window is too thin to mean anything. Four days is the floor
 * because a working week and a weekend are different behaviours and a figure
 * built from two days is a figure built from whichever two.
 */
export const MIN_DAYS_FOR_AVERAGE = 4;

export async function recentStepAverage(
  userId: string,
  today: string,
): Promise<number | null> {
  const { days } = await stepsSummary(userId, today, STEP_SYNC_WINDOW_DAYS + 1);
  const settled = days.filter((d) => d.local_date !== today);
  if (settled.length < MIN_DAYS_FOR_AVERAGE) return null;
  return Math.round(settled.reduce((sum, d) => sum + d.steps, 0) / settled.length);
}
