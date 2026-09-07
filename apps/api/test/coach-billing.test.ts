import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { env } from '../src/env.ts';
import {
  acceptInvite,
  createInvite,
  ensureCoachAccount,
  getCoachAccount,
  setCoachPlan,
} from '../src/services/coach.ts';
import {
  applyStripeEvent,
  createCheckoutSession,
  expireLapsed,
  LAPSED_GRACE_DAYS,
  MIN_PAID_SEATS,
  verifyStripeSignature,
} from '../src/services/stripe.ts';
import { appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The coach seat's card reader. See COACH.md §9.
 *
 * Nothing here reaches Stripe: `fetch` is stubbed where a call would go out,
 * and the webhook is fed events signed with the test secret. What is pinned
 * is the signature check, the idempotency, and the one mapping that matters —
 * a subscription's status and quantity to a plan and a seat count.
 */

const SECRET = 'whsec_test_secret';

let coach: TestUser;
let client: TestUser;
let app: FastifyInstance;
let cookie: string;

beforeEach(async () => {
  env.stripe = { secretKey: 'sk_test_x', webhookSecret: SECRET, seatPriceId: 'price_seat', basePriceId: 'price_base' };
  coach = await createUser({ email: 'coach@example.com', display_name: 'Maria' });
  client = await createUser({ email: 'client@example.com', plan: 'free' });
  await ensureCoachAccount(coach.id);
  const outcome = await acceptInvite(client.id, (await createInvite(coach.id)).code);
  if (!outcome.ok) throw new Error(outcome.reason);
  ({ app, cookie } = await appFor(coach));
});

afterEach(async () => {
  env.stripe = null;
  vi.unstubAllGlobals();
  await app.close();
});

function sign(body: string, at = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', SECRET).update(`${at}.${body}`).digest('hex');
  return `t=${at},v1=${v1}`;
}

function subscriptionEvent(
  id: string,
  type: string,
  status: string,
  quantity: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    type,
    data: {
      object: {
        id: 'sub_123',
        object: 'subscription',
        status,
        customer: 'cus_123',
        items: { data: [{ quantity }] },
        metadata: { coach_user_id: coach.id },
        ...extra,
      },
    },
  };
}

async function post(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  return app.inject({
    method: 'POST',
    url: '/billing/stripe',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature ?? sign(body) },
    payload: body,
  });
}

describe('verifyStripeSignature', () => {
  it('accepts a fresh signature and refuses a wrong, stale or missing one', () => {
    const body = '{"id":"evt_1"}';
    expect(verifyStripeSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyStripeSignature(body, sign(body), 'whsec_other')).toBe(false);
    expect(verifyStripeSignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, Math.floor(Date.now() / 1000) - 3600), SECRET)).toBe(false);
    expect(verifyStripeSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyStripeSignature(body, 't=abc,v1=zzz', SECRET)).toBe(false);
  });

  it('is satisfied by any one of several v1 values, as during a secret rotation', () => {
    const body = '{}';
    const good = sign(body);
    const [t, v1] = good.split(',');
    expect(verifyStripeSignature(body, `${t},v1=deadbeef,${v1}`, SECRET)).toBe(true);
  });
});

