import { queryOne } from '../db.ts';

/**
 * The store reviewers' logins, whose trial never ends.
 *
 * `appreview@` is on Free on purpose — its App Store review notes say so, so
 * the reviewer can reach the paywall and buy in the sandbox — and a trial that
 * ran out seven days after it was made would leave every later review with a
 * journal that refuses to answer. So on these two the week rolls instead of
 * ending: always the trial's allowance, counted over the last seven days.
 * `play-review@` is on Coach and never reaches this, but it is the same kind of
 * account and belongs on the same list. See the store-reviewer note in the
 * project memory for why neither may ever be purged.
 */
export const STORE_REVIEWERS: readonly string[] = [
  'appreview@daysofar.com',
  'play-review@daysofar.com',
];

export function trialNeverEnds(email: string | null | undefined): boolean {
  return !!email && STORE_REVIEWERS.includes(email.trim().toLowerCase());
}

/**
 * Start a free account's seven-day trial — see `LIMITS.free` in `plans.ts`.
 *
 * Called when an account is saved: an address confirmed, or a Google or Apple
 * identity attached. Idempotent, because a second confirmation, a relink or a
 * retried callback must never hand out a second week. Returns when the trial
 * began, whether that was now or earlier.
 *
 * Not at an unconfirmed claim: an address nobody has proved is free to type, and
 * a trial per throwaway address is a trial per install.
 */
export async function startTrial(userId: string, now = new Date()): Promise<Date | null> {
  const row = await queryOne<{ trial_started_at: Date }>(
    `UPDATE users SET trial_started_at = COALESCE(trial_started_at, $2)
      WHERE id = $1
      RETURNING trial_started_at`,
    [userId, now],
  );
  return row ? new Date(row.trial_started_at) : null;
}
