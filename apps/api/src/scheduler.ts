import type { FastifyBaseLogger } from 'fastify';
import { query } from './db.ts';
import { authErrorFor } from './ai/providers/index.ts';
import { generateNudge } from './ai/nudge.ts';
import { generateWeeklyReview } from './ai/review.ts';
import { sendNudgeEmail, sendWeeklyReviewEmail } from './email/notify.ts';
import {
  nudgeReachedAPhone,
  sendAlertPush,
  sendNudgePush,
  sendWeeklyReviewPush,
} from './push/notify.ts';
import { dueAlert, saveAlert } from './services/alerts.ts';
import { sweepBarcodeCache } from './services/barcode.ts';
import { ALERT_JOB, NUDGE_JOB, REVIEW_JOB, withJobLock } from './services/job-lock.ts';
import { expirePlans } from './services/billing.ts';
import { dueNudge, NUDGE_HOUR } from './services/nudges.ts';
import { reviewForWeek, reviewWeekFor } from './services/reviews.ts';
import { getEmailRecipient, listActiveUsers } from './services/user.ts';
import { unmeteredFor } from './ai/lane.ts';
import { limitsFor } from './services/plans.ts';
import { localDateFor, localPartsFor } from './time.ts';

/**
 * The scheduled jobs: the weekly review, the nudges, and the alerts.
 *
 * There is no cron and no queue: the API ticks hourly and asks each user's own
 * clock whether their week has turned over. That keeps the schedule correct for
 * every timezone at once, and it means a restart cannot miss a review — the
 * next tick sees the same unwritten week and picks it up.
 *
 * All three passes are built on the same idea and the same safety property.
 * Whether work is due is answered by looking for the row it would have written,
 * not by trusting the schedule, so running the tick more often than intended is
 * harmless and running it late still does the work.
 *
 * The third pass is the odd one and the difference is worth stating once here:
 * the review and the nudge are *inference*, so both are metered, both are
 * priced into a tier, and both stop dead when the deployment has no model
 * credentials. Alerts are arithmetic. Nothing below them costs a token, so
 * nothing below them reads a plan, and the pass deliberately runs on a
 * deployment with no API key at all.
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

      /*
       * The review is sold, and this is the only path that can spend one
       * without anybody asking.
       *
       * `POST /reviews/run` has answered 402 to a plan with no reviews since
       * the entitlement landed, but that guards the door somebody knocks on.
       * This pass knocks on its own, every Monday, for every active account —
       * so until now a free account was refused the button and then posted the
       * result anyway. `SUBSCRIPTIONS.md` prices the review into Plus at
       * 4.3 x $0.15 a month and states the free tier's steady state as $0.00;
       * both were true of the tiers and false of the deployment.
       *
       * The nudge pass below needs no equivalent: `dueNudge` reads
       * `nudgesPerWeek` off the plan as its very first question, so the zero on
       * free already refuses there. A second gate here would be a second place
       * that decides the same thing.
       */
      if (limitsFor(user.plan, unmeteredFor(user.email)).reviewsPerDay === 0) {
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

/**
 * One alert pass.
 *
 * The third sibling, and the one that is not an entitlement. `runDueReviews`
 * and `runDueNudges` both open by asking `authErrorFor()` whether this
 * deployment can reach a model at all, and both consult the plan before
 * spending anything. Neither question applies here — a streak is counted, a
 * goal weight is compared, an expiry date is subtracted — so neither is asked,
 * and the effect is the one that matters: this is the only thing in the file
 * that speaks to a free account.
 *
 * Like the nudge pass, nothing here decides to send. The clock is this loop's
 * whole job; `dueAlert` owns everything else, including the preferences.
 */
export async function runDueAlerts(
  now: Date = new Date(),
  logger?: FastifyBaseLogger,
): Promise<TickResult> {
  const result = await withJobLock(ALERT_JOB, () => alertPass(now, logger));
  if (result === null) {
    logger?.info('alert pass already running; skipped this tick');
    return emptyTick();
  }
  return result;
}

async function alertPass(now: Date, logger?: FastifyBaseLogger): Promise<TickResult> {
  const result: TickResult = emptyTick();

  for (const user of await listActiveUsers()) {
    result.considered += 1;
    const ctx = { timezone: user.timezone, dayStartHour: user.day_start_hour };

    try {
      /*
       * The recipient, for the two preferences and the units a weight is
       * written in. Read here and passed down rather than looked up inside
       * `dueAlert`, because it is also the row that says whether there is an
       * account to speak to at all — the placeholder row has no address, and
       * neither does an account mid-deletion.
       */
      const recipient = await getEmailRecipient(user.id);
      if (!recipient) {
        result.skipped += 1;
        continue;
      }

      const today = localDateFor(now, ctx);
      const due = await dueAlert({
        userId: user.id,
        prefs: {
          units: recipient.units,
          notifyMilestones: recipient.notifyMilestones,
          notifyDailyRecap: recipient.notifyDailyRecap,
        },
        now,
        hour: localHourFor(now, ctx.timezone),
        today,
      });
      if (!due) {
        result.skipped += 1;
        continue;
      }

      /*
       * Written first, then sent — the opposite order to the two passes above,
       * and for a reason peculiar to a message with no model behind it.
       *
       * A review is written because generating it is the expensive, unrepeatable
       * part; the mail afterwards is an afterthought that can fail harmlessly.
       * Here the *send* is the expensive, unrepeatable part: there is no artifact
       * to lose, and the only thing that can go wrong twice is a phone buzzing
       * twice. So the unique index goes first and the loser of the race says
       * nothing.
       */
      const alert = await saveAlert(user.id, due, today);
      if (!alert) {
        // Another pass got there first — the unique index did its job.
        result.skipped += 1;
        continue;
      }

      result.generated.push(user.id);
      logger?.info({ userId: user.id, kind: alert.kind }, 'alert published');

      /*
       * The phone, and only the phone. Every one of these is a sentence with
       * nothing behind it to go and read, which is the same argument that keeps
       * a nudge off email once it has reached a pocket — and unlike a nudge
       * there is no fallback, because none of them is worth an email on its own.
       * Somebody with no device registered simply hears nothing, which is the
       * honest outcome for a channel they have not opted into.
       */
      await sendAlertPush(user.id, alert, logger);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ userId: user.id, error: message });
      logger?.error({ err: error, userId: user.id }, 'alert failed');
    }
  }

  return result;
}