describe('the webhook', () => {
  it('moves the coach to paid with the seat count on the subscription', async () => {
    const response = await post(subscriptionEvent('evt_1', 'customer.subscription.updated', 'active', 12));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, applied: true, reason: 'ok' });

    const account = (await getCoachAccount(coach.id))!;
    expect(account).toMatchObject({ plan: 'paid', seat_limit: 12, seats_carry_plus: true, lapsed_at: null });
    const stripe = await queryOne<any>('SELECT stripe_customer_id, stripe_subscription_id FROM coach_accounts WHERE user_id = $1', [coach.id]);
    expect(stripe).toEqual({ stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_123' });
    // The client's seat carries Plus.
    expect((await queryOne<any>('SELECT plan, plan_source FROM users WHERE id = $1', [client.id]))).toMatchObject({ plan: 'plus', plan_source: 'coach_seat' });
    // And the audit row names the coach.
    expect((await queryOne<any>(`SELECT user_id, store FROM billing_events WHERE id = 'evt_1'`))).toEqual({ user_id: coach.id, store: 'stripe' });
  });

  it('refuses a bad signature and a malformed body, and answers a duplicate once', async () => {
    const event = subscriptionEvent('evt_2', 'customer.subscription.updated', 'active', 5);
    expect((await post(event, 't=1,v1=nope')).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/billing/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': sign('{') }, payload: '{' })).statusCode).toBe(400);

    expect((await post(event)).json().reason).toBe('ok');
    expect((await post(event)).json().reason).toBe('duplicate');
  });

  it('finds the coach by customer when the metadata is missing', async () => {
    await query(`UPDATE coach_accounts SET stripe_customer_id = 'cus_known' WHERE user_id = $1`, [coach.id]);
    const event = subscriptionEvent('evt_3', 'customer.subscription.updated', 'active', 7, { metadata: {}, customer: 'cus_known' });
    expect((await post(event)).json().reason).toBe('ok');
    expect((await getCoachAccount(coach.id))!.seat_limit).toBe(7);

    const stranger = subscriptionEvent('evt_4', 'customer.subscription.updated', 'active', 7, { metadata: {}, customer: 'cus_nobody' });
    expect((await post(stranger)).json().reason).toBe('unknown_coach');
  });

  it('opens a grace period on a failed card, and ends it on a date', async () => {
    await post(subscriptionEvent('evt_5', 'customer.subscription.updated', 'active', 5));
    await post(subscriptionEvent('evt_6', 'customer.subscription.updated', 'past_due', 5));

    const lapsed = (await getCoachAccount(coach.id))!;
    expect(lapsed.plan).toBe('lapsed');
    expect(lapsed.seats_carry_plus).toBe(true);
    expect(lapsed.lapsed_at).not.toBeNull();
    expect((await queryOne<any>('SELECT plan FROM users WHERE id = $1', [client.id]))!.plan).toBe('plus');

    // Inside the fortnight, nothing moves.
    expect(await expireLapsed(new Date(Date.now() + (LAPSED_GRACE_DAYS - 1) * 86_400_000))).toBe(0);
    // Past it, Solo: one seat, on the free tier.
    expect(await expireLapsed(new Date(Date.now() + (LAPSED_GRACE_DAYS + 1) * 86_400_000))).toBe(1);
    expect((await getCoachAccount(coach.id))!).toMatchObject({ plan: 'expired', seat_limit: 0, seats_carry_plus: false });
    expect((await queryOne<any>('SELECT plan FROM users WHERE id = $1', [client.id]))!.plan).toBe('free');

    // The card works again: straight back.
    await post(subscriptionEvent('evt_7', 'customer.subscription.updated', 'active', 5));
    expect((await getCoachAccount(coach.id))!).toMatchObject({ plan: 'paid', seat_limit: 5, lapsed_at: null });
    expect((await queryOne<any>('SELECT plan FROM users WHERE id = $1', [client.id]))!.plan).toBe('plus');
  });

  it('expires a cancelled coach', async () => {
    await post(subscriptionEvent('evt_8', 'customer.subscription.updated', 'active', 5));
    await post(subscriptionEvent('evt_9', 'customer.subscription.deleted', 'canceled', 5));
    expect((await getCoachAccount(coach.id))!).toMatchObject({ plan: 'expired', seat_limit: 0 });
  });

  it('reads the subscription behind a completed checkout', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('https://api.stripe.com/v1/subscriptions/sub_new');
      return new Response(JSON.stringify({ id: 'sub_new', status: 'active', customer: 'cus_new', items: { data: [{ quantity: 9 }] } }), { status: 200 });
    });
    const result = await applyStripeEvent(
      {
        id: 'evt_10',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_1', client_reference_id: coach.id, customer: 'cus_new', subscription: 'sub_new' } },
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result).toEqual({ applied: true, reason: 'ok' });
    expect((await getCoachAccount(coach.id))!).toMatchObject({ plan: 'paid', seat_limit: 9 });
  });

  it('reads the seat count off the seat line, not the base fee', async () => {
    const event = subscriptionEvent('evt_12', 'customer.subscription.updated', 'active', 0, {
      items: { data: [{ price: { id: 'price_base' }, quantity: 1 }, { price: { id: 'price_seat' }, quantity: 7 }] },
    });
    expect((await post(event)).statusCode).toBe(200);
    expect((await getCoachAccount(coach.id))!).toMatchObject({ plan: 'paid', seat_limit: 7 });
  });

  it('answers 503 when the server has no Stripe', async () => {
    env.stripe = null;
    expect((await post(subscriptionEvent('evt_11', 'customer.subscription.updated', 'active', 5))).statusCode).toBe(503);
  });
});

describe('an expired account', () => {
  it('reaches the account and billing, and a 402 everywhere else', async () => {
    await setCoachPlan(coach.id, 'expired', 0);
    const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } });

    expect((await get('/coach/me')).statusCode).toBe(200);
    expect((await get('/coach/roster')).statusCode).toBe(402);
    expect((await get('/coach/roster')).json()).toMatchObject({ code: 'subscription_required' });
    expect((await get('/coach/invites')).statusCode).toBe(402);
    expect((await get('/coach/digest/preview')).statusCode).toBe(402);
    // Billing is the way back in: no card yet is a 404 from the route, not a 402 from the guard.
    expect((await app.inject({ method: 'POST', url: '/coach/billing/portal', headers: { cookie } })).statusCode).toBe(404);

    await setCoachPlan(coach.id, 'paid', 3);
    expect((await get('/coach/roster')).statusCode).toBe(200);
  });
});

