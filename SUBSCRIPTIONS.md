# Subscription plan

**Built, as of 2026-08-24.** The tiers below are in `apps/api/src/services/plans.ts`,
the meters are enforced off the cost ledger in `services/usage.ts`, and `users.plan`
carries `free | plus | coach` after `034`. The phone now explains itself too — the
count above the composer, the wall in the journal, the locked panels, and
`app/upgrade.tsx` behind them, all off `GET /entitlements`. What is *not* built is
Stripe, and the web says nothing about any of this beyond the landing page's pricing
cards.

Previous versions of this document priced the tiers from a cost model. This one
prices them from production. The difference between the two is the whole content of
this rewrite, and it is not a rounding error: **a journal turn costs 13x what the
model said it would.**

## What an action actually costs

Measured on `ai_usage` on the live deployment, 60 turns, 3 accounts, 4 days, $8.80.
The deployment is running the caching work — `dc247d5` has every one of those commits
in its history — so these are post-fix numbers rather than a preview of them.

| action | model | measured | this doc used to say |
|---|---|---:|---:|
| text log | Haiku 4.5 | **$0.025** | $0.0052 warm |
| text log, escalated | Sonnet 5 | **$0.078** | $0.016 warm *(modelled)* |
| **text log, blended** | — | **$0.066** | $0.0052 |
| photo scan | Opus 5 | **$0.420** | $0.028 warm |
| recipe | Opus 5 | **$0.284** | $0.186 |
| fridge scan | Sonnet 5 | **$0.058** | $0.04 |
| meal plan | Opus 5 | ~$0.63 *(scaled)* | $0.410 |
| weekly review | Opus 5 | ~$0.15 *(est.)* | $0.10 |
| nudge | Sonnet 5 | $0.025 | $0.025 |

Two assumptions in the old tables were load-bearing and both are false.

**1. The escalated path is the normal path.** This document called the escalated
share "the largest unknown in this document" and then priced every table at the
Haiku figure anyway. It is **77%** — 36 Sonnet text logs against 11 Haiku. Sonnet is
3x Haiku, so the headline per-log figure was understated by roughly that much before
anything else was counted. The query that settles it was one `GROUP BY model`, and it
should have been run a month ago.

**2. There is no warm column at this traffic.** **100% of production turns wrote
cache.** Not the 27% the gap distribution predicted — all of them. A shared prefix
only stays resident while *somebody* is running turns, and at three accounts nobody
is. The warm column is real, but it is a property of volume this product does not
have, which makes it exactly the wrong column to price a launch against. **Early
users are the most expensive users**, and every table below is priced accordingly.

### Where the money goes

On a $0.0787 Sonnet text log:

| component | tokens | rate | cost | share |
|---|---:|---|---:|---:|
| cache **write** | 9,134 | $6/M (1h TTL, 2x) | $0.0548 | **70%** |
| cache read | 49,955 | $0.30/M | $0.0150 | 19% |
| output | 538 | $15/M | $0.0081 | 10% |
| fresh input | 263 | $3/M | $0.0008 | 1% |

Seventy per cent of a journal turn is the cache write, and it is paid on every single
turn. Not model choice, not transcript length — the write. That is the cost structure,
and §"What would make this sellable" is the only part of this document that matters
more than the tables.

## The tiers

Sized against the **store** column — 15%, the worse channel — so each tier holds up
where we control the least. Stripe on the web is 2.9% + $0.30, landing once a year
rather than twelve times.

| | annual | store net/mo | Stripe net/mo |
|---|---|---:|---:|
| Plus | $79.99 | $5.67 | $6.45 |
| Coach | $149.99 | $10.62 | $12.10 |

### Free — the offline logbook

Unlimited and unmetered: manual entry, repeat-a-meal, barcode, weight,
Today/History/Progress, the outbox. That is a complete food diary, roughly what
MyFitnessPal's free tier is, and it costs nothing to serve.

Metered: **10 journal turns a month**, and 1 photo scan, ever.

The two clocks are the load-bearing decision, and they are deliberately different.

