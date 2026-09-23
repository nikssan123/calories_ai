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

The model is a road with three stops, not a monthly grant (2026-09-16):

| stop | when | chat | photo |
|---|---|---:|---:|
| guest | no saved account yet | 4 | 1 |
| trial | 3 days from saving the account | 9 | 1 |
| ended | after day 3 | none | none |

All three are one-off grants (`period: 'ever'`); the trial counts from
`users.trial_started_at`, so the guest's four do not come out of the trial's 9.
The numbers are `GUEST` and `TRIAL` in `@ct/shared`; the logic is `freeStage` and
`freeMeter` in `plans.ts`.

**Why three days and not a month, or a week.** Ten a month kept a free account alive
*on the model* — a slow AI diary for nothing, which is a strong reason never to pay
for the fast one. So it became a trial: the product at the pace somebody actually
uses it, then a decision.

A week was too much of it. The meals a person eats repeat, and repeat is free — by
day five the ones that matter are already in the diary and loggable for nothing for
ever, so the decision at the end of the week was an easy no. Three days at three is
long enough to log real meals and watch the ring move, and it ends while the model is
still the thing doing the work. It is also the cheaper bill: about $0.67 for an
account's whole life (guest day plus trial), against $1.45 on the week and $0.41
every month, for ever, on the old ten-a-month.

**Trials already running keep the week** — `TRIAL_LEGACY` and `trialTerms` in
`@ct/shared`, chosen by `users.trial_started_at` against `TRIAL_SHORTENED_AT`
(2026-09-17, which must be at or after the deploy). Not generosity: `save.trialBody` on the phone reads `TRIAL` out of the
bundle, not off the server, so every already-installed copy is still promising "a
7-day trial: 28 messages" on the sheet that starts one. Cutting those accounts to 9
would be the app promising one thing and the server refusing at the fourth message,
which reads as a bug and gets reported as one. The branch can go once the last
pre-cutover trial has run out — seven days after the cutover. The store reviewers
(`services/trial.ts`) keep the old allowance permanently, for the reason that branch
exists at all: a review that hits a wall halfway is a rejection.

**The paywall opens once by itself** when the trial ends — the first time the tabs are
in front of that account on that phone (`lib/trial-paywall.ts`) — and its close
button appears after five seconds. After that the wall in the journal and the locked
buttons carry it.

Existing accounts got a fresh week on the day `057` ran, rather than being counted
from sign-up and losing the model on release day.

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

`subscriberOnly` in `@ct/shared` is true on every pack, messages and photos
alike (photos since 2026-09-15). Free gets a week of trial and then no AI, and a
free account that can buy thirty messages or ten scans for $3.99 has no reason to
ever subscribe — so the wall on Free sells the plan and draws no packs at all.

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

## The way in

**Plus monthly, sold at half price for its first month.** $4.99, then $9.99/mo,
identical on both stores. Annual is untouched: nothing discounts $99.99, because
a year at a discount is a year of the discount.

Live on Play since 2026-09-24 as the `first-month` offer on `plus:monthly` —
173 regions, one phase of `P1M` x 1, targeted at *never had any subscription in
this app*. The App Store half is an introductory offer that has still to be
configured by hand.

### The ladder that was planned and cannot exist

This began as $0.99 for the first week *and then* $4.99 for the first month, and
it is worth writing down why it is not that, because the reasoning that said it
would work was wrong in a way that reads plausible.

**Apple** cannot chain two discounts, for two independent reasons. A paid intro's
duration comes off a fixed table, and against a monthly subscription the
shortest entry is a month — pay-as-you-go is 1–12 months, pay-up-front is 1, 2,
3 or 6 months or a year, and there is no week. And an introductory offer is once
per subscription *group*, not per product, so the obvious workaround — a weekly
SKU carrying the $0.99 — is worse than no week at all: it spends the account's
one intro and makes the discounted month behind it impossible for exactly the
people who took the week.

**Play was assumed to be the half that worked**, because an offer there is a
list of phases and the Console's help page says an offer may have "one or more".
It does, and the example under it is a free trial followed by a discounted
month. That example is the whole permission. The API is blunter:

```
POST …/basePlans/monthly/offers
400  Only one non-free phase is permited within a subscription offer.
```

So Play's two phases are *one free and one paid*, and a paid week followed by a
paid month is refused. Two more rules fell out of the same probing, and both are
worth keeping:

