import { query, queryOne } from '../db.ts';
import { PLANS, type PlanName } from '@ct/shared';
import { PHOTO_BUNDLES, type PhotoBundleId } from './plans.ts';
import { grantPhotoCredits } from './credits.ts';

/**
 * Turning a store's word for what happened into a plan on an account.
 *
 * The webhook is RevenueCat's, which is the reason this file is short. Play and
 * the App Store disagree about almost everything — token formats, notification
 * shapes, who acknowledges what and by when — and RevenueCat's whole job is to
 * answer both in one vocabulary. What arrives here is already normalised, so
 * this file only has to decide what each event *means* for entitlement, which
 * is a product question rather than a protocol one.
 *
 * `app_user_id` is our own `users.id`, because the app calls `Purchases.logIn`
 * with it. That is the entire binding between a purchase and an account, and it
 * is why nothing here has to reason about purchase tokens: a token that moves
 * between accounts arrives as a TRANSFER, not as a token we have to notice is
 * the same one twice.
 */

/** What RevenueCat calls the stores, mapped to what `users.plan_source` calls them. */
const SOURCES: Record<string, string> = {
  PLAY_STORE: 'play',
  APP_STORE: 'app_store',
  STRIPE: 'stripe',
  MAC_APP_STORE: 'app_store',
};

export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id: string;
  product_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  store?: string | null;
  environment?: string | null;
}

/**
 * Which tier a purchase entitles.
 *
 * Two sources, in order, because the reliable one needs configuration and the
 * available one needs parsing.
 *
 * `entitlement_ids` is what RevenueCat is actually for, but it is only correct
 * if somebody named the entitlements `plus` and `coach` in a dashboard this
 * code cannot see. So it is preferred and not trusted: an unrecognised value
 * falls through rather than throwing.
 *
 * `product_id` is the fallback, and on Play it is not simply the product. Play
 * Billing 5 split a subscription into a product and a base plan, and RevenueCat
 * reports the pair as `plus:annual`. Taking the part before the colon is what
 * makes `plus:annual`, `plus:monthly` and a bare `plus` all mean the same tier
 * — which is what you want the day a monthly base plan is added and nobody
 * remembers this function exists.
 */
export function planFor(event: RevenueCatEvent): PlanName | null {
  const paid = (name: string): PlanName | null =>
    (PLANS as readonly string[]).includes(name) && name !== 'free' ? (name as PlanName) : null;

  for (const id of event.entitlement_ids ?? []) {
    const plan = paid(id);
    if (plan) return plan;
  }
  return paid((event.product_id ?? '').split(':')[0] ?? '');
}

/**
 * Which photo bundle a purchase is, if it is one at all.
 *
 * Same two sources as `planFor` and the same order, for the same reasons — the
 * entitlement list is what RevenueCat is for but depends on a dashboard this
 * code cannot see, and the product id is the one that is always there. Play's
 * `product:base_plan` shape is split on the colon here too, so `photo_25` and
 * `photo_25:oneoff` are the same bundle.
 *
 * Returns null for anything not in `PHOTO_BUNDLES`, which is what makes this
 * safe to run in front of `planFor`: a tier purchase is not a bundle and falls
 * straight through.
 */
export function bundleFor(event: RevenueCatEvent): PhotoBundleId | null {
  const ids = [...(event.entitlement_ids ?? []), (event.product_id ?? '').split(':')[0] ?? ''];
  for (const id of ids) {
    const bundle = PHOTO_BUNDLES.find((b) => b.id === id);
    if (bundle) return bundle.id;
  }
  return null;
}

/**
 * What each event does to entitlement.
 *
 * The one worth reading twice is CANCELLATION, which does **nothing**. Turning
 * off auto-renewal is not the end of the subscription — the person paid for a
 * period and is still inside it, and revoking there takes away something they
 * are owed. EXPIRATION is the event that ends access, and it arrives when the
 * period actually runs out. Getting these two the wrong way round is the
 * classic way to make paying customers angry, and it reads as correct in review
 * because "cancelled means cancelled" is a sentence.
 *
 * BILLING_ISSUE is the same argument: a card that failed opens a grace period,
 * and Play retries during it. Revoking on the first failure churns people the
 * store was about to recover. The expiry sweep is what eventually catches the
 * ones that never recover, which is the honest instrument for it — a deadline
 * rather than a guess.
 */
type Effect = 'grant' | 'revoke' | 'ignore';

export function effectOf(type: string): Effect {
  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'NON_RENEWING_PURCHASE':
    case 'TRANSFER':
      return 'grant';
    case 'EXPIRATION':
    case 'SUBSCRIPTION_PAUSED':
      return 'revoke';
    case 'CANCELLATION':
    case 'BILLING_ISSUE':
      return 'ignore';
    default:
      // An event type invented after this was written. Doing nothing is right:
      // entitlement already reflects the last thing we understood, and the
      // sweep bounds how wrong that can stay.
      return 'ignore';
  }
}

