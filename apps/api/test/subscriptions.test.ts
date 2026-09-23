import { beforeEach, describe, expect, it } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { applyEvent, effectOf } from '../src/services/billing.ts';
import {
  listSubscriptions,
  monthlyUsd,
  periodOf,
  setPlan,
  subscriptionReport,
} from '../src/services/subscriptions.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

/**
 * The admin panel's view of who is paying.
 *
 * Most of what is asserted here is a *reading* rather than a computation, and
 * the readings are the part that goes quietly wrong: the price taken off the
 * wrong event blanks the revenue of every subscription that has been
 * cancelled-but-not-expired, and a period read off the wrong half of an Apple
 * product id multiplies a monthly figure by twelve. Both look like a working
 * dashboard.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

/** A RevenueCat event, in the shape `applyEvent` takes. */
const event = (over: Record<string, unknown> = {}) => ({
  id: `evt_${Math.random().toString(36).slice(2)}`,
  type: 'INITIAL_PURCHASE',
  app_user_id: user.id,
  product_id: 'plus:monthly',
  entitlement_ids: ['plus'],
  expiration_at_ms: Date.now() + 30 * 86_400_000,
  store: 'PLAY_STORE',
  environment: 'PRODUCTION',
  price: 11.44,
  takehome_percentage: 0.85,
  transaction_id: 'GPA.0000-0000-0000-00000',
  country_code: 'BG',
  renewal_number: 1,
  ...over,
});

const apply = (over: Record<string, unknown> = {}) =>
  applyEvent(event(over) as never, { acceptSandbox: false });

describe('reading the billing period', () => {
  /**
   * Whole tokens, on both stores. Play reports `plus:annual`; Apple cannot use
   * a colon, so the same thing is `com.daysofar.app.plus.annual` there — and a
   * prefix rule would find `com` and give up.
   */
  it('reads a period off either store’s product id', () => {
    expect(periodOf('plus:annual')).toBe('year');
    expect(periodOf('plus:monthly')).toBe('month');
    expect(periodOf('com.daysofar.app.coach.annual')).toBe('year');
    expect(periodOf('com.daysofar.app.plus.weekly')).toBe('week');
  });

  /** Null rather than a guess: this number is multiplied by twelve downstream. */
  it('answers null when nothing in the id says', () => {
    expect(periodOf('plus')).toBeNull();
    expect(periodOf(null)).toBeNull();
    expect(periodOf('photo_10')).toBeNull();
  });
});

describe('putting a charge on a monthly axis', () => {
  it('spreads a year over twelve and scales a week up', () => {
    expect(monthlyUsd(120, 'year')).toBe(10);
    expect(monthlyUsd(9.99, 'month')).toBe(9.99);
    expect(monthlyUsd(2, 'week')).toBeCloseTo(8.69, 2);
  });

  /**
   * Unknown stays unknown. A zero would read as "this customer pays nothing",
   * which is a different claim and a wrong one.
   */
  it('refuses to price what it cannot', () => {
    expect(monthlyUsd(null, 'month')).toBeNull();
    expect(monthlyUsd(9.99, null)).toBeNull();
  });
});

describe('the subscription list', () => {
  it('carries the plan, the store and the order id', async () => {
    await apply();

    const [row] = await listSubscriptions();
    expect(row.user_id).toBe(user.id);
    expect(row.plan).toBe('plus');
    expect(row.plan_source).toBe('play');
    expect(row.store).toBe('PLAY_STORE');
    expect(row.transaction_id).toBe('GPA.0000-0000-0000-00000');
    expect(row.period).toBe('month');
    expect(row.gross_usd).toBe(11.44);
    expect(row.net_usd).toBe(9.72);
    expect(row.overdue).toBe(false);
  });

  /**
   * The case that decides whether the money column is ever useful.
   *
   * An `EXPIRATION` arrives with no price on it, and it is the last event on
   * every subscription that has ended — so reading the figures off the latest
   * event would blank exactly the rows somebody is looking at.
   */
  it('takes the money off the last event that had any', async () => {
    await apply();
    await apply({ type: 'EXPIRATION', price: null, expiration_at_ms: Date.now() - 1000 });

    const [row] = await listSubscriptions();
    expect(row.last_event).toBe('EXPIRATION');
    expect(row.plan).toBe('free');
    expect(row.gross_usd).toBe(11.44);
  });

  /** A former subscriber is still a row: they are who support is asked about. */
  it('keeps accounts that have lapsed', async () => {
    await apply({ type: 'EXPIRATION' });

    const rows = await listSubscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0].plan).toBe('free');
  });

  /** An account that never touched a store is not a subscription. */
  it('leaves free accounts with no history out', async () => {
    expect(await listSubscriptions()).toHaveLength(0);
  });

  /**
   * Paid, and the period has already run out. Every one of these is a bug
   * rather than a customer — `expirePlans` exists to revoke them — so the panel
   * counts them separately and keeps them out of MRR.
   */
  it('marks a paid account whose period has run out as overdue', async () => {
    await query(
      `UPDATE users SET plan = 'plus', plan_source = 'play', plan_expires_at = now() - interval '2 days'
        WHERE id = $1`,
      [user.id],
    );

    const [row] = await listSubscriptions();
    expect(row.overdue).toBe(true);

    const report = await subscriptionReport();
    expect(report.totals.overdue).toBe(1);
    expect(report.totals.active).toBe(0);
    expect(report.totals.mrr_net_usd).toBe(0);
  });
});

