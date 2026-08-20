import type { DayQuality, DaySummary, FoodItem, Progress, TrendPoint } from '@ct/shared';
export { QUALITY_COVERAGE_FLOOR } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { addDays, dateRange, type DayContext, localDateFor } from '../time.ts';
import { listExerciseEntries, listFoodEntries, listWeights } from './log.ts';
import { qualityTargetsFor, targetsForDate } from './targets.ts';
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
    quality: dayQuality(
      foodEntries.flatMap((entry) => entry.items),
      targets.kcal,
    ),
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

/**
 * A day's quality panel, summed from the items rather than from the entries.
 *
 * Items, because coverage is a share of calories and only an item knows how
 * many of the day's calories it brought. `fiber_g` is the sentinel for the
 * whole panel: the four are estimated together or not at all — one tool call
 * fills all of them — so tracking four separate coverages would be four copies
 * of the same number and a way for them to disagree.
 */
export function dayQuality(items: FoodItem[], targetKcal: number): DayQuality {
  const measured = items.filter((item) => item.fiber_g !== null);
  const totalKcal = items.reduce((sum, item) => sum + item.kcal, 0);
  const measuredKcal = measured.reduce((sum, item) => sum + item.kcal, 0);

  // No food at all is full coverage of nothing, not a gap: an empty day should
  // not be reported as "partly measured" when there is nothing to measure.
  const coverage = totalKcal > 0 ? measuredKcal / totalKcal : 1;

  const sum = (field: 'fiber_g' | 'sodium_mg' | 'sat_fat_g' | 'sugar_g'): number | null => {
    const values = items
      .map((item) => item[field])
      .filter((value): value is number => value !== null);
    if (values.length === 0) return null;
    return Math.round(values.reduce((a, b) => a + b, 0));
  };

  return {
    fiber_g: sum('fiber_g'),
    sodium_mg: sum('sodium_mg'),
    sat_fat_g: sum('sat_fat_g'),
    sugar_g: sum('sugar_g'),
    coverage: Math.round(coverage * 100) / 100,
    targets: qualityTargetsFor(targetKcal),
  };
}

export async function currentLocalDate(ctx: DayContext): Promise<string> {
  return localDateFor(new Date(), ctx);
}

export interface DailyTotal {
  local_date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sodium_mg: number | null;
  sat_fat_g: number | null;
  sugar_g: number | null;
  /** 0-1: the share of the day's calories that carried the quality panel. */
  coverage: number;
}

