import {
  FUNNEL_STEPS,
  REASONED_STEPS,
  SAVE_REASONS,
  type AdminFunnel,
  type FunnelPing,
  type FunnelStep,
  type Locale,
  type SaveReason,
} from '@ct/shared';
import { query, queryOne } from '../db.ts';

/**
 * The first-run funnel: how many installs reached each screen of the walk.
 *
 * Written by `POST /funnel` from a phone that has no account yet, read by the
 * admin panel. What makes it safe to take from anybody is what it stores — a
 * count per (day, step, platform, version, and on two steps which prompt asked)
 * and nothing else — so the worst a forged ping can do is move a number on a
 * chart the operator reads, and the route's rate limit bounds even that. See
 * the migrations for why it exists (055) and why the reason joined it (060).
 */

/**
 * How far back a ping is allowed to say it happened.
 *
 * Two days behind and one ahead. The ahead is not generosity, it is timezones:
 * the day on the ping is the phone's and the one it lands on is this host's, and
 * a phone in Auckland is already on tomorrow. The behind is how long a queued
 * ping is worth flushing — long enough for a night offline and a morning in a
 * tunnel, short enough that the window a forged ping can reach stays small.
 *
 * Anything outside it falls back to today, which is what every build older than
 * this sends anyway. A ping is never dropped for being late: a count on the
 * wrong day is a smaller lie than a step that reads as never reached.
 */
const DAY_SLACK = { behind: 2, ahead: 1 } as const;

/**
 * The phone's day, if it sent one this side of `DAY_SLACK`, else null for today.
 *
 * `FunnelPing` checks the shape and cannot check the date: `2026-02-30` is four
 * digits, two and two, and casting it in the statement below would be a 500 on a
 * route anybody can post to. The round trip catches both that and `2026-13-45`,
 * because `Date` rolls them over into a day that no longer spells the same.
 */
function dayOrNull(day: string | undefined): string | null {
  if (!day) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
  return day;
}

/**
 * One more install at this step, on the day it happened.
 *
 * `reason` is null on all but the two steps that carry one and `locale` is null
 * on anything built before 062, and the key folds nulls together — see the index
 * in 062, which is what `ON CONFLICT` infers. `internal` is defaulted rather than
 * nullable: a ping that does not mention it is a store build, which is the
 * assumption that keeps a real install from being hidden by an older phone.
 *
 * The day is clamped in SQL rather than in TypeScript so that both sides of the
 * comparison come off one clock. `CURRENT_DATE` is the database's date and
 * `new Date()` is the API process's, and on a host where those two disagree —
 * a container without TZ, an API restarted across a DST change — a clamp
 * written here would pass a day the insert then files under a different one.
 */
export async function recordFunnelStep(ping: FunnelPing): Promise<void> {
  await query(
    `INSERT INTO onboarding_funnel (day, step, platform, app_version, reason, locale, internal, reached)
     SELECT
       CASE
         WHEN sent.day BETWEEN CURRENT_DATE - $7::int AND CURRENT_DATE + $8::int THEN sent.day
         ELSE CURRENT_DATE
       END,
       $1, $2, $3, $4, $5, $6, 1
     FROM (SELECT COALESCE($9::date, CURRENT_DATE) AS day) sent
     ON CONFLICT (day, step, platform, app_version, reason, locale, internal)
     DO UPDATE SET reached = onboarding_funnel.reached + 1`,
    [
      ping.step,
      ping.platform,
      ping.app_version,
      ping.reason ?? null,
      ping.locale ?? null,
      ping.internal ?? false,
      DAY_SLACK.behind,
      DAY_SLACK.ahead,
      dayOrNull(ping.day),
    ],
  );
}

/**
 * The last `days` days, today included, as the panel draws it.
 *
 * Every step comes back even when nothing reached it, in walk order, because a
 * funnel with a missing row reads as a step that does not exist rather than one
 * that lost everybody — and the second is the thing this is for.
 */