| shape | outcome |
|---|---|
| paid `P1W` x 1 + paid `P1M` x 1 | `Only one non-free phase is permited` |
| free `P1W` x 1 + paid `P1M` x 1 | accepted |
| paid `P1W` x 4 | `Phase 0 duration does not match parent billing duration` |
| paid `P1W` x 1 (single payment) | accepted |
| paid `P1M` x 1 | accepted |

A phase that *recurs* must use the base plan's own billing period; only a
single-payment phase may have a duration of its own. So "$0.99 a week for four
weeks" is not available either — it is four recurrences of a week against a
monthly base plan.

What remained was a choice between one rung and the other, and the month won on
the one ground that is not a matter of taste: it is the only shape both stores
can express, so the paywall says the same sentence on both and there is one
price to reason about rather than two.

### The weekly offer is still there, and deliberately ignored

`first-week` — €1.99 for one week, 23 EUR regions — predates this and stays
`ACTIVE`. It is not deleted, because it is a configured price that took work to
localise and may be wanted again.

It is, however, tagged **`rc-ignore-offer`**, and without that tag the
`first-month` offer above would never have been seen by anybody. RevenueCat's
`defaultOption` — the option `purchasePackage` charges when handed a package —
filters offers tagged `rc-ignore-offer` or `rc-customer-center`, then takes the
longest free trial, and failing that **the lowest introductory price**. €1.99
is lower than €4.99, so in those 23 regions the week would have won every time
and the discounted month would have been dead configuration. The tag is how an
offer stays in Play without being the one the phone sells.

### The first month is below cost, deliberately

A fully-used Plus month is 90 chat and 8 photo — $3.69 + $1.21, plus $0.10 of
review and $0.11 of nudge: **$5.11**. At 15% the discounted month nets $4.24, so
it loses about **$0.87** on somebody who uses what they bought.

That is not a mispricing to be fixed. It is a customer-acquisition subsidy, and
it exists because of what `ADS.md` already spends: every install the ads produce
arrives as a guest, and the ask that follows three days of trial was $9.99.

**The grant is not pro-rated to the discount**, and that is a decision rather
than an oversight. `allowanceFor` rolls 30 days for every `period: 'month'`
meter, so the discounted month carries the whole 90/8. Teaching `plans.ts` that
a subscription has a billing period at all is item 5 of §"What is left to build"
and it is not worth doing for a worst case of one dollar.

### What the phone had to learn anyway

`Buyable.intro` is an **ordered list of phases** rather than one offer. Today's
offer has a single phase and the list has one entry, so nothing on the paywall
depends on this — but `product.introPrice` is documented on Play as *the first
pricing phase whose amount is greater than zero*, and the free-trial-then-paid
shape in the table above is one `PATCH` away. On that shape a single
`introPrice` reports one of the two phases and the card's next line, "then $9.99
a month", lands immediately after it. A wall that names the wrong next charge is
the one mistake it is never forgiven, so `introOf` reads
`defaultOption.pricingPhases`, drops the last entry — the base plan, which is
the price it becomes rather than a discount — and keeps everything before it.
iOS keeps `introPrice`, because StoreKit genuinely cannot have two.

`introDuration` also learned that a phase's cycles multiply its duration, which
had been wrong since it was written: a pay-as-you-go intro of three months
arrives from StoreKit as one month over three cycles, and it was being called
"1 month".

### Configuring it

The Play half is done and was done over the API — `androidpublisher.v3`,
`monetization.subscriptions.basePlans.offers`. Three things worth knowing before
touching it again:

- **The service account can write here.** `play-service-account.json` is refused
  on production *releases*, which is a different scope; offers create, patch,
  activate and deactivate fine, and none of it opens a Play edit, so it is safe
  to run while an upload is in flight.
- **`regionsVersion.version` must be the current one, and it is `2025/03`.**
  Older values are rejected outright, and `2025/02` and earlier disagree with
  this app's own base plans about Bulgaria — they expect BGN where the base plan
  is priced in EUR.
- **Per-region prices are the final figures.** Each region's price was set
  explicitly at half its own monthly price, snapped to the local ending, so the
  Console's "Set all prices" field never came into it. That field takes a
  pre-tax number and grosses it up — €2.00 typed there reaches a German buyer as
  €2.39 — and the API bypasses it entirely.

**App Store Connect** — still to do: an introductory offer on the Plus monthly
subscription, *pay up front*, 1 month, $4.99. No weekly SKU.

**RevenueCat** — nothing. Play attaches the offer to the base plan the existing
package already points at.

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
   Free chat moved to `period: 'month'` afterwards, then to the seven-day trial,
   then to the three-day one; see §"Free".
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
