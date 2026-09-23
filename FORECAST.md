# Year one — a forecast

Written 2026-09-24, the day 1.5.9 went to App Review. The year it forecasts is
**2026-10-01 → 2027-09-30**: the first year in which all three channels exist at once.

Companion to `ADS.md` (the €15/day smoke test), `SEO.md` (the 223-page site) and
`SOCIAL.md` (the Buffer queue). `COMPETITION.md` §6 already made the strategic call —
*cost is not the thing standing between this and a product; distribution is.* This
document is the arithmetic of that sentence, priced off production rather than
benchmarks.

**The one-line prediction: the three channels will produce roughly 20,000 installs and
3,000 accounts, about 75 subscriptions started, ~$300 MRR at the end of the year, and a
cash loss near $7,000. Neither the blog nor social will move the needle inside twelve
months; ads will, and will not pay for themselves. The forecast is not limited by
traffic at any point — it is limited by 14.5% install→account and by a turn that costs
$0.176.**

---

## 1. Where the year actually starts

Every number here was measured on the live deployment on 2026-09-24, not modelled.

| | measured | source |
|---|---:|---|
| Accounts, all time | **40** | `users`, first 2026-08-19 |
| Paying subscribers, real | **0** | `billing_events`: one PRODUCTION row, a `CANCELLATION`. Everything else SANDBOX |
| Android installs that reached Welcome, last 10 days | **186** | `onboarding_funnel`, `internal is not true` |
| …that saved an account | **27** → **14.5%** | same |
| iOS installs | **0** | listing not published; `apps.apple.com` 404s |
| Accounts that logged food on 2+ days | **5** of 19 non-demo → **26%** | `food_entries` |
| AI cost, last 10 days | **$16.26** over **97 turns**, 26 users | `ai_usage` |
| Cost of a text log, now | **$0.176** | `ai_usage`, 74 turns. `SUBSCRIPTIONS.md` priced the tiers at $0.066 blended |
| Turns per day, whole product | **9.7** | same |
| Blog posts live | **130** published (11 English × 13 locales), 13 drafts | `content_posts` |
| Blog cadence | **13/day** (1 English + 12 translations), **$1.97/day** | `content_posts`, `cost_usd` |
| Social posts ever sent | **9**, across X / TikTok / Instagram | Buffer, org `6aae4e59f6842c61dbd1f838` |
| Social views, reach, reactions, followers gained | **0 / 0 / 0 / 0** | Buffer insights, 31-day window |
| Ad spend to date | **€13.01** (the paused Bulgarian test) | `ADS.md` §1 |

Two of those rows are the whole forecast. **14.5%** is the ceiling on everything the
three channels can deliver, and **$0.176** is what serving the result costs.

---

## 2. What each channel can actually produce

### 2.1 Ads — the only channel with predictable volume

€15/day across DE, FR and US is **€5,475/year** at full run. Observed CPI is €0.59
(Bulgaria, 22 installs); Google's own hints were €0.26 DE, €0.37 FR, €0.78 US. Blended
expectation **€0.55**.

The honest median assumes the campaigns do **not** run all year, because `ADS.md` §7
contains a rule that is likely to fire: *20+ installs, zero accounts → stop them all.*
Bulgaria already produced 14 installs and 0 accounts. So: one month on, two months off
while onboarding is worked, then continuous.

- **~€4,050 spent → ~7,400 installs → ~1,100 accounts → ~27 subscriptions.**
- **Cost per account €3.79. Cost per subscription €152** at 2.5% account→paid.

That €152 sits above the top of the $28–140 fitness CPA band `COMPETITION.md` quotes. At
6% account→paid it falls to €63 and the channel is arguable. The lever is the funnel, not
the bid.

### 2.2 Play organic and the App Store — the biggest single source, and unearned

The funnel is currently taking **~19 installs a day with no live campaign**. That is the
largest number in this document and nothing in the repo takes credit for it. Held flat
with modest growth from install velocity and ratings, Play organic contributes **~8,000
installs**; iOS, live from roughly November with no reviews and no rank, **~3,000**.

This is also the fragile number. If part of those 19/day is residual Bulgarian ad click
or store-listing churn rather than category search, the median loses a third of its
volume. **Nothing measures it today**, which §9 counts as the largest hole in this
forecast.

### 2.3 The blog — a year-two asset, priced and paid for in year one

