import type { PlanName } from '@ct/shared';

/**
 * What each plan is allowed to spend.
 *
 * There is no payment provider behind this yet, and shipping it anyway is the
 * point. Adding a payment provider late is cheap — a checkout redirect, a
 * webhook, a column write. Adding *entitlement* late is not: it means revisiting
 * every route that spends money and every screen that has to show a locked
 * state, after both have grown. So the seam lands now, with everyone on `free`,
 * and billing later only has to flip `users.plan`.
 *
 * The numbers below are grouped by what they protect, which is not the same as
 * what they cost:
 *
 *   - The journal is the habit the product lives on. Someone who hits a wall
 *     logging their dinner stops logging, and an account that stops logging is
 *     worth nothing on either plan. `free` keeps exactly the ceiling it had
 *     before plans existed, so nobody signed in today notices this landed.
 *   - The kitchen is discretionary. Nobody builds a daily habit out of asking
 *     what to cook, so a cap there is an inconvenience rather than an exit —
 *     which is precisely what makes it the right thing to charge for.
 */
export interface PlanLimits {
  /** Journal turns. The one limit that is not really about money. */
  chatTurnsPerHour: number;
  /** Manually triggered reviews; the scheduled one does not pass through here. */
  reviewsPerDay: number;
  /** Fridge photos. Vision, and the most expensive thing per call after a recipe run. */
  fridgeScansPerDay: number;
  /** Recipe generations, each producing several ideas. */
  recipeRunsPerDay: number;
  /** How much kitchen the pantry will hold. Not a cost limit — a usability one. */
  pantryItems: number;
  /**
   * Unprompted messages a week.
   *
   * The odd one out: every other number here caps what somebody can spend, and
   * this caps what the app may spend on them without being asked. The service
   * already holds itself to one a week in code, so this is a ceiling on that
   * ceiling — the place a future decision to make nudges a paid feature, or to
   * turn them off entirely for a plan, gets made without touching the sender.
   */
  nudgesPerWeek: number;
  /**
   * Weeks of dinners planned. Weekly rather than daily because that is the unit
   * it produces, and the single most expensive call in the product — several
   * times the ~$0.22 a three-recipe run costs. Pro-shaped, and the ceiling says
   * so: one a week is exactly enough to plan the week you are in.
   */
  mealPlansPerWeek: number;
}

/*
 * Measured on 2026-08-20, from real runs against Claude, and read off the admin
 * cost panel rather than estimated here:
 *
 *   pantry_scan   ~$0.04   Sonnet, one vision turn, ~1k output tokens
 *   recipe        ~$0.22   Opus, ~5k output tokens — three recipes with method
 *   ...adapting   ~$0.15   one recipe instead of three, so less to write
 *   ...importing  ~$0.09   one recipe, and the method came with it
 *   text_log      ~$0.05   the journal, for comparison
 *
 * Asking in the journal costs both: ~$0.30 and about 75 seconds, because the
 * chat turn waits on a full recipe run inside its own tool call. That is the
 * most expensive single thing a user can do, and it is charged against the same
 * daily budget as the Cook tab — see `RecipeBudgetError`, which is enforced in
 * the engine precisely so all four doors share one allowance.
 *
 * A recipe run is therefore about four times the most expensive journal turn
 * and five times a scan, which is what the ceilings below are built around. Two
 * things follow from it that are worth writing down:
 *
 * A daily cap is a burst limit, not a budget. One recipe run a day for a month
 * is ~$6 of model spend against a €4 subscription that nets closer to $2.40
 * after VAT and the store's cut. Nobody actually asks what to cook every single
 * day, so the typical account is nowhere near this — but if the caps ever need
 * to hold the line rather than catch abuse, the instrument is a monthly budget,
 * not a bigger number here.
 *
 * The other lever is the output itself. Three complete recipes is most of the
 * 5k tokens; generating three summaries and writing the method only for the one
 * someone opens would cut the dominant cost several-fold, at the price of a
 * second round trip on the recipe they picked.
 */
const LIMITS: Record<PlanName, PlanLimits> = {
  /*
   * `chatTurnsPerHour` and `reviewsPerDay` are the values that were hardcoded
   * in routes/index.ts before this file existed. Keep them equal unless there
   * is a reason to change them: a plan seam that silently tightens the free
   * tier on the day it ships is a change nobody agreed to.
   *
   * The kitchen numbers are deliberately small. Free has to be enough to see
   * what the feature is and want it again — which one good answer does — and
   * not enough to be the whole product for nothing.
   */
  free: {
    chatTurnsPerHour: 40,
    reviewsPerDay: 5,
    fridgeScansPerDay: 1,
    recipeRunsPerDay: 1,
    pantryItems: 60,
    nudgesPerWeek: 1,
    // Enough to see what a planned week is and want another. Not enough to run
    // the household on for nothing.
    mealPlansPerWeek: 1,
  },
  pro: {
    chatTurnsPerHour: 200,
    reviewsPerDay: 20,
    fridgeScansPerDay: 6,
    recipeRunsPerDay: 4,
    pantryItems: 300,
    // Not more than free. Being messaged more often is not a feature anybody
    // would pay for, and the once-a-week rule is about what is welcome rather
    // than about what it costs.
    nudgesPerWeek: 1,
    // Room to change your mind, and to plan next week before this one ends.
    mealPlansPerWeek: 4,
  },
};

export function limitsFor(plan: PlanName): PlanLimits {
  // An unrecognised value falls back to the strictest plan rather than throwing.
  // This runs inside the rate limiter, and a plan column that somehow holds
  // something unexpected should cost someone a low ceiling, not a 500.
  return LIMITS[plan] ?? LIMITS.free;
}
