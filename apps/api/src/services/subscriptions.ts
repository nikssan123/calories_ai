import { randomUUID } from 'node:crypto';
import { query, queryOne } from '../db.ts';
import { env } from '../env.ts';
import type {
  AdminBillingEvent,
  AdminSubscription,
  BillingPeriod,
  PlanName,
  PlanSource,
  SubscriptionReport,
} from '@ct/shared';

/**
 * Who is paying, read from the two places that each hold half of the answer.
 *
 * `users.plan` is what every meter in the product enforces, and it has no
 * history: it says `plus` and not which purchase made it so, on which store, at
 * what price, or when the period ends if nothing renews it. `billing_events` is
 * the other half — every delivery as it arrived, including the ones that
 * changed nothing — and it has no current state, because the whole point of
 * `applyEvent` is that most event types are deliberately inert.
 *
 * Neither answers "who is paying us" alone, so this file is the join. It exists
 * because until now the answer took an ssh session and two queries, which is
 * also why the bug it was written after went a whole morning unnoticed: a real
 * purchase had been made, the money taken, and nothing on any screen said the
 * entitlement never arrived.
 *
 * It reads. The one thing it writes is `setPlan`, and that writes its own audit
 * row — see the note there.
 */

/** The store's cut when an event did not say. 15%, per the Play account group. */
const ASSUMED_TAKEHOME = 0.85;

/** Weeks in an average month, for putting a weekly SKU on the same axis as the rest. */
const WEEKS_PER_MONTH = 4.345;

/**
 * How often a product renews, from its id.
 *
 * Both stores encode the period in the identifier and neither one puts it in a
 * field the webhook carries: Play reports `plus:annual` and Apple
 * `com.daysofar.app.plus.monthly`. So this matches a whole token, exactly as
 * `planOf` on the phone does and for the same reason — a prefix rule finds
 * `com` in the Apple id and gives up.
 *
 * Null rather than a guess when nothing matches. A wrong period is worse than
 * no period here, because it is multiplied by twelve on the way into MRR.
 */
