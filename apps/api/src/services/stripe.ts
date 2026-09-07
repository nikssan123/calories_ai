import { createHmac, timingSafeEqual } from 'node:crypto';
import { query, queryOne } from '../db.ts';
import { env, type StripeEnv } from '../env.ts';
import { getCoachAccount, setCoachPlan, SOLO_SEATS } from './coach.ts';

/**
 * The coach seat's card reader. See COACH.md §9.
 *
 * Stripe's REST API over `fetch`, form-encoded, rather than the SDK: three
 * calls and one signature check is the whole surface, and a dependency that
 * ships a hundred endpoints to make three is the wrong trade for a server
 * that otherwise carries none of them.
 *
 * One product, one graduated price, and the seat count as the quantity. That
 * is the entire catalogue, and it is why nothing here has to map a product id
 * to a plan the way `billing.ts` does for the stores: the subscription's
 * quantity *is* the seat limit, and its status *is* the plan.
 */

const API = 'https://api.stripe.com/v1';

/** The fewest seats a card is asked for. Solo is one seat and no card. */
export const MIN_PAID_SEATS = 3;
export const MAX_SEATS = 200;

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
 * A Checkout Session for `seats` seats. The coach lands on Stripe's page,
 * and comes back to Settings either way; the webhook is what moves the plan,
 * never the return URL — a return URL is a browser saying it was there, and
 * that is not a payment.
 *
 * The seat count is adjustable on Stripe's own page, within the same bounds,
 * so the number typed here is a starting point rather than a commitment.
 */
export async function createCheckoutSession(
  coachId: string,
  seats: number,
  fetchImpl?: typeof fetch,
): Promise<{ url: string }> {
  const { seatPriceId } = configured();
  const account = await getCoachAccount(coachId);
  if (!account) throw new Error('Not a coach');
  const quantity = Math.min(MAX_SEATS, Math.max(MIN_PAID_SEATS, Math.trunc(seats)));

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
      subscription_data: { metadata: { coach_user_id: coachId } },
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
  const quantity = Number(subscription.items?.data?.[0]?.quantity ?? 0);
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
      await setCoachPlan(coachId, 'solo', SOLO_SEATS, stripe);
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
 * tier and the plan reads Solo until the card works again, at which point
 * the subscription's next `updated` event puts everything back.
 */
export async function expireLapsed(now = new Date()): Promise<number> {
  const rows = await query<{ user_id: string }>(
    `SELECT user_id FROM coach_accounts
      WHERE plan = 'lapsed' AND lapsed_at IS NOT NULL
        AND lapsed_at < $1::timestamptz - make_interval(days => $2::int)`,
    [now, LAPSED_GRACE_DAYS],
  );
  for (const row of rows) await setCoachPlan(row.user_id, 'solo', SOLO_SEATS);
  return rows.length;
}
