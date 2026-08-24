import { METERS, PLANS, type MeterName, type PlanName, type PlanTier } from '@ct/shared';

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
   * Fridge and pantry photos. Kitchen, and cheap for a vision call at $0.041 —
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
 * modelled.
 *
 *   text log, blended                $0.041    post-fix window at the 5m TTL
 *   photo scan, Sonnet 5             $0.151    was $0.356 on Opus at 1h; see below
 *   recipe, Opus 5                   $0.284    n=1
 *   meal plan, Opus 5                $0.630    scaled from local; not yet run here
 *   weekly review, Opus 5            $0.024    n=3, measured
 *   nudge, Sonnet 5                  $0.025    measured
 *   pantry scan, Sonnet 5            $0.041    n=1, scaled to the 5m TTL
 *
 * Three of those moved after the last revision of this file, and every one of
 * them moved because somebody finally ran the query instead of quoting the
 * table:
 *
 * 1. **The caching work landed inside the sample.** The old figures averaged
 *    four days that straddled it — cache writes per turn fell 24,149 -> 9,134
 *    across them — so the honest blended text log was the post-fix window's
 *    $0.058 rather than the whole sample's $0.106. The old file quoted $0.066,
 *    which was neither: it was the last day taken on its own. That $0.058 was
 *    still at the 1h TTL; the $0.041 at the head of this table is the same
 *    window repriced at 5m, and is what the tiers below are built on.
 * 2. **The photo scan came down by 40% on 2026-08-24**, when 30 weighed plates
 *    showed Opus was not better than Sonnet at reading one. See
 *    `ai/client.ts`.
 * 3. **The weekly review was never $0.150.** That number was marked "estimated,
 *    still" and listed as an open question while three real reviews sat in the
 *    ledger at $0.024. It was 6x too high, and it was load-bearing in both tier
 *    tables.
 *
 * **The escalated path is the normal path.** 77% of production text logs run on
 * Sonnet rather than Haiku, because `ai/language.ts` routes them there. An
 * earlier version of this file filed that under "the largest unknown" and priced
 * every table at the Haiku figure anyway. It is not an unknown and it is not
 * going away by itself: both accounts logging in production write Bulgarian, one
 * escalates on 88% of turns and the other on 64%, so this is the market rather
 * than a mistake. The blended figure above already carries it.
 *
 * **There is no warm cache column at this traffic.** 100% of production turns
 * write cache — not the 27% a gap distribution predicted. A shared prefix only
 * stays resident while *somebody* is running turns, and at five accounts nobody
 * is. Early users are the most expensive users, and every number above is
 * priced accordingly.
 *
 * Where the money goes, on the heaviest account's $0.0942 Sonnet text log:
 *
 *   cache write  12,234 tok x $6/M    $0.0734   **78%**
 *   cache read   46,975 tok x $0.30/M $0.0141    15%
 *   output          447 tok x $15/M   $0.0067     7%
 *
 * Nearly four fifths of a journal turn is the cache write, paid on every single
 * turn. Not model choice, not transcript length — the write.
 *
 * **`ANTHROPIC_CACHE_TTL` was moved from `1h` to `5m` on 2026-08-24**, taking
 * the write multiplier from 2x to 1.25x and that turn from $0.0942 to $0.0667.
 * A 29% cut on every metered turn for one line, and the prices above are set
 * against the result — so this is not an optimisation sitting in a backlog, it
 * is load-bearing. Putting it back to `1h` without repricing takes Coach's
 * annual margin from 20% to about 4%.
 *
 * The hour was not a mistake when it was chosen: it wins whenever it converts
 * turns from cold to warm, and the gap distribution it was chosen off predicted
 * it would. Production then wrote cache on **100% of turns** — a shared prefix
 * only stays resident while somebody is running turns, and at five accounts
 * nobody is, so the hour was buying residency nothing came back for. It becomes
 * right again the moment traffic makes turns cluster, which makes this a
 * setting to revisit at volume rather than a permanent answer. The figures
 * above are the ones to recompute when it changes.
 */

