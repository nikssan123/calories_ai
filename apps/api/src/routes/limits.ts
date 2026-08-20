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

/** Recipe generation — the most expensive single call in the product. */
export const RECIPE_LIMIT = planLimit((l) => l.recipeRunsPerDay, '1 day');

/**
 * Not about money, and deliberately not a plan limit: this one verifies a
 * password, which is intentionally slow, and it is the only irreversible thing
 * an account can do to itself. Paying should not buy a higher ceiling on it.
 */
export const DELETE_ACCOUNT_LIMIT = { max: 5, timeWindow: '15 minutes' };
