# Subscription plan

**Built, as of 2026-08-24.** The tiers below are in `apps/api/src/services/plans.ts`,
the meters are enforced off the cost ledger in `services/usage.ts`, and `users.plan`
carries `free | plus | coach` after `034`. The phone now explains itself too — the
count above the composer, the wall in the journal, the locked panels, and
`app/upgrade.tsx` behind them, all off `GET /entitlements`. What is *not* built is
Stripe, and the web says nothing about any of this.

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

Metered, and **lifetime rather than monthly**: 20 journal turns, 1 photo scan.

The lifetime grant is the load-bearing decision. A monthly grant is a recurring bill
for accounts that have already decided not to pay — at $0.066 a turn, 20/month
forever is $1.32/month per free account, which at 4% conversion is a CAC that climbs
for as long as the account exists. Lifetime makes it a one-time **$1.74** and then
stops. Free-tier steady state is **$0.00/month**.

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
2. ~~The lifetime photo counter.~~ **Done** — `period: 'ever'` on the free meters.
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

Against the table above that is **$0.65/month per free account**, on a tier this
document states has a steady state of $0.00 — enough to make the lifetime-grant
argument in §"Free" wrong by a factor of five over a year. Fixed by selecting `plan`
in `listActiveUsers` and skipping accounts whose `reviewsPerDay` is zero.

The nudge pass needed no equivalent: `dueNudge` reads `nudgesPerWeek` off the plan
as its first question. The general lesson is the one worth keeping — an entitlement
enforced only at the route is enforced only against requests, and the scheduler is
not a request.
