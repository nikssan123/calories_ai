import type { FastifyBaseLogger } from 'fastify';
import { query } from './db.ts';
import { authErrorFor } from './ai/providers/index.ts';
import { generateNudge } from './ai/nudge.ts';
import { generateWeeklyReview } from './ai/review.ts';
import { sendNudgeEmail, sendWeeklyReviewEmail } from './email/notify.ts';
import { nudgeReachedAPhone, sendNudgePush, sendWeeklyReviewPush } from './push/notify.ts';
import { sweepBarcodeCache } from './services/barcode.ts';
import { NUDGE_JOB, REVIEW_JOB, withJobLock } from './services/job-lock.ts';
import { dueNudge, NUDGE_HOUR } from './services/nudges.ts';
import { reviewForWeek, reviewWeekFor } from './services/reviews.ts';
import { listActiveUsers } from './services/user.ts';
import { localDateFor, localPartsFor } from './time.ts';

/**
 * The scheduled jobs: the weekly review, and the nudges.
 *
 * There is no cron and no queue: the API ticks hourly and asks each user's own
 * clock whether their week has turned over. That keeps the schedule correct for
 * every timezone at once, and it means a restart cannot miss a review — the
 * next tick sees the same unwritten week and picks it up.
 *
 * Both passes are built on the same idea and the same safety property. Whether
 * work is due is answered by looking for the row it would have written, not by
 * trusting the schedule, so running the tick more often than intended is
 * harmless and running it late still does the work.
 */

/** Local weekday and hour a review is published at. Monday morning. */
export const REVIEW_WEEKDAY = 'Monday';
export const REVIEW_HOUR = 8;

const TICK_MS = 60 * 60 * 1000;

const emptyTick = (): TickResult => ({ considered: 0, generated: [], skipped: 0, failed: [] });

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
  // A cheap bail when the deployment has no credentials at all, rather than
  // churning through every account to fail on each. Deliberately the
  // deployment's lane and not any particular user's: a pass has no user in hand
  // yet, and the per-user lane is checked where it is known — `review.ts` and
  // `nudge.ts` both ask their own provider before running a turn.
  if (authErrorFor()) return emptyTick();

  /*
   * Held for the whole pass, so two overlapping ticks — or two replicas —
   * cannot both publish this week's review and both email it. The pass is
   * idempotent in intent, but the check that makes it so ("has this week been
   * written?") happens forty seconds before the write that answers it, which is
   * plenty of room for the other run to pass the same check.
   */
  const result = await withJobLock(REVIEW_JOB, () => reviewPass(now, logger));
  if (result === null) {
    logger?.info('review pass already running; skipped this tick');
    return emptyTick();
  }
  return result;
}