/*
 * ---- Sold by the month, with a year on offer --------------------------------
 *
 * This used to be annual-only, and annual-only is a good deal for whoever is
 * selling and a commitment for somebody who has been using the app for a week.
 * The month is what is marketed now; the year is the discount you take once you
 * know you want it. Both are listed here, and the year is priced at ~17% off
 * twelve months — two months free, which is the number people recognise — so
 * the trade is legible rather than a maze.
 *
 *                monthly    store 15%   Stripe web  |    annual   store/mo   Stripe/mo
 *   Plus          $9.99        $8.49       $9.40    |   $99.99      $7.08      $8.06
 *   Coach        $24.99       $21.24      $23.97    |  $249.99     $17.71     $20.20
 *
 * Two net columns because the channel takes a different cut: a store takes 15%
 * of everything, Stripe takes 2.9% + $0.30, and the fixed 30c is why an annual
 * charge lands so much better there than twelve monthly ones. `COMPETITION.md`
 * is right that the web is worth selling on while the post-Epic link-out window
 * is open.
 *
 * **Every ceiling below is sized against the annual store column** — $7.08 and
 * $17.71 — because that is the worst of the four. A tier that holds there holds
 * everywhere, and the monthly figures are the same tier bought a costlier way.
 *
 * ---- What these are up against ----------------------------------------------
 *
 *   Cal AI                 $2.50/mo equivalent, effectively unlimited scanning
 *   MyFitnessPal Premium   $6.67/mo equivalent
 *   Noom                   $70/mo, with a human on the end of it
 *
 * Plus at $9.99 is above MyFitnessPal and nowhere near Cal AI, and that is the
 * honest position: this app spends real money per message and they do not spend
 * it the same way. An earlier revision of this file priced Plus at $14.99, which
 * was 2.2x MyFitnessPal, and it was that high for the wrong reason — the tier
 * had been sized against the heaviest account on the deployment rather than
 * against a normal one. Fixing the ceiling fixed the price.
 *
 * Coach at $24.99 is deliberately in different territory. `COMPETITION.md` puts
 * the ceiling for anything called a tracker at ~$80/yr; pantry -> recipe -> plan
 * -> shopping list is a meal-planning product, which is a different market with
 * a higher anchor and the one thing in that document's comparison table nobody
 * else has.
 */

/**
 * What a tier costs, in USD, on the two channels.
 *
 * Reference values, not the source of truth for a checkout. `PlanTier` in
 * `@ct/shared` deliberately ships no prices to the client for the reason given
 * there — a store knows the local currency and what tax does to the number, and
 * a server hardcoding "$14.99" is wrong in most of the world. These exist so
 * the margins in this file can be recomputed when a cost moves, and so the
 * store products have something to be reconciled against.
 */
export const PRICING: Record<Exclude<PlanName, 'free'>, { monthlyUsd: number; annualUsd: number }> =
  {
    plus: { monthlyUsd: 9.99, annualUsd: 99.99 },
    coach: { monthlyUsd: 24.99, annualUsd: 249.99 },
  };

/**
 * Photo scans bought outright, on top of whatever the plan already grants.
 *
 * Photos are the one meter worth selling this way, and the reason is in the
 * cost table above: a scan is $0.151 against a chat turn's $0.041, so it is the
 * line that decides whether a heavy month fits inside a tier. Metering chat by
 * the bundle would be metering the daily habit — the thing the product needs
 * people to do without thinking about it — but nobody photographs a plate
 * absent-mindedly. A photo is already a deliberate act, so putting a price on
 * more of them does not discourage anything the app depends on.
 *
 * Consumable and **not expiring**. A bundle is stock, not a second
 * subscription: it is drawn down only once the month's included scans are gone,
 * and what is left is still there next month. An expiring top-up is a refund
 * the seller quietly keeps, and it would also make the wall have to explain two
 * different clocks.
 *
 * The unit price falls with size (40c, 32c, 28c) and so does the margin (55%,
 * 44%, 37%). That is the usual shape and it is the right way round here: the
 * big bundle is bought by the people whose scans cost the most to serve, so
 * they should be the ones paying closest to cost.
 *
 * These came down with the plans when the 5m cache TTL landed. Leaving them at
 * the old $4.99/$9.99/$17.99 would have been a 64% margin on the small one
 * against Plus's 54%, which is the wrong way round: a bundle should feel like
 * topping up a plan you already pay for, not like being charged a premium for
 * having run out.
 */
export const PHOTO_BUNDLES = [
  { id: 'photo_10', scans: 10, priceUsd: 3.99 },
  { id: 'photo_25', scans: 25, priceUsd: 7.99 },
  { id: 'photo_50', scans: 50, priceUsd: 13.99 },
] as const;

