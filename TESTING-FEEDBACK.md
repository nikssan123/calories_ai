# Closed testing feedback

Reports from the Play closed testing trial — the 12-testers-for-14-days run that a
personal developer account has to pass before it can apply for production. See
[PLAY_LISTING.md](PLAY_LISTING.md) §"The closed track" for the release path itself.

One section per report. A report stays here after it is fixed, because the useful
part is usually not the bug — it is what the bug says about a decision that looked
finished and was not.

---

## 1. Half the app is still in English · 2026-08-25

**Reported:** "there are a lot and I mean a lot of places where the copy is not
translated."

**Status:** fixed — web and mobile. The transactional mail is still English; see
"What is still English" below.

### What was actually true

The i18n machinery was never the problem, and neither were the catalogues. Five
languages, a compiler-enforced completeness check, and every key present in every
language — `pnpm -r typecheck` will not build otherwise.

The gap was the **call sites**. `built-plans/LANGUAGES.md` closed with a section
called "What is not done" that said so in as many words: 113 of 137 keys wired,
and a named list of screens that "still render English strings from source".

That list was written as a to-do. What a tester on a Bulgarian phone experienced
was the tab bar in Bulgarian, Today in Bulgarian, then Cook, Progress and
Exercise in English — which reads worse than an app that never claimed to speak
your language at all. A half-translated app is not 50% of a translated one.

### What changed

**607 keys per language on web, 747 on mobile**, five languages each: 6,770
messages, all of them rendering. Cook and both recipe pages, the kitchen
dialogs, Progress, the diet-quality card, the weekly review, Exercise, the
workout list and card, Plan and the shopping list, the barcode scanner, the food
editor, repeat-a-meal, the day rail, the journal's status verbs, reset and
unsubscribe on web, and the whole paywall on mobile.

Four things in there were not just typing, and are written up properly in
LANGUAGES.md under "What the string pass actually took":

- **Plurals now include the case where the noun travels without its number.**
  The paywall says "That's your 20 free messages" — a word between the count and
  the noun — so `pluralWord()` joins `plural()` in `shared/locale.ts`. What it
  replaced was `Record<MeterName, [string, string]>`: a singular and a plural per
  meter, which is English's answer to plurals and nobody else's.
