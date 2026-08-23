# Competition, pricing, and what to actually expect

Written 2026-08-22. Companion to `SUBSCRIPTIONS.md`, which priced the tiers from our
cost data without looking at what anyone else charges.

**Stated assumptions**, both given rather than measured:

1. The React Native app is finished and shippable — icon, splash, EAS, all tabs,
   `ChatCard`, native barcode scanner, native Google sign-in.
2. Production runs on `AI_PROVIDER=anthropic-api` — the metered Messages API lane in
   `providers/messages.ts`, not the Claude Code subscription.

Both assumptions matter. Together they remove the two hard blockers from the previous
draft, and assumption 2 changes every cost figure in this document, because **the
`anthropic-api` lane has never run in production and has no measured rows at all.**

---

## 1. The field

| App | Annual | Monthly | Net $/mo after 15% store fee | Free tier |
|---|---|---|---|---|
| **Cal AI** | $29.99 | $9.99 | **$2.12** | Limited scans, ads |
| **Cronometer Gold** | $39.99 | ~$8.99 | $2.83 | Yes, full micros, **no ads** |
| **Yazio PRO** | $47.90 | ~$9.99 | $3.39 | Yes, ad-supported |
| **MacroFactor** | $71.99–83.99 | none | $5.10–5.95 | **None** — 7-day trial only |
| **MyFitnessPal Premium** | $79.99 | $19.99 | $5.67 | Yes, heavily ad-supported |
| **Lose It Premium** | $79.99 | none | $5.67 | Yes, ad-supported |
| **MFP Premium+** | $99.99 | $24.99 | $7.08 | — |
| **Noom** | ~$209 (12mo) | $59–70 | $14.81 | None |

Three structural facts:

- **Annual is the product.** 68% of health-and-fitness subscription revenue is annual.
  Lose It and MacroFactor have removed monthly entirely.
- **The AI-photo category priced itself at $30/year.** Cal AI is the category-definer.
- **The ceiling is ~$80/year** for anything called a tracker. Above that you are selling
  coaching (Noom, $209) and buyers expect human contact.

### The consolidation

MyFitnessPal acquired Cal AI in December 2025 (announced March 2026) — ~$30M ARR
bootstrapped, $50M projected for 2026, founded early 2024, shipped in 14 months, built
on third-party vision APIs with no adaptive TDEE, no conversational correction, and no
kitchen.

**Photo logging is no longer a differentiator.** It belongs to the incumbent with the
largest food database and install base. Cal AI won on TikTok and speed, not on
architecture.

### Accuracy, measured

±10% for simple meals (Cal AI), ±15–20% MAPE against weighed references (SnapCalorie),
70–85% by cuisine (Foodvisor, worse outside European food). **Nobody is accurate.**

That kills the Opus-vs-Sonnet vision distinction as a *sellable* feature — both are wrong
by more than the gap between them. Keep model tiering as a cost lever if you like, but
don't put it on the pricing page.

---

## 2. Where we stand

### Ours, and rare

| Capability | Best competitor | Verdict |
|---|---|---|
| **Conversational mutation** — "there was more rice" edits the existing entry | Nobody | **Unique.** The core asset |
| **Pantry photo → recipes → plan → shopping list** | Nobody in this set | **Unique.** Underrated |
| **Weekly AI review over SQL-computed stats** | Noom (human coaching) | Strong |
| **Adaptive TDEE from intake + weight trend** | MacroFactor | **Parity, not lead** — they own the claim |
| **Barcode with negative caching + snap-the-label fallback** | Partial elsewhere | Better executed than most |

### Theirs, and missing

