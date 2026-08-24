import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query, queryOne } from '../src/db.ts';
import { applyEvent, effectOf, expirePlans, planFor } from '../src/services/billing.ts';
import { getUser } from '../src/services/user.ts';
import { appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * Store subscriptions, and mostly the ways they lose money quietly.
 *
 * Every failure here is invisible in production: a plan that outlives what was
 * paid for looks like a happy customer, and a plan revoked too early looks like
 * churn. So the cases that matter are the boring ones — a redelivered renewal,
 * a cancellation that must *not* revoke, an expiry nobody was told about.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

const event = (over: Record<string, unknown> = {}) => ({
  id: `evt_${Math.random().toString(36).slice(2)}`,
  type: 'INITIAL_PURCHASE',
  app_user_id: user.id,
  product_id: 'plus:annual',
  entitlement_ids: ['plus'],
  expiration_at_ms: Date.now() + 365 * 86_400_000,
  store: 'PLAY_STORE',
  environment: 'PRODUCTION',
  ...over,
});

const apply = (over: Record<string, unknown> = {}) =>
  applyEvent(event(over) as never, { acceptSandbox: false });

describe('reading a tier off a purchase', () => {
  /**
   * Play Billing 5 split a subscription into a product and a base plan, and
   * RevenueCat reports the pair. `plus:annual` and `plus:monthly` are the same
   * tier, which is what stops a monthly base plan added next year from silently
   * entitling nobody.
   */
  it('takes the product from a Play product:base_plan pair', () => {
    expect(planFor({ product_id: 'plus:annual' } as never)).toBe('plus');
    expect(planFor({ product_id: 'coach:monthly' } as never)).toBe('coach');
    expect(planFor({ product_id: 'coach' } as never)).toBe('coach');
  });

  it('prefers the entitlement when one is configured', () => {
    expect(planFor({ entitlement_ids: ['coach'], product_id: 'plus:annual' } as never)).toBe(
      'coach',
    );
  });

  /** An entitlement nobody named after a plan falls through rather than throwing. */
  it('falls back to the product when the entitlement is unrecognised', () => {
    expect(planFor({ entitlement_ids: ['premium'], product_id: 'plus:annual' } as never)).toBe(
      'plus',
    );
  });

  /** `free` is not purchasable, and a product claiming to sell it is not honoured. */
  it('refuses to grant free as if it were a tier', () => {
    expect(planFor({ product_id: 'free' } as never)).toBeNull();
    expect(planFor({ product_id: 'nonsense' } as never)).toBeNull();
  });
});

describe('what each event means', () => {
  /**
   * The one that matters most, and the one that reads as wrong in review.
   *
   * Turning off auto-renewal is not the end of the subscription — they paid for
   * a period and are still inside it. Revoking here takes away something owed,
   * and "cancelled means cancelled" is the sentence that makes it into a bug.
   */
  it('does not revoke on cancellation', () => {
    expect(effectOf('CANCELLATION')).toBe('ignore');
  });

  /** A failed card opens a grace period the store is actively retrying. */
  it('does not revoke on a billing issue', () => {
    expect(effectOf('BILLING_ISSUE')).toBe('ignore');
  });

  it('revokes only when the period actually ends', () => {
    expect(effectOf('EXPIRATION')).toBe('revoke');
    expect(effectOf('SUBSCRIPTION_PAUSED')).toBe('revoke');
  });

  /** An event type invented after this shipped must not change entitlement. */
  it('ignores what it does not recognise', () => {
    expect(effectOf('SOMETHING_NEW')).toBe('ignore');
  });
});

describe('applying an event', () => {
  it('grants the tier, the source and the expiry', async () => {
    const expires = Date.now() + 30 * 86_400_000;
    expect(await apply({ expiration_at_ms: expires })).toEqual({ applied: true, reason: 'ok' });

    const profile = await getUser(user.id);
    expect(profile.plan).toBe('plus');
    const row = await queryOne<{ plan_source: string; plan_expires_at: Date }>(
      'SELECT plan_source, plan_expires_at FROM users WHERE id = $1',
      [user.id],
    );
    expect(row!.plan_source).toBe('play');
    expect(new Date(row!.plan_expires_at).getTime()).toBe(expires);
  });

  /**
   * A webhook worth having retries, so the same renewal arrives twice. Extending
   * the period on the second one is a subscription outliving what was paid for.
   */
  it('is idempotent on the event id', async () => {
    const e = event({ type: 'RENEWAL' });
    expect(await applyEvent(e as never, { acceptSandbox: false })).toEqual({
      applied: true,
      reason: 'ok',
    });
    expect(await applyEvent(e as never, { acceptSandbox: false })).toEqual({
      applied: false,
      reason: 'duplicate',
    });

    const rows = await query('SELECT id FROM billing_events WHERE id = $1', [e.id]);
    expect(rows).toHaveLength(1);
  });

  it('puts an expiration back on free', async () => {
    await apply();
    expect((await getUser(user.id)).plan).toBe('plus');

    await apply({ type: 'EXPIRATION' });
    expect((await getUser(user.id)).plan).toBe('free');
  });

  /** Cancelling keeps the plan, because the period is still paid for. */
  it('leaves a cancelled subscriber on their tier', async () => {
    await apply();
    expect(await apply({ type: 'CANCELLATION' })).toEqual({ applied: false, reason: 'ignored' });
    expect((await getUser(user.id)).plan).toBe('plus');
  });

  /**
   * A sandbox purchase is free. Honouring one in production would let anybody
   * with a test account grant themselves Coach.
   */
  it('refuses a sandbox purchase when configured to', async () => {
    expect(await apply({ environment: 'SANDBOX' })).toEqual({
      applied: false,
      reason: 'wrong_environment',
    });
    expect((await getUser(user.id)).plan).toBe('free');
  });

  it('honours a sandbox purchase when configured to', async () => {
    const result = await applyEvent(event({ environment: 'SANDBOX' }) as never, {
      acceptSandbox: true,
    });
    expect(result).toEqual({ applied: true, reason: 'ok' });
    expect((await getUser(user.id)).plan).toBe('plus');
  });

  /** Deleted account, replayed event. Recorded, not applied, not a crash. */
  it('records an event for an account that no longer exists', async () => {
    const e = event({ app_user_id: '00000000-0000-0000-0000-000000000000' });
    expect(await applyEvent(e as never, { acceptSandbox: false })).toEqual({
      applied: false,
      reason: 'unknown_user',
    });
    expect(await query('SELECT id FROM billing_events WHERE id = $1', [e.id])).toHaveLength(1);
  });

  /**
   * A purchase made before `logIn`, or a TRANSFER carrying the id it moved
   * from. RevenueCat's ids are not all UUIDs and `users.id` is, so without a
   * shape check the lookup is a type error rather than a miss — a 500 on an
   * event that would be redelivered for hours and fail identically every time.
   */
  it('records an event for an anonymous RevenueCat id', async () => {
    const e = event({ app_user_id: '$RCAnonymousID:8f3a1c0e4b7d4f2a9c6e5b1d3a7f0c92' });
    expect(await applyEvent(e as never, { acceptSandbox: false })).toEqual({
      applied: false,
      reason: 'unknown_user',
    });
    expect(await query('SELECT id FROM billing_events WHERE id = $1', [e.id])).toHaveLength(1);
  });

  it('does not grant a product it has never heard of', async () => {
    expect(await apply({ product_id: 'enterprise:annual', entitlement_ids: [] })).toEqual({
      applied: false,
      reason: 'unknown_plan',
    });
    expect((await getUser(user.id)).plan).toBe('free');
  });
});

describe('the expiry sweep', () => {
  /** The whole point: a dropped EXPIRATION must not mean a free subscription. */
  it('returns a lapsed subscriber to free', async () => {
    await apply({ expiration_at_ms: Date.now() - 86_400_000 });
    expect((await getUser(user.id)).plan).toBe('plus');

    expect(await expirePlans()).toBe(1);
    expect((await getUser(user.id)).plan).toBe('free');
  });

  it('leaves a current subscriber alone', async () => {
    await apply();
    expect(await expirePlans()).toBe(0);
    expect((await getUser(user.id)).plan).toBe('plus');
  });

  /**
   * A comped account has no expiry to be past, and sweeping it would make the
   * one query that protects revenue also the one that cancels the founder.
   */
  it('never touches a manually granted plan', async () => {
    await query(
      `UPDATE users SET plan = 'coach', plan_source = 'manual', plan_expires_at = now() - interval '1 day'
        WHERE id = $1`,
      [user.id],
    );
    expect(await expirePlans()).toBe(0);
    expect((await getUser(user.id)).plan).toBe('coach');
  });
});

describe('the webhook route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await appFor(user));
  });

  const post = (payload: unknown, auth?: string) =>
    app.inject({
      method: 'POST',
      url: '/billing/revenuecat',
      headers: auth ? { authorization: auth } : {},
      payload: payload as never,
    });

  /**
   * The secret is the entire authentication — the body names an account and a
   * tier, so an endpoint that cannot identify its caller hands out plans. Under
   * test `env.billing.revenueCatSecret` is forced null, which is the same state
   * a deployment that forgot to configure it is in.
   */
  it('refuses everything when no secret is configured', async () => {
    const response = await post({ event: event() }, 'whatever');
    expect(response.statusCode).toBe(503);
    expect((await getUser(user.id)).plan).toBe('free');
  });

  it('does not require a session', async () => {
    // 503 rather than 401-not-signed-in: it got past the auth gate and was
    // refused by billing's own check, which is the thing under test.
    expect((await post({ event: event() })).statusCode).toBe(503);
  });
});
