import { query, queryOne } from '../db.ts';
import { PHOTO_BUNDLES, type PhotoBundleId } from './plans.ts';

/**
 * Photo scans bought outright.
 *
 * The plan grants a number of scans a month; a bundle is stock on top of it,
 * bought once and drawn down only after the month's grant is gone. It does not
 * expire, and that is the whole of the product decision — an expiring top-up is
 * a refund the seller quietly keeps, and it would make the wall explain two
 * clocks instead of one.
 *
 * The balance is a sum over `photo_credits` rather than a column, for the
 * reasons in `036`: a retried webhook against a bare counter is free scans
 * forever, and a refund against one is a special case that clamps at zero and
 * forgets it happened.
 */

/** What is left. Never negative: a spend is only written when one is available. */
export async function photoCreditBalance(userId: string): Promise<number> {
  const row = await queryOne<{ n: string | null }>(
    `SELECT sum(delta) AS n FROM photo_credits WHERE user_id = $1`,
    [userId],
  );
  return Math.max(0, Number(row?.n ?? 0));
}

/**
 * Add a bundle to an account, once.
 *
 * `eventId` is the store's own id and the unique index on it is the entire
 * idempotency mechanism — a redelivered `NON_RENEWING_PURCHASE` conflicts and
 * does nothing rather than granting twice. Returns whether this call was the
 * one that landed it, so the caller can tell a fresh purchase from a repeat
 * without a second query.
 */
export async function grantPhotoCredits(
  userId: string,
  bundleId: PhotoBundleId,
  eventId: string,
): Promise<boolean> {
  const bundle = PHOTO_BUNDLES.find((b) => b.id === bundleId);
  if (!bundle) return false;

  const rows = await query<{ id: string }>(
    `INSERT INTO photo_credits (user_id, delta, reason, event_id, bundle_id)
     VALUES ($1, $2, 'purchase', $3, $4)
     ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [userId, bundle.scans, eventId, bundleId],
  );
  return rows.length > 0;
}

/**
 * Take one scan off the balance.
 *
 * Conditional on the balance still being positive *inside the statement*, so
 * two photo turns racing cannot both spend the last credit — the `SELECT` in
 * the `WHERE` re-reads under the same snapshot the insert commits against.
 * Returns false when there was nothing to spend, which the caller treats as the
 * wall rather than as an error.
 */
export async function spendPhotoCredit(userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO photo_credits (user_id, delta, reason)
     SELECT $1, -1, 'spend'
      WHERE (SELECT coalesce(sum(delta), 0) FROM photo_credits WHERE user_id = $1) > 0
     RETURNING id`,
    [userId],
  );
  return rows.length > 0;
}

