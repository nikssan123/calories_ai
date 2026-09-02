# App Store listing

Written 2026-08-31, revised 2026-09-03 (§6 §7 §8). The Apple counterpart to
`PLAY_LISTING.md`, which stays the source of truth for positioning, for the
truthfulness rule, and for what the app can and cannot claim.

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

The pricing paragraph was **dropped** when this was written, because the products
did not exist and describing purchases you cannot make is the kind of thing App
Review rejects. That reasoning expired when the catalogue was created, and the
opposite is now true: **§8 puts a pricing block back at the end of the
description, because 3.1.2 requires one.**

## 7. State of the submission

**Revised 2026-09-03.** Everything this section listed as missing on 2026-08-31
now exists. Kept as a section rather than deleted, because what it tracks — the
things that block a submission and are not code — is exactly what the next
rejection will be about.

### Done

- **The in-app purchase catalogue exists** and was accepted by App Review; the
  items sit at *Ready for Review*. Seven products, all priced in
  `apps/api/src/services/plans.ts`:

  | Product | id suffix | Price |
  |---|---|---|
  | Plus, monthly | `plus.monthly` | $9.99 |
  | Plus, annual | `plus.annual` | $99.99 |
  | Coach, monthly | `coach.monthly` | $24.99 |
  | Coach, annual | `coach.annual` | $249.99 |
  | 10 photo scans | `photo_10` | $3.99 |
  | 25 photo scans | `photo_25` | $7.99 |
  | 50 photo scans | `photo_50` | $13.99 |

  Apple product ids cannot contain a colon, so Play's `plus:monthly` is
  `com.daysofar.app.plus.monthly` here. `planOf` in
  `apps/mobile/lib/billing.ts` matches a tier as a whole *token* rather than as a
  prefix for exactly that reason, and a tier that fails to match is not a loud
  failure — it is simply absent from the paywall.

- **Both agreements are Active.** Free Apps and **Paid Apps**, 31 Aug 2026 –
  31 Aug 2027, with a Bulgarian EUR bank account and both US tax forms active.
  The "Paid Apps Agreement is unsigned" blocker this section opened with in
  August is long gone, which is why the catalogue above could be created at all.

- **Screenshots exist**, in `store/`:

  | Slot | Size | Count |
  |---|---|---|
  | iPhone 6.5"/6.7" | 1284 x 2778 | 6 |
  | iPad 13" | 2064 x 2752 | 6 |

- **The support page exists and is wired up.** `apps/web/app/support/page.tsx`,
  live at `https://daysofar.com/support` (200), and `Support URL` in the console
  already points at it rather than at the bare domain it carried when there was
  nothing better to give it.

### Read off App Store Connect, 2026-09-03

Both of the previous open items are settled, and one of them is a live problem.

- **The catalogue is seven products, and `APP_REVIEW_REPLY.md`'s "eight" was
  right all along.** An earlier revision of this line called that document a
  miscount. It was not — the two numbers count different things, and the
  submission page settles it:

  | Counted as | Items |
  |---|---|
  | Products you can buy | 4 subscriptions + 3 consumables = **7** |
  | Items in a review submission | those 7 + the **subscription group** = **8** |

  *Day So Far membership* appears in `Items Submitted` as its own row of type
  *Subscription Group*, alongside the app version, for **9** items total. So the
  catalogue table below is the right list of products and eight is the right
  count of reviewable items. Neither document was wrong; they were answering
  different questions.

- **EU trader status lives in two places, and only one of them is done.**

  | Where | State |
  |---|---|
  | Business → Compliance → Digital Services Act | Submitted **1 Sep 2026**, 27 EU countries, status **In Review** |
  | App Information → Digital Services Act | *"This developer has identified itself as a **non-trader** for this app."* |

  The account-level submission is the trader *identity* — legal name, address,
  phone — lodged with Apple and being verified. The per-app line is a separate
  declaration about whether this particular app is distributed by a trader, and
  it still says no. Doing the first does not do the second, which is exactly the
  trap: the console shows a green-looking DSA row on the Business page while the
  app itself is still declared non-trader.

  **Non-trader does not survive contact with the paywall.** The app sells four
  auto-renewable subscriptions and three consumables; that is trading, and Apple
  removes apps whose trader status is absent or contradicted from EU storefronts.

  Two things to settle before flipping it, neither of them technical. It cannot
  be flipped until the account-level record leaves *In Review*. And the details
  on file are published on the App Store product page — the address Apple holds
  is `ul. Akad. Metodi Popov 14, et.3, ap. 10, Varna 9000`, which reads as
  residential. A registered business or virtual-office address is the usual
  answer, and it is much easier to set before publication than after.

- **The listing itself is in better shape than §7 assumed.** Everything §4 and §5
  specify is actually entered — the keyword field carries the exact 100-character
  string, promotional text is the 157-character line, description is the full
  3,070. `Support URL` already points at `https://daysofar.com/support`. Build 15
  is attached to version 1.0, and the version is set to release automatically
  once approved.

- **The 3.1.2 cause is confirmed by inspection.** A regex over the live
  description field for `terms|eula|privacy` returns **false**: the copy runs from
  "WHO IT IS FOR" straight to the closing line with no legal block at all. And
  App Information → License Agreement is **Apple's Standard License Agreement**,
  which is precisely the branch Apple's rejection describes — *"if you are using
  the standard Apple Terms of Use (EULA), include a link to the Terms of Use in
  the App Description."* §8 is the fix, unchanged.

