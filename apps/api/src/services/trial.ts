import { queryOne } from '../db.ts';

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