- **Three lists of English words became `Intl` calls.** `WEEKDAY_NAMES` (seven
  strings, shortened with `.slice(0, 3)` — three letters is English's
  abbreviation and nobody else's), `listWords` (a hardcoded "and"), and
  `untilWords` (whose vagueness lived in English adjectives). They are
  `Intl.DateTimeFormat`, `Intl.ListFormat` and `Intl.RelativeTimeFormat` now, so
  a sixth language costs nothing there.
- **The journal's status verbs lost their object.** `toolLabel` turned
  `log_food` into "Logging food" by appending the rest of the tool name, so a
  Bulgarian session read "Записвам food". Not fixed with a second table of
  twenty nouns — the whole argument for keying on the verb was that a table of
  every tool name goes stale — but by dropping the object, which was carrying
  almost nothing.
- **Six `.toLocaleString()` calls had no locale**, so they followed the runtime's
  rather than the reader's, and two `.toUpperCase()` calls had none either.

### What is still English

- **The transactional mail** — confirm, reset, password-changed, new-sign-in,
  deleted. ~800 words in `email/templates.ts` and `email/layout.ts`, still served
  by `pluralEn()`. The weekly review is translated; these are not. This is the
  one item from the original report that is not closed.
- **Food names.** "кюфте" logged is "кюфте" listed. It is what they will search for.
- **Numbers and units.** `kcal`, `g`, `kg` are the same everywhere. Only the
  thousands separator moves, via `formatNumber`.
- **Privacy and Terms.** A dictionary translation of a document somebody may have
  to rely on is worse than an English one they can read.
- **The landing page.** Deferred deliberately — it needs `[locale]` routing,
  `hreflang` and a sitemap, none of which this app has. Testers arrive from a Play
  listing, not from the web, so it is not on the path this trial exercises.
- **The admin panel.** One operator, who wrote it.
- **"Free", "Plus" and "Coach".** What the stores charge for. A screen that
  renames the thing the receipt names is a support ticket.

### The lesson worth keeping

LANGUAGES.md ended with "the second language is where the habit either sticks or
quietly rots", and then the habit rotted in the same release — not through
carelessness, but because the completeness check only ever looked at one half of
the problem. The compiler proves every catalogue has every key. Nothing proved
every string goes through a catalogue.

Half of that gap is now closed by `pnpm messages`, which calls every message in
every language and fails on anything that throws, returns a non-string, prints
`undefined`, or silently drops an argument. A message that takes two arguments
and interpolates one typechecks perfectly; that check catches it.

The other half is still open, and it is the one that would have caught this
report: a lint that fails on a bare string literal in JSX under `apps/web` and
`apps/mobile`, with an allowlist for the deliberate cases above. Until it exists,
"is it translated" is a thing somebody has to remember.

---

## 2. Setup never asks which language · 2026-08-25

**Reported:** "Ask for language during setup."

**Status:** fixed — API and mobile.

### What was actually true

The setup conversation asks for sex, date of birth, height, goal, activity level
and metric-or-imperial. It never mentioned language, and it is the only screen a
new account sees. Both places that *can* set the language — the picker on the
sign-in screen and the row in the You tab — are places somebody arrives at either
before they are paying attention or long after this decision was made for them.

`missingProfileFields()` is both the list of what setup collects and the test for
when setup is over. Units are on it for a reason spelled out in a comment above
it: left off, the conversation would end the moment a target could be computed
and hand somebody in Ohio a number in kilos. Language is the same argument with
more riding on it, and it was not on the list.

Two paths also left `locale` null and therefore English:

- **Google sign-up.** `identities.ts` called `createAccount` without a locale at
  all, while the password path beside it sent one. Every Google account started
  in English whatever the phone was set to.
- **A device language this app does not speak.** Null is the honest answer there,
  and English is the fallback — but nothing ever asked the person whether one of
  the other four would suit them better.

`localeOf()` resolves null to English and `languageBrief()` says nothing for
English, so a null locale is indistinguishable from a deliberate choice of
English by the time the model sees it. Nobody was ever going to find this by
reading the prompt.

### What changed

- `missingProfileFields()` now asks *which language they read* when `locale` is
  null, which also means setup cannot end without it.
- The onboarding brief raises language in the opening message, in one clause, in
  whatever language it is already writing — naming all five in their own names.
  Two shapes, decided by what is known: an **offer** when the account already
  reads something ("They are reading in German… drop it the moment they show no
  interest"), a real **question** when nobody has ever been told. Answering by
  simply writing in Bulgarian counts, and switches the same reply rather than the
  next one.
- The Google callback reads `Accept-Language` off the browser that ran the
  consent screen — on a phone that is the system browser, reporting the device's
  language. It is the same signal the native client sends, arriving by the only
  route that flow has.
- `PATCH /profile` now decides "is this account onboarded" from
  `missingProfileFields()` rather than from a second inline copy of the list. The
  copy had already drifted: it never checked activity level, so the form could
  mark an account complete while the journal was still asking for it.

### The lesson worth keeping

A preference with a sensible default is exactly the kind of thing that never gets
asked, because nothing breaks when it is wrong — it just quietly serves the wrong
person. `units` was given a seat on the missing-fields list for that reason and
`locale` was not, in the same release that shipped five languages.

---

## 3. Onboarding can be walked away from · 2026-08-25

**Reported:** "users can just skip the onboarding conversation and just start
logging calories and uploading photos which is wrong"

**Status:** fixed — mobile. The web still has it; see below.

### What was actually true

A new account opens on the journal and the agent starts setup by itself. Nothing
held anyone there. Tap Today, Cook, Progress or Exercise and the app worked: food
logged, photos uploaded, the day filled up.

Every target on those screens is a generic default until the profile is complete
— a calorie figure computed for nobody in particular. So the app was quietly
lying on four screens at once: Today drew a ring against it, Progress plotted a
line against it, Cook planned meals to it. The only thing in the product that
said so was one grey sentence on the journal's status bar, which is the screen
somebody who skipped setup had already left. That sentence was also hardcoded
English — see §1.

The second cost is the first impression. The opening turn is where somebody
decides what the app is *for*, and a tester who walks past it comes away thinking
it is a food diary that happens to have a chat tab.

### What changed — the deferred gate

Three options were on the table. A **hard gate** (nothing but the journal until
setup is finished) is truthful and is the most likely thing to make somebody
uninstall on their first screen. A **soft gate** (label the placeholders, block
nothing) is honest and easy to ignore. What shipped is between them:

- Until setup is finished **or** something has been logged, the tab bar offers
  the journal and You. The other four are screens about data that does not exist
  yet, drawn against a number calculated for nobody.
- The moment a meal is logged without setup being finished, all six come back —
  with a banner at the top of Today, Progress, Exercise and Cook reading "These
  numbers are placeholders. Finish setting up in the journal.", which is a link
  back to the conversation.
- The journal picks setup back up on the next turn. The brief has told it to do
  exactly that since it was written: answer the food first, then ask one thing.

Somebody who photographs their lunch instead of answering questions has told you
what they came for, and the answer to that is to get out of the way — with the
numbers labelled — rather than to keep the door shut.

**You stays reachable throughout**, which is not a compromise. It holds the
language picker, sign-out, delete-account and a form that can finish setup by
hand for somebody who would rather not be asked. A new account penned on a single
screen with no way off it is not a gate, it is a trap, and this ships into the
week people are deciding whether to keep the app.

Mechanically: `/onboarding` gained `logged` (has this account ever logged food —
weight deliberately does not count, since setup itself records a weight), and the
state moved out of the journal screen into `lib/onboarding.tsx` where the tab bar
can also read it. That relocation *is* the fix in miniature: the journal knew the
profile was half empty, and the five screens rendering targets off it did not.

### Not covered

The web has the same hole — `Journal.tsx` reads `/onboarding` and the sidebar
does not. The trial is on Play, so the phone was fixed first; the web wants the
same two pieces (a gated nav, the same banner over anything showing a target).

---

## 4. The test card was accepted and nothing happened · 2026-08-25

**Reported:** "clicked on get a plan and they said they got accepted a test card".

**Status:** fixed — server. The symptom stays, and is now the intended
behaviour; the hole behind it was something else entirely.

### What was actually true

Two separate things, and only one of them is what the tester saw.

**The test card is not a bug.** A Google account on the **License testing** list
in Play Console gets "Test card, always approves" and "You will not be charged"
on every purchase sheet, for every app on the developer account, on every track
including production. It is not a property of the closed track — a closed tester
who is *not* on that list pays real money. Somebody had put the trial's testers
on it, which is the reasonable thing to do and also means the trial produces no
revenue signal at all.

**What was a bug is that the deployment would have honoured the purchase.**
`env.ts` computes it as:

```ts
acceptSandbox: source.BILLING_ACCEPT_SANDBOX === 'true' || source.NODE_ENV !== 'production'
```

The host's `.env` said `BILLING_ACCEPT_SANDBOX=true`, left over from proving the
webhook end to end on 2026-08-24 and never put back. But the flag was not even
load-bearing: **the api service never set `NODE_ENV`**, so the fallback clause
was true on its own and the deployment accepted sandbox purchases whatever the
flag said. The comment beside `BILLING_ACCEPT_SANDBOX` in `docker-compose.prod.yml`
has claimed "off in production by default" since it was written, and nothing in
that file ever supplied the variable the default is read from.

A free test purchase therefore bought a real Coach plan on the production
database, for anybody on a list whose entire purpose is that purchases from it
cost nothing.

The scale of it is in the ledger: **all 13 rows in `billing_events` are
`SANDBOX`**, every one from the 2026-08-24 device test. Not one real purchase has
ever reached this deployment, and nothing anywhere said so — which is the same
shape as the scheduled-review leak in `SUBSCRIPTIONS.md`, an entitlement that
looked enforced because the one path anybody watched was the one that worked.

The tester's own purchase, incidentally, never arrived: no `POST
/billing/revenuecat` in the twelve hours around it, no webhook auth failures, and
their account still `free`. Whether they finished the sheet or backed out of it
is a question for RevenueCat's customer history, not for us.

### What changed

- **`NODE_ENV: production` on the api service** (`docker-compose.prod.yml`), which
  is the line that makes the documented default real. `NODE_ENV` is read in
  exactly two places in the API — `isTest`, and this — so it changes nothing else.
- **`BILLING_ACCEPT_SANDBOX=false`** in the host's `.env`, and the api container
  recreated to pick both up.
- Verified against the live endpoint rather than by reading the code: a signed
  `SANDBOX` event now answers `{"ok":true,"applied":false,"reason":"wrong_environment"}`,
  writes no row, and grants no plan.

What a license tester sees from here is the sheet accepting the test card, then
ten seconds of polling in `awaitPlan` (`apps/mobile/lib/billing.ts`), then a
failure. That is the system working. To let a tester actually buy, take them off
the license testing list — it propagates in minutes and Play caches it, so they
should force-stop the Play Store app before retrying. To re-verify the webhook
loop from a tester account, set the flag true for the length of the test and put
it back; never leave it true.

### The lesson worth keeping

A default that exists only as the second half of an `||` is a default nobody
supplies. Written as `NODE_ENV !== 'production'` it reads like a safe fallback and
behaves like an open door, because the variable it turns on was never in the
compose file — and the comment two lines below it asserted the safe reading for
months without anything making it true. The invariant was documented and unowned.

The tell was there to be read: a `billing_events` table in which *every* row is
`SANDBOX` is either a product with no customers or a guard that is not running,
and both are worth an alert. `SUBSCRIPTIONS.md` insists the one lane with no
invoice must not also be the one lane with no numbers. The numbers were written
down faithfully. Nobody was looking at them.

### Not covered

- Nothing measures this. The webhook logs `reason` at info and that is the whole
  instrumentation; a guard that starts refusing every purchase looks exactly like
  a product nobody is buying.
- The web has no paywall to buy from at all, so none of this is testable there —
  the same "the trial is on Play, so the phone was fixed first" as §3.

---

## 5. The first message is a brochure · 2026-08-25

**Reported:** "The initial onboarding message respond of the ai is too long and
boring — it used to be better."

**Status:** fixed — API.

### What was actually true

It used to be better, and there are commits for when it stopped being. Three
separate edits gave the opening message another job, every one of them a fix for
something real, and not one of them said how long it had to do all of it in:

- **40aff72** — the opening sentence must "reach past logging", because the only
  description of the app anywhere in the product described a food log (the same
  gap §1 of `prompt.test.ts` calls "knows it is more than a calorie logger").
- **057acd0** — metric-or-imperial rides on the first question as a clause,
  rather than being a question of its own.
- **1662b90** — language goes in the opening message too, naming all five in
  their own names. That is §2 above, fixed earlier the same day.

Each clause was bought honestly. Nothing was ever taken out to pay for them, and
nothing capped the total, so the first thing a new account read had become a
product tour with a question stapled to the end. Reproduced against
`claude-opus-5` at high effort — the model `setup` actually runs on — with a
fresh English profile:

> Welcome — glad you're here. I'm your food-and-training log, but the useful part
> is that it's all one conversation: you tell me what you ate in whatever words
> come naturally, and I'll also keep track of what's in your kitchen, save your
> recipes, plan a week of dinners with the shopping list that follows, and record
> your gym sessions. (I can do all this in Български, Deutsch, Español or Français
> too, if any of those would suit you better than English.)
>
> To give you a calorie target that actually means something rather than the
> generic one sitting there now, I need a handful of basics. Let's start with two:
> how tall are you, and roughly what do you weigh at the moment? Kilos and
> centimetres, or pounds and feet — whichever you think in.

**135 words, two paragraphs**, and the same shape on every sample: an inventory
sentence, a parenthesis about languages, then a sentence explaining why it is
about to ask a question, then the question. The Bulgarian opening ran 107. The
crush also produced its own small bug — one sample offered four languages with
"if **either** of those would suit you" — which is what a clause looks like when
it is being asked to carry more than it can.

Note what is *not* in that message: nothing about the person. It is the app
talking about the app, which is the definition of boring, and "brochure" is the
right word for it — it reads like something written to be published rather than
said to somebody.

### What changed

All of it in `onboardingPrompt`, which is the whole of setup mode:

- **A hard cap: about forty words, never more than sixty.** Three parts and no
  fourth — hello and what you do, the language clause, one question. Stated as a
  cap rather than a preference, because the three edits above are evidence that
  the next feature wanting a clause in the first message will also get one.
- **The capability sentence gestures instead of listing.** Two things beyond
  logging, a few words each, and an explicit line that this is *not* the "what
  can you do" answer — nobody has asked yet, and an inventory in the first
  message reads as marketing and gets skimmed like it.
- **No sentence justifying the questions.** The model wrote one every single
  time ("to give you a target that actually means something rather than the
  generic one sitting there now") because the brief explained the generic-default
  problem to it and never said not to pass it on. Just ask.
- **The language clause names only the languages it is not already writing in.**
  Offering somebody the language they are currently reading is noise, and it was
  costing a word out of a budget that now has one.
- **The budget extends past the first message** — two or three sentences per
  setup turn, one question, and no reading the collected fields back.

After, same model and profile, three samples: **62, 56 and 45 words** in English,
**36 and 44** in Bulgarian, all of them one short paragraph and one question, with
the language list correct in both directions. A test in `prompt.test.ts` locks
the cap and the no-inventory line.

### The lesson worth keeping

A prompt has no line budget the way a screen has a pixel budget. Adding a
sentence to it is free to write, invisible in review, and lands in full on the
one message the entire product gets judged by — so three good fixes composed into
a bad first impression without any of them being wrong. The instruction that was
missing was never "say less about the kitchen"; it was a number.

And the specific sequencing is worth keeping in view: **§2's fix is what broke
this**, hours earlier, in the same day's work off the same trial. A clause in the
opening message is not free, and the report that asks for one should be read
alongside the space it has to come out of.

### Not covered

- Nothing measures the length of what the model actually writes. The cap is
  words in a prompt and a `toMatch` on the prompt text — not an assertion about
  output. What would catch the next regression is an eval that generates the
  opening turn and counts, which is also what the photo work in `prompt.ts`
  already has a harness shape for.
- The per-turn budget for the *rest* of setup is stated but unmeasured: the
  throwaway harness had no tools wired, so a second turn had nothing real to call
  and the sample was worthless. The opening is the measured claim.

---

## 6. The journal cannot edit an exercise · 2026-08-26

**Reported:** "I wanted to use the journal to edit an exercise that was logged
but it totally didn't understand — there is no way to edit an exercise even
manually."

**Status:** fixed — a tool for the model, an Edit affordance on both screens
that list a session, and a deletion that says what it deleted. The model-switch
finding at the end is diagnosed and left alone.

### The transcript

`nikssan123@gmail.com`, session `419c30ed`, all four turns inside ninety seconds:

| Time (UTC) | Who | What |
| --- | --- | --- |
| 10:37:40 | user | "Adjust my full body workout logged for today - only 1 shoulder exercise, only 1 biceps and no legs" |
| 10:37:40 | model | asks for the full exercise list, with sets and reps |
| 10:37:58 | user | "It is already logged" |
| 10:37:58 | model | asks for the full exercise list again |
| 10:38:34 | user | "Just remove 1 of the exercises as I logged 2 - I did shoulder extensions and biceps curls only" |
| 10:38:34 | model | asks for sets and reps |
| 10:38:59 | user | "3 sets - 10 reps" |
| 10:38:59 | model | "Done." — `delete_entry` on the session, then `log_workout` for a new one |

Twice asked to retype a workout the app already had, and then the app deleted it.

### What was actually true

The model was not confused about what the user meant. It has no tool that can
change a logged session, so the only thing it can do with "remove one exercise"
is delete the session and log a replacement — and to log a replacement it has to
be told the whole thing again. Every question it asked was the correct question
for the only tool it had.

**There is no `update_exercise_entry`.** `tools.ts` has `update_food_entry`
(`apps/api/src/ai/tools.ts:444`), whose description says in as many words: "Use
this instead of logging a compensating second entry." Exercise has `log_exercise`,
`log_workout`, and `delete_entry`. Nothing else. `prompt.ts:136` tells the model
to correct food with `update_food_entry`; there is no equivalent sentence for
exercise, because there is no tool to name.

**The endpoint it needed already exists.** `PATCH /entries/exercise/:id`
(`routes/index.ts:620`) calls `updateWorkout` (`services/workouts.ts:181`), which
replaces the exercise and set list on an existing entry and redraws the receipt
in the conversation. It has its own test block (`test/workouts.test.ts:219`, eight
cases). No AI tool wraps it.

**The manual path is one screen deep and unreachable from the log.** The only
Edit affordance for a logged session is on the exercise card *inside a chat
message* (`apps/mobile/components/ChatCard.tsx:880`, web `ChatCard.tsx:739`),
which opens `WorkoutCard` in editing mode and PATCHes. The two places a session
is actually listed offer delete and nothing else — Today
(`app/(tabs)/today.tsx:508`, swipe or trash) and the Exercise tab
(`app/(tabs)/exercise.tsx:220`, swipe or trash). Neither lists the sets, so you
cannot even see what is in the session you are being asked to delete.

This session was logged from the Exercise tab against the "Full body" routine, so
no chat card ever existed for it. There was no Edit link anywhere in the product
for that entry. The tester's "no way to edit an exercise even manually" is exactly
right.

And the comment explaining why is `today.tsx:504`:

> Exercise has no expand-to-edit affordance the way food does — there are no
> items under it — so the burn is corrected in the journal and removed here.

The journal is where it sends you, and the journal has no tool for it. Two
half-built paths, each written assuming the other one covered it.

### What it cost

Entry `e216fa67` — "Full body", 8 exercises, 26 sets, every load recorded (Chest
fly 3×10 @30kg, Leg press, Bench press, Bicep curl, Tricep extension 6×10 @35kg,
Lat pulldown, Seated row, Lateral raise) — was deleted at 10:38:59 and replaced by
`868bfb54`: two exercises, six sets, **no loads at all**, carrying the deleted
session's 78 minutes and therefore its identical 574 kcal burn. The number on the
card did not move; the training history underneath it was gone.

The tester deleted that too and re-logged the whole session by hand from the
Exercise tab at 10:40:51. Both ids are absent from `exercise_entries` now; the
surviving entry is the one they retyped.

### One more bug found on the way

**An exercise deletion reported itself as a food deletion.** `delete_entry`
pushed `kind: 'food_deleted'` whatever it deleted — there was no
`exercise_deleted` in the `ChatAction` enum — and it read the entry's name only
on the food branch. So the chip in this transcript reads **"Removed entry"**, in
destructive red, with no name. The one thing a user needs from a deletion
receipt is which thing went, and a workout was the only kind of entry that never
said.

What is *not* broken, checked because it looked like it would be: the card left
in the journal at 10:38:59 does not offer Edit on the entry it lost.
`deleteExerciseEntry` already calls `markEntryRemoved` (`services/log.ts:529`),
the stored action carries `removed: true`, and both clients draw that card faded
and `pointer-events: none`. The strike mechanism was built for exactly this and
it works.

### The model switched mid-conversation, on the turn that mattered

From `ai_usage`, the same four turns:

| Time | Model | cache read | cache write | Cost |
| --- | --- | --- | --- | --- |
| 10:37:40 | sonnet-5 | 54,458 | 922 | $0.0280 |
| 10:37:58 | sonnet-5 | 27,848 | 877 | $0.0187 |
| 10:38:34 | **haiku-4-5** | **0** | **22,996** | **$0.0487** |
| 10:38:59 | haiku-4-5 | 46,970 | 1,640 | $0.0113 |

The escalation in `language.ts` samples the last 600 characters of *user* turns
(`SAMPLE_LIMIT`, `language.ts:98`). This account writes Bulgarian, so it starts on
Sonnet; four English turns pushed the Bulgarian out of the window mid-thread and
it dropped to Haiku. The switch threw away a warm prompt cache and paid a full
cold 1-hour cache write, which made the cheapest model the **most expensive turn
in the conversation** — more than either Sonnet turn — and it landed precisely on
the turn that read "remove 1 of the exercises" and logged a new workout instead.

The routing table is right about which model suits a text log. What nobody costed
is the *switch*: ~$0.03 of cache write per flip, and a flip is one turn of English
away for every bilingual account.

### What changed

- **`update_workout`**, wrapping the service that was already there. The model
  reads the session with `get_day` and sends the corrected exercise list back;
  the entry id survives, and with it the journal card, the routine link and the
  training history. It shares its schema with `log_workout` — one form, filled
  in twice — because a correction that could not express something the log could
  would send the model straight back to deleting and re-logging.
- **The prompt says so.** "Which exercise tool" is five now, not four, and the
  Corrections section names `update_workout` beside `update_food_entry` with the
  thing both of them need said: they replace what they are given, so read the
  entry first and send back everything that stays.
- **`exercise_updated` and `exercise_deleted` action kinds**, and `delete_entry`
  now reads the entry on both branches, so the chip says *"Removed Full body"*.
  `isDeletion()` in `@ct/shared` replaces the four separate `=== 'food_deleted'`
  tests that were correct only while a deleted workout called itself that.
- **The exercise row opens, on all four screens that list one.** Today and the
  Exercise tab, web and mobile: a counted session expands onto its sets — which
  is the answer to "what did I actually log?", and until now only the receipt in
  the chat gave it — and offers Edit, which reopens the same `WorkoutCard` the
  journal already reopens. A session with no sets is delete-only exactly as
  before: a run's record is a sentence and a distance, and handing that to a form
  built for exercises and loads would turn it into an empty strength session.

Five tests: four on `update_workout` (rewrites in place rather than adding a
second row, announces itself as a correction, leaves the session on the day it
was already on, errors usefully on a bad id) and one on the deletion naming what
it deleted.

### What is still open

**Pin the model for the life of a conversation**, or at minimum let the sample
window keep what it has already decided about an account's language. Left alone
deliberately: it changes the routing economics for every bilingual account and
deserves its own measurement, not a fix smuggled in beside this one.

### The lesson worth keeping

Every piece of editing a workout was built and tested — service, route, editor,
card. It was reachable from exactly one surface: the receipt the chat leaves
behind. Anything logged outside the chat produced a record that no path in the
product could change, and the code comment that explains the missing affordance
points at the journal, which is the one place with no tool for it.

The tester read this as "it totally didn't understand." The model understood
perfectly and had nothing to reach for — which is what a missing tool looks like
from the outside, and why "the AI got confused" is worth checking against the tool
list before it is believed.

### Not covered

- **A described activity still cannot be edited at all.** "5km run" has a
  description, a duration, a distance and a burn, and no endpoint takes those —
  `PATCH /entries/exercise/:id` is workout-shaped, so the Edit affordance is
  gated on a session having sets. Delete-and-relog remains the only correction
  for a run, which is the same shape of hole this report is about, one size
  smaller.
- The burn arithmetic after an edit. `updateWorkout` recomputes from bodyweight
  and time, so a session edited down to two exercises keeps whatever duration it
  was given — which is how 574 kcal survived losing six exercises. Correct by the
  formula, wrong-looking on the card.
- Whether the same hole exists for weight entries. `log_weight` upserts on the
  day, so a correction is a re-log; nobody has reported it.