## 8. Guideline 3.1.2 — the subscription block the description must carry

**Added after the second rejection, 2026-09-03.** The submission came back on
3.1.2 with a single complaint: the app *"offers auto-renewable subscriptions but
does not include a functional link to the Terms of Use (EULA) in the app metadata
that appears on the app's App Store product page."*

Worth being precise about what was and was not wrong, because the obvious reading
sends you into the app to fix something that is already right:

- **The paywall is compliant.** `apps/mobile/app/upgrade.tsx:509` links both
  Terms and Privacy, from `lib/links.ts`, and both URLs return 200.
- **The product page is not.** The App Description is a separate surface, Apple
  reads it on its own, and it carried neither link.

So this is a metadata edit, in App Store Connect, and it ships without a build.

### What goes at the end of the description

3.1.2 asks for more than the one link the rejection named — title, length, price,
Terms *and* Privacy. Supplying only the link that was complained about invites a
third round on the same guideline, so the whole block goes in:

```
SUBSCRIPTIONS

Day So Far is free to use. Plus and Coach are optional auto-renewable subscriptions.

- Plus - $9.99 per month, or $99.99 per year
- Coach - $24.99 per month, or $249.99 per year

Payment is charged to your Apple Account at confirmation of purchase. A subscription
renews automatically unless it is turned off at least 24 hours before the end of the
current period, and your Apple Account is charged for renewal within 24 hours of the
end of that period. You can manage or cancel a subscription in your Apple Account
settings after purchase.

Terms of Use (EULA): https://daysofar.com/terms
Privacy Policy: https://daysofar.com/privacy
```

The prices are `PRICING` in `apps/api/src/services/plans.ts` and have to be
re-read from it rather than remembered — the tiers were repriced once already,
and a description quoting a superseded number is its own 3.1.2 problem.

**The three photo bundles (§7) are deliberately absent from that block.** 3.1.2's
disclosure rules are about *auto-renewable* subscriptions; `photo_10`, `photo_25`
and `photo_50` are consumables, they do not renew, and there is nothing about
them a reader has to be warned of before buying. Listing them under a heading
that promises automatic renewal would be worse than leaving them out.

### Where it goes

| | |
|---|---|
| Description | App Store Connect → the version → **Description**, appended at the end |
| License Agreement | **App Information → License Agreement**. Apple's standard EULA is fine given the description now links `/terms`; a custom EULA pasted here also satisfies it |

Both, rather than either. The description link is what the rejection asked for;
the License Agreement field is where a reviewer looks next.

### What this does not need

No build, no version bump, no resubmission of the binary — a description edit on
a version already in review can be replied to in App Review with the change made.
That is the whole reason this is worth getting exactly right in one pass.

## 9. Pre-submission sweep, 2026-09-03

Read off the console rather than remembered. Everything below was checked on the
rejected 1.0 before a second submission.

| | State |
|---|---|
| **Description carries the §8 block** | **NO — unchanged at 3,070 chars, no `terms`/`eula`/`privacy` anywhere** |
| Trader status, app level | Trader |
| Trader record, account level | Submitted 1 Sep, 27 countries, **In Review** |
| License Agreement | Apple's Standard |
| Age rating | 9+ across 172 regions; 12+ Vietnam and Brazil |
| App Privacy | Published, 7 data types, policy URL set |
| Support / Marketing URL | `/support` and the bare domain |
| Keywords / promotional text | 100 and 157 characters, both as §4 and §5 specify |
| Screenshots | iPhone 6.5" 6 of 10, iPad 13" 6 of 10 |
| Build | 15, attached to version 1.0 |
| Demo account | `appreview@daysofar.com`, sign-in required ticked |
| Review contact | Name, phone and email all present |
| Pricing and availability | 175 regions, US base, tax category set |
| Catalogue | 4 subscriptions + 3 consumables, all Ready for Review |
| Release | **Manual** |

**One blocker, and it is the one the rejection was about.** Everything else on
the version is in order, which is worth stating plainly because a page this
complete invites a resubmission that fails for the single reason it already
failed for. §8 is not applied yet.

Two things that are not blockers but are new:

- **`Add Labels and Markings` appeared under Digital Services Act** the moment
  the app was declared trader-distributed. It is the EU product-safety (GPSR)
  surface. Software is not normally what it is for, but it is unset and now
  visible, so it is worth a look rather than an assumption.
- **The account-level DSA record is still `In Review`.** The app-level flag is
  set and App Review is a separate process, so this does not hold up a
  submission — but EU distribution depends on the verification landing, and it
  was only filed on 1 September.

## 10. Second submission, 2026-09-03

The §8 block was appended to the description — 3,070 to **3,718** characters, 282
short of the limit — and verified through a reload before submitting rather than
trusted to the editor's own confirmation. The submission moved from *Unresolved
Issues* to **Waiting for Review** with all nine items on it.

Two notes for the next time this happens.

**The editor's save is not the save.** Setting the field and seeing the character
counter update means React took the value; the page still held it as unsaved, and
only the toolbar `Save` turning into a checkmark — and `Update Review` turning
blue beside it — meant the server had it. A navigation attempted in between was
blocked by an unsaved-changes prompt, which is the honest signal and worth not
forcing past.

**`Update Review` is not the submit button.** It opens the submission page. The
button that actually resubmits is `Resubmit to App Review` on that page, and the
submission is only sent when every item's status flips from *Ready for Review* to
*Waiting for Review*.