/** Per-day totals over a window, used by both the progress screen and the AI. */
export async function dailyTotals(
  userId: string,
  from: string,
  to: string,
): Promise<DailyTotal[]> {
  const rows = await query<any>(
    `SELECT e.local_date,
            COALESCE(SUM(i.kcal), 0)      AS kcal,
            COALESCE(SUM(i.protein_g), 0) AS protein_g,
            COALESCE(SUM(i.carbs_g), 0)   AS carbs_g,
            COALESCE(SUM(i.fat_g), 0)     AS fat_g,
            SUM(i.fiber_g)   AS fiber_g,
            SUM(i.sodium_mg) AS sodium_mg,
            SUM(i.sat_fat_g) AS sat_fat_g,
            SUM(i.sugar_g)   AS sugar_g,
            -- How much of the day these four actually speak for. The same
            -- figure dayQuality() computes in memory for one day, in SQL
            -- because a fortnight of days is not worth loading item by item.
            --
            -- Two COALESCEs, and they mean opposite things. The inner one turns
            -- "food logged, none of it estimated" into a measured zero — a
            -- FILTER that matches no rows sums to NULL, and left alone that
            -- NULL falls through to the outer default and reports a completely
            -- unmeasured day as fully covered. The outer one is for a day with
            -- no food at all, where there is nothing to have missed.
            COALESCE(
              COALESCE(SUM(i.kcal) FILTER (WHERE i.fiber_g IS NOT NULL), 0)
                / NULLIF(SUM(i.kcal), 0),
              1
            ) AS coverage
       FROM food_entries e
       LEFT JOIN food_items i ON i.entry_id = e.id
      WHERE e.user_id = $1 AND e.local_date BETWEEN $2 AND $3
   GROUP BY e.local_date
   ORDER BY e.local_date ASC`,
    [userId, from, to],
  );

  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return rows.map((row) => ({
    local_date: row.local_date,
    kcal: Number(row.kcal),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
    fiber_g: num(row.fiber_g),
    sodium_mg: num(row.sodium_mg),
    sat_fat_g: num(row.sat_fat_g),
    sugar_g: num(row.sugar_g),
    coverage: Number(row.coverage),
  }));
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

  /**
   * Calories and protein share this shape exactly: an unlogged day is a null
   * rather than a zero, and the rolling mean skips those gaps rather than
   * averaging them in — a day nobody logged is missing data, and counting it as
   * zero would drag every average down and invent a deficit that never existed.
   */
  const nutritionSeries = (field: 'kcal' | 'protein_g'): TrendPoint[] =>
    window.map((date, index) => {
      const raw = totalsByDate.get(date);
      const value = raw ? Math.round(Number(raw[field])) : null;
      const priorWindow = window
        .slice(Math.max(0, index - 6), index + 1)
        .map((d) => (totalsByDate.get(d) ? Number(totalsByDate.get(d)![field]) : null))
        .filter((v): v is number => v !== null && v > 0);
      return { local_date: date, value: value === 0 ? null : value, average: mean(priorWindow) };
    });

  const calorieSeries = nutritionSeries('kcal');
  const proteinSeries = nutritionSeries('protein_g');

  // Exercise is the opposite case: a day with no session really is a zero-burn
  // day, so the gaps are filled and the rolling mean counts them.
  const burnByDate = new Map<string, number>();
  for (const entry of exercise) {
    burnByDate.set(entry.local_date, (burnByDate.get(entry.local_date) ?? 0) + entry.kcal_burned);
  }
  const exerciseSeries: TrendPoint[] = window.map((date, index) => {
    const priorWindow = window
      .slice(Math.max(0, index - 6), index + 1)
      .map((d) => burnByDate.get(d) ?? 0);
    return {
      local_date: date,
      value: Math.round(burnByDate.get(date) ?? 0),
      average: mean(priorWindow),
    };
  });

  const weightByDate = new Map(weights.map((w) => [w.local_date, w.weight_kg]));
  const weightSeries: TrendPoint[] = window.map((date, index) => {
    const priorWindow = window
      .slice(Math.max(0, index - 6), index + 1)
      .map((d) => weightByDate.get(d))
      .filter((v): v is number => v !== undefined);
    return { local_date: date, value: weightByDate.get(date) ?? null, average: mean(priorWindow) };
  });

  /*
   * A day counts toward the quality averages only if its panel was estimated at
   * all. Averaging in the days that predate the columns would report a fiber
   * intake well below what was actually eaten and then nudge someone about it.
   */
  const measuredDays = loggedDays.filter((t) => t.fiber_g !== null);
  const windowKcal = loggedDays.reduce((sum, t) => sum + t.kcal, 0);
  const measuredKcal = loggedDays.reduce((sum, t) => sum + t.kcal * t.coverage, 0);

  const qualityMean = (field: 'fiber_g' | 'sodium_mg' | 'sat_fat_g' | 'sugar_g') => {
    const value = mean(
      measuredDays.map((t) => t[field]).filter((v): v is number => v !== null),
    );
    return value === null ? null : Math.round(value);
  };

  const fiberByDate = new Map(measuredDays.map((t) => [t.local_date, t.fiber_g!]));
  const fiberSeries: TrendPoint[] = window.map((date, index) => {
    const priorWindow = window
      .slice(Math.max(0, index - 6), index + 1)
      .map((d) => fiberByDate.get(d))
      .filter((v): v is number => v !== undefined);
    return {
      local_date: date,
      value: fiberByDate.get(date) ?? null,
      average: mean(priorWindow),
    };
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
      series: proteinSeries,
    },
    exercise: {
      sessions: exercise.length,
      total_kcal: Math.round(exercise.reduce((sum, e) => sum + e.kcal_burned, 0)),
      series: exerciseSeries,
    },
    quality: {
      average: {
        fiber_g: qualityMean('fiber_g'),
        sodium_mg: qualityMean('sodium_mg'),
        sat_fat_g: qualityMean('sat_fat_g'),
        sugar_g: qualityMean('sugar_g'),
      },
      targets: qualityTargetsFor(targets.kcal),
      // Weighted by calories rather than by day, so a fully-estimated snack day
      // cannot offset an unestimated one twice its size.
      coverage:
        windowKcal > 0 ? Math.round((measuredKcal / windowKcal) * 100) / 100 : 1,
      days_measured: measuredDays.length,
      fiber_series: fiberSeries,
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
