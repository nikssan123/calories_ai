# Play Store listing

Written 2026-08-24. Android-only; iOS is parked until Android runs.

Companion to `COMPETITION.md` (§6 — distribution is the whole game) and `LANGUAGES.md`.
Everything here is copy you can paste into Play Console, plus the reasoning for why it
is worded that way.

**One rule governs every line below: nothing is claimed that the app cannot do today,
and nothing the app can do is left out.**

Checked against the code, not against the planning docs — `COMPETITION.md` is dated
2026-08-22 and is already stale on this point. **Offline logging is built** (`OFFLINE.md`:
"All of it is built"; `apps/mobile/lib/outbox.ts`), so it is sold below rather than
disclosed. **Voice input is built too**, as of 2026-08-24 — `apps/mobile/lib/voice.ts`,
dictation straight into the composer — so it is sold below as well; it was listed here as
absent until that day. Still genuinely absent: **Health Connect sync** (`INTEGRATIONS.md`:
"Nothing here is built") and **a searchable food catalogue**. Those two stay out of the
copy.

---

## 1. Why Play ASO is not App Store ASO

Three differences change the whole approach:

| | Apple | Play |
|---|---|---|
| Keyword field | 100 chars, separate | **None** |
| Description indexed | No | **Yes — all 4,000 chars** |
| A/B testing | None built in | **Store listing experiments, free** |

So on Play the long description *is* the keyword field. Density and natural repetition
matter in a way they never did on iOS, and the copy has to do double duty: rank, and
convert. Play also weights **retention and uninstall rate** far more heavily than Apple
weights anything — which is the real reason not to overclaim.

---

## 2. Title — 30 characters

```
Day So Far: Calorie Counter
```

27 chars. `Calorie Counter` is the highest-volume term in the category and the title is
the heaviest-weighted field on Play, so it gets the exact match.

The brand keeps first position because "Day So Far" is genuinely good — it says the
product's actual idea (a day in progress, not a ledger you settle at midnight) and it is
short enough that keeping it costs almost nothing.

**Rejected:**

- `Day So Far` alone — wastes the single strongest ranking asset in the listing.
- `Day So Far: AI Calorie Tracker` (30) — "AI" is a crowded, low-intent modifier and
  `tracker` indexes slightly below `counter`. Both terms still appear below, which is
  enough on Play.
- `Calorie Counter: Day So Far` — keyword-first reads like a content farm and hurts the
  branded-search flywheel you want later.

---

## 3. Short description — 80 characters

```
Just say what you ate. AI food diary, macro tracker and calorie counting.
```

73 chars. Indexed, and shown above the fold before anyone taps "more".

The first sentence is the differentiator, not a keyword — the one thing no competitor in
`COMPETITION.md §2` can say. The second carries `food diary`, `macro tracker` and
`calorie counting`, none of which fit in the title.

**Alternate to test later:**

```
Say what you ate, get calories and macros. Food diary and calorie counter.
```

---

## 4. Long description — 4,000 characters

Paste as-is. Play renders limited HTML; the `<b>` tags below are supported.