describe('the report', () => {
  it('counts the active ones and adds up what they pay', async () => {
    await apply();

    const report = await subscriptionReport();
    expect(report.totals.active).toBe(1);
    expect(report.totals.by_plan).toEqual([{ plan: 'plus', count: 1 }]);
    expect(report.totals.by_source).toEqual([{ source: 'play', count: 1 }]);
    expect(report.totals.mrr_gross_usd).toBe(11.44);
    expect(report.totals.expiring_7d).toBe(0);
    expect(report.events[0].email).toBe(user.email);
  });

  /** A renewal inside the week is a renewal that has to arrive. */
  it('counts a period ending inside a week as renewing', async () => {
    await apply({ expiration_at_ms: Date.now() + 2 * 86_400_000 });

    expect((await subscriptionReport()).totals.expiring_7d).toBe(1);
  });

  it('counts an account back on free that once paid as lapsed', async () => {
    await apply();
    await apply({ type: 'EXPIRATION' });

    const report = await subscriptionReport();
    expect(report.totals.lapsed).toBe(1);
    expect(report.totals.active).toBe(0);
  });

  /**
   * The block this panel was written for. A webhook with no secret refuses
   * every delivery, and under test there is deliberately no secret — see the
   * note on `revenueCatSecret` in `env.ts`.
   */
  it('reports whether a purchase could land at all', async () => {
    const report = await subscriptionReport();
    expect(report.webhook.configured).toBe(false);
    expect(report.webhook.last_event_at).toBeNull();

    await apply();
    expect((await subscriptionReport()).webhook.last_event_at).not.toBeNull();
  });
});

describe('setting a plan by hand', () => {
  /**
   * The repair for a purchase that was paid for and never delivered. Matching
   * the store — source and renewal date — is the point: a grant left `manual`
   * is exempt from the sweep for ever, and one dated in the past is swept
   * overnight.
   */
  it('grants a plan and dates it', async () => {
    const renews = new Date(Date.now() + 30 * 86_400_000).toISOString();
    expect(await setPlan(user.id, { plan: 'plus', expiresAt: renews, source: 'play', by: null })).toBe(
      true,
    );

    const row = await queryOne<{ plan: string; plan_source: string; plan_expires_at: Date }>(
      'SELECT plan, plan_source, plan_expires_at FROM users WHERE id = $1',
      [user.id],
    );
    expect(row?.plan).toBe('plus');
    expect(row?.plan_source).toBe('play');
    expect(row?.plan_expires_at?.toISOString()).toBe(renews);
  });

  /**
   * Revoking clears the source and the date with the plan. A free account left
   * carrying `play` and an expiry reads as a subscription to the next person,
   * and as a row to sweep for ever to `expirePlans`.
   */
  it('clears the source and the expiry when it revokes', async () => {
    await apply();
    await setPlan(user.id, { plan: 'free', expiresAt: null, source: 'play', by: null });

    const row = await queryOne<{ plan: string; plan_source: string; plan_expires_at: Date | null }>(
      'SELECT plan, plan_source, plan_expires_at FROM users WHERE id = $1',
      [user.id],
    );
    expect(row?.plan).toBe('free');
    expect(row?.plan_source).toBe('manual');
    expect(row?.plan_expires_at).toBeNull();
  });

  /**
   * `billing_events` is described everywhere in this codebase as the trail
   * behind `users.plan`. An admin grant that did not appear there would make
   * that false exactly when somebody is relying on it to explain an account.
   */
  it('writes itself into the event log', async () => {
    await setPlan(user.id, { plan: 'coach', expiresAt: null, source: 'manual', by: user.id });

    const row = await queryOne<{ type: string; environment: string; payload: any }>(
      'SELECT type, environment, payload FROM billing_events WHERE user_id = $1',
      [user.id],
    );
    expect(row?.type).toBe('ADMIN_SET_PLAN');
    expect(row?.environment).toBe('ADMIN');
    expect(row?.payload.plan).toBe('coach');
    expect(row?.payload.by).toBe(user.id);
  });

  /** And that row is inert: replayed through the webhook it grants nothing. */
  it('logs a type the webhook does not act on', () => {
    expect(effectOf('ADMIN_SET_PLAN')).toBe('ignore');
  });

  it('answers false for an account that does not exist', async () => {
    expect(
      await setPlan('00000000-0000-0000-0000-000000000000', {
        plan: 'plus',
        expiresAt: null,
        source: 'manual',
        by: null,
      }),
    ).toBe(false);
  });
});
