# App Store listing

Written 2026-08-31. The Apple counterpart to `PLAY_LISTING.md`, which stays the
source of truth for positioning, for the truthfulness rule, and for what the app
can and cannot claim.

**The same one rule governs every line: nothing is claimed that the app cannot do
today, and nothing the app can do is left out.** Still genuinely absent, and so
absent from the copy: **Health Connect / HealthKit sync** and **a searchable food
catalogue**.

## The account, in identifiers

| | |
|---|---|
| Apple team | `A3Z8QJ5KFF` |
| Apple ID (app) | `6807134161` |
| SKU | `daysofar-ios` |
| Bundle ID | `com.daysofar.app` |
| RevenueCat project | `3db98aed` |
| RevenueCat App Store app | `appd9ad5c955a` |

## 1. Why this is not the Play listing

`PLAY_LISTING.md §1` has the table. The one difference that changes the whole
approach: **Apple does not index the description.** All 4,000 characters of it are
conversion copy and nothing else. What Apple indexes is the **name**, the
**subtitle**, and a separate **100-character keyword field** — and it silently
combines terms across all three, so `calorie` in the name and `log` in the
keywords together rank the app for "calorie log" without either field spending
characters on the phrase.

That inverts the Play discipline. On Play the long description *is* the keyword
field and density is audited. Here, repeating a word costs ranking rather than
buying it, because a duplicate spends characters in a 100-character budget and
buys a combination that already existed.

## 2. Name — 30 characters

```
Day So Far: Calorie Counter
```

27 chars, deliberately identical to the Play title. The reasoning is in
`PLAY_LISTING.md §2` and it survives the move: the title is the heaviest-weighted
field on both stores, `Calorie Counter` is the highest-volume term in the
category, and the brand keeps first position.

Keeping the two stores identical is itself the decision. A brand that renders
differently per store is one that never compounds.

## 3. Subtitle — 30 characters

```
AI food diary & macro tracker
```

29 chars. Indexed, and weighted second only to the name — which makes it the one
field that must not waste a word on something the name already covers.

It carries `food diary` and `macro tracker`, the two highest-volume terms that did
not fit in the title, plus `AI`. On Play, `PLAY_LISTING.md §2` rejected `AI` as a
"crowded, low-intent modifier" *in the title*, where it would have displaced
`Counter`. Here it displaces nothing: the subtitle had two spare characters and
`AI` is the shortest available differentiator.

## 4. Keywords — 100 characters

```
weight,loss,nutrition,barcode,scanner,photo,voice,offline,recipe,meal,plan,protein,carbs,log,journal
```

Exactly 100. Comma-separated with **no spaces** — a space after a comma is a
wasted indexed character, and Apple does not need it.

Every word here is absent from the name and subtitle, which is the whole
discipline: `calorie`, `counter`, `food`, `diary`, `macro`, `tracker` and `ai` are
already indexed and repeating any of them would buy nothing. Singulars only —
Apple stems, so `recipe` covers `recipes`.

What the combinations buy, none of which cost characters here:

| Reads as | Built from |
|---|---|
| weight loss | `weight` + `loss` |
| calorie log / food log | name + `log` |
| food journal | subtitle + `journal` |
| barcode scanner | `barcode` + `scanner` |
| meal plan | `meal` + `plan` |
| photo calorie counter | `photo` + name |
| offline food diary | `offline` + subtitle |

**Nothing unbuilt is in the field.** No `fasting`, no `water`, no `sync`, no
`database` — the last one especially, since not having a database to scroll is the
product's actual argument.

## 5. Promotional text — 170 characters

```
Just say what you ate. Day So Far turns a sentence into calories and macros - no database, no scrolling. Works offline, and in whatever language you cook in.
```

157 chars. Not indexed, and the only field that can be changed **without shipping a
version** — so it is the A/B slot Apple otherwise does not give you, standing in
for the store listing experiments `PLAY_LISTING.md §1` credits Play with.

## 6. Description — 4,000 characters

3,070 used. Adapted from `PLAY_LISTING.md §4` with two changes:

- **No `<b>` tags.** Play renders limited HTML; Apple renders none, and the tags
  would show as literal text. Section headings are plain capitals instead.
- **No keyword density target.** The audit table in `PLAY_LISTING.md §4` does not
  apply. Terms appear where they read naturally and nowhere else.

The pricing paragraph is **dropped entirely** rather than carried over. On Play it
was already flagged as a placeholder pending the monetization decision; here it
would also describe purchases that do not exist yet (§7), which is the kind of
thing App Review rejects.

## 7. What is not done

- **In-app purchases do not exist.** The **Paid Apps Agreement is unsigned**
  (status `New`) and needs legal-entity plus banking and tax details first.
  Until it is signed no product can be created, so the seven products the Play
  catalogue carries have no iOS counterpart. Apple product ids cannot contain a
  colon, so `plus:monthly` becomes `com.daysofar.app.plus.monthly` — the reason is
  in `apps/mobile/lib/billing.ts:180`.
- **EU trader status is unprovided**, and the Digital Services Act requires it
  before the app can be distributed in the EU at all.
- **No screenshots.** 6.5" iPhone is mandatory; the first three are what the
  install sheet shows.
- **No support page.** `Support URL` currently points at `https://daysofar.com`
  because `apps/web` has `/privacy` and `/terms` but no `/support`. Apple expects a
  page a user can actually get help from.