```
Most calorie counters make you find your food in a database. Day So Far just asks what you ate.

"Two eggs, toast and some cheese." That is a logged breakfast — 407 calories, 24g protein, already counted against your day. No searching, no scrolling, no picking the right one of forty entries called "toast".

<b>How calorie counting works here</b>

1. Write a sentence about your meal
2. Day So Far turns it into calories, protein, carbs and fat
3. Your day updates

<b>Change your mind, in words</b>

Say "there was more rice" and the entry you already logged changes. Not a correction appended underneath it, not a delete-and-retype — the meal itself updates. Every other food diary makes you go back and edit the row by hand.

<b>It keeps working without a signal</b>

Supermarket basements, gyms, lifts and planes are where people actually log food, and where most calorie counting apps give up. Enter a meal offline and it is saved on your phone, counts toward your day immediately, and syncs by itself when you are back. Nothing is lost, and nothing is logged twice.

<b>A calorie counter that knows what you actually cook</b>

Log in any language. A plate of musaka, a bowl of tarator, whatever your grandmother called it — a sentence parser does not need a barcode or a US chain-restaurant entry to understand a home-cooked meal. This is where most calorie counting apps quietly fail, and it is the whole reason this food log exists.

<b>What you get</b>

• <b>Log by writing</b> — a sentence, not a search box
• <b>Log by speaking</b> — say the meal out loud; your phone does the listening
• <b>Offline logging</b> — enter meals anywhere, they sync when you reconnect
• <b>Barcode scanner</b> — for the packaged half of your diet
• <b>Photo logging</b> — snap the plate or snap the label
• <b>Macro tracker</b> — protein, carbs and fat, plus fiber, sodium and sugar
• <b>Adaptive calorie targets</b> — your goal recalculates from what you actually eat and how your weight actually moves, not from a formula you filled in once
• <b>Home screen widget</b> — calories remaining without opening the app
• <b>Weekly review</b> — written from your real numbers, not a template
• <b>Exercise logging</b> — in the same sentence-first way as food
• <b>Metric or imperial</b> — switch any time; your history re-renders, nothing is rewritten

<b>The kitchen</b>

Photograph what is in your fridge. Get recipes that use it, a meal plan built from those recipes, and a shopping list for the gaps. Calorie counting is the part every nutrition tracker does. Deciding what to eat is the part that actually stops people.

<b>A day that ends when yours does</b>

A 1am snack counts toward the evening it belongs to, not tomorrow morning. Set your day to start whenever you actually wake up, and stop losing late meals to the calendar.

<b>Who it is for</b>

People counting calories for weight loss, maintenance or gaining. People who cook rather than buy. People who have tried a food diary before, logged for nine days, and stopped because logging a home-cooked dinner took four minutes.

<b>Free, Plus and Coach</b>

Log your food for free. Plus adds the weekly review, more journal turns and more photo scans. Coach adds the kitchen — fridge scans, recipes and meal plans.

Day So Far is a calorie counter, food diary and macro tracker for people tired of scrolling a database to log a sandwich.
```

### Keyword map

Play counts what is in the text, so this is the audit that matters:

| Term | Target | In copy |
|---|---:|---:|
| calorie / calories | 10–12 | 12 |
| calorie counting | 3–4 | 4 |
| calorie counter | 3 | 3 |
| food diary | 3 | 3 |
| recipes | 3 | 3 |
| barcode | 2–3 | 3 |
| offline | 2 | 2 |
| macros | 2 | 2 |
| meal plan | 2 | 2 |
| food log | 1–2 | 1 |
| nutrition tracker | 1 | 1 |
| weight loss | 1 | 1 |

3,390 of the 4,000 available characters, 583 words, 1.9% density on the primary term —
inside the band where Play indexes it and a human still reads it as English. Do not push
past ~3%.

**Paste it unwrapped.** Play preserves the literal line breaks you give it, so a
hard-wrapped paragraph renders ragged on a phone. Each paragraph above is one long line;
only the bullets and the numbered steps have their own.

### The pricing paragraph is a placeholder

`SUBSCRIPTIONS.md` prices three tiers, but `COMPETITION.md` recommends a **7-day
card-required trial** with the free logbook as the post-trial fallback — and that trial is
not built. The paragraph above is deliberately neutral so it is true either way, which
also makes it weak copy.

Rewrite it the day monetization is decided. It matters beyond the listing: at freemium's
2.1% conversion an install is worth ~$0.95 and no paid channel clears that; at a hard
trial's 10.7% it is worth ~$4.80 and Meta becomes affordable. The listing and the ad
budget both hang on the same decision.

### On the offline section

`COMPETITION.md §2` lists offline logging as a **blocker** and §6.4 predicts it as a
day-one 1-star driver. Both are out of date — `OFFLINE.md` closes with "All of it is
built", and `lib/outbox.ts` carries create, repeat, delete and patch through a persisted
queue with idempotency keys and optimistic reads.

That makes it a differentiator worth a paragraph of its own rather than a disclosure. An
AI-first tracker that survives a basement is unusual precisely *because* the log path
normally needs a model round trip — the thing the competitors' local databases give them
for free is the thing that was hard here.

**The scope sentence was removed on 2026-08-25**, on the owner's instruction that nothing
describing a shortfall belongs in the listing. `OFFLINE.md §4` still puts photos, chat
turns, barcode lookup, recipe generation and the weekly review out of scope, so the risk
this sentence existed to cover is unchanged — a reader may assume a photo logs offline.