export async function readFunnel(days: number): Promise<AdminFunnel> {
  const rows = await query<{
    step: FunnelStep;
    platform: 'ios' | 'android';
    app_version: string;
    reason: SaveReason | null;
    locale: Locale | null;
    internal: boolean;
    reached: number;
  }>(
    `SELECT step, platform, app_version, reason, locale, internal, sum(reached)::int AS reached
       FROM onboarding_funnel
      WHERE day > CURRENT_DATE - $1::int
      GROUP BY step, platform, app_version, reason, locale, internal`,
    [days],
  );

  /*
   * Our own builds leave the panel, and are counted on the way out.
   *
   * Everything below reads `real`, so a morning spent driving the walk on a
   * simulator stops reading as a dozen installs that opened the app and left.
   * The total is kept and reported because the alternative is indistinguishable
   * from the flag not working: a funnel that silently drops rows and one that
   * has none to drop both look like the same set of numbers.
   */
  const real = rows.filter((row) => !row.internal);
  const internal_pings = rows
    .filter((row) => row.internal)
    .reduce((sum, row) => sum + row.reached, 0);

  const steps = FUNNEL_STEPS.map((step) => {
    const mine = real.filter((row) => row.step === step);
    const on = (platform: 'ios' | 'android') =>
      mine.filter((row) => row.platform === platform).reduce((sum, row) => sum + row.reached, 0);
    return { step, reached: on('ios') + on('android'), ios: on('ios'), android: on('android') };
  });

  /*
   * Version and language are the same shape of question — "which slice of this
   * blend lost people" — so they are folded the same way, over a key that no
   * locale can collide with: `null` for a phone from before 062 becomes the
   * empty string in the key and comes back out as null.
   */
  const fold = <K extends string | null>(key: (row: (typeof real)[number]) => K) => {
    const counts = new Map<string, { key: K; step: FunnelStep; reached: number }>();
    for (const row of real) {
      const value = key(row);
      const id = `${value ?? ''}\u0000${row.step}`;
      const found = counts.get(id);
      if (found) found.reached += row.reached;
      else counts.set(id, { key: value, step: row.step, reached: row.reached });
    }
    return [...counts.values()];
  };

  const versions = fold((row) => row.app_version)
    .map(({ key, step, reached }) => ({ app_version: key, step, reached }))
    .sort(
      (a, b) =>
        b.app_version.localeCompare(a.app_version, undefined, { numeric: true }) ||
        FUNNEL_STEPS.indexOf(a.step) - FUNNEL_STEPS.indexOf(b.step),
    );

  const locales = fold((row) => row.locale)
    .map(({ key, step, reached }) => ({ locale: key, step, reached }))
    .sort(
      (a, b) =>
        (a.locale ?? '\uffff').localeCompare(b.locale ?? '\uffff') ||
        FUNNEL_STEPS.indexOf(a.step) - FUNNEL_STEPS.indexOf(b.step),
    );

  /*
   * Both reasoned steps against all four prompts, zeros included and in ladder
   * order, for the same reason every step comes back above: a rung that shows
   * nothing has to read as a rung nobody took, not as a rung that is missing.
   */
  const reasons = REASONED_STEPS.flatMap((step) =>
    SAVE_REASONS.map((reason) => ({
      step,
      reason,
      reached: real
        .filter((row) => row.step === step && row.reason === reason)
        .reduce((sum, row) => sum + row.reached, 0),
    })),
  );

  /*
   * Accounts the window actually produced, and the subset that saved an address.
   *
   * The first used to be the second, and read zero for a week while the ads made
   * twenty accounts — every one of them a guest with `email IS NULL`. See
   * `AdminFunnel.accounts_created`.
   */
  const accounts = (await queryOne<{ created: number; saved: number }>(
    `SELECT count(*)::int AS created,
            count(*) FILTER (WHERE email IS NOT NULL)::int AS saved
       FROM users
      WHERE created_at >= CURRENT_DATE - ($1::int - 1)`,
    [days],
  ))!;

  return {
    days,
    steps,
    versions,
    locales,
    reasons,
    accounts_created: accounts.created,
    accounts_saved: accounts.saved,
    internal_pings,
  };
}
