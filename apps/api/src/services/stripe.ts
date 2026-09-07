import { createHmac, timingSafeEqual } from 'node:crypto';
import { query, queryOne } from '../db.ts';
import { env, type StripeEnv } from '../env.ts';
import { EXPIRED_SEATS, getCoachAccount, setCoachPlan } from './coach.ts';

/**
 * The coach seat's card reader. See COACH.md §9.
 *
 * Stripe's REST API over `fetch`, form-encoded, rather than the SDK: three
 * calls and one signature check is the whole surface, and a dependency that
 * ships a hundred endpoints to make three is the wrong trade for a server
 * that otherwise carries none of them.
 *
 * Two prices on one subscription: a flat monthly fee for the dashboard, and a
 * graduated per-seat price with the seat count as the quantity. That is the
 * entire catalogue, and it is why nothing here has to map a product id to a
 * plan the way `billing.ts` does for the stores: the seat line's quantity *is*
 * the seat limit, and the subscription's status *is* the plan.
 */

const API = 'https://api.stripe.com/v1';

/** The fewest seats a card is asked for. The base fee is the floor; a seat is a client. */
export const MIN_PAID_SEATS = 1;
export const MAX_SEATS = 200;

/** Stripe refuses a trial end nearer than this, so a shorter remainder is simply not passed. */
const MIN_TRIAL_END_SECONDS = 48 * 3600;

/** How long a failed card keeps Plus on the seats before they drop to free. */
export const LAPSED_GRACE_DAYS = 14;

