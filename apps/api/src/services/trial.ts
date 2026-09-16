import { TRIAL } from '@ct/shared';
import { queryOne } from '../db.ts';

/**
 * The store reviewers' logins, whose trial never ends.
 *
 * `appreview@` is on Free on purpose — its App Store review notes say so, so
 * the reviewer can reach the paywall and buy in the sandbox — and a trial that
 * ran out a few days after it was made would leave every later review with a
 * journal that refuses to answer. So on these two the window rolls instead of
 * ending: 28 messages over the last seven days, which is the trial as it was
 * before it was shortened. `allowanceFor` says why the reviewers kept the old
 * and more forgiving numbers, and why they ignore `trial_terms` to do it.
 *
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
 * Start a free account's trial — see `LIMITS.free` in `plans.ts` for its length.
 *
 * Called when an account is saved: an address confirmed, or a Google or Apple
 * identity attached. Idempotent, because a second confirmation, a relink or a
 * retried callback must never hand out a second trial. Returns when the trial
 * began, whether that was now or earlier.
 *
 * The terms are stamped here, in the same statement and under the same
 * `COALESCE`, and that is the whole grandfather clause: whatever `TRIAL` says on
 * the day an account saves is what that account keeps, and a trial that started
 * on the seven-day terms goes on being a seven-day trial no matter what this
 * constant becomes later. `TRIAL_LEGACY` in `@ct/shared` and migration `059` say
 * why it is stored rather than worked out from a date.
 *
 * Not at an unconfirmed claim: an address nobody has proved is free to type, and
 * a trial per throwaway address is a trial per install.
 */
export async function startTrial(userId: string, now = new Date()): Promise<Date | null> {
  const row = await queryOne<{ trial_started_at: Date }>(
    `UPDATE users
        SET trial_started_at = COALESCE(trial_started_at, $2),
            trial_terms = COALESCE(trial_terms, $3::jsonb)
      WHERE id = $1
      RETURNING trial_started_at`,
    [userId, now, JSON.stringify(TRIAL)],
  );
  return row ? new Date(row.trial_started_at) : null;
}
