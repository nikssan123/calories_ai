import type { Calendar, CalendarDay, ExerciseSummary, TrendPoint } from '@ct/shared';
import { query } from '../db.ts';
import { addDays, dateRange, type DayContext, localDateFor } from '../time.ts';
import { listExerciseEntries } from './log.ts';

/**
 * The two window-shaped reads that back the History and Exercise screens.
 *
 * Both answer "what did a stretch of days look like?", which `buildProgress`
 * deliberately does not: that one reduces a window to trends and averages,
 * while these keep every day addressable so a grid can be drawn and a cell
 * tapped.
 */

/**
 * A month of days for the calendar grid.
 *
 * Targets travel per day rather than being taken once for today, because they
 * are effective-from rows: an adaptive change in June would otherwise repaint
 * every day in May against a target that did not exist yet, turning a month of
 * days that were on target into a month that missed.
 */
export async function buildCalendar(
  userId: string,
  from: string,
  to: string,
): Promise<Calendar> {
  const [rows, exercise, weights] = await Promise.all([
    query<{
      local_date: string;
      kcal: string | number;
      protein_g: string | number;
      logged: boolean;
      target_kcal: number | null;
    }>(
      `SELECT d::date::text                       AS local_date,
              COALESCE(SUM(i.kcal), 0)            AS kcal,
              COALESCE(SUM(i.protein_g), 0)       AS protein_g,
              COUNT(e.id) > 0                     AS logged,
              t.kcal                              AS target_kcal
         FROM generate_series($2::date, $3::date, '1 day') d
         LEFT JOIN food_entries e
                ON e.user_id = $1 AND e.local_date = d::date
         LEFT JOIN food_items i ON i.entry_id = e.id
         LEFT JOIN LATERAL (
                SELECT kcal FROM targets
                 WHERE user_id = $1 AND effective_from <= d::date
              ORDER BY effective_from DESC
                 LIMIT 1
              ) t ON TRUE
     GROUP BY d, t.kcal
     ORDER BY d`,
      [userId, from, to],
    ),
    listExerciseEntries(userId, { from, to }),
    query<{ local_date: string; weight_kg: number }>(
      `SELECT local_date::text AS local_date, weight_kg
         FROM weight_entries
        WHERE user_id = $1 AND local_date BETWEEN $2 AND $3`,
      [userId, from, to],
    ),
  ]);

  const burnByDate = new Map<string, number>();
  for (const entry of exercise) {
    burnByDate.set(entry.local_date, (burnByDate.get(entry.local_date) ?? 0) + entry.kcal_burned);
  }
  const weightByDate = new Map(weights.map((w) => [w.local_date, Number(w.weight_kg)]));

  const days: CalendarDay[] = rows.map((row) => ({
    local_date: row.local_date,
    kcal: Math.round(Number(row.kcal)),
    protein_g: Math.round(Number(row.protein_g)),
    // A day before the first target row has none; the app's own fallback is the
    // honest answer there, and it is the number that screen was showing anyway.
    target_kcal: row.target_kcal ?? 0,
    burned_kcal: Math.round(burnByDate.get(row.local_date) ?? 0),
    weight_kg: weightByDate.get(row.local_date) ?? null,
    logged: row.logged,
  }));

  return { from, to, days };
}

/** The window the Exercise tab shows: totals, a per-day shape, and the sessions. */
export async function buildExerciseSummary(
  userId: string,
  ctx: DayContext,
  days: number,
): Promise<ExerciseSummary> {
  const today = localDateFor(new Date(), ctx);
  const from = addDays(today, -(days - 1));
  const entries = await listExerciseEntries(userId, { from, to: today });

  const burnByDate = new Map<string, number>();
  for (const entry of entries) {
    burnByDate.set(entry.local_date, (burnByDate.get(entry.local_date) ?? 0) + entry.kcal_burned);
  }

  const window = dateRange(from, today);
  const series: TrendPoint[] = window.map((date, index) => {
    const prior = window.slice(Math.max(0, index - 6), index + 1).map((d) => burnByDate.get(d) ?? 0);
    return {
      local_date: date,
      value: Math.round(burnByDate.get(date) ?? 0),
      average: prior.length === 0 ? null : prior.reduce((a, b) => a + b, 0) / prior.length,
    };
  });

  // Null rather than zero when nothing in the window carried the measurement:
  // "0 km" reads as a claim about the training, "—" reads as no data, and for a
  // month of weight sessions the second one is true.
  const sum = (pick: (e: (typeof entries)[number]) => number | null) => {
    const values = entries.map(pick).filter((v): v is number => v !== null);
    return values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;
  };

  return {
    days,
    sessions: entries.length,
    total_kcal: Math.round(entries.reduce((total, e) => total + e.kcal_burned, 0)),
    total_distance_km: sum((e) => e.distance_km),
    total_duration_min: sum((e) => e.duration_min),
    active_days: burnByDate.size,
    series,
    // Newest first: the Exercise tab is a log to scroll, not a timeline to read
    // forwards, and the session someone wants is almost always the last one.
    entries: [...entries].reverse(),
  };
}