At 13 posts/day the year mints **~365 topics in 13 languages — ~4,745 posts** for about
**$720**. They are not translations: `ai/content.ts` gives each locale the same brief and
has it written from that locale's own search results. That is extraordinarily cheap content and it is not the question. The question
is whether a domain with **zero referring domains** (`SEO.md` §18: "effectively zero", and
brand search returns nothing) ranks any of it.

Expected arc, and it is not flattering:

| | sessions/mo | installs |
|---|---:|---:|
| Months 1–3 | 0–200 | ~10 |
| Months 4–6 | 500–1,500 | ~50 |
| Months 7–9 | 1,500–3,000 | ~120 |
| Months 10–12 | 3,000–6,000 | ~200 |

**~200 installs and ~5 accounts for the whole year.** At ~1% of sessions becoming
installs, a blog needs five figures of monthly traffic before it is a channel, and a new
domain does not get there in twelve months without links.

Two things make the range wider than it looks:

- **Downside, and it is a real one.** 4,700 AI-written pages on a domain with no
  authority is the single most plausible way to earn a scaled-content action, and it
  would take the 223 good pages with it. `SEO.md` §17 already says the right thing —
  *sequence English-first and mint the other twelve for the winners* — and the pipeline
  currently mints all thirteen on day one, before a single topic has an impression.
- **Upside.** `SEO.md` §17 checked seven non-English SERPs and found no DR-90 site in any
  of them. If the head of that long tail lands at all, it lands in Bulgarian, Czech and
  Greek first, months before anything English moves.

### 2.4 Social — nine posts, zero views, and the one channel that can break the forecast

The measured state is unambiguous: 9 posts sent, **0 views, 0 reach, 0 followers**. The
channels are five days old, so this is a starting line rather than a verdict — but the
assets are the problem `CONTENT_ENGINE.md` §0 warned about in its first sentence. What
has gone out is typographic cards and a rendered 8-second cut. No face, no real capture,
no trending sound.

- **Median: ~1,000 posts, ~200k cumulative views, 500–2,000 followers, ~500 installs.**
- **The fork: one genuine breakout.** This category does produce them, and the meme
  pipeline (`clips.mts` / `memes.mts` / `memepost.mts`) is built to feed one. A single
  300k–1M view video is worth 3,000–10,000 installs in a week — more than the entire ad
  budget buys in a quarter. Probability inside twelve months, if the cadence holds *and*
  the hero asset becomes real app capture with a face: **20–30%**. Without that change:
  under 10%, and the median above is generous.

Also worth pricing: Buffer's free plan caps the queue at **10 scheduled posts**
(`SOCIAL.md` §5). A daily cadence across three channels needs the paid tier — ~$70/year,
the cheapest line item in this document and currently a hard ceiling on the whole plan.

---

## 3. The funnel all three channels feed

Measured, then held constant. This is the part of the forecast with no benchmark in it.

```
  install ──14.5%──▶ account ──26%──▶ logs a 2nd day ──?──▶ pays
     19/day            4/day              1/day             0 ever
```

`account → paid` has **no production observation at all**: one cancellation, no purchase.
The median uses **2.5%**, below `COMPETITION.md`'s 4% health-and-fitness figure, because
the trial is three days and nine messages and most accounts never reach day two. Monthly
churn is taken at that document's **9.2%** for annual buyers and much worse for monthly
ones, which the $3.99 first month makes cheap to enter and cheap to leave.

---

## 4. Three scenarios

| | bear (40%) | **median (40%)** | bull (20%) |
|---|---:|---:|---:|
| Installs | 6,000 | **20,000** | 50,000 |
| install → account | 14% | **15%** | 25% (onboarding fixed) |
| Accounts | 850 | **3,000** | 12,500 |
| account → paid | 1.5% | **2.5%** | 4% |
| Subscriptions started | 12 | **75** | 500 |
| Gross revenue | $500 | **$3,900** | $26,000 |
| Net of store fees | $420 | **$3,300** | $22,000 |
| AI COGS | $900 | **$4,100** | $12,000–31,000 |
| Ads + content + tools | $1,800 | **$5,100** | $17,000 |
| **Cash result** | **−$2,300** | **−$5,900** | **−$26,000 … +$4,000** |
| …with the Hetzner box | −$3,000 | **−$6,900** | −$27,000 … +$3,000 |
| Exit MRR | $60 | **~$300** | ~$3,500 |

The median's shape by quarter: **Q1** 3,100 installs / 460 accounts, **Q2** 4,800 / 770,
**Q3** 6,350 / 1,020, **Q4** 7,100 / 1,140. Growth is almost entirely the store, not the
marketing.

