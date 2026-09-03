import { query, queryOne } from '../db.ts';
import { BUNDLES, type BundleId, type MeterName } from '@ct/shared';

/**
 * Stock bought outright — photo scans and journal messages.
 *
 * The plan grants a number of each a month; a bundle is stock on top of it,
 * bought once and drawn down only after the month's grant is gone. It does not
 * expire, and that is the whole of the product decision — an expiring top-up is
 * a refund the seller quietly keeps, and it would make the wall explain two
 * clocks instead of one.
 *
 * The balance is a sum over `credits` rather than a column, for the reasons in
 * `036` and restated in `042`: a retried webhook against a bare counter is free
 * stock forever, and a refund against one is a special case that clamps at zero
 * and forgets it happened.
 *
 * Every function here takes the meter rather than assuming photos. That is the
 * whole of what `042` bought: the two bundles differ in a `WHERE` clause, not
 * in a code path, so a third one is a row in `BUNDLES` and nothing here.
 */

/** What is left. Never negative: a spend is only written when one is available. */
export async function creditBalance(userId: string, meter: MeterName): Promise<number> {
  const row = await queryOne<{ n: string | null }>(
    `SELECT sum(delta) AS n FROM credits WHERE user_id = $1 AND meter = $2`,
    [userId, meter],
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
 *
 * The meter is read off the bundle rather than passed in, because the id is
 * what the store sent and the meter is what we decided it means. A caller that
 * could supply both could supply a mismatched pair, and the failure — a
 * hundred messages credited as photo scans — is silent on both ends.
 */
export async function grantCredits(
  userId: string,
  bundleId: BundleId,
  eventId: string,
): Promise<boolean> {
  const bundle = BUNDLES.find((b) => b.id === bundleId);
  if (!bundle) return false;

  const rows = await query<{ id: string }>(
    `INSERT INTO credits (user_id, meter, delta, reason, event_id, bundle_id)
     VALUES ($1, $2, $3, 'purchase', $4, $5)
     ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [userId, bundle.meter, bundle.units, eventId, bundleId],
  );
  return rows.length > 0;
}

/**
 * Take one unit off the balance.
 *
 * Conditional on the balance still being positive *inside the statement*, so
 * two turns racing cannot both spend the last credit — the `SELECT` in the
 * `WHERE` re-reads under the same snapshot the insert commits against.
 * Returns false when there was nothing to spend, which the caller treats as the
 * wall rather than as an error.
 */
export async function spendCredit(userId: string, meter: MeterName): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO credits (user_id, meter, delta, reason)
     SELECT $1, $2, -1, 'spend'
      WHERE (SELECT coalesce(sum(delta), 0) FROM credits
              WHERE user_id = $1 AND meter = $2) > 0
     RETURNING id`,
    [userId, meter],
  );
  return rows.length > 0;
}
