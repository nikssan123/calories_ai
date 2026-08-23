import type { MeterName, PlanName } from '@ct/shared';

/**
 * What each plan is allowed to spend.
 *
 * There is no payment provider behind this yet, and shipping it anyway is the
 * point. Adding a payment provider late is cheap — a checkout redirect, a
 * webhook, a column write. Adding *entitlement* late is not: it means revisiting
 * every route that spends money and every screen that has to show a locked
 * state, after both have grown. So the seam lands now, and billing later only
 * has to flip `users.plan`.
 *
 * ---- What changed, and why the free tier got smaller --------------------------
 *
 * The previous version of this file argued that the journal must never be the
 * thing someone hits a wall in: "someone who hits a wall logging their dinner
 * stops logging, and an account that stops logging is worth nothing on either
 * plan." That was right, and it is now obsolete, because it assumed a model
 * round trip was the only way to record a meal.
 *
 * `OFFLINE.md` shipped and it is not any more. Manual entry, repeat-a-meal,
 * barcode and the outbox all write a food entry without spending a token, and
 * the phone rolls the day up itself. So a free account that runs out of model
 * still has a working food diary — the ring still moves, the streak survives,
 * History is intact. **The wall stopped being an exit.** That is the single
 * change that lets the AI allowance below be as small as the cost data says it
 * has to be.
 *
 * The rule the numbers follow from: *give away what is deterministic, meter
 * what is inferential.* Nothing in `POST /entries/food`, repeat, barcode or the
 * rollup appears in this file at all, on any plan, because none of it costs a
 * fraction of a cent to serve.
 */

/**
 * One metered dimension.
 *
 * `allowed: null` means the meter does not apply to this plan — the kitchen on
 * `free`, which is a locked feature rather than a spent one. Zero means it
 * applies and is gone. A counter cannot tell those apart and a sentence has to,
 * so the distinction is carried rather than collapsed.
 *
 * `period: 'ever'` is a lifetime allowance with no reset. It is what the free
 * tier is built out of, for the reason `SUBSCRIPTIONS.md` gives about the
 * single lifetime photo: one scan, ever, means every free user experiences the
 * best thing the app does exactly once and hits the wall while still impressed.
 * That argument was always right about photos. The cost data below extends it
 * to the whole free AI surface.
 */
export interface Meter {
  allowed: number | null;
  period: 'month' | 'ever';
}

export interface PlanLimits {
  /**
   * Journal turns, text and setup together. Metered because it is inferential,
   * not because it is expensive relative to a photo — at the measured blended
   * cost below it is the largest line on every paid tier, because it is the
   * only one anybody does daily.
   */
  chat: Meter;
  /** Photo scans. Six times a text log and the thing people judge the app by. */
  photo: Meter;
  /**
   * Fridge and pantry photos. Kitchen, and cheap for a vision call at $0.058 —
   * but it is the front door to recipes, so it is gated with them rather than
   * with the journal's photo scans. A free account that can scan a fridge it
   * cannot then cook from has been sold a dead end.
   */
  pantryScan: Meter;
  /** Recipe generations, one idea each. Kitchen — output-dominated. */
  recipe: Meter;
  /** Weeks of dinners planned. The single most expensive action in the product. */
  mealPlan: Meter;

  /**
   * A burst ceiling on the journal, and deliberately not a meter.
   *
   * This one guards against a stuck client firing the same turn in a loop, not
   * against a user spending their allowance. The allowance is the thing that is
   * sold; this is the thing that stops a bug costing a month of it in ninety
   * seconds.
   *
   * It has to sit *below* the meter to do that job at all. At the old 40/hour
   * against a free grant of 20 for all time, the limiter could never fire — the
   * meter always got there first, which made the guard dead code dressed as a
   * safety net. A real burst of logging is a meal and its corrections, three or
   * four turns; ten an hour is well clear of that and still catches a loop
   * before it costs a month.
   */
  chatTurnsPerHour: number;
  /** Manually triggered reviews; the scheduled one does not pass through here. */
  reviewsPerDay: number;
  /** How much kitchen the pantry will hold. Not a cost limit — a usability one. */
  pantryItems: number;
  /**
   * Model-written nudges a week.
   *
   * Zero on free, and that is a feature decision rather than a cost one — or
   * rather it is both, and they happen to agree. A nudge costs $0.025 and a
   * free account can hold one forever without ever converting, so at ten
   * thousand signups the free tier's only recurring line item is a model
   * writing to people who have already decided not to pay. Free accounts get a
   * templated push instead, which FCM already sends and which costs nothing.
   */
  nudgesPerWeek: number;
}

