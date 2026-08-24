import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db.ts';
import { grantPhotoCredits, photoCreditBalance, spendPhotoCredit } from '../src/services/credits.ts';
import { allowanceFor, PlanLimitError, requireAllowance } from '../src/services/usage.ts';
import { bundleFor } from '../src/services/billing.ts';
import { limitsFor, PHOTO_BUNDLES } from '../src/services/plans.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

/**
 * Photo scans bought outright.
 *
 * The thing worth testing here is not that a number goes up. It is that the two
 * ways an account can lose scans it paid for — a retried webhook granting twice,
 * and a race spending the last credit twice — are both closed, because neither
 * shows up in ordinary use and both are permanent when they do.
 */
describe('photo credits', () => {
  let user: TestUser;
  beforeEach(async () => {
    user = await createUser();
  });

  it('grants a bundle once, however many times the webhook retries', async () => {
    expect(await grantPhotoCredits(user.id, 'photo_25', 'evt-1')).toBe(true);
    expect(await photoCreditBalance(user.id)).toBe(25);

    // RevenueCat redelivers on any non-2xx. The second one must be free.
    expect(await grantPhotoCredits(user.id, 'photo_25', 'evt-1')).toBe(false);
    expect(await photoCreditBalance(user.id)).toBe(25);

    // A different event is a different purchase, and does stack.
    expect(await grantPhotoCredits(user.id, 'photo_10', 'evt-2')).toBe(true);
    expect(await photoCreditBalance(user.id)).toBe(35);
  });

  it('refuses a bundle id it does not sell', async () => {
    expect(await grantPhotoCredits(user.id, 'photo_999' as never, 'evt-3')).toBe(false);
    expect(await photoCreditBalance(user.id)).toBe(0);
  });

  it('never spends below zero, even when several turns race for the last one', async () => {
    await grantPhotoCredits(user.id, 'photo_10', 'evt-4');

    // Ten concurrent spends against ten credits, then ten more against none.
    const first = await Promise.all(Array.from({ length: 10 }, () => spendPhotoCredit(user.id)));
    expect(first.filter(Boolean)).toHaveLength(10);
    expect(await photoCreditBalance(user.id)).toBe(0);

    const second = await Promise.all(Array.from({ length: 10 }, () => spendPhotoCredit(user.id)));
    expect(second.filter(Boolean)).toHaveLength(0);
    expect(await photoCreditBalance(user.id)).toBe(0);
  });

  /**
   * The ledger is the point of the table. A counter would answer the balance
   * just as well and could not answer this.
   */
  it('keeps the purchase and the spends as separate rows', async () => {
    await grantPhotoCredits(user.id, 'photo_10', 'evt-5');
    await spendPhotoCredit(user.id);

    const rows = await query<{ reason: string; delta: number; bundle_id: string | null }>(
      'SELECT reason, delta, bundle_id FROM photo_credits WHERE user_id = $1 ORDER BY delta DESC',
      [user.id],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ reason: 'purchase', delta: 10, bundle_id: 'photo_10' });
    expect(rows[1]).toMatchObject({ reason: 'spend', delta: -1, bundle_id: null });
  });
});

describe('credits against the photo meter', () => {
  let user: TestUser;
  beforeEach(async () => {
    user = await createUser();
  });

  const spendMonthlyGrant = async (plan: 'free' | 'plus' | 'coach') => {
    const allowed = limitsFor(plan).photo.allowed!;
    for (let i = 0; i < allowed; i++) {
      await query(
        `INSERT INTO ai_usage (user_id, kind, model, provider, cost_usd)
         VALUES ($1,'photo_log','claude-sonnet-5','anthropic-api',0)`,
        [user.id],
      );
    }
  };

  it('reports bought scans alongside the grant, before the button is pressed', async () => {
    await grantPhotoCredits(user.id, 'photo_10', 'evt-6');
    const allowance = await allowanceFor(user.id, 'plus', 'photo');

    // Both halves, separately. Folding them into one number would be true this
    // month and a lie the next.
    expect(allowance.allowed).toBe(limitsFor('plus').photo.allowed);
    expect(allowance.used).toBe(0);
    expect(allowance.credits).toBe(10);
  });

  it('is zero on every meter that is not sold by the bundle', async () => {
    await grantPhotoCredits(user.id, 'photo_10', 'evt-7');
    for (const meter of ['chat', 'recipe', 'meal_plan', 'pantry_scan'] as const) {
      expect((await allowanceFor(user.id, 'coach', meter)).credits).toBe(0);
    }
  });

  it('falls through to a bought scan once the month is gone', async () => {
    await spendMonthlyGrant('plus');
    await expect(requireAllowance(user.id, 'plus', 'photo')).rejects.toThrow(PlanLimitError);

    await grantPhotoCredits(user.id, 'photo_10', 'evt-8');
    const allowance = await requireAllowance(user.id, 'plus', 'photo');
    expect(allowance.credits).toBe(9);
    expect(await photoCreditBalance(user.id)).toBe(9);
  });

  it('walls again when the bought ones run out too', async () => {
    await spendMonthlyGrant('plus');
    await grantPhotoCredits(user.id, 'photo_10', 'evt-9');
    for (let i = 0; i < 10; i++) await requireAllowance(user.id, 'plus', 'photo');

    await expect(requireAllowance(user.id, 'plus', 'photo')).rejects.toThrow(PlanLimitError);
  });

  /**
   * A credit is only touched once the grant is spent. Drawing on bought stock
   * while the included scans are sitting unused is the one behaviour nobody
   * would forgive, and it is invisible until someone counts.
   */
  it('does not touch a bought scan while the month still has room', async () => {
    await grantPhotoCredits(user.id, 'photo_10', 'evt-10');
    await requireAllowance(user.id, 'plus', 'photo');
    expect(await photoCreditBalance(user.id)).toBe(10);
  });

  it('sells more scans to a free account too', async () => {
    await spendMonthlyGrant('free');
    await grantPhotoCredits(user.id, 'photo_10', 'evt-11');
    await expect(requireAllowance(user.id, 'free', 'photo')).resolves.toBeTruthy();
  });
});

describe('recognising a bundle purchase', () => {
  const event = (over: Record<string, unknown>) =>
    ({ id: 'e', type: 'NON_RENEWING_PURCHASE', app_user_id: 'u', ...over }) as never;

  it('reads the product id, with or without a Play base plan on it', () => {
    expect(bundleFor(event({ product_id: 'photo_25' }))).toBe('photo_25');
    expect(bundleFor(event({ product_id: 'photo_25:oneoff' }))).toBe('photo_25');
  });

  it('prefers the entitlement list when there is one', () => {
    expect(bundleFor(event({ entitlement_ids: ['photo_50'], product_id: 'photo_10' }))).toBe(
      'photo_50',
    );
  });

  /** The property that makes it safe to run in front of planFor. */
  it('is null for a tier, so a subscription falls straight through', () => {
    expect(bundleFor(event({ product_id: 'coach:annual' }))).toBeNull();
    expect(bundleFor(event({ entitlement_ids: ['plus'] }))).toBeNull();
    expect(bundleFor(event({}))).toBeNull();
  });

  it('sells every bundle it advertises', () => {
    for (const bundle of PHOTO_BUNDLES) {
      expect(bundleFor(event({ product_id: bundle.id }))).toBe(bundle.id);
    }
  });
});