**Chat is monthly, and it is knowingly a recurring bill.** At $0.041 a turn a free
account that spends its ten costs **$0.41/month** for as long as it exists, against
a one-time $0.82 under the lifetime grant this replaced — so it pays for itself
against the old scheme in two months and then keeps going. What that buys is the one
thing a lifetime grant cannot: a free account that is still alive next month. Twenty
turns that never return is a demo with a cliff — spend it in week one, and every
month after that the app is a diary with a dead button in it, which is nobody's
upgrade decision because there is no longer a moment at which one gets made. Ten a
month puts a small, repeating taste of the paid product in front of somebody who is
*currently* using the app, which is the only place a paywall converts.

Ten rather than twenty because the ceiling now recurs. It holds the steady state at
$0.41/month, and it is still half again what the old lifetime grant gave per month to
anybody who lasted longer than eight weeks.

**The photo stays lifetime.** It is the sharpest wall in the product and the whole
conversion argument: one scan, ever, means every free user sees the best thing the
app does exactly once and hits the wall while still impressed. Handing it back every
month would be giving away the pitch.

**The count is visible from the fifth message.** `MeterChip` shows the remainder once
half a small grant is gone — half the grant, floored at three and capped at five — so
free's ten start counting down at five left rather than at three. A ceiling somebody
can watch approach is a plan; the same ceiling discovered by hitting it is a trap, and
three out of ten would have meant 70% of the allowance spent before the app said a
word.

No model-written nudges. A nudge is $0.025 and a dormant free account can collect one
every week indefinitely. Free accounts hear from the app over a templated push, which
FCM already sends and which costs nothing.

**This is only survivable because `OFFLINE.md` shipped.** The old argument for a
generous free tier — "someone who hits a wall logging their dinner stops logging, and
an account that stops logging is worth nothing" — was correct while a model round trip
was the only way to record a meal. It no longer is. **The wall stopped being an exit**,
and that is what buys every number above.

### Plus — $79.99/yr

30 journal turns/mo · 2 photo scans/mo · weekly review · model-written nudges

| | | |
|---|---:|---:|
| 30 chat | x $0.066 | $1.98 |
| 2 photo | x $0.420 | $0.84 |
| review | 4.3 x $0.15 | $0.65 |
| nudge | 4.3 x $0.025 | $0.11 |
| **COGS** | | **$3.58** |
| margin, store net $5.67 | | **37%** |
| margin, Stripe net $6.45 | | **44%** |

### Coach — $149.99/yr

Plus, and the kitchen: 35 turns · 3 photos · 10 fridge scans · 8 recipes · 2 meal
plans, all monthly.

| | | |
|---|---:|---:|
| 35 chat | x $0.066 | $2.31 |
| 3 photo | x $0.420 | $1.26 |
| 10 fridge scan | x $0.058 | $0.58 |
| 8 recipe | x $0.284 | $2.27 |
| 2 meal plan | x $0.630 | $1.26 |
| review + nudge | | $0.76 |
| **COGS** | | **$8.44** |
| margin, store net $10.62 | | **21%** |
| margin, Stripe net $12.10 | | **30%** |

Thinner than Plus on purpose, and the kitchen is what makes it thin — $4.11 of the
$8.44. None of that half can be improved by anything in the next section, because
caching only ever helps input and a meal plan is ~10k tokens of *output*. The kitchen
is the one irreducible cost in the product, which is precisely why it is sold
separately rather than bundled into Plus.

$149.99 is above the ~$80/yr ceiling `COMPETITION.md` identifies for anything called a
tracker. That is the same bet that document recommends: pantry → recipe → plan →
shopping list is a meal-planning product, a different market with a higher anchor and
the one thing in the comparison table nobody else has.

## Stock, sold by the bundle

> **The tier tables above this line are stale.** They were written against
> $79.99/yr Plus and a 30-turn ceiling. Production has been on `PRICING` and
> `LIMITS` in `apps/api/src/services/plans.ts` since the 5m cache TTL landed —
> Plus $9.99/mo or $99.99/yr for 90 chat and 8 photo, Coach $24.99/mo or
> $249.99/yr for 180 chat and 25 photo — and that file is the source of truth
> for every number in this section. The rest of this document is kept for the
> cost analysis, which is still correct, and for §"What would make this
> sellable", which is still the plan.

