import type {
  Achievement,
  DaySummary,
  DietQuality,
  Progress,
  Streak,
  TrendPoint,
} from '@ct/shared';
import { qualityTargetsFor, rollUpDay } from '@ct/shared';
export { dayQuality, QUALITY_COVERAGE_FLOOR } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { addDays, dateRange, type DayContext, localDateFor } from '../time.ts';
import { evaluateAchievements, listAchievements } from './achievements.ts';
import { listExerciseEntries, listFoodEntries, listWeights } from './log.ts';
import { type LogHistory, logHistory, streaksOf } from './streaks.ts';
import { targetsForDate } from './targets.ts';
import { getUser } from './user.ts';

/** The four columns the diet quality panel is made of. */
type QualityField = keyof DietQuality;

/**
 * `today` is the reader's own current date, and passing it is what turns the
 * streak on.
 *
 * Optional because most callers of this are building a card for one entry on
 * whatever day that entry belongs to, and a run counted against a day in March
 * is not a number anybody opened a calendar to find. Omitting it costs a
 * `DISTINCT local_date` scan that a History grid would otherwise pay thirty-one
 * times to answer a question it never asked.
 */
export async function buildDaySummary(
  userId: string,
  localDate: string,
  today?: string,
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

  return rollUpDay({
    localDate,
    streak: localDate === today ? await todayStreak(userId, today) : null,
    foodEntries,
    exerciseEntries,
    targets,
    weight: weightRow
      ? {
          id: weightRow.id,
          measured_at: new Date(weightRow.measured_at).toISOString(),
          local_date: weightRow.local_date,
          weight_kg: Number(weightRow.weight_kg),
        }
      : null,
  });
}

/**
 * The logging run for the chip beside the ring, and the badge pass riding along
 * with it.
 *
 * They travel together because they want the same two scans, and this is the
 * read every log already round-trips through — so a badge earned by logging
 * lunch arrives in the same response as the lunch, rather than at 20:00 in a
 * notification about something that happened five hours ago.
 */
async function todayStreak(userId: string, today: string): Promise<Streak> {
  const history = await logHistory(userId);
  await earnQuietly(userId, history, today);
  return streaksOf(history, today).logging;
}

/**
 * The badge pass, with its failures swallowed.
 *
 * The same bargain `recordUsage` makes, and for a sharper reason: this runs
 * inside the read that draws somebody's food. An uncelebrated badge is a
 * nuisance that the next read picks up; a day summary that 500s because a
 * congratulation could not be written is the app refusing to show a meal.
 */
async function earnQuietly(
  userId: string,
  history: LogHistory,
  today: string,
): Promise<Achievement[]> {
  try {
    return await evaluateAchievements(userId, history, today);
  } catch {
    return [];
  }
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

  const [user, totals, weights, exercise, targets, history, achievements] = await Promise.all([
    getUser(userId),
    dailyTotals(userId, from, today),
    listWeights(userId, { from: addDays(today, -(days * 2)), to: today }),
    listExerciseEntries(userId, { from, to: today }),
    targetsForDate(userId, today),
    logHistory(userId),
    listAchievements(userId),
  ]);

  /*
   * Progress draws the grid, so Progress also earns.
   *
   * The day-summary read is the fast path and covers almost everybody, but it
   * is not the only door: a badge deserved by a meal logged on another device,
   * or by a workout added from the web, should be on the wall the first time
   * somebody looks at the wall — not the next time they happen to open Today.
   * The history is already in hand, so this costs the evaluation and nothing
   * more.
   */
  const fresh = await earnQuietly(userId, history, today);

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

  /*
   * The rolling mean reaches back over calendar days rather than over the
   * chart, which is why `weights` was fetched wider than the window is drawn.
   *
   * Slicing the window instead would leave its first six points averaging one
   * to six readings while every point after them averages a week — a left edge
   * that jumps for no reason the reader can see, on the one series where the
   * history to do better is already in hand. The other series slice the window
   * because their queries stop at `from` and there is nothing earlier to use.
   */
  const weightByDate = new Map(weights.map((w) => [w.local_date, w.weight_kg]));
  const weightSeries: TrendPoint[] = window.map((date) => {
    const priorWindow = dateRange(addDays(date, -6), date)
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

  const qualityMean = (field: QualityField) => {
    const value = mean(
      measuredDays.map((t) => t[field]).filter((v): v is number => v !== null),
    );
    return value === null ? null : Math.round(value);
  };

  /**
   * One series per nutrient, because the card lets you put any of the four on
   * its chart. Built here rather than fetched per selection: the window is one
   * query either way, and a chart that has to go to the network to change which
   * line it is drawing feels like a page rather than a switch.
   *
   * A day missing this particular figure is a gap like an unlogged day is, not
   * a zero — the columns arrived mid-history, and a run of zeroes before them
   * would draw a fortnight of sodium-free eating that never happened.
   */
  const qualitySeries = (field: QualityField): TrendPoint[] => {
    const byDate = new Map(
      measuredDays
        .filter((t) => t[field] !== null)
        .map((t) => [t.local_date, t[field]!] as const),
    );
    return window.map((date, index) => {
      const priorWindow = window
        .slice(Math.max(0, index - 6), index + 1)
        .map((d) => byDate.get(d))
        .filter((v): v is number => v !== undefined);
      return {
        local_date: date,
        value: byDate.get(date) ?? null,
        average: mean(priorWindow),
      };
    });
  };

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
      series: {
        fiber_g: qualitySeries('fiber_g'),
        sodium_mg: qualitySeries('sodium_mg'),
        sat_fat_g: qualitySeries('sat_fat_g'),
        sugar_g: qualitySeries('sugar_g'),
      },
    },
    // Against the whole history rather than `window`, and deliberately so:
    // "how long have you kept this up" answered with a number capped by
    // whichever of 14/30/90 happened to be selected would be a lie the tab bar
    // told.
    streaks: streaksOf(history, today),
    achievements: [...achievements, ...fresh],
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