async function reviewPass(now: Date, logger?: FastifyBaseLogger): Promise<TickResult> {
  const result: TickResult = emptyTick();

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

      /*
       * And then tell them it exists.
       *
       * This is the one notification the product sends because it wants to
       * rather than because something happened to the account, and it is worth
       * sending for a specific reason: a weekly review nobody opens is a
       * week of someone's logging spent on nothing. It is also the one
       * notification with an unsubscribe link, which is the deal.
       *
       * Inside the same try as the generation, and after it, so an email
       * failure is reported against the user it belongs to — but the review
       * itself is already committed by this point and stays published either
       * way. Sending is keyed on the week, so a later tick will not send twice.
       */
      const published = await reviewForWeek(user.id, week.start);
      if (published) {
        /*
         * Both channels, and this is the one notification where that is right.
         * The mail carries the review — the writing, the stats, the layout —
         * and the push carries the news that it exists. They are two different
         * messages, so nobody hears the same sentence twice.
         */
        await sendWeeklyReviewPush(user.id, published, logger);
        await sendWeeklyReviewEmail(user.id, published, logger);
      }
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

/**
 * One nudge pass.
 *
 * Deliberately a sibling of `runDueReviews` rather than a branch inside it: the
 * two share a tick and nothing else. A review is written for everyone who
 * logged last week; a nudge is written for the few people whose log shows one
 * of four specific patterns, and the decision about which — and whether at all
 * — belongs entirely to `dueNudge`.
 *
 * Nothing here decides to send. This loop's whole job is the clock.
 */
export async function runDueNudges(
  now: Date = new Date(),
  logger?: FastifyBaseLogger,
): Promise<TickResult> {
  if (authErrorFor()) return emptyTick();

  // Its own lock rather than the review's, for the reason the two passes are
  // started separately: they share a tick and nothing else, and a review pass
  // still grinding through a timezone must not be why nobody gets a nudge.
  const result = await withJobLock(NUDGE_JOB, () => nudgePass(now, logger));
  if (result === null) {
    logger?.info('nudge pass already running; skipped this tick');
    return emptyTick();
  }
  return result;
}

async function nudgePass(now: Date, logger?: FastifyBaseLogger): Promise<TickResult> {
  const result: TickResult = emptyTick();

  for (const user of await listActiveUsers()) {
    result.considered += 1;
    const ctx = { timezone: user.timezone, dayStartHour: user.day_start_hour };

    try {
      if (!isNudgeTime(now, ctx.timezone)) {
        result.skipped += 1;
        continue;
      }

      const today = localDateFor(now, ctx);
      const trigger = await dueNudge(user.id, ctx, today);
      if (!trigger) {
        result.skipped += 1;
        continue;
      }

      // Passed through rather than recomputed: `dueNudge` is several queries and
      // it has already answered the only question that mattered.
      const nudge = await generateNudge(user.id, { today, trigger });
      if (!nudge) {
        // Another pass got there first — the unique index did its job.
        result.skipped += 1;
        continue;
      }

      result.generated.push(user.id);
      logger?.info({ userId: user.id, kind: nudge.kind }, 'nudge published');

      /*
       * Inside the same try and after the write, so a delivery failure is
       * reported against the user it belongs to while the nudge itself stays
       * published. Keyed on the nudge, so a later tick will not send twice.
       *
       * The phone first, and the inbox only if the phone was not reached. A
       * nudge is one sentence with nothing behind it to go and read, so it is
       * complete on a lock screen — and saying it again in an email would turn
       * "at most one a week" into two of the same thing. Somebody with no
       * device registered still gets the mail, exactly as before.
       */
      const pushed = await sendNudgePush(user.id, nudge, logger);
      if (!nudgeReachedAPhone(pushed)) await sendNudgeEmail(user.id, nudge, logger);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ userId: user.id, error: message });
      logger?.error({ err: error, userId: user.id }, 'nudge failed');
    }
  }

  return result;
}

/**
 * True from the nudge hour onward, in the user's own timezone.
 *
 * A window rather than an exact hour, like `isReviewTime` — but the reason it
 * cannot run away is different. A review is keyed on the week; a nudge is kept
 * to one a week by `dueNudge`'s own rate limit, which is checked before
 * anything is written and would refuse a second one tomorrow regardless.
 */
export function isNudgeTime(now: Date, timezone: string): boolean {
  const { time } = localPartsFor(now, timezone);
  return Number(time.slice(0, 2)) >= NUDGE_HOUR;
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
  const now = new Date();
  runDueReviews(now, logger).catch((error) => {
    logger?.error({ err: error }, 'review scheduler tick failed');
  });
  // Started separately rather than chained: a review pass that throws must not
  // be the reason nobody gets a nudge, and neither waits on the other.
  runDueNudges(now, logger).catch((error) => {
    logger?.error({ err: error }, 'nudge scheduler tick failed');
  });
  // Not a user's clock at all — one DELETE over a small shared table, riding a
  // tick that already exists rather than earning a scheduler of its own. Every
  // read checks its own row's age, so this is only about disk: it is safe to
  // run every hour, safe to skip, and safe to run twice.
  sweepBarcodeCache().catch((error) => {
    logger?.error({ err: error }, 'barcode cache sweep failed');
  });
}

/** Starts the hourly tick. Returns a stop function for shutdown and for tests. */
export function startScheduler(logger?: FastifyBaseLogger): () => void {
  const timer = setInterval(() => tick(logger), TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}