describe('checkout and the portal', () => {
  it('asks Stripe for a session with the seats as the quantity, floored at the minimum', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit) => {
      calls.push({ url: String(input), body: String(init.body) });
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test' }), { status: 200 });
    }));

    const response = await app.inject({ method: 'POST', url: '/coach/billing/checkout', headers: { cookie }, payload: { seats: 1 } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test' });

    expect(calls[0]!.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    const params = new URLSearchParams(calls[0]!.body);
    expect(params.get('mode')).toBe('subscription');
    // The dashboard fee first, fixed at one; the seats beside it, adjustable.
    expect(params.get('line_items[0][price]')).toBe('price_base');
    expect(params.get('line_items[0][quantity]')).toBe('1');
    expect(params.get('line_items[0][adjustable_quantity][enabled]')).toBeNull();
    expect(params.get('line_items[1][price]')).toBe('price_seat');
    expect(params.get('line_items[1][quantity]')).toBe(String(MIN_PAID_SEATS));
    expect(params.get('line_items[1][adjustable_quantity][minimum]')).toBe(String(MIN_PAID_SEATS));
    // A fresh coach is inside the free month, so the card is not charged until it ends.
    const account = (await getCoachAccount(coach.id))!;
    expect(params.get('subscription_data[trial_end]')).toBe(
      String(Math.floor(new Date(account.trial_ends_at!).getTime() / 1000)),
    );
    expect(params.get('client_reference_id')).toBe(coach.id);
    expect(params.get('customer_email')).toBe(coach.email);
    expect(params.get('subscription_data[metadata][coach_user_id]')).toBe(coach.id);
    expect(params.get('success_url')).toContain('/coach/settings?checkout=success');
  });

  it('charges at once when the free month is over, or nearly', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/x' }), { status: 200 }));
    const paramsOf = (call: number) => new URLSearchParams(String((fetchImpl.mock.calls[call] as any)[1].body));

    await setCoachPlan(coach.id, 'expired', 0);
    await createCheckoutSession(coach.id, 2, fetchImpl as unknown as typeof fetch);
    expect(paramsOf(0).get('subscription_data[trial_end]')).toBeNull();

    // A day left is under Stripe's two-day floor for a trial end: no trial, charge now.
    await query(`UPDATE coach_accounts SET plan = 'trial', trial_ends_at = now() + interval '1 day' WHERE user_id = $1`, [coach.id]);
    await createCheckoutSession(coach.id, 2, fetchImpl as unknown as typeof fetch);
    expect(paramsOf(1).get('subscription_data[trial_end]')).toBeNull();
  });

  it('reuses the customer once there is one', async () => {
    await query(`UPDATE coach_accounts SET stripe_customer_id = 'cus_again' WHERE user_id = $1`, [coach.id]);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ url: 'https://checkout.stripe.com/x' }), { status: 200 }));
    await createCheckoutSession(coach.id, 5, fetchImpl as unknown as typeof fetch);
    const params = new URLSearchParams(String((fetchImpl.mock.calls[0] as any)[1].body));
    expect(params.get('customer')).toBe('cus_again');
    expect(params.get('customer_email')).toBeNull();
  });

  it('has no portal for a coach with no card, and one for a coach with', async () => {
    expect((await app.inject({ method: 'POST', url: '/coach/billing/portal', headers: { cookie } })).statusCode).toBe(404);

    await query(`UPDATE coach_accounts SET stripe_customer_id = 'cus_p' WHERE user_id = $1`, [coach.id]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session' }), { status: 200 })));
    const response = await app.inject({ method: 'POST', url: '/coach/billing/portal', headers: { cookie } });
    expect(response.json()).toEqual({ url: 'https://billing.stripe.com/p/session' });
  });

  it('relays what Stripe said when it refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'No such price: price_seat' } }), { status: 400 })));
    const response = await app.inject({ method: 'POST', url: '/coach/billing/checkout', headers: { cookie }, payload: { seats: 5 } });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toBe('No such price: price_seat');
  });

  it('is hidden without Stripe, like the rest of the dashboard is without a seat', async () => {
    env.stripe = null;
    expect((await app.inject({ method: 'POST', url: '/coach/billing/checkout', headers: { cookie }, payload: { seats: 5 } })).statusCode).toBe(503);
    await setCoachPlan(coach.id, 'paid', 5);
    expect((await getCoachAccount(coach.id))!.billing_configured).toBe(false);
  });
});