What makes the removal defensible rather than misleading is that the paragraph only ever
claims *entering a meal* works offline, and that claim is true. It no longer volunteers
what else does not. If offline expectations show up in the reviews, this is the first
thing to put back.

### On the "honest about what is missing" section

**Cut on 2026-08-25, by the owner's call**, along with the offline scope sentence: the
listing sells what the app does and stays quiet about what it does not.

The argument it replaced is worth keeping visible, because it is a bet either way.
`COMPETITION.md §6.4` predicts Health Connect as a day-one 1-star driver, and a listing
that pre-empts it converts slightly worse but retains meaningfully better — which matters
because Play weights **uninstalls** far more than install count. The wager now is that the
install gain beats the review cost. The metric that settles it is uninstall rate in the
first week, not conversion.

---

## 5. Graphics

Play needs more than screenshots, and two of these are hard requirements:

| Asset | Spec | Required |
|---|---|---|
| Icon | 512×512 PNG | Yes |
| **Feature graphic** | **1024×500** | **Yes — listing will not publish without it** |
| Screenshots | 2–8, min 320px, 9:16 | Yes (min 2) |
| Promo video | YouTube URL | No, but Play surfaces it prominently |

### Screenshot order

The first three are visible without scrolling. They carry the whole listing.

| # | Frame | Caption |
|---|---|---|
| 1 | Sentence typed → structured meal appears | **Just say what you ate** |
| 2 | "there was more rice" → the entry updates | **Change your mind? Just say so** |
| 3 | Today view, ring at ~60% | **Your day, as it happens** |
| 4 | Widget on a real home screen | **Without opening the app** |
| 5 | A meal logged in airplane mode, pending badge showing | **Works in the basement gym** |
| 6 | Barcode scanner on a product | **Scan the packaged stuff** |
| 7 | Fridge photo → recipe list | **Cook what you already have** |
| 8 | Weekly review | **A real read on your week** |

Frames 1 and 2 are the entire pitch and nobody else in the category can screenshot them.
Frame 4 is there because `COMPETITION.md §2` lists widgets as a competitor advantage —
`widget/DayWidget.tsx` closed that gap on Android and the listing should say so.

Frame 5 replaced a progress-trend frame showing adaptive targets. Adaptive TDEE is
**parity, not lead** by your own §2 — MacroFactor owns that claim and reviewers credit
them for it. Offline is a claim you can make and the AI-first competitors cannot.

Caption text belongs *in the image*, large. Play does not render captions separately, and
most installs are decided on frames 1–3 at thumbnail size.

---

## 6. The microphone permission — settled 2026-08-24

This section used to say: `app.json` declares `android.permission.RECORD_AUDIO`, nothing
uses it, delete the line unless voice logging ships in the same release. **Voice logging
shipped in the same release**, so the permission stays and is now honest.

What that leaves for the store:

- The listing still shows **Microphone** next to Camera. That is a real conversion cost
  and now buys something — the mic is the second-largest control in the composer, and the
  screenshot set should show it rather than let the permission arrive unexplained.
- **Data Safety: no audio is collected.** Recognition runs through Android's own
  `SpeechRecognizer`. No recording reaches this project's servers, so there is nothing to
  declare as collected or shared — only the resulting text, which is already declared as
  part of the conversation.
- Where the phone has no offline language pack, Android hands the audio to Google's
  network recogniser instead of doing it on-device. That is a flow between the phone and
  Google rather than anything this app receives, and it is disclosed as such in `/privacy`
  §4 under Google.

---

## 7. Localization

`packages/shared/src/locale.ts` ships `['en', 'bg']`. The listing should never run ahead
of the app: a Bulgarian listing that installs into an English tab bar is a 1-star review
with extra steps, which is the trap flagged at the end of `LANGUAGES.md`.

**Order, and why:**

| # | Locale | Rationale |
|---|---|---|
| 1 | `en` | Baseline |
| 2 | `bg` | Already in the code, founder-market, and the cuisine argument is strongest where you can verify it yourself |
| 3 | `pl` | ~38M, high Android share, real payment willingness, heavily home-cooked |
| 4 | `ro` | Adjacent cuisine to `bg`, Android-dominant, cheap CPMs |
| 5 | `tr` | Very high Android share and very cheap installs — but weak ARPU and currency risk, so volume test only |

