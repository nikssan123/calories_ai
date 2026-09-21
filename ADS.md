# Google Ads — Germany, France and the US

Written 2026-09-15. Android only; iOS joins when the App Store listing is live.

Companion to `COMPETITION.md` (§6: distribution is the whole game) and `PLAY_LISTING.md`.
The copy and images are in `store/ads/`, and `node store/tools/check-ad-copy.cjs` holds
them to Google's limits.

**The rule is the listing's rule: an ad claims nothing the app can't do today.** Every line
below is taken from the published `de-DE` / `fr-FR` / `en-GB` store listings rather than
written fresh, so the ad and the page it opens say the same thing. The US lines are the
`en-GB` listing in US spelling.

---

## 1. Why Germany and France

- **Bulgaria is unlikely to pay.** That's the founder's read, and Germany and France are
  much larger markets where paying for an app is normal. Bulgaria stays open, but it isn't
  where the budget goes. (Its campaign ran from 2026-09-13 until it was paused: €13.01
  for 22 installs, **€0.59 each**, CTR 8.5%. On 2026-09-14 its fourteen installs made no
  accounts. That points at onboarding before it says anything about price; see §6.)
- **The wedge still holds.** `COMPETITION.md` picked home-cooked, non-English food because
  a barcode database is weak there. That's as true of Rouladen and blanquette as of kyufte,
  and the incumbents are less entrenched than in the US or UK.
- **Nothing to build first.** German and French listings, screenshots and landing pages
  (`/de`, `/fr`) are already live.

### Why the US too

It's a test, not a bet. The US is MyFitnessPal's, Cal AI's and MacroFactor's home market,
and the most expensive place in the category to buy an install. `COMPETITION.md` §7 also
warns that the field is price-anchored at $30–80/year, and that a general-purpose tracker
at $59.99/year won't sell on its architecture alone. Plus is now $99.99/year. What €5/day
can show is the real CPI and whether American installs turn into accounts, and that's
worth knowing before anyone argues for or against the US from opinion.

## 2. Why Android only

The App Store lookup returns nothing in any country: 1.2.0 is still in review, and EU
distribution also waits on the DSA trader record (`APP_STORE_LISTING.md`). Play has been
live in production in 177 countries since September.

An App campaign also needs no SDK on Android. Linking Play Console to Google Ads
gives Google the install count directly, and the app ships no attribution SDK.

## 3. The three campaigns

One campaign per country, each with its own language's assets. An App campaign can't match
an asset's language to the viewer's, so a mixed-asset campaign would show French lines to
people in Germany.

**DE and FR also target English.** Expats, and people who keep their phone in English, are
a real share of both countries, and leaving them out shrinks an audience that €5 already
struggles to reach. The trade-off: they see the German or French ads, since the campaign
can't switch asset language for them.

All three were created on 2026-09-15 in Google Ads account `994-316-1862` (signed in as
nikssan123@gmail.com; the account also holds the WebWork campaigns), next to the older
`Day So Far - BG - Installs`.

| Setting | `Day So Far - DE - Installs` | `Day So Far - FR - Installs` | `Day So Far - US - Installs` |
|---|---|---|---|
| Campaign ID | `24260141956` | `24254674928` | `24249218637` |
| Type / subtype | App promotion / App installs | same | same |
| App | Android, `com.daysofar.app` | same | same |
| Location | Germany | France | United States |
| Location option | **Presence**: people in, or regularly in, the country | same | same |
| Language | German, English | French, English | English |
| Assets | `de-DE` | `fr-FR` | `en-US` |
| Budget | **€5/day** | **€5/day** | **€5/day** |
| Bidding | Install volume, *All users*, no target CPI | same | same |
| Conversion | *Day So Far: Calorie Counter (Android) installs* (Google Play, linked 2026-09-12) | same | same |
| View-through conversions | Off, as on BG, so the CPI counts only clicks and engaged views | same | same |
| Start date | 16 Sep 2026 | 16 Sep 2026 | 16 Sep 2026 |
| Status | **Paused**: published so the ads go through policy review, then paused straight away | **Paused** | **Paused** |

**€15/day in total (€5 per campaign) is a smoke test, not an optimisation.** Google's
guidance for App campaigns is a daily budget of many times the target CPI. At €5 a
campaign may not leave learning. What it can show is roughly what an install costs in each
country, and whether any country turns installs into accounts. Google's own "typical CPI" hint at
creation was €0.26 (DE), €0.37 (FR) and €0.78 (US).

## 4. Assets

Five headlines (≤ 30) and five descriptions (≤ 90) per language are in
`store/ads/google-app-campaign.json`. There are six images per language:

| File | Size | Screen | Caption (from the listing) |
|---|---|---|---|
| `01-log-landscape.png` | 1200×628 | Journal: a sentence becomes a meal | captions[0] |
| `01-log-square.png` | 1200×1200 | 〃 | 〃 |
| `01-log-portrait.png` | 1200×1500 | 〃 | 〃 |
| `03-today-landscape.png` | 1200×628 | Today: the ring and what's left | captions[2] |
| `03-today-square.png` | 1200×1200 | 〃 (ring only) | 〃 |
| `03-today-portrait.png` | 1200×1500 | 〃 (week strip and ring) | 〃 |

### Video

**FR and BG each carry one video as of 2026-09-21; DE and US still have none.** An App
campaign takes video only from YouTube — the asset picker offers a YouTube URL or the
asset library, never a file upload — so both cuts live on a brand channel created for
this: **Day So Far, `@daysofarapp`** (`UCC1na4h9_l16HMhIpgHIgfg`, under the same
`nikssan123@gmail.com`). Both are **Unlisted**, which is all a video asset needs, and
both were auto-classified as Shorts, being 15 s and vertical.