Two things are now sold outright, on top of whatever the plan grants. Both are
consumables, neither expires, and both are drawn down only once the month's
grant is gone.

| pack | id | price | $/unit | COGS | margin (store) |
|---|---|---:|---:|---:|---:|
| 10 photo scans | `photo_10` | $3.99 | $0.399 | $1.51 | 55% |
| 25 photo scans | `photo_25` | $7.99 | $0.320 | $3.78 | 44% |
| 50 photo scans | `photo_50` | $13.99 | $0.280 | $7.55 | 37% |
| 30 messages | `chat_30` | $3.99 | $0.133 | $1.23 | 64% |
| 100 messages | `chat_100` | $10.99 | $0.110 | $4.10 | 56% |

### Why messages joined the photos

The previous argument for selling photos and nothing else was that metering
chat by the bundle would be putting a price on the daily habit the product
depends on. That argument was about the *plan's* meter and it still holds. What
it did not cover is what happens **after** the grant is gone.

Plus grants 90 messages a month. The one real account on the deployment runs
about 115 — flat from the first day rather than an onboarding burst — so the
person this tier was sized for walls somewhere around the 22nd, and until now
the only thing on the other side of that wall was Coach or the end of the
month. `plans.ts` has said so in a comment since the ceiling moved to ninety;
selling a top-up is the part that was missing.

### Where the two prices come from

**Both rungs are above the in-plan rate.** Splitting a tier's price across its
meters by COGS share puts Plus at $0.080 a message and Coach at $0.071; the
packs are 1.7x and 1.4x that. A pack is therefore never the cheap way to buy
messages — it is the convenient way to buy a few more of them — and the
subscription stays the thing the arithmetic recommends. That constraint is the
whole design, and it is what keeps a top-up from quietly becoming the cheapest
tier in the product.

Two sizes rather than the photos' three, because the third rung has nowhere to
sit. Anything big enough to be worth a discount lands close enough to Coach's
$24.99 that the tier is the better buy, and a pack whose honest advice is "buy
the other thing" is a worse page rather than a fuller one.

The middle of the ladder does the upsell with no copy at all. Plus plus the
100-pack is $20.98 for 190 messages; Coach is $24.99 for 180 messages, 25 photo
scans and the whole kitchen. Anybody topping up every month does that sum once
and upgrades.

### Subscribers only, and only on the way in

`subscriberOnly` in `@ct/shared` is true on the message packs and false on the
photo ones. Free gets ten messages a month, and a free account that can refill
for $3.99 has no reason to ever subscribe — so the wall on Free sells the plan
and draws no message packs at all. Photos have no such problem: Free gets one
scan *ever*, so a pack there is a genuine purchase rather than a subscription
substitute.

It gates the **offer** and not the spend, and the difference matters for one
person: the subscriber who buys a hundred messages, lets the subscription
lapse, and still owns them. Credits do not expire, so `requireAllowance` spends
them on whatever plan the account is on by then. Refusing there would be
keeping the money and withholding the thing it bought, which is the one
behaviour a top-up must never have.

### The ledger

`042` folded `photo_credits` into `credits` with a `meter` column. The
alternative was a second table with the same five columns, the same unique
index and the same three functions — and nothing above the SQL differs by meter
except a `WHERE`. A third bundle is now a row in `BUNDLES` and a price in
`plans.ts`.

Everything `036` argued for survives: the balance is `sum(delta)` over a ledger
rather than a counter, because a retried webhook against a counter is free
stock forever, a refund against one is a special case that clamps at zero, and
neither has anywhere to put the store's event id.

### This is not the fix

Selling a top-up is not the same as making the ceiling right, and it should not
be mistaken for it. 90 messages is 3 a day, and the reason it is not higher is
in §"What would make this sellable": the prefix is ~19,700 tokens of system
prompt and tool schema on every turn, and a journal turn calls about thirteen
of the twenty-seven tools it is handed. Bringing the per-turn cost down raises
every ceiling in the product at the same margin. The packs are what somebody
who runs out on the 22nd can do about it *this month*.

## Who the meters do not apply to