/*
 * ---- Measured, on production, 2026-08-23 -------------------------------------
 *
 * Everything below is priced off `ai_usage` on the live deployment rather than
 * modelled. 60 turns, 3 accounts, 4 days, $8.80 — and the deployment is running
 * the caching work (`dc247d5` has every one of those commits in its history),
 * so these are post-fix numbers, not a preview of them.
 *
 *   text log, Haiku 4.5              $0.025    n=11
 *   text log, Sonnet 5 (escalated)   $0.078    n=36
 *   text log, blended                $0.066    77% of real traffic escalates
 *   photo scan, Opus 5               $0.420    n=10, most recent day
 *   recipe, Opus 5                   $0.284    n=1
 *   meal plan, Opus 5                $0.630    scaled from local; not yet run here
 *   weekly review                    $0.150    estimated, still
 *   nudge, Sonnet 5                  $0.025    measured
 *
 * **These are 5–13x what `SUBSCRIPTIONS.md` prices against**, and the gap is not
 * drift — it is two assumptions in that document that production has now
 * falsified:
 *
 * 1. **The escalated path is the normal path, not the exception.** That document
 *    calls the escalated share "the largest unknown" and prices every table at
 *    the Haiku figure anyway. It is 77%. Sonnet is 3x Haiku, so the headline
 *    per-log cost was understated by roughly that before anything else.
 *
 * 2. **There is no warm column at this traffic.** 100% of production turns wrote
 *    cache. Not 27% — all of them. A shared prefix only stays resident if
 *    *somebody* is running turns, and at three accounts nobody is. The warm
 *    column in that document is real, but it is a property of volume the product
 *    does not have yet, which makes it exactly the wrong column to price a
 *    launch against: early users are the most expensive users.
 *
 * Where the money actually goes, on a $0.0787 Sonnet text log:
 *
 *   cache write   9,134 tok x $6/M    $0.0548   **70%**
 *   cache read   49,955 tok x $0.30/M $0.0150    19%
 *   output          538 tok x $15/M   $0.0081    10%
 *   fresh input     263 tok x $3/M    $0.0008     1%
 *
 * Seventy per cent of a journal turn is the cache write, and it is paid on every
 * single turn. That, not model choice and not the transcript length, is the cost
 * structure — and it is why the allowances below are as small as they are. See
 * the note at the foot of this file for what would move it.
 */

/*
 * ---- Net revenue, and why it is two numbers ---------------------------------
 *
 *                        annual   store 15%   Stripe web
 *   Plus     $79.99/yr             $5.67/mo    $6.45/mo
 *   Coach   $149.99/yr            $10.62/mo   $12.10/mo
 *
 * Stripe is 2.9% + $0.30, landing once a year on an annual plan rather than
 * twelve times, which is most of the gap. `COMPETITION.md` is right that the
 * web is worth selling on while the post-Epic link-out window is open.
 *
 * Every ceiling below is sized against the **store** column — the worse one —
 * so that the tier holds up on the channel we control least.
 */

const LIMITS: Record<PlanName, PlanLimits> = {
  /*
   * Free — the offline logbook, and a taste of the model.
   *
   * Unlimited and unmetered: manual entry, repeat, barcode, weight, Today,
   * History, Progress, the outbox. That is a complete food diary and it is
   * roughly what MyFitnessPal's free tier is, which makes it a real product
   * rather than a demo.
   *
   * Metered, and lifetime rather than monthly: 20 journal turns and one photo.
   * A monthly grant would be a recurring bill for accounts that have already
   * decided not to pay — at $0.066 a turn, 20/month forever is $1.32/month
   * per free account, which at 4% conversion is a CAC of $33/month of burn and
   * climbs for as long as the account exists. Lifetime makes it a one-time
   * $1.74 acquisition cost that stops. The free tier's steady state is $0.00.
   *
   * 20 is enough to have several real conversations, correct a couple of
   * portions, and understand what the thing does. The one photo is the whole
   * conversion argument and is unchanged from `SUBSCRIPTIONS.md`.
   */
  free: {
    chat: { allowed: 20, period: 'ever' },
    photo: { allowed: 1, period: 'ever' },
    pantryScan: { allowed: null, period: 'month' },
    recipe: { allowed: null, period: 'month' },
    mealPlan: { allowed: null, period: 'month' },
    chatTurnsPerHour: 10,
    reviewsPerDay: 0,
    pantryItems: 60,
    nudgesPerWeek: 0,
  },

  /*
   * Plus — $79.99/yr. The journal, metered.
   *
   * COGS at the ceiling, measured:
   *
   *   30 chat   x $0.066   $1.98
   *    2 photo  x $0.420   $0.84
   *    review   4.3 x $0.15  $0.65
   *    nudge    4.3 x $0.025 $0.11
   *                        ------
   *                        $3.58   against $5.67 net  ->  37% margin
   *                                against $6.45 web  ->  44%
   *
   * **These ceilings are honest and they are not yet competitive.** Thirty
   * journal turns a month is about one a day, against a field where Cal AI
   * sells effectively unlimited scanning for $29.99/yr. The number is small
   * because the per-turn cost is 13x what the pricing doc assumed, not because
   * the tier is designed this way — and it is the per-turn cost that has to
   * move, which is a cost-structure change rather than a pricing one. See the
   * foot of this file. Until then this is the ceiling that covers its own bill,
   * which is the property that was asked for.
   */
  plus: {
    chat: { allowed: 30, period: 'month' },
    photo: { allowed: 2, period: 'month' },
    pantryScan: { allowed: null, period: 'month' },
    recipe: { allowed: null, period: 'month' },
    mealPlan: { allowed: null, period: 'month' },
    chatTurnsPerHour: 20,
    reviewsPerDay: 5,
    pantryItems: 60,
    nudgesPerWeek: 1,
  },

  /*
   * Coach — $149.99/yr. Plus, and the kitchen.
   *
   *   35 chat        x $0.066   $2.31
   *    3 photo       x $0.420   $1.26
   *   10 fridge scan x $0.058   $0.58
   *    8 recipe      x $0.284   $2.27
   *    2 meal plan   x $0.630   $1.26
   *      review      4.3 x $0.15  $0.65
   *      nudge       4.3 x $0.025 $0.11
   *                             ------
   *                             $8.44  against $10.62 net -> 21% margin
   *                                    against $12.10 web -> 30%
   *
   * Thinner than Plus on purpose, and it is the kitchen that makes it thin:
   * $4.11 of the $8.44 is fridge scans, recipes and plans. That half cannot be improved by
   * anything at the foot of this file, because caching only ever helps input
   * and a meal plan is ~10k tokens of *output*. The kitchen is the one part of
   * this product whose cost is irreducible, which is exactly why it is sold
   * separately instead of bundled into Plus.
   *
   * $149.99 is above the ~$80/yr ceiling `COMPETITION.md` identifies for
   * anything called a tracker. That is deliberate and is the same bet that
   * document recommends: pantry -> recipe -> plan -> shopping list is a
   * meal-planning product, which is a different market with a higher anchor and
   * the one thing in the comparison table nobody else has.
   */
  coach: {
    chat: { allowed: 35, period: 'month' },
    photo: { allowed: 3, period: 'month' },
    pantryScan: { allowed: 10, period: 'month' },
    recipe: { allowed: 8, period: 'month' },
    mealPlan: { allowed: 2, period: 'month' },
    chatTurnsPerHour: 20,
    reviewsPerDay: 20,
    pantryItems: 300,
    nudgesPerWeek: 1,
  },
};

