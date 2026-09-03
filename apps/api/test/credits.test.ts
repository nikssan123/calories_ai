import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db.ts';
import { creditBalance, grantCredits, spendCredit } from '../src/services/credits.ts';
import { allowanceFor, PlanLimitError, requireAllowance } from '../src/services/usage.ts';
import { bundleFor } from '../src/services/billing.ts';
import { BUNDLES, limitsFor } from '../src/services/plans.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

/**
 * Scans and messages bought outright.
 *
 * The thing worth testing here is not that a number goes up. It is that the two
 * ways an account can lose stock it paid for — a retried webhook granting twice,
 * and a race spending the last credit twice — are both closed, because neither
 * shows up in ordinary use and both are permanent when they do. Since `042` put
 * both meters in one table there is a third: a credit bought against one meter
 * being spent by the other, which is silent until somebody counts.
 */
describe('credits', () => {
  let user: TestUser;
  beforeEach(async () => {
    user = await createUser();
  });

  it('grants a bundle once, however many times the webhook retries', async () => {
    expect(await grantCredits(user.id, 'photo_25', 'evt-1')).toBe(true);
    expect(await creditBalance(user.id, 'photo')).toBe(25);

    // RevenueCat redelivers on any non-2xx. The second one must be free.
    expect(await grantCredits(user.id, 'photo_25', 'evt-1')).toBe(false);
    expect(await creditBalance(user.id, 'photo')).toBe(25);

    // A different event is a different purchase, and does stack.
    expect(await grantCredits(user.id, 'photo_10', 'evt-2')).toBe(true);
    expect(await creditBalance(user.id, 'photo')).toBe(35);
  });

  it('refuses a bundle id it does not sell', async () => {
    expect(await grantCredits(user.id, 'photo_999' as never, 'evt-3')).toBe(false);
    expect(await creditBalance(user.id, 'photo')).toBe(0);
  });

  it('never spends below zero, even when several turns race for the last one', async () => {
    await grantCredits(user.id, 'photo_10', 'evt-4');

    // Ten concurrent spends against ten credits, then ten more against none.
    const first = await Promise.all(Array.from({ length: 10 }, () => spendCredit(user.id, 'photo')));
    expect(first.filter(Boolean)).toHaveLength(10);
    expect(await creditBalance(user.id, 'photo')).toBe(0);

    const second = await Promise.all(Array.from({ length: 10 }, () => spendCredit(user.id, 'photo')));
    expect(second.filter(Boolean)).toHaveLength(0);
    expect(await creditBalance(user.id, 'photo')).toBe(0);
  });

  /**
   * The ledger is the point of the table. A counter would answer the balance
   * just as well and could not answer this.
   */
  it('keeps the purchase and the spends as separate rows', async () => {
    await grantCredits(user.id, 'photo_10', 'evt-5');
    await spendCredit(user.id, 'photo');

    const rows = await query<{ reason: string; delta: number; bundle_id: string | null }>(
      'SELECT reason, delta, bundle_id FROM credits WHERE user_id = $1 ORDER BY delta DESC',
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
    await grantCredits(user.id, 'photo_10', 'evt-6');
    const allowance = await allowanceFor(user.id, 'plus', 'photo');

    // Both halves, separately. Folding them into one number would be true this
    // month and a lie the next.
    expect(allowance.allowed).toBe(limitsFor('plus').photo.allowed);
    expect(allowance.used).toBe(0);
    expect(allowance.credits).toBe(10);
  });

  it('is zero on every meter that is not sold by the bundle', async () => {
    await grantCredits(user.id, 'photo_10', 'evt-7');
    for (const meter of ['recipe', 'meal_plan', 'pantry_scan'] as const) {
      expect((await allowanceFor(user.id, 'coach', meter)).credits).toBe(0);
    }
  });

  /**
   * The bug `042` exists to make impossible. One table with a meter column is
   * only safe if every read filters on it — a photo pack that topped up the
   * chat meter would be invisible until somebody's messages ran out early.
   */
  it('does not let one meter spend another meter\'s stock', async () => {
    await grantCredits(user.id, 'photo_10', 'evt-7b');
    expect((await allowanceFor(user.id, 'plus', 'chat')).credits).toBe(0);
    expect(await creditBalance(user.id, 'chat')).toBe(0);
  });

  it('falls through to a bought scan once the month is gone', async () => {
    await spendMonthlyGrant('plus');
    await expect(requireAllowance(user.id, 'plus', 'photo')).rejects.toThrow(PlanLimitError);

    await grantCredits(user.id, 'photo_10', 'evt-8');
    const allowance = await requireAllowance(user.id, 'plus', 'photo');
    expect(allowance.credits).toBe(9);
    expect(await creditBalance(user.id, 'photo')).toBe(9);
  });

  it('walls again when the bought ones run out too', async () => {
    await spendMonthlyGrant('plus');
    await grantCredits(user.id, 'photo_10', 'evt-9');
    for (let i = 0; i < 10; i++) await requireAllowance(user.id, 'plus', 'photo');

    await expect(requireAllowance(user.id, 'plus', 'photo')).rejects.toThrow(PlanLimitError);
  });

  /**
   * A credit is only touched once the grant is spent. Drawing on bought stock
   * while the included scans are sitting unused is the one behaviour nobody
   * would forgive, and it is invisible until someone counts.
   */
  it('does not touch a bought scan while the month still has room', async () => {
    await grantCredits(user.id, 'photo_10', 'evt-10');
    await requireAllowance(user.id, 'plus', 'photo');
    expect(await creditBalance(user.id, 'photo')).toBe(10);
  });

  it('sells more scans to a free account too', async () => {
    await spendMonthlyGrant('free');
    await grantCredits(user.id, 'photo_10', 'evt-11');
    await expect(requireAllowance(user.id, 'free', 'photo')).resolves.toBeTruthy();
  });
});

/**
 * Messages, which are the reason `042` happened.
 *
 * The photo cases above already cover the ledger's mechanics, so these only
 * test what is different about a message pack: it lands on the chat meter, it
 * queues behind the monthly grant like every other credit, and — the one
 * product rule with teeth — it is spendable by an account that is no longer
 * subscribed, because credits do not expire and the money was already taken.
 */
describe('credits against the chat meter', () => {
  let user: TestUser;
  beforeEach(async () => {
    user = await createUser();
  });

  const spendMonthlyGrant = async (plan: 'free' | 'plus' | 'coach') => {
    const allowed = limitsFor(plan).chat.allowed!;
    for (let i = 0; i < allowed; i++) {
      await query(
        `INSERT INTO ai_usage (user_id, kind, model, provider, cost_usd)
         VALUES ($1,'text_log','claude-haiku-4-5','anthropic-api',0)`,
        [user.id],
      );
    }
  };

  it('credits the chat meter and leaves the photo one alone', async () => {
    await grantCredits(user.id, 'chat_100', 'evt-c1');
    expect(await creditBalance(user.id, 'chat')).toBe(100);
    expect(await creditBalance(user.id, 'photo')).toBe(0);
    expect((await allowanceFor(user.id, 'plus', 'chat')).credits).toBe(100);
  });

  it('does not touch a bought message while the month still has room', async () => {
    await grantCredits(user.id, 'chat_30', 'evt-c2');
    await requireAllowance(user.id, 'plus', 'chat');
    expect(await creditBalance(user.id, 'chat')).toBe(30);
  });

  it('falls through to a bought message once the month is gone, then walls', async () => {
    await spendMonthlyGrant('plus');
    await expect(requireAllowance(user.id, 'plus', 'chat')).rejects.toThrow(PlanLimitError);

    await grantCredits(user.id, 'chat_30', 'evt-c3');
    expect((await requireAllowance(user.id, 'plus', 'chat')).credits).toBe(29);
    for (let i = 0; i < 29; i++) await requireAllowance(user.id, 'plus', 'chat');

    await expect(requireAllowance(user.id, 'plus', 'chat')).rejects.toThrow(PlanLimitError);
  });

  /**
   * `subscriberOnly` keeps message packs off the wall on Free — it does not
   * refuse to honour one that is already owned. This is the lapsed subscriber:
   * they bought a hundred messages on Plus, the subscription ran out, and the
   * stock is still theirs. Spending it is the only outcome that is not keeping
   * the money and withholding the thing it bought.
   */
  it('still spends stock bought before a subscription lapsed', async () => {
    await grantCredits(user.id, 'chat_30', 'evt-c4');
    await spendMonthlyGrant('free');
    await expect(requireAllowance(user.id, 'free', 'chat')).resolves.toBeTruthy();
    expect(await creditBalance(user.id, 'chat')).toBe(29);
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
    for (const bundle of BUNDLES) {
      expect(bundleFor(event({ product_id: bundle.id }))).toBe(bundle.id);
    }
  });

  /**
   * The message packs are the first bundles whose id shares a prefix with
   * something else in the vocabulary — `chat` is also a meter name. A store
   * that sent the meter rather than the product must not credit anybody.
   */
  it('is null for a meter name that is not a bundle', () => {
    expect(bundleFor(event({ product_id: 'chat' }))).toBeNull();
    expect(bundleFor(event({ product_id: 'photo' }))).toBeNull();
  });
});