export function periodOf(productId: string | null): BillingPeriod | null {
  for (const token of (productId ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (token === 'annual' || token === 'yearly' || token === 'year') return 'year';
    if (token === 'monthly' || token === 'month') return 'month';
    if (token === 'weekly' || token === 'week') return 'week';
  }
  return null;
}

/**
 * What one subscription is worth a month, gross.
 *
 * Null when the period or the price is unknown, which keeps an unpriced row out
 * of the total rather than counting it as zero — a zero reads as "this customer
 * pays nothing", and the honest answer is "we do not know what this one pays".
 */
export function monthlyUsd(gross: number | null, period: BillingPeriod | null): number | null {
  if (gross === null || period === null) return null;
  if (period === 'year') return gross / 12;
  if (period === 'week') return gross * WEEKS_PER_MONTH;
  return gross;
}

/**
 * Everything the panel draws, in one round trip.
 *
 * One request rather than four, for the reason `/admin/costs` is one request:
 * the answer is a comparison. An active count that is not next to the overdue
 * count and the date of the last delivery invites exactly the conclusion this
 * panel exists to prevent — that a quiet webhook is a quiet month.
 */
export async function subscriptionReport(): Promise<SubscriptionReport> {
  const [subscriptions, events, lapsed, lastDelivery] = await Promise.all([
    listSubscriptions(),
    recentBillingEvents(),
    lapsedCount(),
    lastEventAt(),
  ]);

  const active = subscriptions.filter((row) => row.plan !== 'free' && !row.overdue);
  const week = Date.now() + 7 * 86_400_000;

  return {
    subscriptions,
    events,
    totals: {
      active: active.length,
      by_plan: tally(active.map((row) => row.plan)).map(([plan, count]) => ({ plan, count })),
      by_source: tally(active.map((row) => row.plan_source)).map(([source, count]) => ({
        source,
        count,
      })),
      expiring_7d: active.filter(
        (row) => row.plan_expires_at !== null && Date.parse(row.plan_expires_at) <= week,
      ).length,
      lapsed,
      overdue: subscriptions.filter((row) => row.overdue).length,
      mrr_gross_usd: round(sum(active.map((row) => monthlyUsd(row.gross_usd, row.period)))),
      mrr_net_usd: round(sum(active.map((row) => monthlyUsd(row.net_usd, row.period)))),
    },
    webhook: {
      configured: env.billing.revenueCatSecret !== null,
      accepts_sandbox: env.billing.acceptSandbox,
      last_event_at: lastDelivery,
    },
  };
}

/**
 * Every account that is paying, or ever has been.
 *
 * Lapsed accounts stay in the list on purpose: the row somebody goes looking
 * for is usually the one that *stopped* — a card that failed, a refund, a
 * transfer to another id — and a list of current subscribers cannot answer any
 * of those. They sort below the live ones.
 *
 * The money comes from the last event that carried a price rather than from the
 * last event, because the last event is frequently an `EXPIRATION` or a
 * `CANCELLATION`, and those arrive with no figures at all. Reading the price
 * off them would blank the revenue of exactly the subscriptions somebody is
 * looking at.
 */
export async function listSubscriptions(): Promise<AdminSubscription[]> {
  const rows = await query<Record<string, any>>(
    `WITH last_event AS (
       SELECT DISTINCT ON (user_id)
              user_id, type, store, product_id, environment, received_at
         FROM billing_events
        WHERE user_id IS NOT NULL
        ORDER BY user_id, received_at DESC
     ),
     last_charge AS (
       SELECT DISTINCT ON (user_id) user_id, payload
         FROM billing_events
        WHERE user_id IS NOT NULL
          AND payload->>'price' IS NOT NULL
        ORDER BY user_id, received_at DESC
     )
     SELECT u.id, u.email, u.plan, u.plan_source, u.plan_expires_at,
            e.type                              AS last_event,
            e.received_at                       AS last_event_at,
            e.store,
            e.environment,
            COALESCE(e.product_id, c.payload->>'product_id') AS product_id,
            c.payload->>'transaction_id'         AS transaction_id,
            c.payload->>'country_code'           AS country,
            (c.payload->>'price')::float8        AS gross_usd,
            (c.payload->>'takehome_percentage')::float8 AS takehome,
            (c.payload->>'renewal_number')::int  AS renewals
       FROM users u
       LEFT JOIN last_event  e ON e.user_id = u.id
       LEFT JOIN last_charge c ON c.user_id = u.id
      WHERE u.plan <> 'free' OR e.user_id IS NOT NULL
      ORDER BY (u.plan <> 'free') DESC, u.plan_expires_at DESC NULLS LAST, u.created_at`,
  );

  const now = Date.now();
  return rows.map((row) => {
    const expires = row.plan_expires_at ? new Date(row.plan_expires_at).toISOString() : null;
    const gross = row.gross_usd === null ? null : Number(row.gross_usd);
    const takehome = row.takehome === null ? ASSUMED_TAKEHOME : Number(row.takehome);
    return {
      user_id: row.id,
      email: row.email,
      plan: row.plan,
      plan_source: row.plan_source,
      plan_expires_at: expires,
      overdue: row.plan !== 'free' && expires !== null && Date.parse(expires) < now,
      last_event: row.last_event ?? null,
      last_event_at: row.last_event_at ? new Date(row.last_event_at).toISOString() : null,
      store: row.store ?? null,
      environment: row.environment ?? null,
      product_id: row.product_id ?? null,
      transaction_id: row.transaction_id ?? null,
      country: row.country ?? null,
      period: periodOf(row.product_id ?? null),
      gross_usd: gross === null ? null : round(gross),
      net_usd: gross === null ? null : round(gross * takehome),
      renewals: row.renewals === null ? null : Number(row.renewals),
    };
  });
}

/**
 * The delivery log, newest first.
 *
 * Every store event as received, which is the audit trail behind `users.plan`
 * and — since a refused delivery is logged with the reason it was refused —
 * also the only place a purchase that did not land leaves a trace. Reachable
 * through the database browser before this, which is to say reachable by
 * somebody who already suspected something.
 */
export async function recentBillingEvents(limit = 50): Promise<AdminBillingEvent[]> {
  const rows = await query<Record<string, any>>(
    `SELECT b.id, b.user_id, u.email, b.type, b.store, b.product_id,
            b.environment, b.expires_at, b.received_at
       FROM billing_events b
       LEFT JOIN users u ON u.id = b.user_id
      ORDER BY b.received_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id ?? null,
    email: row.email ?? null,
    type: row.type,
    store: row.store ?? null,
    product_id: row.product_id ?? null,
    environment: row.environment ?? null,
    expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    received_at: new Date(row.received_at).toISOString(),
  }));
}

/** Accounts back on free that once had a store event. Churn, in accounts. */
async function lapsedCount(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT count(DISTINCT b.user_id)::int AS count
       FROM billing_events b
       JOIN users u ON u.id = b.user_id
      WHERE u.plan = 'free'`,
  );
  return row?.count ?? 0;
}

/** When the last delivery arrived. Null on a deployment that has never had one. */
async function lastEventAt(): Promise<string | null> {
  const row = await queryOne<{ at: string | null }>(
    'SELECT max(received_at) AS at FROM billing_events',
  );
  return row?.at ? new Date(row.at).toISOString() : null;
}

export interface SetPlanInput {
  plan: PlanName;
  /** ISO, or null for a grant with no end — which the expiry sweep never touches. */
  expiresAt: string | null;
  source: PlanSource;
  /** The admin doing it, for the audit row. */
  by: string | null;
}

/**
 * Move an account's plan by hand, and write down that it was moved.
 *
 * This is the one action in this file, and the case it is for is the one that
 * produced it: a purchase RevenueCat holds and our server never heard about.
 * A missed `INITIAL_PURCHASE` is not redelivered, so without this the only
 * repair is an `UPDATE` typed into psql over ssh — which works, and leaves no
 * trace anywhere, on the one table whose whole purpose is to explain why an
 * account is on the plan it is on.
 *
 * So the audit row is not decoration. `billing_events` is described everywhere
 * else in this codebase as the trail behind `users.plan`, and an admin grant
 * that does not appear there makes that sentence false exactly when somebody is
 * relying on it. The row is typed `ADMIN_SET_PLAN`, which `effectOf` does not
 * recognise and therefore ignores — so it is inert if it is ever replayed
 * through the webhook, and it cannot grant anything a second time.
 *
 * Revoking is the same operation with `free`, and it clears the expiry and the
 * source together: a `free` account with `plan_source = 'play'` and a date on
 * it would be read by the next person as a subscription, and by `expirePlans`
 * as a row to sweep for ever.
 */
export async function setPlan(userId: string, input: SetPlanInput): Promise<boolean> {
  const free = input.plan === 'free';
  const source = free ? 'manual' : input.source;
  const expiresAt = free ? null : input.expiresAt;

  const updated = await queryOne<{ id: string }>(
    `UPDATE users SET plan = $1, plan_source = $2, plan_expires_at = $3
      WHERE id = $4
      RETURNING id`,
    [input.plan, source, expiresAt ? new Date(expiresAt) : null, userId],
  );
  if (!updated) return false;

  await query(
    `INSERT INTO billing_events (id, user_id, type, store, product_id, expires_at, environment, payload)
       VALUES ($1,$2,'ADMIN_SET_PLAN',NULL,NULL,$3,'ADMIN',$4)`,
    [
      `admin_${randomUUID()}`,
      userId,
      expiresAt ? new Date(expiresAt) : null,
      JSON.stringify({ plan: input.plan, plan_source: source, expires_at: expiresAt, by: input.by }),
    ],
  );
  return true;
}

/** How many of each, in first-seen order rather than alphabetical. */
function tally<T extends string>(values: T[]): Array<[T, number]> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()];
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