| Campaign | File | YouTube | Ad group |
|---|---|---|---|
| `Day So Far - FR - Installs` | `content/ads/ad-fr.mp4` | [`KWp3NxGwSWc`](https://www.youtube.com/watch?v=KWp3NxGwSWc) | `206971469184` |
| `Day So Far - BG - Installs` (paused) | `content/ads/ad-bg.mp4` | [`zufuZ8TF5qA`](https://www.youtube.com/watch?v=zufuZ8TF5qA) | `201052750478` |

Both are 1080×1920, 15.0 s, 60 fps, H.264 + AAC, and Google reads them as Vertical (9:16).
Adding the video moved **ad strength from Poor to Average** on both; Google now asks for a
landscape and a square cut to reach Excellent, which is the next asset to make, not a new
film — `scripts/content/ad.mts` renders the same fifteen seconds at another aspect.

The scripts are `content/copy/ad-fr.md` and `content/copy/ad-bg.md`. **The middle nine
seconds of each are still rendered rather than captured** (`ad-fr.md` §2), which
`CONTENT_ENGINE.md` §0 says the hero asset must not be — shooting turns 1 and 2 on a real
account and swapping the capture in is the one thing left.

**Google flags the AI question.** The video picker warns that some regions require ads
using assets created or edited with AI to be labelled. The B-roll under the hook and the
close is generated (`scripts/content/broll.py`), so this is a real declaration to make
before the FR video has run long, not a generic notice.

The DE and US campaigns have no video. Where a campaign has none, Google may build one
from the images instead.

To remake the images, start from the three raw captures `store/tools/capture-shots.sh`
takes per language. Then run:

```sh
COMPOSE_TARGET=ad-landscape                   node store/tools/compose-shot.cjs raw-1.png 01-log-landscape.png "$HEAD" "$SUB"
COMPOSE_TARGET=ad-square   COMPOSE_CARD=wide  node store/tools/compose-shot.cjs raw-1.png 01-log-square.png    "$HEAD" "$SUB"
COMPOSE_TARGET=ad-portrait COMPOSE_CARD=wide  node store/tools/compose-shot.cjs raw-1.png 01-log-portrait.png  "$HEAD" "$SUB"
# Today: skip past the greeting so the ring isn't cut off
COMPOSE_CROP_RAW=590 COMPOSE_TARGET=ad-square   COMPOSE_CARD=wide node store/tools/compose-shot.cjs raw-3.png 03-today-square.png   …
COMPOSE_CROP_RAW=340 COMPOSE_TARGET=ad-portrait COMPOSE_CARD=wide node store/tools/compose-shot.cjs raw-3.png 03-today-portrait.png …
```

## 5. Policy lines the copy keeps

- **No weight-loss promise.** No "lose X kg", no before/after, no bodies, no timelines.
  The product is sold as logging, which is what it is.
- **No superlatives the app can't prove.** No "best", "#1" or "most accurate".
  `COMPETITION.md` says outright that no app in this category is accurate.
- **"Free" goes only on what is free for good.** On Free, sentence logging is a guest day
  plus a 3-day, 9-message trial (`plans.ts`). So *kostenlos* / *gratuit* sits only on the
  barcode scanner, macros and the offline diary. Never write "log by sentence for free".
- **No "!" in headlines.** That's Google's editorial rule, and the checker enforces it.
- **No photo scanning in the copy.** Free gets one photo, ever, so an ad built on
  photo logging would sell the paywall.

## 6. What to measure

| Metric | Where | Why |
|---|---|---|
| Cost per install, per country | Google Ads | Which country, if either, is worth €5 |
| Install → account | Admin panel → **Funnel** tab | The Bulgarian campaign's fourteen installs made no accounts |
| Where the walk stops | Funnel tab, step against step | Welcome, questions, plan, or the sign-up form |
| Trial → paid | Play Console, and Google Play in-app purchase conversions in Google Ads once the link is on | The only number that pays for the ads |

The Funnel tab splits by platform and version, **not by country**. While more than one
campaign runs, it shows DE, FR and US combined, along with any organic installs.

## 7. When to act

- **Day 7 (about €35 per campaign):** a first read, for direction only. Fix anything
  broken, and change nothing that's merely slow.
- **About €70 per campaign (about two weeks at this budget):** decide.
  - If a country's CPI is **more than 2×** the cheapest one's, pause it and move its €5
    to the cheapest.
  - If **20 or more installs** across all campaigns have made **zero accounts**, stop them
    all. The problem is onboarding, not targeting, and more money won't fix it.
  - Keep the ones that are comparable and bring in accounts, and add a video before
    raising any budget.
  - For the US, judge on cost per *account*, not per install. It will cost the most, and
    it only earns its place if Americans convert well enough to cover that.

## 8. Open

- **A native speaker reads the German and French copy before launch.** Nothing here has
  been checked by one. The lines come from the store listings, and nothing records
  whether those were read by a native speaker either. Treat them the way `bg.ts` is
  treated: never calqued, always read.
- **To launch, set each campaign to Enabled.** The start date has passed by then, so
  nothing else needs changing.
- **The US images are the en-GB captures.** They show grams (`~200 g`, `about 300 g`) and
  the date as "Tuesday 15 September". Both read as foreign to an American. A recapture
  with the account set to imperial and a US date format would fix it. The copy doesn't
  mention units.
- **Re-check §5's "free" line whenever the Free plan changes.**