export type PhotoBundleId = (typeof PHOTO_BUNDLES)[number]['id'];

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
   * Plus — $9.99/mo or $99.99/yr. The journal, metered.
   *
   * COGS at the ceiling, at the 5m cache TTL:
   *
   *   60 chat   x $0.041   $2.46
   *    8 photo  x $0.151   $1.21
   *      review 4.3 x $0.024  $0.10
   *      nudge  4.3 x $0.025  $0.11
   *                         ------
   *                         $3.88   against $7.08 annual store net -> 45%
   *                                 against $8.49 monthly store    -> 54%
   *
   * **60 is a normal user, not a heavy one, and that distinction is the whole
   * correction here.** A previous revision granted 100 — three AI messages a
   * day — because it had been sized off the busiest account on the deployment.
   * That is Coach's job. Two a day is what somebody logging three meals
   * actually spends, because the other meals go in through manual entry,
   * repeat-a-meal or a barcode, none of which touch a model or this file.
   *
   * The fat margin is deliberate and it is not really margin. Nobody sits at
   * the ceiling every month, so the realistic figure is well under $3.89 — and
   * more to the point this is the tier that has to survive a cost estimate
   * being wrong again, which has now happened three times in this file's
   * history. Headroom here is what stops the next surprise being a reprice.
   */
  plus: {
    chat: { allowed: 60, period: 'month' },
    photo: { allowed: 8, period: 'month' },
    pantryScan: { allowed: null, period: 'month' },
    recipe: { allowed: null, period: 'month' },
    mealPlan: { allowed: null, period: 'month' },
    chatTurnsPerHour: 20,
    reviewsPerDay: 5,
    pantryItems: 60,
    nudgesPerWeek: 1,
  },

  /*
   * Coach — $24.99/mo or $249.99/yr. Plus, the kitchen, and the headroom.
   *
   *   150 chat        x $0.041   $6.15
   *    25 photo       x $0.151   $3.78
   *    10 fridge scan x $0.041   $0.41
   *     8 recipe      x $0.284   $2.27
   *     2 meal plan   x $0.630   $1.26
   *       review      4.3 x $0.024  $0.10
   *       nudge       4.3 x $0.025  $0.11
   *                              ------
   *                              $14.08  against $17.71 annual store  -> 20%
   *                                      against $21.24 monthly store -> 34%
   *                                      against $23.97 monthly web   -> 41%
   *
   * ---- Where 150 and 25 come from ---------------------------------------------
   *
   * The heaviest real account on the deployment, read off `ai_usage` rather than
   * imagined: 6.25 chat turns and 2.0 photos a day across four active days,
   * which is 188 and 60 a month. Dropping that account's first day — an 18-turn
   * onboarding burst that is not what a steady month looks like — leaves 3.3
   * chat and 1.67 photos a day, so **100 chat and 50 photos a month**.
   *
   * 150 covers that with room above it, which is the point of a top tier: the
   * person who reaches for it should not then be counting. It is also 2.5x Plus
   * rather than equal to it — an earlier revision granted 100 on both, which
   * left Coach selling nothing but the kitchen to anybody who talks to the app
   * a lot.
   *
   * Photos are granted at half the measured rate and the other half is a bundle,
   * because the two lines cost very different amounts: 150 chat turns is $6.15
   * and 50 photos would be $7.55. Sizing the tier to the full photo rate prices
   * every Coach subscriber for the habits of the heaviest one, and most of them
   * do not photograph two meals a day.
   *
   * That account on this tier plus one 25-bundle: $17.85 of cost against $28.03
   * of revenue, 36%. Which is the point of selling stock separately — the
   * heaviest user is the *best* customer rather than the one who breaks the
   * model, and nobody else subsidises them.
   *
   * ---- The kitchen is now most of the bill ------------------------------------
   *
   * $3.94 of this $14.08 is fridge scans, recipes and plans, and the cache TTL
   * that took 29% off everything else did not touch $3.53 of it: caching only
   * helps input, and a meal plan is ~10k tokens of *output*.
   *
   * It is also the last part of the routing table still resting on an argument
   * rather than a measurement. `recipe` and `meal_plan` sit on Opus 5 at high
   * effort for the same reason `photo_log` did — that they are the hard,
   * valuable turns — and that reason turned out to be worth nothing on 30
   * weighed plates. Nobody has run the equivalent here. At Sonnet's list rates
   * it would be $2.12 instead of $3.53, which is most of the gap between this
   * tier's 20% annual margin and a comfortable one. Worth measuring before it is
   * priced around, and worth *not* assuming either way.
   */
  coach: {
    chat: { allowed: 150, period: 'month' },
    photo: { allowed: 25, period: 'month' },
    pantryScan: { allowed: 10, period: 'month' },
    recipe: { allowed: 8, period: 'month' },
    mealPlan: { allowed: 2, period: 'month' },
    chatTurnsPerHour: 20,
    reviewsPerDay: 20,
    pantryItems: 300,
    nudgesPerWeek: 1,
  },
};

/**
 * Every tier, in the shape the wall reads.
 *
 * This exists so that the screen selling a plan and the file enforcing it
 * cannot disagree. The alternative — a feature list typed into a paywall
 * component — survives exactly until the first time one of the numbers above
 * moves, and then the app is advertising a ceiling it does not honour, which is
 * the one kind of copy error that is also a refund request.
 *
 * Ordered as `PLANS` is, which is cheapest first, because that is the order the
 * wall has to draw them in.
 */
export function tiers(): PlanTier[] {
  return PLANS.map((plan) => {
    const limits = limitsFor(plan);
    return {
      plan,
      meters: METERS.map((meter) => {
        const { allowed, period } = meterFor(plan, meter);
        return { meter, allowed, period };
      }),
      reviews_per_day: limits.reviewsPerDay,
      nudges_per_week: limits.nudgesPerWeek,
    };
  });
}

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