| Gap | Severity |
|---|---|
| **Apple Health / Google Fit sync** — zero references in the codebase | **Blocker.** Table stakes; a 1-star review generator. Not solved by assumption 1 |
| **Offline logging** — every log needs a model round trip | **Blocker.** Architectural. There is no "AI-first" that excuses failing on a plane |
| **Manual food search over a catalogue** — we have `search_food_history` (your own past meals) only | **Serious.** Users expect a search box |
| Micronutrients — fiber/sodium/sugar only, no vitamins/minerals | Moderate (Cronometer's whole pitch) |
| Restaurant & chain menus | Moderate |
| Apple Watch app, widgets | Moderate — widgets are a retention mechanic |
| Water, streaks, fasting timer | Minor individually, cumulative in reviews |
| Social / community | Low, deliberately excluded |

### Design

Web is competitive — `CalorieRing`, `MacroBars`, `Sparkline`, `DayRail`, `InsetGroup`,
three-state theme, real landing page. Under assumption 1 mobile matches it. Design is not
the constraint.

---

## 3. The economics

### First, what is actually measured

```
production ai_usage:  59 turns · 4 accounts · all provider = 'anthropic' (Agent SDK)
                      0 rows on the metered lane, because it had never been switched on

as of 2026-08-23:     production flipped to AI_PROVIDER=anthropic-api
measured separately:  20 text logs + 3 photo scans on the real key, real prompt,
                      real tools -- the first Haiku and photo_log numbers that exist
```

Everything in `SUBSCRIPTIONS.md` priced at Haiku ($0.012/text log) or on a photo
($0.046/$0.072) is a **projection with no measurement behind it**. The one measured text
log is **$0.0626 on Sonnet 5** — 5× the planning figure — and it came from a lane
assumption 2 retires.

Decomposing that measured turn (n=9, Sonnet 5, 2.2 round trips):

| line | tokens | cost | share |
|---|---|---|---|
| **cache writes** | 8,300 | $0.0498 | **79%** |
| output | 490 | $0.0074 | 12% |
| cache reads | 17,534 | $0.0053 | 8% |
| fresh input | 205 | $0.0006 | 1% |
| | | **$0.0631** | reported $0.0626 |

### The lever: use the breakpoints you already have

`providers/messages.ts` places **one** `cache_control` breakpoint, on the static system
prompt. The API allows **four**. The conversation history has none, so it is re-sent at
full input price on every round trip — ~2.2 per turn.

```
tools (~4.5k)         ─┐ breakpoint 1  ← the only one in the codebase
system, stable (7.5k) ─┘
system, dynamic        ← no bp; correctly stable within a session
messages: history + this turn   ← NO BREAKPOINT — full price, every round trip
```

The fix is the documented multi-turn pattern: a breakpoint on the last content block of
the most-recently-appended turn. History then reads at 0.1× and only the new turn writes
at 1.25×, and earlier breakpoints stay valid as read points so hits accrue as the
conversation grows.

| step | per text log | product change |
|---|---|---|
| measured, Agent SDK on Sonnet 5 | $0.0626 | — |
| **measured, `anthropic-api` on Haiku 4.5, warm, no breakpoint** | **$0.0069** | none |
| **measured, same with the breakpoint + chunked window** | **$0.0052** | **none** |
| the same turn cold, i.e. paying to write the shared prefix | $0.0285 | — |

**Measured 2026-08-23**, both arms: twenty real turns on a real key, same twenty
messages, same account, run back to back. The lane change is the large one — 12× — and
almost all of it is Sonnet 5 → Haiku 4.5 plus a warm prefix, not the breakpoint.

The breakpoint's own contribution, isolated on the input side where it acts:

| per turn, steady state | before | after |
|---|---:|---:|
| uncached input tokens | 2,653 | **1,320** |
| cache read tokens | 31,069 | 30,144 |
| cache write tokens | 0 | 47 |
| **input cost** | **$0.00576** | **$0.00439** |

**−24% on input, ~$0.0014 a turn.** The mechanism is visible in the raw rows: without
the breakpoint, `input_tokens` climbs every turn — 1,696 at the start of the
conversation, 4,435 by turn eighteen — because the whole transcript is re-sent at full
price and the transcript keeps growing. With it, uncached input goes flat and cache
writes collapse to 13–63 tokens a turn, which is the two new messages and nothing else.

**The honest headline is that this was the smaller lever.** The bill is dominated by
whether the ~18k-token shared prefix is warm when a turn arrives: $0.0052 warm against
$0.0285 cold, a 5.5× spread that dwarfs everything above. That is a traffic property,
not a code property.

Three things worth knowing:

- **Don't shrink the prompt to save money.** Haiku 4.5's minimum cacheable prefix is
  **4,096 tokens**. A lean extraction prompt below that silently never caches — no error,
  just `cache_creation_input_tokens: 0`. The 12k prefix is an asset, not a cost.
- **The TTL is configurable, and the default is `1h`.** This entry has now said all
  three things: originally "default `1h`", then "default `5m`, and the plan was wrong to
  say otherwise", and now `1h` again — on measurement rather than reasoning either time.
  The `5m` argument was that four accounts means turns hours apart, so nothing stays warm
  under either setting and the hour is pure premium. The gap distribution says otherwise:
  41% of production turns arrive within five minutes of another, 32% within the hour,
  median gap seventeen minutes against a mean of eighty-three. People log in
  conversations. Reasoning from the mean cost about 20% of the per-turn bill, at a volume
  where the argument said the setting could not matter.
- **Verify, don't assume.** Non-zero `cache_read_input_tokens` on repeated turns is the
  only proof the breakpoint landed.

**The breakpoint alone is a no-op — it needs a second change.** `loadHistory` took the
*most recent 30* messages, and at two rows per turn that window slid by two every turn
once a conversation passed fifteen. A sliding window re-keys the prefix under the
breakpoint on every turn, so it would have paid the write and never earned the read. The
window now evicts in **chunks**: the anchor is quantised to every 20th message, so the
replayed prefix is byte-identical for ten consecutive turns — one cache write, then nine
reads — and the window breathes between 20 and 39 messages instead of sitting at 30.
Breakpoint and chunked eviction are one change, not two; neither works alone.

**Landed.** `providers/messages.ts` (`replayable`, breakpoint 2 plus uniform block form)
and `run.ts` (`loadHistory` → `listReplayWindow`, `HISTORY_KEEP`/`HISTORY_CHUNK` = 20/20).
Two caveats found while implementing, both of which cap the win and neither of which is
fixable here: a photo turn invalidates the message tier because image presence does, and
a language escalation switches model, and caches are per-model. Mixed conversations
therefore re-key more often than the arithmetic above assumes — which is the argument for
doing step 2 before trusting any of these figures.

### Where caching does *not* help

The kitchen is **output**-dominated, and output is never cached:

| action | measured | output share |
|---|---|---|
| meal plan | $0.4097 (n=3) | **65%** |
| recipe | $0.1863 (n=5) | **59%** |

Logging is an input problem, so caching solves it. The kitchen is a generation problem,
so caching cannot. That asymmetry, not model choice, is what should shape the tiers.

### Per-action costs after the fix

| action | model | warm | cold | basis |
|---|---|---|---|---|
| text log | Haiku 4.5 | **$0.0052** | $0.0285 | **measured** |
| photo scan | **Opus 5** | **$0.028** | $0.165 | **measured** |
| text log, language-escalated | Sonnet 5, low | ~$0.016 | ~$0.09 | modelled |
| weekly review | Opus 5 | ~$0.10 | — | estimated |
| nudge | Sonnet 5 | $0.025 | — | **measured** |
| recipe | Opus 5 | $0.186 | — | **measured** |
| meal plan | Opus 5 | $0.410 | — | **measured** |

Two corrections to earlier drafts of this table. A photo scan runs on **Opus 5**, not
Sonnet — `ai/client.ts` routes `photo_log` to Opus at high effort, so the Sonnet row was
never a configuration that existed. And the warm/cold split is not a rounding detail: a
cold photo scan is $0.165, six times the warm one, and is what a user's *first* photo of
a quiet morning actually costs.

### Monthly COGS

| profile | assumptions | COGS |
|---|---|---|
| **Free** | 3 logs/day, 1 lifetime photo, weekly nudge | **$0.82** |
| **Plus, median** | 5 logs/day × 20 active days, 10 photos, review | **$1.43** |
| **Plus, daily committed** | 8 logs + 1 photo every day, review | **$3.01** |
| **Coach, median** | 8 logs/day × 25 days, 30 photos, 2 plans, 8 recipes | **$5.03** |
| **Coach, at the cap** | 12 logs + 3 photos daily, 4 plans, 20 recipes | **$10.79** |

Compare to `SUBSCRIPTIONS.md`: Standard typical falls $4.32 → $3.01, and free falls
$1.87 → $0.82, with no feature removed.

---

## 4. Ads for the free tier

Two formats, two different answers. The earlier version of this document banned the
category on the strength of the interstitial math, which was wrong: rewarded video is a
different mechanic and the numbers do not transfer.

### Interstitial and banner — no

An *engaged* free user, 2.5 opens/day, ~4 screens each:

| Placement | Impressions/mo | US/mo | Global blended |
|---|---|---|---|
| Banner on Today/History | 300 | $0.38 | $0.15 |
| Interstitial, 1 per 3 logs (cap 3/day) | 75 | $0.53 | $0.23 |
| **Realistic** (AdMob only, 60–70% fill) | | **~$0.55** | **~$0.25** |

An interstitial between "I had two eggs and toast" and the reply damages the one thing
that is actually ours, and freemium already converts at 2.1% against 10.7% for a hard
paywall. Not worth it for ~$0.55.

### Rewarded — yes, for logging only

Rewarded is opt-in, user-initiated, does not interrupt the conversation, and carries the
highest eCPM of any format precisely because it completes. Reported effects: rewarded-ad
users ~4.5–5× more likely to make an IAP, hybrid implementations lifting IAP revenue
~30% and LTV ~33%, and only 10% of subscription apps running true hybrid.

Treat the 4.5× cautiously — vendor-published, and almost certainly confounded, since
engaged users both watch rewarded ads and subscribe. The mechanism argument is the
stronger one: **every ad watch is a paywall encounter.**

One rewarded view ≈ $0.017 US; $0.003–0.010 Tier-2/3 (India $0.0026, Brazil $0.0042):

| action | cost | US views to break even | Tier-2/3 views |
|---|---|---|---|
| text log | $0.008 | **0.5** | 1.3 |
| photo scan | $0.023 | **1.4** | 3.8 |
| weekly review | $0.10 | 5.9 | 17 |
| recipe | $0.186 | 11 | 31 |
| meal plan | $0.410 | **24** | 68 |

**The rule: rewarded works when one view roughly covers the action, and breaks past about
two.** Photo scans and text logs qualify. The kitchen cannot be rescued at any ratio —
the same output-dominated cost that caching could not touch. Twenty-four ads for a meal
plan is not a product. The kitchen stays subscription-only.

**Set the ratio for break-even, not revenue.** 1 ad → 1 photo scan is $0.017 against
$0.023 — slightly negative in the US and clearly negative elsewhere. Capped at 3/week the
worst case is a few cents a month, and it buys ~13 paywall encounters. That is the
return: bounded cost and repeated conversion moments, not the pennies.

**The uncomfortable interaction.** The wedge recommended in §6 — non-English, home-cooked,
unpackaged food — is exactly Tier-2/3 geography, where rewarded eCPM is 5–15× worse. The
ad-funded free tier pays best in the market where we are weakest competitively and worst
where we are strongest. That tension is a strategy decision, not a tuning one.

## 5. The plan

### Free — the conversational logbook
3 conversational logs/day · unlimited barcode · repeat-meal · manual entry · weight ·
Today/History/Progress · **one lifetime photo scan** · weekly nudge
**COGS ~$0.82/mo.**

Keeping the agent in the free tier is the change the caching fix pays for. The
conversation is the differentiator; a free tier that cannot demonstrate it cannot sell
it. Three a day is enough to feel the product and not enough to live in it. The single
lifetime photo stays exactly as `SUBSCRIPTIONS.md` argues it — best paragraph in that
document.

### Plus — **$59.99/year** (or $8.99/month)
Conversation without a daily ceiling · 3 photo scans/day · adaptive targets · weekly
review · no ads

| | Net revenue/mo | COGS | Margin |
|---|---|---|---|
| Store, 15%, median user | $4.25 | $1.43 | **66%** |
| Store, 15%, daily committed | $4.25 | $3.01 | 29% |
| Web/Stripe, median | $4.85 | $1.43 | **71%** |

### Coach — **$119.99/year** (or $16.99/month)
Everything in Plus, plus the kitchen: pantry scan · recipe generation · meal plans ·
shopping lists · unlimited photo scans

| | Net revenue/mo | COGS | Margin |
|---|---|---|---|
| Store, 15%, median user | $8.50 | $5.03 | **41%** |
| Store, 15%, at the cap | $8.50 | $10.79 | **−27%** |
| Web/Stripe, median | $9.70 | $5.03 | 48% |

**The kitchen has to be metered, and it is the only thing that does.** Because it is
output-dominated, no caching or model change rescues the at-cap cell — a meal plan is
10,593 output tokens and that is the feature. Cap at **4 meal plans and 20 recipes a
month**; both sit above any real cadence (a plan is a weekly artifact) and both are what
stands between one enthusiast and a negative month.

Sell the kitchen, not the model tier. Pantry → recipes → plan → shopping list against a
real calorie budget is a second product nobody in the comparison table has. Drop
Opus-vs-Sonnet vision from the pricing page entirely — the accuracy data says no user can
perceive it.

### Trial, not freemium, for the paid path

MacroFactor's model: 7-day full-access trial, card required, annual default. A trial
costs ~$0.20 once; hard paywalls convert ~5× better than freemium. Run the free logbook
*alongside* it as the post-trial fallback.

### Payments

Sell on the **web** where you can. Post-Epic, US apps can currently link out at **no
Apple fee** — the Ninth Circuit lifted Apple's stay in April 2026, the Supreme Court
declined to pause it in May, and Apple has since proposed 5–15% (5% under the Small
Business Program) while the appeals court has suggested zero may be correct. **The window
may close; take it while it exists.** Keep IAP at 15% as the convenient path.

---

## 6. Brutally honest expectations

**1. Distribution is the whole game, and assumptions 1 and 2 don't touch it.**
A finished app and a metered API key get you to the start line. No audience, no ASO, no
budget, no install base. Cal AI won on TikTok in 14 months. The quality of the reasoning
in `SCALING.md` will not move one install.

**2. Your headline feature was acquired by the incumbent eight months ago.**
Anything you say about snapping a meal is a claim someone can already satisfy for $29.99
a year from a brand they know.

**3. You have two defensible things, and one is contested.**
Conversational mutation is genuinely yours. The kitchen is genuinely yours. Adaptive TDEE
is MacroFactor's — reviewers write "no competitor offers this at any price" about *them*.

**4. Two absent features generate 1-star reviews on day one, and neither is fixed by a
finished RN app.** No Apple Health sync. No offline logging. Offline is the hard one:
your log path *requires* a model round trip; theirs write to a local database. Budget
these as launch scope, not backlog.

**5. Time to first dollar: 3–5 weeks, not 3 months.**
Caching fix and cost verification ~1 week. Entitlements in the cost ledger, the lifetime
photo counter, Stripe + StoreKit, the paywall screen ~2 weeks. Store listing, screenshots,
review ~1–2 weeks. Apple Health and offline logging push it out, and should.

**6. The revenue math, unflattered.**
Health-and-fitness freemium converts ~4%; monthly churn ~9.2%. At $59.99/year, median
COGS, no marketing spend:

| Free signups | Paying (4%) | Gross/yr | Net after fees | Less COGS | Contribution |
|---|---|---|---|---|---|
| 1,000 | 40 | $2,400 | $2,040 | −$1,060 | **~$980/yr** |
| 10,000 | 400 | $24,000 | $20,400 | −$10,600 | **~$9,800/yr** |
| 50,000 | 2,000 | $120,000 | $102,000 | −$53,000 | **~$49,000/yr** |

Note what the COGS column does: because the free tier now costs $0.82/month and most
signups never convert, **free-tier burn scales with signups while revenue scales with
conversions.** At 4%, free users cost roughly half of net subscription revenue. That is
survivable at $0.82 and would not have been at $1.87 — but it is the reason the trial
model beats the permanent free tier, and the reason to watch the ratio monthly.

A solo launch with no budget produces **hundreds** of signups in month one. Row one is
the honest year-one expectation: a project that pays its own hosting. Row three is a real
business and needs a marketing operation — paid acquisition at fitness CPAs of $28–$140,
or organic content as a full-time job.

**7. The strategic read.**
The market is consolidated, price-anchored at $30–80/year, and dominated by an incumbent
that just bought the fastest-growing challenger. With the caching fix your unit economics
are now genuinely healthy — 66% margin on a median Plus user is a real business at any
scale you can reach. **Cost is no longer the thing standing between this and a product.
Distribution is, and always was.**

The paths that remain:

- **Sell the kitchen, not the tracker.** Pantry → recipes → plan → shopping list is a
  meal-planning product, a less crowded market with a higher price point, and the one
  thing here nobody else has.
- **Go where the search box fails.** Non-English speakers, home-cooked and unpackaged
  cuisines, low-literacy and visually-impaired users. MFP's 20M-item database is useless
  for a home-cooked Bulgarian meal; a sentence parser is not. The incumbent structurally
  cannot copy this — their moat *is* the database.
- **Or keep it as an exceptional portfolio piece.** `SCALING.md` and `SUBSCRIPTIONS.md`
  are better artifacts than most funded startups produce.

What does not work is shipping a general-purpose calorie tracker at $59.99/year into this
field and hoping the architecture shows.

---

## 7. What to do first

1. ~~**Add the second cache breakpoint** on the replayed history in `providers/messages.ts`,
   **and** switch `loadHistory` from a sliding window to chunked eviction.~~ **Done.** One
   change in two files; the breakpoint does nothing without the eviction fix.
2. ~~**Flip prod to `anthropic-api`** and log 20 text turns and 10 photos.~~ **Done.**
   Production runs the metered lane as of 2026-08-23 (`ANTHROPIC_ITPM=10000000`, the
   account's published ceiling on all three models). Twenty text logs and three photo
   scans measured; `cache_read_input_tokens` non-zero from the second turn on.
3. ~~**Make the cache TTL config**~~ **Done** — `ANTHROPIC_CACHE_TTL`, `5m` or `1h`,
   validated at boot, default `1h`, and set to `1h` on the host. Which is what this step
   originally said; the detour through `5m` and back is recorded in §3 because the
   mistake in between is more useful than the conclusion.
4. ~~**Re-run the tables above**~~ **Done** for per-action costs; `SUBSCRIPTIONS.md`
   carries the correction. The **tier tables are deliberately not recomputed** — they
   need a warm/cold mix, and only real traffic on the new lane can supply it.
5. **Let real traffic accumulate, then read the cold-write share.** That single number
   decides both the TTL setting and whether the monthly COGS table above is closer to its
   warm column or its cold one. Nothing else in the pricing can be settled without it.
6. Then build entitlements, the paywall, and payments — against numbers instead of
   guesses.

---

## Sources

- [MyFitnessPal pricing 2026 — NutriScan](https://nutriscan.app/blog/posts/myfitnesspal-pricing-2026-guide-2ff09c399a)
- [Cal AI pricing 2026 — eesel AI](https://www.eesel.ai/blog/cal-ai-pricing)
- [MyFitnessPal acquires Cal AI — The Next Web](https://thenextweb.com/news/myfitnesspal-acquires-cal-ai-the-viral-calorie-tracking-app-built-by-teens)
- [Cal AI revenue — Forbes](https://www.forbes.com/sites/zoyahasan/2026/03/06/this-u30-kept-launching-apps-until-one-worked-then-sold-it-to-myfitnesspal/)
- [MacroFactor vs Cronometer 2026 — NutriScan](https://nutriscan.app/blog/posts/macrofactor-vs-cronometer-2026-62a278ee64)
- [MacroFactor review 2026 — Calorie Trackers](https://calorie-trackers.com/reviews/macrofactor/)
- [SnapCalorie review and accuracy — Food Trackers](https://www.food-trackers.com/reviews/snapcalorie/)
- [Foodvisor accuracy by cuisine — CalorieScan AI](https://www.caloriescanai.com/blog/what-foodvisor-does-well-and-poorly)
- [State of Subscription Apps 2026 — RevenueCat](https://www.revenuecat.com/state-of-subscription-apps)
- [Health & fitness subscription benchmarks — Adapty](https://adapty.io/blog/health-fitness-app-subscription-benchmarks/)
- [Fitness app churn benchmarks](https://retentioncheck.com/churn-benchmarks/fitness-apps)
- [App ad revenue benchmarks 2026 — RevenueFlex](https://revenueflex.com/blog/app-ad-revenue-benchmarks-2026/)
- [AdMob & mobile monetization 2026 — MonetizeMore](https://www.monetizemore.com/blog/admob-monetization/)
- [Apple proposes 15% on external payments — TechCrunch](https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/)
- [App Store fees and link-outs — MacRumors](https://www.macrumors.com/2026/08/13/app-store-fees-apple-link-outs/)
- [Freemium conversion benchmarks 2026 — Artisan Strategies](https://www.artisangrowthstrategies.com/blog/freemium-conversion-rate-benchmarks)
- [Noom cost 2026](https://www.noom.com/blog/weight-management/noom-cost/)
