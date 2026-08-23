# Subscription plan

Nothing here is built. This is the pricing the cost data actually supports, written
down while the measurements are fresh, so the tiers are a consequence of what a turn
costs rather than a guess that the engineering then has to chase.

It assumes the same decision `SCALING.md` does: **production runs on a metered
Anthropic API key, not a Claude Code subscription.** Every figure below is what the
tokens would cost at API rates, which is the only number that matters when the
question is whether this can be a product.

## Where the numbers come from

Three sources, in descending order of trust:

- **Billed production rows.** `ai_usage` for 2026-08-20/21 — 30 turns across three
  accounts, priced by the Agent SDK itself. This is ground truth and everything else
  is calibrated against it.
- **A cost model** that reproduces that day to within 4%. It is what lets the tables
  below say what 15 logs a day costs when nobody has yet logged 15 in a day.
- **Estimates, flagged as such.** The weekly review, the meal plan and the nudge have
  no production rows yet — nobody has triggered one. Those three numbers are the
  softest thing in this document.

The model config the tables assume is the one now in `ai/client.ts`: Haiku 4.5 for
`text_log`, Opus 5 for `photo_log`, `MAX_SESSION_MESSAGES` at 60.

## What one action costs

**Superseded 2026-08-23 by measurement.** The figures in this section were a model.
Twenty text logs and three photo scans have now been run through the real
`anthropic-api` lane on a real key, and the model was wrong in both directions:

| action | model | measured, warm | measured, cold | this doc had |
|---|---|---|---|---|
| text log | Haiku 4.5 | **$0.0052** | $0.0285 | $0.012 |
| photo scan | Opus 5 | **$0.028** | $0.165 | $0.046–$0.072 |
| nudge | Sonnet 5 | $0.025 | — | $0.01 *(est.)* |
| recipe | Opus 5 | $0.186 | — | — |
| meal plan | Opus 5 | $0.410 | — | $0.20 *(est.)* |
| weekly review *(still est.)* | Opus 5 | ~$0.10 | — | $0.10 |

*Warm* means the ~18k-token shared prefix — tool definitions plus the static system
prompt — was already in cache; *cold* means that turn paid to write it. The two
differ by 5.5× on text and 6× on a photo, and which one a turn gets is a function of
deployment traffic, not of the user. **That spread is now the single largest source
of uncertainty in this document**, and it cannot be resolved by modelling — only by
running real traffic and reading the cold-write share off `ai_usage`.

Three corrections that matter more than the arithmetic:

- **A text log is half what this doc assumed**, warm. Text is even cheaper to give
  away than the tiers below suppose.
- **A photo scan runs on Opus 5, not Sonnet 5** — `ai/client.ts` routes `photo_log`
  to Opus at high effort, so the Sonnet row was never a real configuration. Warm it
  is cheaper than the doc's Sonnet figure; cold it is more than twice the Opus one.
- **A meal plan is $0.41, not $0.20.** The estimate was half the truth, and meal
  plans are output-dominated, which is the one thing caching cannot help.

**A photo costs five times a text log, warm.** That ratio still decides the tier
structure — text is cheap enough to be effectively unlimited, photos are the thing
that has to be metered — so the shape of what follows survives; the absolute numbers
in it do not. **Every tier table below still prices a text log at $0.012 and has not
been recomputed**, deliberately: doing so would need a warm/cold mix that no
production row can yet supply, and a projection recomputed from a measurement is
still a projection. See `COMPETITION.md` §3.

Two second-order effects worth knowing, because they are counter-intuitive:

- **Cost is superlinear in daily volume.** Each turn re-reads the conversation so
  far, so the tenth log of a day costs more than the first. Capping the replayed
  transcript is what flattens it — at a 6-turn window, 40 logs a day costs $21/month
  instead of $34.
- **Cache writes, not model calls, were 87% of the original bill.** That is fixed
  (see the `dayContextPrompt` note), but it is the reason to distrust any cost
  intuition formed before 2026-08-21.

## The tiers

