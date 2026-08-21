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

| action | model | cost |
|---|---|---|
| text log | Haiku 4.5 | $0.012 |
| photo scan | Sonnet 5 | $0.046 |
| photo scan | Opus 5 | $0.072 |
| weekly review *(est.)* | Opus 5 | $0.10 |
| meal plan *(est.)* | Opus 5 | $0.20 |
| nudge *(est.)* | Haiku 4.5 | $0.01 |

**A photo costs four to six times a text log.** That single ratio decides the whole
tier structure: text is cheap enough to be effectively unlimited, and photos are the
only thing that has to be metered. Everything below follows from it.

Two second-order effects worth knowing, because they are counter-intuitive:

- **Cost is superlinear in daily volume.** Each turn re-reads the conversation so
  far, so the tenth log of a day costs more than the first. Capping the replayed
  transcript is what flattens it — at a 6-turn window, 40 logs a day costs $21/month
  instead of $34.
- **Cache writes, not model calls, were 87% of the original bill.** That is fixed
  (see the `dayContextPrompt` note), but it is the reason to distrust any cost
  intuition formed before 2026-08-21.

## The tiers

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

## Why the caps are where they are

Every cell in both tables is positive, including the pathological one: a user who
sits at the ceiling every single day for a year on the cheapest annual plan still
does not lose money. That is the property the caps are chosen for, and it is worth
more than a headline price, because the users who do that are also the ones who never
churn.

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
- **Whether Haiku is good enough at `text_log`.** The economics assume it is. This
  is the one change in the cost work that could show up as a worse product, and it
  is a one-word revert if it does. Watch correction rates — a rise in
  `update_food_entry` calls per log is the signal.
- **Conversion.** Every number in the free-tier section is a guess until there is a
  paywall to measure. It is also the number the business is most sensitive to.
- **Whether the market bears $29.99.** Coach is priced as a coaching product rather
  than a food logger, which is what the feature set actually is. That is a
  positioning bet, and the cost data cannot settle it.
