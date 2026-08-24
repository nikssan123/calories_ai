import type { AlertKind } from '@ct/shared';
import { queryOne } from '../db.ts';
import { addDays } from '../time.ts';

/**
 * How often the app is allowed to speak first, counted across everything that
 * speaks.
 *
 * This used to live inside `nudges.ts`, where it was correct and where it was
 * also the only thing that could interrupt anybody. That stopped being true the
 * moment a second unprompted sender existed. A budget enforced per feature is
 * not a budget: two features each keeping honestly to "at most one a week" is
 * two messages a week, and the switch in Settings still says one.
 *
 * So the promise is kept here, once, over the union of what has been sent.
 * A nudge and a milestone spend the same allowance and neither knows about the
 * other.
 *
 * Two things deliberately do not count against it:
 *
 * - **The weekly review.** It is a standing appointment the reader made, not
 *   the app deciding to speak — but it does impose `QUIET_DAYS_AFTER_REVIEW`
 *   below, because two messages about the same week a day apart reads as an app
 *   that has lost track of itself.
 * - **Account events.** A plan about to lapse is not a newsletter, and the same
 *   reasoning `email/notify.ts` applies to a password change applies here: it
 *   is about the account rather than about the food, and there is no preference
 *   to consult and no budget to spend.
 */

/** At most one unprompted message in a rolling week, whoever is sending it. */
export const MIN_DAYS_BETWEEN_INTERRUPTIONS = 7;

/**
 * And never in the day after the Monday review, which already said everything
 * a nudge or a milestone would say about that week.
 */
export const QUIET_DAYS_AFTER_REVIEW = 1;

/**
 * Which alerts spend the allowance.
 *
 * The two celebrations do, because they are the app choosing to speak about
 * somebody's log — the same act a nudge performs, and indistinguishable from
 * one on a lock screen.
 *
 * `daily_recap` does not, and the exemption is the reader's own doing: it is
 * off until switched on, and what it is switched on *for* is a message every
 * evening. Charging it to a weekly budget would mean honouring the request by
 * refusing it six days out of seven.
 *
 * `plan_expiring` does not, because it is an account event. See above.
 */
export const BUDGETED_ALERT_KINDS: readonly AlertKind[] = ['streak', 'goal_reached'];

/**
 * Whether one more unprompted message fits.
 *
 * `allowance` is the caller's ceiling for the window, not a global one: a nudge
 * asks with `nudgesPerWeek` off the plan, which is zero on free, while a
 * milestone asks with one because it is not sold. Both counts come from the
 * same window over the same union, so a free account that has just been
 * congratulated on a hundred days is quiet for the week either way.
 */
export async function withinInterruptionBudget(
  userId: string,
  today: string,
  allowance: number,
): Promise<boolean> {
  if (allowance < 1) return false;

  const since = addDays(today, -MIN_DAYS_BETWEEN_INTERRUPTIONS);
  if ((await interruptionsSince(userId, since)) >= allowance) return false;

  return !(await quietAfterReview(userId, today));
}

/**
 * How many times the app has spoken first since `since`, over both tables.
 *
 * One statement rather than two round trips: this runs for every active account
 * on every tick, and it is the cheap question that answers for most people on
 * most days.
 */
export async function interruptionsSince(userId: string, since: string): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT (SELECT count(*) FROM nudges
              WHERE user_id = $1 AND local_date > $2)
          + (SELECT count(*) FROM alerts
              WHERE user_id = $1 AND local_date > $2 AND kind = ANY($3)) AS n`,
    [userId, since, BUDGETED_ALERT_KINDS],
  );
  return Number(row?.n ?? 0);
}

/** Whether the last weekly review is recent enough to hold the floor. */
export async function quietAfterReview(userId: string, today: string): Promise<boolean> {
  const review = await queryOne<{ created_at: string }>(
    `SELECT created_at FROM weekly_reviews
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (!review) return false;

  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(review.created_at)) / 86_400_000;
  return days <= QUIET_DAYS_AFTER_REVIEW;
}