/** The hour it is where the reader is, 0-23. */
function localHourFor(now: Date, timezone: string): number {
  return Number(localPartsFor(now, timezone).time.slice(0, 2));
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
  // Third and independent, for the same reason again — and with more force,
  // since this is the only pass of the three that a deployment without model
  // credentials still has anything to do.
  runDueAlerts(now, logger).catch((error) => {
    logger?.error({ err: error }, 'alert scheduler tick failed');
  });
  // Not a user's clock at all — one DELETE over a small shared table, riding a
  // tick that already exists rather than earning a scheduler of its own. Every
  // read checks its own row's age, so this is only about disk: it is safe to
  // run every hour, safe to skip, and safe to run twice.
  sweepBarcodeCache().catch((error) => {
    logger?.error({ err: error }, 'barcode cache sweep failed');
  });
  /*
   * The backstop under every store subscription.
   *
   * A store notification is not a Stripe webhook. Play publishes through
   * Pub/Sub and RevenueCat forwards, and either hop can drop one while this API
   * is restarting, misconfigured, or briefly answering 500. Without this pass a
   * single missed EXPIRATION is a paid tier served free *forever*, and nothing
   * surfaces it — the row looks exactly like a paying customer's.
   *
   * Hourly is deliberately coarse. The alternative is polling every
   * subscription's true state against the store, which costs an API call per
   * subscriber per tick to answer a question a date already answers. Somebody
   * keeping their plan for up to an hour past expiry is not a problem worth a
   * quota.
   */
  expirePlans(now)
    .then((n) => {
      if (n > 0) logger?.info({ expired: n }, 'plans returned to free');
    })
    .catch((error) => {
      logger?.error({ err: error }, 'plan expiry sweep failed');
    });
}

/** Starts the hourly tick. Returns a stop function for shutdown and for tests. */
export function startScheduler(logger?: FastifyBaseLogger): () => void {
  const timer = setInterval(() => tick(logger), TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}