**An account whose turns run on the Claude Code subscription is unmetered.** Not a
higher tier — no tier at all: `chat`, `photo`, `pantry_scan`, `recipe` and
`meal_plan` all answer `unlimited`, the wall never appears, and the locked kitchen
opens. `SUBSCRIPTION_EMAILS` decides who that is, one address at a time, and
`unmeteredFor` in `ai/lane.ts` is the predicate.

Every number in this document is a cost control. The tiers are sized in dollars off
`ai_usage`, the free photo is lifetime rather than monthly because a monthly one is
a recurring bill nobody converts off, and the wall exists so that a $0.15 scan is
paid for by somebody.
None of that is true of a turn on the subscription: it is already paid for, flat, by
whoever signed the box in. Metering it protects no margin — it just refuses work
that has no marginal price.

Three things this deliberately does *not* do:

- **It is not the lane on its own.** `laneFor` says `anthropic` for an allowlisted
  address, but the Agent SDK bills an `ANTHROPIC_API_KEY` ahead of the credentials
  file when one is set — same lane, real invoice. The entitlement is built on
  `onSubscription`, which rules that out. An account that is genuinely being billed
  is never quietly handed an unlimited plan.
- **It does not lift the loop guard.** `chatTurnsPerHour` stays, at Coach's twenty.
  It matters more on this lane, not less: a stuck client spends the operator's own
  Claude rate limit — the one their terminal is sharing — and no invoice ever turns
  up to say it happened. Same for `nudgesPerWeek`, which caps what the app sends
  unasked and is a product decision whoever is paying.
- **It does not touch the ledger.** Every turn still writes its `ai_usage` row. That
  is the only place a subscription's consumption is visible at all, and the one lane
  with no invoice must not also be the one lane with no numbers.

On a deployment whose `AI_PROVIDER` is `anthropic` — a personal install, or
development — everybody's turns are on that subscription, so everybody is unmetered.
That is the honest answer rather than a hole: there is no per-token bill on that box
for a ceiling to be protecting. The tiers start meaning something the day it is
configured with a key.

## The honest part

**These ceilings cover their costs and they are not yet competitive.**

Thirty journal turns a month is about one a day, against a field where Cal AI sells
effectively unlimited scanning for $29.99/yr. The number is small because the
per-turn cost is 13x what this document used to assume — not because the tier is
designed that way.

The instruction these were built to was *if chat is unlimited, the subscription must
cover it*. At $0.066 a turn, and after the review, nudge and two photo scans
Plus also carries, unlimited chat breaks even at **about 2 messages a day**. There is no price in the $30–80/yr band that funds it, and a subscription that
did would have to retail near $28/month, which is Noom's price for human coaching. So
chat is metered, and the meter is published rather than hidden behind a "fair use"
ceiling somebody would hit and call a bug.

## What would make this sellable

Not a pricing change. Three levers, and the first two are configuration:

1. **The cache write TTL.** 70% of a journal turn is the write at the 1h multiplier
   (2x base). That TTL was chosen in `3062937` off a gap distribution that assumed
   the written block would earn reads back. It does not — production writes cache on
   100% of turns, so the hour is buying residency nothing returns for. The 5m
   multiplier is 1.25x: **−26% on the whole turn, one line.** The hour becomes right
   again the moment turns arrive close enough together to read what they wrote, so
   this is a setting to revisit with traffic, not a permanent answer.

2. **The escalation policy.** 77% of turns run on Sonnet at 3x Haiku's rate because
   of `ai/language.ts`. Blended $0.066; all-Haiku $0.025. **A 2.6x saving**, gated
   entirely on whether Haiku 4.5 is genuinely unusable for those languages or was
   measured once and written down. It is the largest single number in the pricing and
   it deserves a re-measurement.

3. **The replayed transcript.** ~50k tokens of cache read per turn, of which ~18k is
   the shared prefix. This was item 5 of the old build list, "not required to ship".
   At 19% of the turn it is genuinely the smallest of the three — but it also shrinks
   the write in (1), since a shorter transcript is a smaller block to re-key.

**(1) and (2) together take a blended turn from $0.066 to roughly $0.019** — 3.5x,
which turns Plus's 30 turns a month into something nearer 120 at the same margin.
That is the difference between the table above and a product, and neither one is a
refactor.

