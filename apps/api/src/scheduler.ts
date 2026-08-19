import type { FastifyBaseLogger } from 'fastify';
import { query } from './db.ts';
import { hasSubscriptionAuth } from './ai/client.ts';
import { generateWeeklyReview } from './ai/review.ts';
import { reviewForWeek, reviewWeekFor } from './services/reviews.ts';
import { listActiveUsers } from './services/user.ts';
import { localDateFor, localPartsFor } from './time.ts';

/**
 * The weekly review job.
 *
 * There is no cron and no queue: the API ticks hourly and asks each user's own
 * clock whether their week has turned over. That keeps the schedule correct for
 * every timezone at once, and it means a restart cannot miss a review — the
 * next tick sees the same unwritten week and picks it up.
 */

/** Local weekday and hour a review is published at. Monday morning. */
export const REVIEW_WEEKDAY = 'Monday';
export const REVIEW_HOUR = 8;

const TICK_MS = 60 * 60 * 1000;

export interface TickResult {
  considered: number;
  generated: string[];
  skipped: number;
  failed: Array<{ userId: string; error: string }>;
}

/**
 * One pass. Exported so it can be driven directly — by a test, or by the
 * `POST /reviews/run` route when someone wants theirs early.
 */
export async function runDueReviews(
  now: Date = new Date(),
  logger?: FastifyBaseLogger,
): Promise<TickResult> {
  const result: TickResult = { considered: 0, generated: [], skipped: 0, failed: [] };
  if (!hasSubscriptionAuth() && !process.env.ANTHROPIC_API_KEY) return result;

  for (const user of await listActiveUsers()) {
    result.considered += 1;
    const ctx = { timezone: user.timezone, dayStartHour: user.day_start_hour };

    try {
      if (!isReviewTime(now, ctx.timezone)) {
        result.skipped += 1;
        continue;
      }

      const today = localDateFor(now, ctx);
      const week = reviewWeekFor(today);

      if (await reviewForWeek(user.id, week.start)) {
        result.skipped += 1;
        continue;
      }
      // A review of a week with nothing in it is noise, and it would arrive
      // every Monday forever for a dormant account.
      if (!(await hasEntriesBetween(user.id, week.start, week.end))) {
        result.skipped += 1;
        continue;
      }

      await generateWeeklyReview(user.id, { today });
      result.generated.push(user.id);
      logger?.info({ userId: user.id, week: week.start }, 'weekly review published');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ userId: user.id, error: message });
      logger?.error({ err: error, userId: user.id }, 'weekly review failed');
    }
  }

  return result;
}

/**
 * True from the publishing hour onward, on the publishing day, in the user's own
 * timezone.
 *
 * Deliberately a window rather than an exact hour: the review is written once
 * and then found by `reviewForWeek`, so a later tick is a no-op — but if the
 * process happened to be down at 08:00, an exact match would silently skip the
 * week rather than catching up at 09:00.
 */
export function isReviewTime(now: Date, timezone: string): boolean {
  const { weekday, time } = localPartsFor(now, timezone);
  return weekday === REVIEW_WEEKDAY && Number(time.slice(0, 2)) >= REVIEW_HOUR;
}

async function hasEntriesBetween(userId: string, from: string, to: string): Promise<boolean> {
  const rows = await query<{ ok: boolean }>(
    `SELECT TRUE AS ok FROM food_entries
      WHERE user_id = $1 AND local_date BETWEEN $2 AND $3 LIMIT 1`,
    [userId, from, to],
  );
  return rows.length > 0;
}

/**
 * One tick, fire-and-forget. Separate from the interval so a failure inside a
 * review can never reject into an unhandled rejection and take the process down.
 */
export function tick(logger?: FastifyBaseLogger): void {
  runDueReviews(new Date(), logger).catch((error) => {
    logger?.error({ err: error }, 'review scheduler tick failed');
  });
}

/** Starts the hourly tick. Returns a stop function for shutdown and for tests. */
export function startScheduler(logger?: FastifyBaseLogger): () => void {
  const timer = setInterval(() => tick(logger), TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}