export interface ApplyResult {
  applied: boolean;
  reason: 'ok' | 'duplicate' | 'unknown_user' | 'unknown_plan' | 'ignored' | 'wrong_environment';
}

/**
 * Record the event and move the plan, once.
 *
 * Idempotent on the event id, because a webhook that is worth having is one
 * that retries — RevenueCat redelivers on any non-2xx, and a redelivered
 * RENEWAL that extended the period twice would be a subscription that quietly
 * outlives what was paid for. The insert is the lock: a duplicate id conflicts,
 * touches nothing, and answers 200 so the sender stops.
 */
export async function applyEvent(
  event: RevenueCatEvent,
  options: { acceptSandbox: boolean },
): Promise<ApplyResult> {
  // A sandbox purchase is free. Honouring one in production would mean anybody
  // with a test account could grant themselves Coach, so the environment is
  // checked before anything is written — including the event log, so a
  // production deployment leaves no trace of somebody trying.
  if ((event.environment ?? 'PRODUCTION') !== 'PRODUCTION' && !options.acceptSandbox) {
    return { applied: false, reason: 'wrong_environment' };
  }

  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO billing_events (id, user_id, type, store, product_id, expires_at, environment, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
    [
      event.id,
      // Not a foreign key on the way in: an event for an account that has since
      // been deleted is still worth keeping, and losing the audit row is worse
      // than holding an id that resolves to nobody.
      null,
      event.type,
      event.store ?? null,
      event.product_id ?? null,
      event.expiration_at_ms ? new Date(event.expiration_at_ms) : null,
      event.environment ?? null,
      JSON.stringify(event),
    ],
  );
  if (!inserted) return { applied: false, reason: 'duplicate' };

  const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE id = $1', [
    event.app_user_id,
  ]);
  if (!user) return { applied: false, reason: 'unknown_user' };

  await query('UPDATE billing_events SET user_id = $1 WHERE id = $2', [user.id, event.id]);

  const effect = effectOf(event.type);
  if (effect === 'ignore') return { applied: false, reason: 'ignored' };

  if (effect === 'revoke') {
    await query(
      `UPDATE users SET plan = 'free', plan_source = 'manual', plan_expires_at = NULL
        WHERE id = $1`,
      [user.id],
    );
    return { applied: true, reason: 'ok' };
  }

  /*
   * A photo bundle, which is stock rather than a tier.
   *
   * Checked before `planFor` because it is the same `NON_RENEWING_PURCHASE`
   * shape a tier would arrive in, and without this it falls through to
   * `unknown_plan`: the event is logged, 200 is returned, the money is taken
   * and nothing is granted. That is the worst of the failure modes available
   * here, because it is silent on both ends.
   *
   * `grantPhotoCredits` is idempotent on the event id in its own right. It is
   * belt and braces over the `billing_events` insert above — that one already
   * refuses a redelivery — but the two protect different things: this one also
   * covers the same purchase arriving under a second event id, which is what a
   * store migration or a replayed backfill looks like.
   */
  const bundle = bundleFor(event);
  if (bundle) {
    const granted = await grantPhotoCredits(user.id, bundle, event.id);
    return granted ? { applied: true, reason: 'ok' } : { applied: false, reason: 'duplicate' };
  }

  const plan = planFor(event);
  if (!plan) return { applied: false, reason: 'unknown_plan' };

  await query(
    `UPDATE users SET plan = $1, plan_source = $2, plan_expires_at = $3 WHERE id = $4`,
    [
      plan,
      SOURCES[event.store ?? ''] ?? 'manual',
      event.expiration_at_ms ? new Date(event.expiration_at_ms) : null,
      user.id,
    ],
  );
  return { applied: true, reason: 'ok' };
}

/**
 * Everyone whose paid period has run out, put back on free.
 *
 * This is the backstop, and it is not optional. A store notification is not a
 * Stripe webhook: Play publishes through Pub/Sub and RevenueCat forwards, and
 * either hop can drop one while your endpoint is down, misconfigured, or
 * briefly returning 500. Without a sweep, one missed EXPIRATION is a
 * subscription served free forever, and nothing ever surfaces it — the account
 * looks exactly like a paying one.
 *
 * `plan_source = 'manual'` is excluded on purpose. That is the value a comped
 * account, a staff account or an admin grant carries, and those have no expiry
 * to be past. Sweeping them would mean the one instrument that protects revenue
 * is also the one that silently cancels the founder's own account.
 */
export async function expirePlans(now: Date = new Date()): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE users
        SET plan = 'free', plan_source = 'manual', plan_expires_at = NULL
      WHERE plan <> 'free'
        AND plan_source <> 'manual'
        AND plan_expires_at IS NOT NULL
        AND plan_expires_at < $1
      RETURNING id`,
    [now],
  );
  return rows.length;
}
