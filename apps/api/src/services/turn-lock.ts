import { query, queryOne } from '../db.ts';

/**
 * One turn at a time per account.
 *
 * The failure this prevents is a correctness one before it is a load one. A
 * turn opens by reading the day through `buildDaySummary` and closes by writing
 * to it through a tool, with twenty seconds of model call in between — so two
 * turns started a second apart both read the same "before", and a double-tapped
 * send logs lunch twice while each reply quotes a total that does not include
 * the other one.
 *
 * The lease is held on the user row rather than in this process, for the reason
 * the whole scaling plan exists: an in-process map stops defending anything the
 * moment a second replica appears, and there is nothing sticky routing a person
 * to the same one. It is not a Postgres advisory lock either — those live on a
 * connection, and holding a connection for the length of a turn is exactly the
 * resource this is trying to protect.
 */

/**
 * How long a lease lasts if nobody releases it.
 *
 * Long enough that a slow photo turn is never robbed of its own lock, short
 * enough that a process killed mid-turn does not lock someone out of their
 * journal for meaningfully longer than they would wait anyway. The normal path
 * never reaches it — `withTurnLock` releases in a `finally`.
 */
export const TURN_LEASE_SECONDS = 120;

/**
 * Raised when a turn is already running for this account. Distinct from an
 * ordinary failure because the right answer is "you already have one in
 * flight", not "something went wrong" — and the caller answers it with a 429
 * rather than a 502.
 */
export class TurnInProgressError extends Error {
  constructor() {
    super('You already have a message being answered. Give it a moment.');
    this.name = 'TurnInProgressError';
  }
}

/**
 * Takes the lease, or returns false if someone else holds a live one.
 *
 * One statement, so the check and the claim cannot be separated by another
 * caller: the `WHERE` matches only a row whose lease is absent or expired, and
 * `RETURNING` is empty when it does not match. Taking over an expired lease is
 * deliberate and is how a crashed turn heals.
 */
async function acquire(userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE users
        SET turn_lock_until = now() + ($2 || ' seconds')::interval
      WHERE id = $1
        AND (turn_lock_until IS NULL OR turn_lock_until < now())
      RETURNING id`,
    [userId, String(TURN_LEASE_SECONDS)],
  );
  return row !== null;
}

/**
 * Releases unconditionally.
 *
 * Not conditioned on still owning the lease, because by the time this runs the
 * only way it could have changed hands is that this turn overran the lease and
 * another took over — in which case the other turn is the live one and clearing
 * the column is the wrong-but-harmless outcome either way. A release that could
 * itself fail to release is worse than one that occasionally lets a second turn
 * through.
 */
async function release(userId: string): Promise<void> {
  await query('UPDATE users SET turn_lock_until = NULL WHERE id = $1', [userId]);
}

/**
 * Runs `fn` holding this account's turn lease, or throws `TurnInProgressError`.
 *
 * The rejection is immediate and deliberate. Queueing the second turn would
 * move the wait rather than removing it — somebody is watching the screen — and
 * the honest answer to "you pressed send twice" is to say so.
 */
export async function withTurnLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (!(await acquire(userId))) throw new TurnInProgressError();
  try {
    return await fn();
  } finally {
    // Swallowed: the turn's own result is what the caller is waiting for, and a
    // failed release only costs the lease its remaining seconds.
    await release(userId).catch(() => {});
  }
}
