import type { AdaptiveProposal, ReviewStats, WeeklyReview } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { addDays, type DayContext, localDateFor } from '../time.ts';
import { dailyIntake, proposeTargets } from './adaptive.ts';
import { listExerciseEntries, listWeights } from './log.ts';
import { targetsForDate } from './targets.ts';

/**
 * The weekly review. Every number here is computed in SQL; the agent is handed
 * these stats and writes the prose. That split is the point — a model that has
 * to both recall and narrate will get one of them wrong, and it is always the
 * recall.
 */

/** Days within this fraction of the calorie target count as "on target". */
const ON_TARGET_BAND = 0.1;

/**
 * The week a review generated on `today` covers: the seven days ending
 * yesterday. Run on a Monday that is exactly the previous Monday–Sunday.
 */
export function reviewWeekFor(today: string): { start: string; end: string } {
  return { start: addDays(today, -7), end: addDays(today, -1) };
}

export async function buildReviewStats(
  userId: string,
  week: { start: string; end: string },
  adaptive: AdaptiveProposal | null = null,
): Promise<ReviewStats> {
  const previous = { start: addDays(week.start, -7), end: addDays(week.start, -1) };

  const [intake, previousIntake, targets, weights, exercise, topFoods] = await Promise.all([
    dailyIntake(userId, week.start, week.end),
    dailyIntake(userId, previous.start, previous.end),
    targetsForDate(userId, week.end),
    // Reach back a week either side so a Monday-only weigher still gets a trend.
    listWeights(userId, { from: addDays(week.start, -7), to: week.end }),
    listExerciseEntries(userId, { from: week.start, to: week.end }),
    topFoodsFor(userId, week.start, week.end),
  ]);

  const inWeek = weights.filter((w) => w.local_date >= week.start && w.local_date <= week.end);
  const start = inWeek[0]?.weight_kg ?? null;
  const end = inWeek.at(-1)?.weight_kg ?? null;

  const byKcal = [...intake].sort((a, b) => a.kcal - b.kcal);

  return {
    week_start: week.start,
    week_end: week.end,
    days_logged: intake.length,
    mean_kcal: mean(intake.map((d) => d.kcal)),
    mean_protein_g: mean(intake.map((d) => d.protein_g)),
    target_kcal: targets.kcal,
    target_protein_g: targets.protein_g,
    days_on_target: intake.filter(
      (d) => Math.abs(d.kcal - targets.kcal) <= targets.kcal * ON_TARGET_BAND,
    ).length,
    days_protein_hit: intake.filter((d) => d.protein_g >= targets.protein_g).length,
    previous_mean_kcal: mean(previousIntake.map((d) => d.kcal)),
    previous_days_logged: previousIntake.length,
    weight_start_kg: start,
    weight_end_kg: end,
    weight_change_kg: start !== null && end !== null ? round1(end - start) : null,
    exercise_sessions: exercise.length,
    exercise_kcal: Math.round(exercise.reduce((s, e) => s + e.kcal_burned, 0)),
    top_foods: topFoods,
    highest_day: byKcal.at(-1)
      ? { local_date: byKcal.at(-1)!.local_date, kcal: Math.round(byKcal.at(-1)!.kcal) }
      : null,
    lowest_day: byKcal[0]
      ? { local_date: byKcal[0].local_date, kcal: Math.round(byKcal[0].kcal) }
      : null,
    adaptive,
  };
}

/** Most-repeated foods of the week, by how many entries they appear in. */
async function topFoodsFor(
  userId: string,
  from: string,
  to: string,
): Promise<Array<{ name: string; times: number; kcal: number }>> {
  const rows = await query<{ name: string; times: string; kcal: number }>(
    `SELECT min(i.name) AS name, count(*) AS times, COALESCE(SUM(i.kcal), 0) AS kcal
       FROM food_items i
       JOIN food_entries e ON e.id = i.entry_id
      WHERE e.user_id = $1 AND e.local_date BETWEEN $2 AND $3
   GROUP BY lower(i.name)
     HAVING count(*) > 1
   ORDER BY count(*) DESC, SUM(i.kcal) DESC
      LIMIT 5`,
    [userId, from, to],
  );
  return rows.map((r) => ({ name: r.name, times: Number(r.times), kcal: Math.round(Number(r.kcal)) }));
}

/** Stats plus the adaptive proposal, which is what a full review needs. */
export async function buildFullReviewStats(
  userId: string,
  ctx: DayContext,
  today = localDateFor(new Date(), ctx),
): Promise<{ week: { start: string; end: string }; stats: ReviewStats }> {
  const week = reviewWeekFor(today);
  const adaptive = await proposeTargets(userId, ctx, today);
  return { week, stats: await buildReviewStats(userId, week, adaptive) };
}

// ---- Persistence -----------------------------------------------------------

export async function saveReview(
  userId: string,
  stats: ReviewStats,
  content: string,
  messageId: string | null,
): Promise<WeeklyReview> {
  const row = await queryOne<any>(
    `INSERT INTO weekly_reviews (user_id, week_start, week_end, content, stats, message_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, week_start) DO UPDATE
       SET content = EXCLUDED.content,
           stats = EXCLUDED.stats,
           message_id = EXCLUDED.message_id,
           week_end = EXCLUDED.week_end
     RETURNING *`,
    [userId, stats.week_start, stats.week_end, content, JSON.stringify(stats), messageId],
  );
  return toReview(row);
}

export async function listReviews(userId: string, limit = 12): Promise<WeeklyReview[]> {
  const rows = await query<any>(
    'SELECT * FROM weekly_reviews WHERE user_id = $1 ORDER BY week_start DESC LIMIT $2',
    [userId, Math.min(limit, 52)],
  );
  return rows.map(toReview);
}

export async function latestReview(userId: string): Promise<WeeklyReview | null> {
  const rows = await listReviews(userId, 1);
  return rows[0] ?? null;
}

export async function reviewForWeek(userId: string, weekStart: string): Promise<WeeklyReview | null> {
  const row = await queryOne<any>(
    'SELECT * FROM weekly_reviews WHERE user_id = $1 AND week_start = $2',
    [userId, weekStart],
  );
  return row ? toReview(row) : null;
}

function toReview(row: any): WeeklyReview {
  return {
    id: row.id,
    week_start: row.week_start,
    week_end: row.week_end,
    content: row.content,
    stats: row.stats,
    message_id: row.message_id,
    created_at: new Date(row.created_at).toISOString(),
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