/** How far a webhook's timestamp may be from ours before it is a replay. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

function configured(): StripeEnv {
  if (!env.stripe) throw new Error('Stripe is not configured on this server.');
  return env.stripe;
}

/** Nested keys the way Stripe's form encoding spells them: `a[b][0][c]`. */
function encode(params: Record<string, unknown>, prefix = ''): string[] {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) pairs.push(...encode(item as Record<string, unknown>, `${name}[${index}]`));
        else pairs.push(`${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === 'object') {
      pairs.push(...encode(value as Record<string, unknown>, name));
    } else {
      pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return pairs;
}

async function stripeRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, unknown> = {},
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<T> {
  const { secretKey } = configured();
  const body = method === 'POST' ? encode(params).join('&') : undefined;
  const response = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      ...(body !== undefined ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body,
  });
  const json = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(json.error?.message ?? `Stripe answered ${response.status}`);
  }
  return json;
}

// ---- Checkout and the portal -------------------------------------------------

/**
 * The rest of the free month, as a Stripe trial end: a coach who adds a card
 * on day ten is not charged until day thirty, and the card is simply on file
 * by then. Only a trial has a remainder — `expired` keeps the date for the
 * billing page's copy, but the month is over.
 */
function remainingTrialEnd(account: { plan: string; trial_ends_at: string | null }, now: Date): number | null {
  if (account.plan !== 'trial' || !account.trial_ends_at) return null;
  const seconds = Math.floor(new Date(account.trial_ends_at).getTime() / 1000);
  return seconds - now.getTime() / 1000 >= MIN_TRIAL_END_SECONDS ? seconds : null;
}

/**
 * A Checkout Session for the dashboard and `seats` seats. The coach lands on
 * Stripe's page, and comes back to Settings either way; the webhook is what
 * moves the plan, never the return URL — a return URL is a browser saying it
 * was there, and that is not a payment.
 *
 * The seat count is adjustable on Stripe's own page, within the same bounds,
 * so the number typed here is a starting point rather than a commitment. The
 * base fee is not adjustable: one dashboard, one fee.
 */
export async function createCheckoutSession(
  coachId: string,
  seats: number,
  fetchImpl?: typeof fetch,
  now = new Date(),
): Promise<{ url: string }> {
  const { seatPriceId, basePriceId } = configured();
  const account = await getCoachAccount(coachId);
  if (!account) throw new Error('Not a coach');
  const quantity = Math.min(MAX_SEATS, Math.max(MIN_PAID_SEATS, Math.trunc(seats)));
  const trialEnd = remainingTrialEnd(account, now);

  const stripeCustomer = await queryOne<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM coach_accounts WHERE user_id = $1',
    [coachId],
  );

  const session = await stripeRequest<{ url: string }>(
    'POST',
    '/checkout/sessions',
    {
      mode: 'subscription',
      line_items: [
        { price: basePriceId, quantity: 1 },
        {
          price: seatPriceId,
          quantity,
          adjustable_quantity: { enabled: true, minimum: MIN_PAID_SEATS, maximum: MAX_SEATS },
        },
      ],
      client_reference_id: coachId,
      // An existing customer keeps their card on file; a new one is created
      // from the address so the invoice goes where the sign-in did.
      ...(stripeCustomer?.stripe_customer_id
        ? { customer: stripeCustomer.stripe_customer_id }
        : { customer_email: account.email ?? undefined }),
      subscription_data: {
        metadata: { coach_user_id: coachId },
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
      allow_promotion_codes: true,
      success_url: `${env.appUrl}/coach/settings?checkout=success`,
      cancel_url: `${env.appUrl}/coach/settings?checkout=cancelled`,
    },
    fetchImpl,
  );
  return { url: session.url };
}

/** Stripe's own page for the card, the invoices and the seat count. */
export async function createPortalSession(
  coachId: string,
  fetchImpl?: typeof fetch,
): Promise<{ url: string } | null> {
  configured();
  const row = await queryOne<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM coach_accounts WHERE user_id = $1',
    [coachId],
  );
  if (!row?.stripe_customer_id) return null;
  const session = await stripeRequest<{ url: string }>(
    'POST',
    '/billing_portal/sessions',
    { customer: row.stripe_customer_id, return_url: `${env.appUrl}/coach/settings` },
    fetchImpl,
  );
  return { url: session.url };
}

// ---- The webhook --------------------------------------------------------------

/**
 * Stripe's signature: `t=<unix>,v1=<hex>[,v1=<hex>...]`, where each v1 is an
 * HMAC-SHA256 of `${t}.${rawBody}` under the endpoint secret. Any v1 that
 * matches is enough — Stripe sends more than one while a secret is being
 * rolled — and a timestamp outside the tolerance is a replay however good the
 * signature is.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  now = new Date(),
): boolean {
  if (!header) return false;
  const parts = new Map<string, string[]>();
  for (const piece of header.split(',')) {
    const [key, value] = piece.split('=', 2);
    if (!key || !value) continue;
    parts.set(key.trim(), [...(parts.get(key.trim()) ?? []), value.trim()]);
  }
  const timestamp = Number(parts.get('t')?.[0]);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(
    createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex'),
  );
  return (parts.get('v1') ?? []).some((candidate) => {
    const offered = Buffer.from(candidate);
    return offered.length === expected.length && timingSafeEqual(offered, expected);
  });
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, any> };
}

export interface StripeApplyResult {
  applied: boolean;
  reason: 'ok' | 'duplicate' | 'unknown_coach' | 'ignored';
}

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The coach a Stripe object belongs to: its metadata first, the customer second. */
async function coachFor(object: Record<string, any>): Promise<string | null> {
  const fromMetadata = object.metadata?.coach_user_id ?? object.client_reference_id;
  if (typeof fromMetadata === 'string' && USER_ID.test(fromMetadata)) {
    const row = await queryOne<{ user_id: string }>('SELECT user_id FROM coach_accounts WHERE user_id = $1', [fromMetadata]);
    if (row) return row.user_id;
  }
  const customer = typeof object.customer === 'string' ? object.customer : object.customer?.id;
  if (typeof customer === 'string') {
    const row = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM coach_accounts WHERE stripe_customer_id = $1',
      [customer],
    );
    if (row) return row.user_id;
  }
  return null;
}

/** The id on a subscription item's price, however expanded the object came. */
function priceIdOf(item: Record<string, any>): string | undefined {
  return typeof item.price === 'string' ? item.price : item.price?.id;
}

/**
 * The seat line's quantity. Two lines share the subscription, so the seat
 * line is found by its price; failing that, whichever line is not the base
 * fee, which is also what a subscription made before the base fee looks like.
 */
function seatQuantity(subscription: Record<string, any>): number {
  const { seatPriceId, basePriceId } = configured();
  const items: Record<string, any>[] = subscription.items?.data ?? [];
  const seat =
    items.find((item) => priceIdOf(item) === seatPriceId) ??
    items.find((item) => priceIdOf(item) !== basePriceId);
  return Number(seat?.quantity ?? 0);
}

/**
 * What a subscription's state means for the seats.
 *
 * `past_due` and `unpaid` are the grace period, not the end: Stripe is still
 * retrying, and revoking on the first failure churns people the retry was
 * about to recover — the same argument `billing.ts` makes about BILLING_ISSUE.
 * `expireLapsed` is what ends the grace, on a date.
 */
async function applySubscription(
  coachId: string,
  subscription: Record<string, any>,
  now: Date,
): Promise<void> {
  const quantity = seatQuantity(subscription);
  const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const stripe = { customerId: customer ?? null, subscriptionId: subscription.id ?? null };

  switch (subscription.status) {
    case 'active':
    case 'trialing':
      await setCoachPlan(coachId, 'paid', quantity > 0 ? quantity : MIN_PAID_SEATS, stripe);
      await query('UPDATE coach_accounts SET lapsed_at = NULL WHERE user_id = $1', [coachId]);
      return;
    case 'past_due':
    case 'unpaid': {
      const current = await getCoachAccount(coachId);
      await setCoachPlan(coachId, 'lapsed', current?.seat_limit ?? quantity, stripe);
      await query(
        'UPDATE coach_accounts SET lapsed_at = COALESCE(lapsed_at, $2) WHERE user_id = $1',
        [coachId, now],
      );
      return;
    }
    case 'canceled':
    case 'incomplete_expired':
      await setCoachPlan(coachId, 'expired', EXPIRED_SEATS, stripe);
      await query('UPDATE coach_accounts SET lapsed_at = NULL WHERE user_id = $1', [coachId]);
      return;
    default:
      // `incomplete` and anything newer: the card has not been charged yet, so
      // nothing has been bought and nothing changes.
      return;
  }
}

/**
 * Record the event and move the plan, once. Idempotent on the event id for
 * the reason the RevenueCat path is: a webhook worth having retries.
 */
export async function applyStripeEvent(
  event: StripeEvent,
  options: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<StripeApplyResult> {
  const now = options.now ?? new Date();
  const object = event.data?.object ?? {};

  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO billing_events (id, user_id, type, store, product_id, expires_at, environment, payload)
       VALUES ($1, NULL, $2, 'stripe', NULL, NULL, NULL, $3)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
    [event.id, event.type, JSON.stringify(event)],
  );
  if (!inserted) return { applied: false, reason: 'duplicate' };

  const coachId = await coachFor(object);
  if (!coachId) return { applied: false, reason: 'unknown_coach' };
  await query('UPDATE billing_events SET user_id = $1 WHERE id = $2', [coachId, event.id]);

  switch (event.type) {
    case 'checkout.session.completed': {
      // The session names the subscription; the seat count lives on it.
      const subscriptionId = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
      if (!subscriptionId) return { applied: false, reason: 'ignored' };
      const subscription = await stripeRequest<Record<string, any>>(
        'GET',
        `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        {},
        options.fetchImpl,
      );
      await applySubscription(coachId, subscription, now);
      return { applied: true, reason: 'ok' };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await applySubscription(coachId, object, now);
      return { applied: true, reason: 'ok' };
    default:
      return { applied: false, reason: 'ignored' };
  }
}

/**
 * Every grace period that has run out, ended: the seats drop to the free
 * tier and the dashboard closes until the card works again, at which point
 * the subscription's next `updated` event puts everything back.
 */
export async function expireLapsed(now = new Date()): Promise<number> {
  const rows = await query<{ user_id: string }>(
    `SELECT user_id FROM coach_accounts
      WHERE plan = 'lapsed' AND lapsed_at IS NOT NULL
        AND lapsed_at < $1::timestamptz - make_interval(days => $2::int)`,
    [now, LAPSED_GRACE_DAYS],
  );
  for (const row of rows) await setCoachPlan(row.user_id, 'expired', EXPIRED_SEATS);
  return rows.length;
}