## What is left to build

1. ~~A plan on the user, and enforcement in the cost ledger.~~ **Done** — `034`,
   `plans.ts`, `usage.ts`. Meters are counted off `ai_usage` rather than the route
   limiter, because a route limiter cannot see a turn started from inside a journal
   tool and cannot express "not included" (a ceiling of zero comes out as 429, "come
   back later", for a feature that never comes back). Every entitlement refusal is
   **402**; throttles stay 429.
2. ~~The lifetime photo counter.~~ **Done** — `period: 'ever'`, on the free photo.
   Free chat moved to `period: 'month'` afterwards; see §"Free".
3. **Stripe.** Checkout, the webhook, and the column write. Annual as the default
   selection. Sell on the web where the post-Epic link-out window allows it; keep IAP
   at 15% as the convenient path. The store half is done — RevenueCat's webhook in
   `services/billing.ts`, and `lib/billing.ts` on the phone.
4. ~~The wall itself.~~ **Done, on mobile** — `components/PlanWall.tsx` and
   `app/upgrade.tsx`, fed by `GET /entitlements`.

   It is not one sentence and two buttons, and the reason is the argument this
   document already makes for the free tier. If the wall stopped being an exit
   because typing a meal in is unmetered, then the wall's *primary* button has to be
   that — not the checkout. So a refused turn lands in the transcript as a card that
   opens the manual form inline, with the sentence they just typed already in it,
   and offers the upgrade beside it rather than instead of it.

   Three surfaces, not one, because a limit that is only ever met as a refusal is a
   trap however well it is worded:

   - **The count**, above the composer, from three turns out. `ChatResponse` now
     carries the allowance the turn just spent, so this costs no request.
   - **The wall**, in the conversation, where the reply would have been.
   - **The locked panel**, drawn *instead of* the controls on Cook and the week
     planner rather than next to disabled ones.

   The web has none of this yet, and should not until there is something on it to
   pay with.
5. **A billing period.** The meters roll over 30 days rather than resetting on a
   date, deliberately — there is no billing period to anchor to yet, and a rolling
   window has no cliff. When Stripe lands, `allowanceFor` is the one function that
   has to learn about it.
6. **A templated push for free accounts.** The model-written nudge is a paid feature
   and `dueNudge` has always refused one on `free` — but the templated replacement
   this document promises in its place ("which FCM already sends and which costs
   nothing") was never built, so the free tier is simply silent. That is the correct
   spend and the wrong product.

## Open questions

- ~~What share of turns escalate by language.~~ **Answered: 77%.**
- ~~What the cold-write share is.~~ **Answered: 100%, at this traffic.**
- **The three estimated costs.** Meal plan, review and nudge are still modelled or
  scaled. Trigger one of each in production and read the ledger.
- **Whether Haiku is really unusable for the escalated languages.** The largest
  remaining lever, and it is a quality question rather than a cost one.
- **Conversion.** Every free-tier number is a guess until there is a paywall to
  measure it against. There is one now, on mobile; nothing measures it yet.

## A leak this closed

**The scheduled weekly review ignored the plan.** `POST /reviews/run` has answered
402 to a free account since the meters landed, which made the entitlement look
covered — but that route is the door somebody knocks on, and `reviewPass` knocks on
its own every Monday for every active account. Free accounts were refused the button
and then had the review published for them anyway, at roughly $0.15 a week each.

Against the table above that is **$0.65/month per free account**, on a tier that at
the time claimed a steady state of $0.00 — enough to make the free-tier argument in
§"Free" wrong by a factor of five over a year. Fixed by selecting `plan` in
`listActiveUsers` and skipping accounts whose `reviewsPerDay` is zero.

The tier now has a deliberate recurring cost of $0.41/month, which does not soften
this: $0.65 of unbilled review on top of it would still be the larger half, and it
would still be arriving from a scheduler nobody had asked.

The nudge pass needed no equivalent: `dueNudge` reads `nudgesPerWeek` off the plan
as its first question. The general lesson is the one worth keeping — an entitlement
enforced only at the route is enforced only against requests, and the scheduler is
not a request.
