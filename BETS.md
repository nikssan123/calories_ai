# Staking money on hitting your calorie target

Written 2026-08-27. The idea: a user puts up money on hitting their target for the day —
and not going over — for some run of days, and the pot goes to the people who make it.
DietBet, but on intake instead of the scale.

Companion to `COMPETITION.md`, which set the priorities this would compete with.

**The short version.** There are four walls. The gambling-law wall is survivable and
expensive. The distribution-and-payments wall is worse than the law. The verification
wall is fatal, and it is ours specifically — not a problem DietBet had to solve. And the
fourth is the reason not to build it even if the first three cleared: the behaviour the
money rewards is under-logging, which is the one behaviour the rest of the product
cannot tolerate.

---

## 1. Is it gambling?

The test everywhere in the US is three elements: **prize, consideration, chance.** The
stake is consideration. The pot is a prize. Everything turns on chance.

Our defence would be the one DietBet and HealthyWage have run for a decade: the outcome
is under the participant's control, so it is a contest of skill, not a wager. That
defence has held up in the sense that nobody has stopped them — but "unprosecuted since
2013" is a precedent, not a safe harbour. No court has blessed the model, and the states
do not apply one test. Some ask whether skill is the *dominant factor*, some whether
chance is a *material element*, and a few treat *any* chance as disqualifying or ban
entry-fee skill contests outright. There is no reliable published list of which is which;
the gaming bar says so in as many words, and the operators in this space handle it by
geo-blocking the same handful of states the daily-fantasy operators block and paying for
an opinion letter.

**Our version of the bet is materially worse for that defence than DietBet's**, and this
is the part specific to us. DietBet stakes on a weigh-in — a number the participant
controls and a referee can check. We would be staking on whether a *model's estimate* of
a photograph came in under a line. `COMPETITION.md` §1 already concedes the accuracy
literature: ±10% on simple meals at best, ±15–20% MAPE against weighed references, 70–85%
by cuisine. If a vision estimate that is wrong by 15% decides whether you keep your $20,
then chance is not incidental to the contest — it is the mechanism of the contest, and it
lives in our own inference stack. That is a genuinely bad fact to have to explain to a
regulator, and no amount of terms-of-service drafting removes it.

Cost to clear this wall: a 50-state gaming opinion, geo-restriction, and age gating.
Legal spend, not engineering spend.

## 2. Holding the pot

Taking money from users and paying it to other users is money transmission in most
states. That is licensing in the forty-odd states that require it, with surety bonds and
net-worth minimums, or a licensed escrow/trust partner who holds the funds instead of us.
Either path is a company-shaped commitment, not a feature. And the partner path leads
straight into the next section, because the partners who will hold contest pots are
gambling-adjacent processors with gambling-adjacent pricing and reserves.

## 3. The stores and the processor — the real blocker

This is where the idea actually dies, and it dies three times.

**Apple.** Guideline 5.3.4: apps offering real money gaming "must have necessary
licensing and permissions in the locations where the app is used, must be geo-restricted
to those locations, and must be free on the App Store." 5.3.3: no in-app purchase for
credit or currency used in real money gaming of any kind. So stakes cannot go through
IAP — they go through the web, Apple Pay or PayPal, which we can live with, since
`COMPETITION.md` §5 already argues for selling on the web. The unlivable part is the
first clause. If review classifies a staked calorie contest as real money gaming, there
is no licence to show them, because no regulator issues one for this. If instead review
treats it as a contest under 5.3.1/5.3.2, we must be the sponsor and print official rules
in the app — survivable, but it is review's call, not ours, and the downside case is a
rejection that puts the whole binary at risk, not just the feature.

**Google Play.** Worse, and clearer. Real-money games are permitted only in approved
countries, only for a developer holding a valid gambling licence for that country or
state and for that product type, and such apps must be free, must not use Play Billing,
and **must be rated Adult Only**. There is no licence class for a calorie contest, so the
honest reading is that this is not permittable on Play as a stake-and-win pot at all —
and an AO rating would take the listing `PLAY_LISTING.md` is built around with it.

**Stripe.** Our web checkout. Stripe's restricted list prohibits games of skill with a
monetary prize and, explicitly, "payment of an entry or player fee that promises the
entrant a prize of value." It is case-by-case at best; start.gg lost paid-tournament
processing over exactly this in 2023. So the bet money needs a second, gambling-tolerant
processor sitting alongside the subscription processor, at gambling-tier rates with a
rolling reserve.

Three platforms, three separate approvals, none of which we control, for a feature
attached to a product whose install base is currently zero.

## 4. Nothing in this app is verifiable

DietBet stakes on a weigh-in photo with a referee. StepBet stakes on device step data.
Both are weak signals, but both come from somewhere other than the participant's honesty
at the moment money is on the line.

We have neither. Calories are a number the user typed or a model guessed from the user's
own photograph. Weight is a self-reported row keyed by `(user_id, local_date)` — and
`COMPETITION.md` §2 records that there are *zero* Apple Health or Google Fit references
in the codebase, so there is no scale, no wearable, no second source for anything.

