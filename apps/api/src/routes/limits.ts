import type { FastifyRequest } from 'fastify';
import { limitsFor, type PlanLimits } from '../services/plans.ts';

/**
 * Every ceiling in the product, in one place.
 *
 * Rate limiting is off globally and switched on per route — throttling the
 * dashboard's polling would break the app to protect nothing. What needs a
 * ceiling is the handful of routes that spend money or guard a password, and
 * gathering them here means the answer to "what does a free account actually
 * get?" is one file rather than a grep.
 */

/**
 * A ceiling that depends on the account's plan.
 *
 * `max` is read per request by @fastify/rate-limit, which is what makes this
 * work without any new machinery: the plan was resolved by the session hook
 * before the limiter runs, so the right number is already on the request by the
 * time the decision is made.
 */
function planLimit(pick: (limits: PlanLimits) => number, timeWindow: string) {
  return {
    max: (request: FastifyRequest) => pick(limitsFor(request.plan)),
    timeWindow,
  };
}

/** The journal. The one limit that is about runaway loops, not about money. */
export const CHAT_LIMIT = planLimit((l) => l.chatTurnsPerHour, '1 hour');

/** Manually triggered reviews. The scheduled one does not come through a route. */
export const REVIEW_LIMIT = planLimit((l) => l.reviewsPerDay, '1 day');

/** Fridge photos: vision, and discretionary. */
export const SCAN_LIMIT = planLimit((l) => l.fridgeScansPerDay, '1 day');

/**
 * A burst guard on the recipe routes, not the recipe budget.
 *
 * The budget itself lives in `ai/recipes.ts`, counted off the cost ledger,
 * because there are four ways to start a run — suggest, adapt, import, and the
 * journal's tool — and this plugin keeps a separate bucket per route config. A
 * per-route daily ceiling of one therefore meant four, which is not a limit.
 * What is left here is what a per-route limiter is actually good for: stopping
 * a stuck client from firing the same expensive request in a loop.
 */
export const RECIPE_BURST = { max: 6, timeWindow: '1 minute' };

/**
 * Scanning packets, and deliberately not a `planLimit`.
 *
 * Every other ceiling in this file guards money or a password. This one guards
 * neither: a lookup is usually a read of a shared cache row, and when it is
 * not, it is one request to a free catalogue. What the limit is actually for is
 * being a polite Open Food Facts client and stopping a scanner stuck on a
 * blurry frame from looping. Charging for it would be charging for something
 * that costs nothing to serve.
 *
 * Generous, because a shopper walks down an aisle: a dozen products in a minute
 * is a normal trolley rather than a runaway client.
 */
export const BARCODE_BURST = { max: 30, timeWindow: '1 minute' };

/**
 * Not about money, and deliberately not a plan limit: this one verifies a
 * password, which is intentionally slow, and it is the only irreversible thing
 * an account can do to itself. Paying should not buy a higher ceiling on it.
 */
export const DELETE_ACCOUNT_LIMIT = { max: 5, timeWindow: '15 minutes' };