Every table in this section prices a text log at $0.012 — the Haiku figure, and so
the right one only for a user writing in a language Haiku handles. What happens to
these numbers when that does not hold is the section after them, and for some cells
it is the difference between a business and a hole.

### Free — 6 text logs a day, 1 photo scan ever

**Cost: ~$1.87 per active free user per month.**

The single lifetime photo is deliberate and is the most important design decision
here. Photo scanning is both the thing that makes people say "oh" and the most
expensive action in the product. One scan, ever, means every free user experiences
the best thing the app does, exactly once, and hits the wall while still impressed.
It costs $0.05 once and it is the entire conversion argument.

Text logs stop at 6/day with an upgrade prompt rather than degrading. A hard stop is
legible — "that's your 6 logs for today" is a sentence someone understands — and it
caps free-tier COGS exactly, which a soft degrade does not.

No weekly review, no meal plan. Those are Opus and they are what the paid tiers are
for. A weekly nudge stays, because it costs a cent and it is what brings people back.

**Watch this number.** At $1.87/month, free-tier burn is the CAC:

| conversion | effective CAC per paying user |
|---|---|
| 3% | $63.51 |
| 5% | $38.11 |
| 8% | $23.82 |

If conversion lands under ~4%, the free tier is the most expensive line in the
business and should be cut to a 14-day trial instead.

### Standard — $12.99/month or $119/year

15 text logs a day · 2 photo scans a day (Sonnet) · weekly review

| | COGS | net revenue | margin |
|---|---|---|---|
| typical — 8 logs, 1 photo | $4.32 | $12.31 | **65%** |
| at the cap, every day | $8.33 | $12.31 | 32% |
| annual, typical | $4.32 | $9.60 | 55% |
| annual, at the cap | $8.33 | $9.60 | 13% |

### Coach — $29.99/month or $299/year

30 text logs a day · 5 photo scans a day (Opus) · weekly review · meal plans

| | COGS | net revenue | margin |
|---|---|---|---|
| typical — 12 logs, 3 photos | $12.26 | $28.82 | **57%** |
| at the cap, every day | $23.84 | $28.82 | 17% |
| annual, typical | $12.26 | $24.17 | 49% |
| annual, at the cap | $23.84 | $24.17 | 1% |

Net revenue is after Stripe (2.9% + $0.30). On annual that fee lands once instead of
twelve times, which is worth about $0.45/month — the reason annual survives at all.

## When the language escalates

A text log costs $0.012 on Haiku 4.5 and $0.038 on Sonnet 5, and which one it is
depends on the language it was written in — Haiku writes about two dozen languages
cleanly and roughly ten badly enough to be a product defect. `ai/language.ts` holds
the list and the measurements; the routing is in `ai/run.ts`.

So the tier tables have a variable in them that they do not show. Only the text-log
line moves — photos, reviews and plans are already on models that write every
language well — but text is most of the volume, and at 3.2x it is enough to change
the answer:

| | net revenue | COGS, none escalated | 10% escalated | all escalated |
|---|---|---|---|---|
| Standard typical | $12.31 | $4.32 · **65%** | $4.86 · 61% | $9.75 · 21% |
| Standard at the cap | $12.31 | $8.33 · 32% | $9.44 · 23% | $19.46 · **−58%** |
| Standard annual, typical | $9.60 | $4.32 · 55% | $4.86 · 49% | $9.75 · **−2%** |
| Standard annual, at the cap | $9.60 | $8.33 · 13% | $9.44 · 2% | $19.46 · **−103%** |
| Coach typical | $28.82 | $12.26 · **57%** | $13.23 · 54% | $21.97 · 24% |
| Coach at the cap | $28.82 | $23.84 · 17% | $26.38 · 9% | $49.28 · **−71%** |
| Coach annual, typical | $24.17 | $12.26 · 49% | $13.23 · 45% | $21.97 · 9% |
| Coach annual, at the cap | $24.17 | $23.84 · 1% | $26.38 · **−9%** | $49.28 · **−104%** |