**Read the bull column twice.** It loses more money than the bear column, and that is not
a modelling error — it is what a $0.176 turn does when engagement arrives.

---

## 5. Why growth costs money at today's per-turn price

| | net revenue | COGS at measured rates | |
|---|---:|---:|---|
| Plus monthly, first month | $3.39 | up to **$18.41** (90 chat × $0.176 + 8 photo × $0.318) | **−$15** |
| Plus monthly, thereafter | $8.49 | up to $18.41 | −$10 |
| Plus annual | $7.08/mo | up to $18.41 | −$11 |
| The one real Plus account, last 10 days | $2.80 | **$10.24** (29 turns) | −$7 |

Every engaged Plus subscriber loses money every month, and the intro month loses the
most. `SUBSCRIPTIONS.md` sized these tiers at **$0.066** a blended text log and its own
warning is the explanation: *there is no warm column at this traffic — 100% of production
turns wrote cache.* Cache write is 70% of a turn.

**The crossover is concrete and checkable.** A 1-hour prefix stays resident only while
somebody is running turns. At **~25–30 turns a day** the prefix is warm for most of the
working day and a text log should fall toward the $0.02–0.05 band — a 4–8× cost cut with
no code change. The product is at **9.7 turns/day**. The median scenario crosses 25/day
around **month 6–9**; the bull case crosses it in **week three**, which is why its range
spans $30k of outcome.

So the year has a genuine order dependency, and it is the opposite of intuition:
**volume fixes the unit economics, but only if the subscribers arrive after the volume,
not with it.** Free and guest traffic warms the cache for free — a guest is 4 messages
that cost $0.70 and keep the prefix alive. The channel that looks least profitable per
install is the one that makes the paying users profitable.

---

## 6. What the forecast is most wrong about, in order

1. **The 19 installs a day.** Unattributed, unexplained, and 40% of median volume. If it
   is store-listing noise the median loses ~8,000 installs and lands between bear and
   median.
2. **`account → paid` has zero observations.** 2.5% is a guess disciplined by a benchmark.
   Anywhere in 1–5% is defensible, and it swings revenue 2.5× in either direction.
3. **The cache crossover.** Modelled, never measured at this product's volume. If warm
   turns do not materialise at 30/day, every scenario's COGS column roughly doubles.
4. **Social is one draw from a fat tail.** The median is not a prediction of what happens,
   it is the average of a distribution where one video is worth more than the ad budget.

---

## 7. Gates — when to act, and on what

Written as `ADS.md` §7 is written, because a forecast without a stop rule is a wish.

| When | Read | Act |
|---|---|---|
| **Month 1, €450 spent** | Cost per *account*, not per install, from the Funnel tab | Above €6 → stop and work onboarding. `ADS.md` §7's zero-account rule still binds |
| **Month 2** | install→account across all sources | Below 20% → every euro after this is bought at a 5× discount to what it should be. Fix the walk before buying more of it |
| **Month 3** | First purchase, anywhere | Still zero → the paywall, not the funnel, is the subject. 3,000 accounts at 0% is a different document |
| **Month 4** | `ai_usage`: turns/day and cache-write share | Turns/day above 30 with cache writes still at 100% → the warm column is not coming and the tiers are mispriced, not the market |
| **Month 6** | Search Console impressions on the 365 English posts | Under 5,000/mo → stop the 12 daily translations and spend the cadence on links instead. The content is not the problem; nothing points at it |
| **Month 6** | Best social post's views | Best-ever under 5,000 → the assets are the problem `CONTENT_ENGINE.md` §0 named. Real capture and a face, or stop rendering cards |
| **Any month** | MRR vs AI COGS | COGS above 2× net subscription revenue for two months → cap the Plus grant or raise the intro month. Growing into this is not a plan |

---

## 8. The prediction in one paragraph

Twelve months from now the app has about **3,000 accounts, 30–45 live subscriptions and
$300 of MRR**, it has spent about **$5,000 on ads and $700 on content**, and it is down
roughly **$6,000–7,500** for the year. Play's own organic, not any of the three channels
being built, delivered most of the installs. The blog has 4,700 pages and a few thousand
sessions a month and will matter in year two if it survives its own translation cadence.
Social produced one week worth remembering or nothing at all. And the single most
valuable thing that happened all year was not a channel: it was **install→account moving
off 14.5%**, which would have been worth more than doubling every marketing line in this
document.
