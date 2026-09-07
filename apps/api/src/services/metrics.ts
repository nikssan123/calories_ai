import type { DailySteps, StepsSummary } from '@ct/shared';
import { STEP_SYNC_WINDOW_DAYS } from '@ct/shared';
import { query } from '../db.ts';
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
 * How many settled days an average needs before it means anything.
 *
 * Four, because a working week and a weekend are different behaviours and a
 * figure built from two days is a figure built from whichever two. Below this
 * every caller reports null rather than a number nobody should act on.
 */
export const MIN_DAYS_FOR_AVERAGE = 4;

/**
 * Whether a day may be averaged against.
 *
 * Two days are excluded, and for the same reason rather than two: neither one
 * covers the hours it appears to.
 *
 * **Today**, because it is still happening. A reading at nine in the morning is
 * a third of a day, and averaging it in would make "your usual" depend on what
 * time somebody opened the app.
 *
 * **The first day there was ever a reading**, because on Android it almost
 * never is one. Health Connect is a store, and the apps that fill it write
 * *forward* from the moment they are permitted — Samsung Health does not
 * backfill. So the day somebody switches steps on holds the walking they did
 * after tapping Allow and none of what came before it: on a real S25 on
 * 2026-09-07, Samsung Health's own tally read 8,570 while Health Connect held
 * 56. Left in, that day sits in the window for a week (`STEP_SYNC_WINDOW_DAYS`)
 * dragging the average under a band boundary — [56, 8500, 8500, 8500] averages
 * 6,389, which `activityFromSteps` reads as `light` where the truth is
 * `moderate`. `measuredActivityLevel` caps the fall at one notch and
 * `adaptive.ts` closes the rest from the scale, so the cost is bounded; it is
 * still a wrong number offered on the one day a new reader is deciding whether
 * to believe any of this.
 *
 * The day is still *drawn* — it is real walking, and the chart is a record of
 * what happened rather than a reference to be compared against. Only the
 * average leaves it out.
 *
 * Known gap: somebody who revokes the permission for a month and grants it
 * again has a second partial day, and it is not the first one, so this does not
 * catch it. Handling that needs the grant recorded rather than inferred, which
 * is a schema change for a case that happens once in a rare while against one
 * that happens to every Android reader exactly once.
 */
function isSettled(day: string, today: string, firstEver: string | null): boolean {
  return day !== today && day !== firstEver;
}

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
  return (await stepsContextFor(userId, localDate)).steps;
}

/**
 * A day's count and the ordinary week behind it, in one round trip.
 *
 * The average is here rather than left to the caller because a step count on
 * its own does not say very much. Eight thousand is a lot for one person and a
 * quiet day for another, and the only reference this app can honestly offer is
 * the reader's own recent behaviour — it has never had a step *goal*, and
 * inventing one to put a ring around would be inventing a number and then
 * grading somebody against it.
 *
 * Both come out of one scan of the same eight rows, which is why they travel
 * together: the widget and the day summary each want both, and asking twice
 * would be two queries over an index that has already found the range.
 */
export async function stepsContextFor(
  userId: string,
  localDate: string,
): Promise<{ steps: number | null; average: number | null }> {
  const rows = await query<{ local_date: string; steps: string; first_date: string | null }>(
    `SELECT local_date::text AS local_date, MAX(steps) AS steps,
            (SELECT MIN(local_date)
               FROM daily_metrics
              WHERE user_id = $1
                AND steps IS NOT NULL)::text AS first_date
       FROM daily_metrics
      WHERE user_id = $1
        AND local_date BETWEEN $2 AND $3
        AND steps IS NOT NULL
   GROUP BY local_date`,
    [userId, addDays(localDate, -STEP_SYNC_WINDOW_DAYS), localDate],
  );

  const today = rows.find((r) => r.local_date === localDate);
  /*
   * The day itself is excluded from its own reference. It is incomplete for
   * most of its length — a reading at nine in the morning is a third of a day —
   * and averaging it in would make "your usual" depend on what time somebody
   * happened to look at their home screen.
   */
  const settled = rows.filter((r) => isSettled(r.local_date, localDate, rows[0]?.first_date ?? null));

  return {
    steps: today ? Number(today.steps) : null,
    average:
      settled.length >= MIN_DAYS_FOR_AVERAGE
        ? Math.round(settled.reduce((sum, r) => sum + Number(r.steps), 0) / settled.length)
        : null,
  };
}

/**
 * A window of days, newest last, for the chart and for the agent's day context.
 *
 * Days with no reading are absent rather than zeroed, which is why `average`
 * has to be computed here instead of by whoever draws it: the caller sees a
 * sparse array and cannot tell a quiet day from a missing one without knowing
 * how the query was written.
 */
async function stepsWindow(
  userId: string,
  today: string,
  days: number,
): Promise<{ series: DailySteps[]; firstEver: string | null }> {
  const from = addDays(today, -(days - 1));
  const rows = await query<{ local_date: string; steps: string; first_date: string | null }>(
    `SELECT local_date::text AS local_date, MAX(steps) AS steps,
            (SELECT MIN(local_date)
               FROM daily_metrics
              WHERE user_id = $1
                AND steps IS NOT NULL)::text AS first_date
       FROM daily_metrics
      WHERE user_id = $1
        AND local_date BETWEEN $2 AND $3
        AND steps IS NOT NULL
   GROUP BY local_date
   ORDER BY local_date ASC`,
    [userId, from, today],
  );

  return {
    series: rows.map((r) => ({
      local_date: r.local_date,
      steps: Number(r.steps),
      source: DEVICE_SOURCE,
    })),
    /*
     * Carried out rather than applied here, because the window may not contain
     * it: a reader of two years has a first day far behind `from`, and the
     * exclusion must still know the date to be sure this window holds none of
     * it. `null` only when the reader has never reported a step at all.
     */
    firstEver: rows[0]?.first_date ?? null,
  };
}

export async function stepsSummary(
  userId: string,
  today: string,
  days = 30,
): Promise<StepsSummary> {
  const { series, firstEver } = await stepsWindow(userId, today, days);

  /* Both exclusions, and why, are on `isSettled`. The chart still draws every
     day in `series`; only the number they get compared against leaves any out. */
  const settled = series.filter((d) => isSettled(d.local_date, today, firstEver));
  const average =
    settled.length > 0
      ? Math.round(settled.reduce((sum, d) => sum + d.steps, 0) / settled.length)
      : null;

  return { days: series, average };
}

export async function recentStepAverage(
  userId: string,
  today: string,
): Promise<number | null> {
  const { series, firstEver } = await stepsWindow(userId, today, STEP_SYNC_WINDOW_DAYS + 1);
  const settled = series.filter((d) => isSettled(d.local_date, today, firstEver));
  if (settled.length < MIN_DAYS_FOR_AVERAGE) return null;
  return Math.round(settled.reduce((sum, d) => sum + d.steps, 0) / settled.length);
}