And the free tier, where the whole number is the CAC:

| | cost per active free user | CAC at 3% | at 5% | at 8% |
|---|---|---|---|---|
| none escalated | $1.91 | $63.51 | $38.11 | $23.82 |
| 10% escalated | $2.31 | $76.97 | $46.18 | $28.86 |
| all escalated | $5.94 | $198.01 | $118.81 | $74.25 |

**The escalated share is not known.** It is a property of who signs up, not of the
code, and nothing here can guess it. `ai_usage` records the model each turn actually
ran on, so the query that settles it is a `GROUP BY model` over `kind = 'text_log'`
— and it is worth running before the paywall is built rather than after, because two
of the decisions below depend on the answer.

**If this product is aimed at one of the escalated languages, the right-hand column
is the real one.** A Bulgarian or Croatian or Finnish user base does not make the
tiers thinner; it makes two of the eight cells lose money outright and puts the free
tier's CAC near $200 at plausible conversion. That is a repricing, not a tuning:
either the caps come down, or the escalated languages carry their own price, or the
escalated path gets cheaper than Sonnet at low effort.

## Why the caps are where they are

Every cell in both tables is positive, including the pathological one: a user who
sits at the ceiling every single day for a year on the cheapest annual plan still
does not lose money. That is the property the caps are chosen for, and it is worth
more than a headline price, because the users who do that are also the ones who never
churn.

**That property is conditional on the language, and the caps were set before anyone
knew that.** It holds for a user Haiku can serve. It does not survive a user whose
every turn escalates — the annual at-the-cap cell goes to −103% on Standard — and on
Coach annual it does not even survive one turn in ten. The caps are the thing to move
when the escalated share is known: they are what stands between the pathological user
and the bill, and against Sonnet prices they are currently set about three times too
high.

The caps are roughly 2× typical usage. In human terms 15 logs a day is every meal,
every snack, and several corrections — more than the heaviest real user currently
does. Nobody should ever see these limits; they exist so that the one person who
would have cost $86/month cannot.

**Model tier is product tier.** Standard gets Sonnet vision, Coach gets Opus. This is
the rare cost lever that is also an honest feature difference — Opus really is better
at estimating a portion from a plate — so the thing you are metering and the thing
you are selling are the same thing.

## What has to be built

Roughly in order:

1. **A plan on the user, and enforcement in the cost ledger.** The ceilings belong
   where `turnsInLastDay` already lives, not in the route limiter — `usage.ts`
   explains why, and the reasoning applies unchanged to entitlements. Route limits
   cannot see a turn started from inside a journal tool; the ledger can.
2. **The lifetime photo counter.** Distinct from the daily counters — a
   `COUNT(*) WHERE kind = 'photo_log'` over all time, not a rolling window.
3. **Stripe.** Checkout, the webhook, and the plan column. Annual prices as the
   default selection, monthly as the visible alternative.
4. **The wall itself.** One sentence and two buttons. This is a product surface, not
   an error state, and it is the screen that earns the revenue — worth more care than
   the plumbing behind it.
5. **A transcript window.** Not required to ship, but it is what makes the at-cap
   column comfortable rather than merely positive, and it is a small change: keep the
   last N turns rather than the day.

## Open questions

- **The three estimated costs.** Review, meal plan and nudge are modelled, not
  measured. Trigger one of each in production and check the ledger before trusting
  the Coach tier's margin.
- **What share of turns escalate by language.** The largest unknown in this
  document, and the only one that can turn a cell negative — see "When the
  language escalates". It is also the cheapest to answer: the ledger already
  records the model per turn, so it needs a query rather than an experiment.
  Answer it before building the paywall, because the caps depend on it.
- **Conversion.** Every number in the free-tier section is a guess until there is a
  paywall to measure. It is also the number the business is most sensitive to.
- **Whether the market bears $29.99.** Coach is priced as a coaching product rather
  than a food logger, which is what the feature set actually is. That is a
  positioning bet, and the cost data cannot settle it.