Put cash on that and the cheapest winning strategy is not eating differently. It is not
logging the biscuit. We would be paying users to corrupt the only data we have.

And it compounds, because the corruption is not confined to the bet. Adaptive TDEE is
computed from logged intake against the weight trend. A staked user has a standing
incentive to under-report both inputs, which means the feature quietly degrades the one
capability `COMPETITION.md` scores as parity-with-MacroFactor, for precisely the users who
engage with the product most.

This is not a fraud-detection problem to be solved with heuristics. There is no signal to
detect against.

## 5. What the incentive actually rewards

"Hit your target and not more" pays for eating less and pays for logging less, and from
inside the app those two are the same event.

The evidence is not ambiguous. Calorie-tracker users show measurably higher dietary
restraint and eating concern controlling for BMI; in one clinical sample, 73% of app users
with eating-disorder symptoms named the app as a contributor. And in a randomised trial of
financial incentives for dietary self-monitoring, participants who missed the payout
reported logging everything — while under-reporting portion sizes. That is our exact
failure mode, already observed, in a design weaker than the one being proposed here,
because that trial did not also let participants win each other's money.

Attach a pot and a leaderboard to a daily intake ceiling and the product is a restriction
contest with a scoreboard. Apple's 1.4 physical-harm scrutiny is the small version of the
risk. The large version is a single press cycle about the app that pays people to eat
less, which the product does not survive, and which an 18+ gate does not prevent.

## 6. What survives

In order of what I would actually do.

1. **Streaks and achievements, no money.** The plumbing is already there — the
   achievement enum in `packages/shared/src/index.ts` already carries `weight_logged`
   alongside the rest. Costs nothing legally, ships this week, and is what actually
   retains people in this category.
2. **A commitment deposit with no pot** — the stickK shape. You put up $20; you get it
   back for hitting the week; forfeits go to a charity you chose in advance. Because no
   user ever receives another user's money, there is no prize, so it is not gambling in
   any state, needs no gaming licence, no AO rating, and no second processor. It still
   wants a lawyer's eye (refunds, unclaimed forfeits, state charitable-solicitation
   rules) and it still carries the §5 incentive problem in weaker form, so gate it on
   *logging consistency* rather than on staying under a calorie ceiling. Betting on
   showing up is safe; betting on the number is not.
3. **If it has to be cash with winners**: stake on weight over four weeks with a
   video weigh-in, i.e. rebuild DietBet. Different company, different licensing, and
   emphatically not wired to daily calorie logging.

And the strategic note. `COMPETITION.md` §2 lists three blockers — Health/Fit sync,
offline logging, manual food search — each of which is a documented one-star review
generator and none of which needs a lawyer. A staked calorie contest is months of legal
work and three platform approvals in front of a feature that would make our own numbers
less trustworthy. It is the wrong next thing by a wide margin.

## 7. If you want it scoped anyway

Before a line of code: a 50-state gaming opinion; a money-transmission analysis or a
licensed escrow partner; a gambling-tolerant processor with its reserve terms in writing;
a pre-review conversation with Apple; and an answer to Play's licensing requirement that
I do not believe exists. The engineering — stakes, escrow ledger, settlement, refunds,
geo-gating, age-gating — is the easy 10% of it.

---

## Sources

- [App Store Review Guidelines, 5.3 Gaming, Gambling, and Lotteries; 1.4 Physical Harm](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play, Real-Money Gambling, Games, and Contests](https://support.google.com/googleplay/android-developer/answer/9877032)
- [Stripe, Prohibited and Restricted Businesses](https://stripe.com/legal/restricted-businesses)
- [Stripe changes TOS to restrict card payments from 'games of skill' (2023)](https://paymentexpert.com/2023/09/29/stripe-tos-card-payments/)
- [Walters Law Group, Which States Allow Skill Gaming?](https://www.firstamendment.com/list-states-skill-gaming-allowed-prohibited/)
- [Walters Law Group, Skill Gaming Legal Guide](https://www.firstamendment.com/skill-gaming-legal-guide/)
- [Social dieting sites and the chance-versus-control question](https://www.onlinecasinoselite.org/post/social-dieting-websites-legally-mimic-online-gambling)
- [DietBet, Official Membership Rules](https://www.dietbet.com/official-membership-rules)
- [Randomized pilot of financial incentives for dietary self-monitoring and weight loss](https://pmc.ncbi.nlm.nih.gov/articles/PMC8489416/)
- [MyFitnessPal calorie tracker usage in the eating disorders](https://pmc.ncbi.nlm.nih.gov/articles/PMC5700836/)
- [Calorie counting and fitness tracking technology: associations with eating disorder symptomatology](https://www.sciencedirect.com/science/article/abs/pii/S1471015316303646)
- [Money transmitter licensing: who needs one](https://www.brico.ai/post/who-needs-a-money-transmitter-license-8-common-company-types)