export function limitsFor(plan: PlanName): PlanLimits {
  // An unrecognised value falls back to the strictest plan rather than throwing.
  // This runs on the hot path of every chat turn, and a plan column that somehow
  // holds something unexpected should cost someone a low ceiling, not a 500.
  return LIMITS[plan] ?? LIMITS.free;
}

/** The meter one plan applies to a given dimension. */
export function meterFor(plan: PlanName, meter: MeterName): Meter {
  const limits = limitsFor(plan);
  switch (meter) {
    case 'chat':
      return limits.chat;
    case 'photo':
      return limits.photo;
    case 'pantry_scan':
      return limits.pantryScan;
    case 'recipe':
      return limits.recipe;
    case 'meal_plan':
      return limits.mealPlan;
  }
}

/*
 * ---- What would make these numbers sellable ---------------------------------
 *
 * Not a pricing change. The ceilings above are what $79.99 and $149.99 buy at a
 * blended $0.066 per journal turn, and no arrangement of tiers fixes that — a
 * subscription that covers unlimited chat at this cost would have to retail near
 * $28/month, which is Noom's price for human coaching.
 *
 * Three levers, in descending order of return per unit of work. The first two
 * are configuration:
 *
 * 1. **The cache write TTL.** 70% of a journal turn is the write, at the 1h
 *    multiplier of 2x base. That TTL was chosen in `3062937` off a gap
 *    distribution which assumed the written block would earn reads back. It does
 *    not: production writes cache on 100% of turns, so the hour is buying
 *    residency nothing comes back for. The 5m multiplier is 1.25x, which is
 *    -26% on the whole turn for a one-line change. Revisit once real traffic
 *    exists — the hour becomes right again the moment turns arrive close enough
 *    together to read what they wrote.
 *
 * 2. **The escalation policy.** 77% of turns run on Sonnet at 3x Haiku's rate
 *    because of `ai/language.ts`. Blended cost is $0.066; all-Haiku is $0.025.
 *    That is a 2.6x saving gated entirely on whether Haiku 4.5 is genuinely
 *    unusable for the languages in question or was measured once and written
 *    down. It is worth re-measuring, because it is the largest single number in
 *    this file.
 *
 * 3. **The replayed transcript.** ~50k tokens of cache read per turn, of which
 *    ~18k is the shared prefix and the rest is history. `SUBSCRIPTIONS.md`
 *    lists this as item 5, "not required to ship". It is only 19% of the turn,
 *    so it is genuinely the smallest of the three — but it also shrinks the
 *    write in 1, since a shorter transcript is a smaller block to re-key.
 *
 * 1 and 2 together take a blended turn from $0.066 to roughly $0.019, which is
 * 3.5x and turns Plus's 30 journal turns a month into something closer to 120.
 * That is the difference between this table and a product, and neither one is a
 * refactor.
 */