`es` and `pt-BR` are the obvious scale plays and the obvious traps: huge Android
install bases, the lowest ARPU in the category, and every competitor already localized.
Go there when you are buying installs profitably somewhere else first.

Play's **custom store listings** let you target a country without shipping app
localization — useful for testing demand in a market before committing translation work,
and only for that.

---

## 8. What to A/B, and when

Play's store listing experiments are free and built in. They are also useless below a few
thousand store visits a week — the tool will simply never reach significance, and
`COMPETITION.md §6.6` puts month one in the hundreds. So this section is for later, in
this order:

1. **Icon** — the largest single lever on tap-through, and the cheapest to vary.
2. **Screenshot 1**, then the order of 1–3.
3. **Short description** — test the alternate in §3.
4. **Feature graphic.**

**Do not A/B the long description.** It is your indexed keyword surface; churning it
resets ranking signal for a conversion gain you cannot measure at this volume.

---

## 9. Sequence

1. ~~Delete `RECORD_AUDIO`~~ — **done differently**: voice shipped, so the permission is
   kept and earned (§6).
2. Title, short description, long description (§2–4).
3. Feature graphic + 8 screenshots (§5).
4. Ship `bg` app localization, then the `bg` listing (§7).
5. Only then buy traffic — see the trial-model precondition in the ads discussion:
   at freemium's 2.1% conversion an install is worth ~$0.95 and no paid channel clears it.

---

## 10. Getting the build there

`eas.json`'s `submit.production` now names a track:

```json
"submit": {
  "production": {
    "android": { "track": "internal", "releaseStatus": "completed" }
  }
}
```

**`internal`, not `production`.** Internal testing is available to its testers within
minutes and skips the review queue, which is what you want a command to do
unattended. Promotion to production is a decision, and it stays a button somebody
presses in Play Console — the same argument `bin/deploy.sh` makes for not running
`eas submit` after a build: an artifact costs a queue slot, a release reaches real
installs.

**The key is named by path, and the file is gitignored.** Storing it on EAS instead
would be tidier — that is the rule `.gitignore` states for the Firebase key — but the
only way to put it there is `eas credentials -p android`, an interactive TUI, and it
failed here. `eas submit` on 22.2.0 has no key-path flag, so the remaining route is
`serviceAccountKeyPath` in this file. `play-service-account.json` is ignored in both
the repo root and `apps/mobile/`, and nothing reads it at build time — only submit.

### The key does not exist yet

Checked against EAS on 2026-08-24: `com.daysofar.app` has Android credentials (the
upload keystore) but `googleServiceAccountKeyForSubmissions` is empty. Until that is
fixed, `eas submit` will stop and ask for one.

Drive it from Play Console rather than from Google Cloud — the console links the two
projects for you, and doing it the other way round leaves an account GCP knows about
and Play does not:

1. Play Console → **Setup → API access**. Link a Google Cloud project if it asks.
2. **Create new service account** — the link takes you to Google Cloud Console.
3. There: **Create service account**, give it a name, and skip the optional roles.
   None are needed; the permission that matters is granted back in Play.
4. On that account: **Keys → Add key → Create new key → JSON**. That download is the
   secret.
5. Back in Play Console → **API access** → the account now appears → **Grant access**.
   Under *Releases* tick **Release to testing tracks**; add *Release to production*
   only when you want one command to be able to reach real installs. Then **Invite
   user**.
6. Save the downloaded JSON as `apps/mobile/play-service-account.json`. That is the
   path `eas.json` already names, and it is gitignored. (If `eas credentials -p android`
   works for you, uploading it to EAS instead is better — then delete both the file and
   the `serviceAccountKeyPath` line.)

Then the whole path is:

```bash
eas build --platform android --profile production
eas submit --platform android --profile production --latest
```

**Propagation is not instant.** A newly granted service account is commonly refused by
the Publishing API for a few minutes to a few hours after step 3. A first submit that
fails on permissions is usually this, not a wrong key.
