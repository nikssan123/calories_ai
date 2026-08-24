import { pool } from '../db.ts';

/**
 * One runner at a time for a named background pass.
 *
 * The hourly tick has no re-entrancy guard of its own, and both passes it
 * starts walk every active user serially with a model call each. A review takes
 * roughly forty seconds; a few hundred users in one timezone is already longer
 * than the hour between ticks, at which point two runs overlap. That is not
 * merely duplicated work — both would find the same unwritten week, both would
 * call the model, and both would publish and email, because the check that
 * makes the pass idempotent ("has this week been written yet?") happens forty
 * seconds before the write that answers it.
 *
 * The same race appears the instant there is a second replica, and arrives
 * without any tick overlapping at all.
 *
 * A Postgres advisory lock is the right instrument here, where it was the wrong
 * one for a user's turn: it lives on a connection, and a background pass can
 * happily hold a connection for its duration — there is exactly one of these
 * running, by construction. It also needs no table, no cleanup, and no expiry,
 * because the lock dies with the connection, so a killed process releases it
 * rather than blocking the next hour.
 */

export const REVIEW_JOB = 'weekly-reviews';
export const NUDGE_JOB = 'nudges';
/**
 * The alerts pass has its own, for the reason the other two do — but note that
 * the argument above only half applies here. Nothing in that pass calls a
 * model, so no run of it takes forty seconds and no two ticks realistically
 * overlap. What it still needs the lock for is the second replica, where the
 * race arrives with no overlap at all: two processes reading the same due check
 * in the same millisecond, both finding a streak uncongratulated. The unique
 * index behind `saveAlert` is the thing that actually settles that; this lock
 * is what stops both of them doing the work to find out.
 */
export const ALERT_JOB = 'alerts';

/**
 * Runs `fn` holding the named lock, or returns null without running it because
 * somebody else holds it.
 *
 * Null rather than an exception or a wait: a pass that is already running is
 * the system working, not failing, and the work is due hourly — the right
 * response to missing this hour's slot is to do nothing and let the next tick
 * find the same unwritten week.
 */
export async function withJobLock<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS locked',
      [name],
    );
    if (!rows[0]?.locked) return null;

    try {
      return await fn();
    } finally {
      // Before the release, always. An advisory lock is held by the session,
      // so a connection handed back to the pool still holding one would take
      // the lock out of circulation until the pool happened to discard it.
      await client.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [name]);
    }
  } finally {
    client.release();
  }
}
