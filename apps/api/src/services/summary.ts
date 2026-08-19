import type { DaySummary, Progress, TrendPoint } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { addDays, dateRange, type DayContext, localDateFor } from '../time.ts';
import { listExerciseEntries, listFoodEntries, listWeights } from './log.ts';
import { targetsForDate } from './targets.ts';
import { getUser } from './user.ts';

export async function buildDaySummary(
  userId: string,
  localDate: string,
): Promise<DaySummary> {
  const [foodEntries, exerciseEntries, targets, weightRow] = await Promise.all([
    listFoodEntries(userId, { localDate }),
    listExerciseEntries(userId, { localDate }),
    targetsForDate(userId, localDate),
    queryOne<any>('SELECT * FROM weight_entries WHERE user_id = $1 AND local_date = $2', [
      userId,
      localDate,
    ]),
  ]);

  const consumed = foodEntries.reduce(
    (acc, entry) => ({
      kcal: acc.kcal + entry.kcal,
      protein_g: acc.protein_g + entry.protein_g,
      carbs_g: acc.carbs_g + entry.carbs_g,
      fat_g: acc.fat_g + entry.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  const burned_kcal = exerciseEntries.reduce((sum, e) => sum + e.kcal_burned, 0);

  return {
    local_date: localDate,
    consumed: {
      kcal: Math.round(consumed.kcal),
      protein_g: Math.round(consumed.protein_g),
      carbs_g: Math.round(consumed.carbs_g),
      fat_g: Math.round(consumed.fat_g),
    },
    burned_kcal: Math.round(burned_kcal),
    // Reported, but §9 says the UI must not lead with it.
    net_kcal: Math.round(consumed.kcal - burned_kcal),
    targets,
    food_entries: foodEntries,
    exercise_entries: exerciseEntries,
    weight: weightRow
      ? {
          id: weightRow.id,
          measured_at: new Date(weightRow.measured_at).toISOString(),
          local_date: weightRow.local_date,
          weight_kg: Number(weightRow.weight_kg),
        }
      : null,
  };
}

export async function currentLocalDate(ctx: DayContext): Promise<string> {
  return localDateFor(new Date(), ctx);
}

/** Per-day totals over a window, used by both the progress screen and the AI. */
export async function dailyTotals(
  userId: string,
  from: string,
  to: string,
): Promise<Array<{ local_date: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }>> {
  return query(
    `SELECT e.local_date,
            COALESCE(SUM(i.kcal), 0)      AS kcal,
            COALESCE(SUM(i.protein_g), 0) AS protein_g,
            COALESCE(SUM(i.carbs_g), 0)   AS carbs_g,
            COALESCE(SUM(i.fat_g), 0)     AS fat_g
       FROM food_entries e
       LEFT JOIN food_items i ON i.entry_id = e.id
      WHERE e.user_id = $1 AND e.local_date BETWEEN $2 AND $3
   GROUP BY e.local_date
   ORDER BY e.local_date ASC`,
    [userId, from, to],
  );
}

export async function buildProgress(
  userId: string,
  ctx: DayContext,
  days: number,
): Promise<Progress> {
  const today = localDateFor(new Date(), ctx);
  const from = addDays(today, -(days - 1));

  const [user, totals, weights, exercise, targets] = await Promise.all([
    getUser(userId),
    dailyTotals(userId, from, today),
    listWeights(userId, { from: addDays(today, -(days * 2)), to: today }),
    listExerciseEntries(userId, { from, to: today }),
    targetsForDate(userId, today),
  ]);

  const totalsByDate = new Map(totals.map((t) => [t.local_date, t]));
  const window = dateRange(from, today);

  // Only days with food logged count toward averages — an unlogged day is
  // missing data, not a zero-calorie day.
  const loggedDays = totals.filter((t) => t.kcal > 0);
  const averageKcal = mean(loggedDays.map((t) => Number(t.kcal)));
  const averageProtein = mean(loggedDays.map((t) => Number(t.protein_g)));
  const daysTargetHit = loggedDays.filter((t) => Number(t.protein_g) >= targets.protein_g).length;

  const calorieSeries: TrendPoint[] = window.map((date, index) => {
    const value = totalsByDate.has(date) ? Math.round(Number(totalsByDate.get(date)!.kcal)) : null;
    const priorWindow = window
      .slice(Math.max(0, index - 6), index + 1)
      .map((d) => (totalsByDate.get(d) ? Number(totalsByDate.get(d)!.kcal) : null))
      .filter((v): v is number => v !== null && v > 0);
    return { local_date: date, value: value === 0 ? null : value, average: mean(priorWindow) };
  });

  const weightByDate = new Map(weights.map((w) => [w.local_date, w.weight_kg]));
  const weightSeries: TrendPoint[] = window.map((date, index) => {
    const priorWindow = window
      .slice(Math.max(0, index - 6), index + 1)
      .map((d) => weightByDate.get(d))
      .filter((v): v is number => v !== undefined);
    return { local_date: date, value: weightByDate.get(date) ?? null, average: mean(priorWindow) };
  });

  const currentWeight = weights.at(-1)?.weight_kg ?? null;
  const firstWeight = weights[0]?.weight_kg ?? null;
  const average7d = mean(weights.slice(-7).map((w) => w.weight_kg));
  const previous7d = mean(weights.slice(-14, -7).map((w) => w.weight_kg));

  return {
    weight: {
      current_kg: currentWeight,
      average_7d_kg: average7d === null ? null : round1(average7d),
      change_7d_kg:
        average7d !== null && previous7d !== null ? round1(average7d - previous7d) : null,
      change_since_start_kg:
        currentWeight !== null && firstWeight !== null ? round1(currentWeight - firstWeight) : null,
      to_target_kg:
        currentWeight !== null && user.target_weight_kg !== null
          ? round1(currentWeight - user.target_weight_kg)
          : null,
      series: weightSeries,
    },
    calories: {
      average_kcal: averageKcal === null ? null : Math.round(averageKcal),
      target_kcal: targets.kcal,
      series: calorieSeries,
    },
    protein: {
      average_g: averageProtein === null ? null : Math.round(averageProtein),
      target_g: targets.protein_g,
      days_target_hit: daysTargetHit,
      days_logged: loggedDays.length,
    },
    exercise: {
      sessions: exercise.length,
      total_kcal: Math.round(exercise.reduce((sum, e) => sum + e.kcal_burned, 0)),
    },
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
