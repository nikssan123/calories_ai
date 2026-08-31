# Languages

A plate of мусака is not in anybody's food database. A sentence parser does not
care. That advantage has existed since the journal was written — and until this
was built, it sat behind an English tab bar.

This is how the app speaks somebody's own language: what changes, what
deliberately does not, and the one line of it that is genuinely hard.

## The one rule

**Locale is a rendering preference, exactly like `units`.**

It changes what is drawn on a screen and written into an email. It changes
nothing stored, nothing in a tool argument, and nothing about a food name.

`users.locale` is `'en' | 'bg' | 'de' | 'es' | 'fr'`, nullable. Null means
**nobody has asked** — which is not the same as English, and is what lets a
client fall back to the device's language and the journal learn it from how
somebody writes. Everything reads it through `localeOf(profile)`, which resolves
null *and any unrecognised value* to English rather than throwing. The whole
feature is cosmetic and has to fail that way: a row written by a newer deploy
that has since been rolled back must render, not 500.

`units` was the template, and every seam this needed already had one in it:

| Seam | `units` | `locale` |
|---|---|---|
| Column | `users.units` | `users.locale` — `038_locale.sql`, no `CHECK` |
| Schema | `shared/units.ts`, `unitsOf()` | `shared/locale.ts`, `localeOf()` |
| Web | `lib/units.ts` → `useUnits()` | `lib/i18n.ts` → `useT()`, `useLocale()` |
| Mobile | `lib/units.ts` → `useUnits()` | `lib/i18n.ts` → same pair |
| Prompt | `unitsBrief(profile)` | `languageBrief(profile)` beside it |
| Email | `notify.ts` passes `units` | passes `locale` |
| Learned by | `set_profile`'s `units` | `set_profile`'s `locale` |

No `CHECK` constraint on the column, unlike `units`. The set of shipped
languages will change more often than the schema should, and a constraint that
has to be dropped and recreated to add Polish is a migration for nothing. The
Zod enum in `shared/locale.ts` is the real gate.

## What does not get translated

Half the work in a normal i18n project is arguing about this list. Here the
arguments were already won:

- **Food names.** If they wrote "кюфте", the entry is called "кюфте" — it is
  what they will search for and what they will recognise in a list. A `bg`
  locale does not turn a Bulgarian speaker's "chicken breast" into "пилешко";
  they typed English, they meant English.
- **Numbers and units.** `~650 kcal` is the same everywhere. So are `g`, `mg`,
  `kg`. Only the grouping separator moves — `1,240` against `1 240` — which is
  `formatNumber(value, locale)`.
- **Tool arguments.** `log_food`'s fields are an API, not prose. This is in the
  brief for a reason: a model writing Bulgarian will reach for a Bulgarian enum
  value unless told, and `log_food` does not take `"закуска"`.
- **`api/src/time.ts`.** Three `en-GB`s in there are *parsing*, not display —
  `formatToParts` pulling numbers out of an instant so `localPartsFor` can build
  a `YYYY-MM-DD`. A locale flowing into those changes which day a meal counts
  toward. There is a comment on `zoneOffsetMs` saying so, for the next person
  who greps.
- **Privacy and Terms.** Legal text. A dictionary translation of a document
  somebody may have to rely on is worse than an English one they can read. The
  one remaining display `en-GB`, in `LegalPage.tsx`, is that decision.
- **The landing page.** Deferred — see the end.

## The four generations that used to be English

The expensive half already worked: `ai/prompt.ts` tells the model to reply in
the language it was written to in, and `ai/language.ts` escalates Haiku → Sonnet
for the ten languages Haiku writes badly. Someone could log every meal for a
year in Bulgarian and never see an English sentence *in the journal*.

What they saw in English was everything generated without a user sentence in
front of it for that rule to catch. `languageBrief(profile)` — which returns
null for English, because English is what the model does unprompted and a line
confirming it is tokens spent on every turn — is now wired into all four:

- `reviewTaskPrompt` — **the one that mattered.** Monday's review is generated
  from `ReviewStats` with no user prose anywhere near it.
- `nudgeTaskPrompt` — same problem, same fix.
- `recipeTaskPrompt` — a recipe in English for someone who logs in Bulgarian is
  the feature failing at the last step.
- `dayContextPrompt` and `ai/pantry.ts` — belt and braces, and it fixes the bare
  photo with no caption, which had nothing to detect.

`ai/language.ts` needed nothing. `needsCapableModel` reads what the *turn* is
written in, which is the correct signal: somebody whose locale is `bg` but who
types a meal in English gets Haiku, and should.

## The strings

No i18n library. 66 of 79 components under `apps/web` are `'use client'`, the
app is client-rendered behind `<AuthGate>`, and the locale arrives on the profile
from `/me` rather than from the URL. `next-intl`'s server components, `[locale]`
segment and middleware all solve problems this app does not have.

So: `MESSAGES[locale][key]`, a `useT()` hook, and catalogues in TypeScript
rather than JSON so the keys are inferred and a string can carry a comment about
the tone it is going for.

**The completeness check is the compiler.** `MessageKey` is `keyof typeof en`,
every other catalogue is typed `Messages`, and a missing Bulgarian string is a
`pnpm -r typecheck` failure rather than a blank label. `StringKey` narrows that
to the keys whose messages are plain strings, for the tables — the tab bar, the
meal headings — that store a key and resolve it at render.

A message that takes a number is a **function**, not a placeholder in a string.
ICU MessageFormat exists to make interpolation safe inside a string; a function
is already safe, and it typechecks.

**Plurals go through `Intl.PluralRules`**, via `plural(count, forms, locale)` in
`shared/locale.ts`. This replaced a `plural(count, 'day', 'days')` helper in the
email templates that hardcoded English's categories *and* English's vocabulary
— so a Bulgarian review read "5 days logged" in the middle of Bulgarian prose.
Two forms is not a simplification of the problem, it is English's answer to it:
French puts **zero in the singular**, so "0 jour" is correct and no two-form
helper can say so. Polish and Russian have four categories and three; the old
shape could not have been patched into correctness for them at all. Each
language's forms live in that language's own catalogue, so a new one needs no
code — only words.

What is left of the old helper is `pluralEn()`, named for the language it knows
rather than for the job, and used only by the transactional templates that have
not been translated yet.

Three catalogues, not one: `apps/web/messages`, `apps/mobile/messages`, and
`apps/api/src/email/messages.ts`. The apps do not say all the same things — the
phone has a scanner, the web has a sidebar, an email has neither — and the
server cannot import from either app anyway.

## The font problem

**Baloo 2 has no Cyrillic glyphs.** Not a subset Google declines to serve: 0
codepoints in U+0400–04FF in the shipped `.ttf`, against 856 mapped in total.
All 60 Bulgarian letters are missing. Baloo is the display face — the ring's
figure, every heading, the landing headline — so a Bulgarian session would fall
back per glyph to whatever the OS offers, on the largest text on every screen.

**Nunito 900 stands in.** It was already bundled for body text and its 220
Cyrillic glyphs have been shipping since the first build, so Cyrillic costs
approximately nothing: 132 KB for the 900 weight on mobile, and zero on web,
where Google serves each subset behind its own `unicode-range`.

A step heavier than the Latin face on purpose — Nunito's counters are more open,
so at a given weight it reads lighter, and 900 against Baloo's 800 is what makes
the two look like the same amount of ink.

Two places name the Cyrillic display face, and **swapping to Comfortaa is a
change to those two and nothing else**:

- `apps/web/app/globals.css` — `--font-display-cyrillic`, swapped in by
  `:root:lang(bg)`. `<html lang>` is set before paint by `LOCALE_INIT_SCRIPT`
  and maintained by `<LocaleSync>`.
- `apps/mobile/theme/typography.ts` — `DISPLAY_FACES`, read through
  `typeFor(locale)` and the `useType()` hook, which is to the type scale what
  `useColors()` is to the palette.

Two things measured rather than assumed, before committing to Nunito:

- **The leading floor survives.** `DISPLAY_LEADING = 1.15` was derived from
  Baloo's own `hhea` — a 0.524em descender against a 0.602em cap, so 1.126em is
  the shortest line that draws a whole digit. Nunito 900 is 0.353em against
  0.705em, a floor of 1.058em. 1.15 clears both, so nothing crops on iOS.
- **Cap height moves, and it is visible.** Nunito 900's cap is 0.705em against
  Baloo's 0.602em — **17% taller at the same `fontSize`**. A Bulgarian heading
  is optically larger than the English one beside it. Baloo is wider, so the
  overall mass is closer than the number suggests, but this is the thing to look
  at on a real screen before deciding Nunito is the answer. No optical scale is
  applied; it would be one constant in `DISPLAY_FACES` if wanted.

Comfortaa's ceiling is 700 — a step *below* Baloo rather than above — so its
figure will read airier. Worth seeing in the ring before committing.

## The picker

One component per platform, used in exactly two places: the sign-in screen and
Settings.

**Every option is written in its own language.** `LOCALE_NAMES` says
"Български", never "Bulgarian" — a picker that names a language in a language
you cannot read is a picker for somebody who did not need it. It is the only
text in the app that never goes through `useT`. On mobile each option is drawn
in its own script's display face via `typeFor(locale)`, and on web each carries
`lang={locale}`, so the one screen where somebody is looking hard at letterforms
is not the one showing a fallback.

**Past four languages it becomes a menu.** Two or three fit on one line and
cost one tap, which is worth keeping while it is true; five do not. The
threshold is a named `INLINE_LIMIT` inside the component rather than at the two
call sites, so the sign-in screen and Settings can never disagree — and on
mobile the menu is the app's ordinary `<Picker>` sheet, the same control
Activity and Sex already use, so it is a list somebody has already learned.

**On the sign-in screen it is the first control**, pre-filled from
`navigator.language` on web and `Intl.DateTimeFormat().resolvedOptions().locale`
on mobile — no `expo-localization`, because Hermes on this SDK ships full ICU
and `lib/voice.ts` has read the device locale that way for months. For most
people it is already right and costs nothing but the glance that confirms it.

It is there rather than left to Settings because **it is the only picker that
reaches the confirmation email.** That mail goes out during the signup request,
before there is a profile to read a preference off, so signup carries a `locale`
field. Failing that, the server falls back to `Accept-Language`; failing that,
the column stays null and the journal learns it later.

**In Settings it sits above Units**, and both sit above the fields they rewrite,
so changing one visibly redraws what is under it rather than something further
down the page the eye has already left. Choosing there writes twice: the profile
(durable, and what emails are written from) and the local preference (what the
sign-in screen shows next time this device is signed out).

`locale` is deliberately **not** in `missingProfileFields`. A null locale is not
an incomplete profile — it is somebody who has only ever used the app in one
language. Adding it there would re-open onboarding for every existing account.

## The model can set it

`set_profile` takes a `locale` argument, worded like `units`: set it from how
they answer rather than asking twice. Somebody who has logged three meals in
Bulgarian has told you.

This is better than a second detector. `franc` is already in the codebase, but it
answers "is this a language Haiku struggles with" — not "what should the tab bar
say" — and a trigram guess off nine characters is not a thing to rewrite
somebody's UI from.

The client picks it up for free. `adoptProfile` exists because `set_profile` can
change the profile mid-conversation, so saying "говори ми на български" in the
journal re-renders the app in Bulgarian without a round trip.

## Which languages next

**Bulgarian first** because it was the tested case — `ai/language.ts` documents a
measurement run on it, its broken Haiku output is why the escalation exists, and
`users.timezone` defaults to `Europe/Sofia`. Also the harder one, which was the
argument for doing it first: it brought the Cyrillic font problem, and a Latin
language shipped first would have hidden it.

**Then German, Spanish and French.** All three are clean on Haiku, so none of
them costs a Sonnet escalation. All three are fully covered by both faces —
checked in the `cmap` rather than assumed, including `ß`, `œ`, `¿` and the
guillemets — so Baloo stays the display face and they add **zero font bytes**.

Each earned its place differently:

- **German** is the layout stress test. `nav.progress` is "Fortschritt", eleven
  characters against English's five-character "Today", and the widest label the
  tab bar has ever drawn. It is the accurate word and it stays; if it clips, the
  bar's type size is the thing to change. Look at it on a device.
- **Spanish** is the reach. Peninsular where the two Spanishes diverge —
  `meal.lunch` is "Comida", not "Almuerzo" — which is the first string to split
  if a Latin American audience shows up, rather than the whole file.
- **French** is why the plural rewrite happened: zero is singular.

After that a language is one `messages/xx.ts` per app plus one in
`email/messages.ts`. The model needs nothing — `ai/language.ts`'s list already
works. Nunito covers Latin, Cyrillic and Vietnamese; it has **no** CJK, Kana,
Hangul, Arabic, Hebrew, Devanagari or Thai, and only 5 Greek codepoints. Those
scripts mean either accepting the system font — which is what the stack already
degrades to — or bundling a face at 5–20 MB. That is the only decision that
would move the package size meaningfully.

## What is not done

*Updated 2026-08-31, after the transactional mail went through. What follows is
what is still English; everything the earlier drafts listed as "not yet" is
done.*

- **The landing page**, on purpose. It is ~1,000 words of the most carefully
  written copy in the repo, it is rewritten often, and localising it needs the
  `[locale]` routing this deliberately avoided plus `hreflang`, `sitemap.ts` and
  `robots.ts`, none of which exist. Ship the app in Bulgarian, see whether
  anyone arrives, and localise the front door once there is evidence it is the
  door they are trying.
- **Privacy and Terms**, on purpose, for the reason above.
- **The admin panel**, on purpose. One operator, who wrote it.
- **`TIER_NAMES`** — "Free", "Plus", "Coach". These are what the stores charge
  for, and a screen that renames the thing the receipt names is a support
  ticket. `TIER_PITCHES` beside them *is* translated, because that is a
  sentence about the tier rather than its name.

## The mail, finished

*2026-08-31.* The weekly review had been translated since the string pass and
everything else the server sends had not, which is the worst of the three
possible states: a Bulgarian account got Bulgarian prose on Monday and an
English "Confirm your email" on the day it signed up.

Six things had to move, and only the first was the copy:

- **`email/messages.ts` gained the other forty-odd keys** — verify, reset,
  password-changed, new-sign-in, deleted, suspended, restored, and the nudge's
  two words of chrome. Same shape as before: English is the contract, every
  other catalogue is typed `EmailMessages`, and a key added to one and forgotten
  in another fails `pnpm -r typecheck`.
- **`layout.ts` stopped writing sentences.** It had four left — the footer
  tagline, "Don't want these?", "Turn off weekly emails", and "Or paste this
  into your browser" under every button — plus `(on target)` in the week strip's
  plain-text alternative. No template could see them, which is exactly why they
  were the last English in an otherwise Bulgarian message. `EmailContent` now
  carries a required `locale`, which is also what `<html lang>` gets.
- **Every template takes a locale**, and `greeting()` no longer defaults its
  catalogue to English. The default was how a translated template opened in the
  wrong language.
- **`formatWhen` and `formatRange` stopped being `en-GB`.** CLDR supplies the
  join word for four of the five — "в", "um", "à" — so only English needs its
  "at" inserted by hand. Spanish needs a "de" inside a date range that no other
  language wants, so the range's day-and-month is a catalogue entry too.
- **Numbers are grouped by the reader's language.** `round()` was
  `toLocaleString('en-GB')`, which prints 2,320 — a number that reads as two and
  a bit in German. This is the only formatting bug in the set that changes a
  value rather than a register.
- **`pluralEn()` is gone.** It was correct only for the templates that were
  still English, and there are none.

The one thing that needed a decision rather than a translation: **nothing
addressed to the reader may be gendered.** The server knows a display name and
nothing else, so "Welcome", "you have been signed out" and "if it was you" had
to be written in Bulgarian, Spanish and French as sentences that do not inflect
for the reader. That is why the Bulgarian confirmation says "Радваме се, че си
тук" rather than "Добре дошъл", and it is a rule the next language inherits.

The receipt for a deletion is the awkward one, and stays awkward: it is written
after the row it would read a locale off is gone, so both callers read the
locale beside the address, before the delete. `AdminUser` carries `locale` for
exactly that.

## What the string pass actually took

The catalogues were never the hard part and the compiler had been guarding the
wrong half. `MessageKey` proves every catalogue has every key; nothing proved
every string went through a catalogue, and by 2026-08-25 the untranslated call
sites were most of the app — Cook, Progress, Exercise, Plan, the scanner, the
food editor, the paywall and the journal's own status verbs.

**607 keys per language on web, 747 on mobile**, five languages each: 6,770
messages. Worth writing down are the four that were not just typing.

**Plurals are `Intl.PluralRules` everywhere now, including where the noun
travels alone.** `plural()` returns "20 messages", which is right wherever the
count and the noun sit together. The paywall separates them — "That's your 20
free messages" puts a word between — so `pluralWord()` was added beside it,
returning the agreeing noun without the formatting. The old `NOUNS: Record<
MeterName, [string, string]>` in `plan-copy.ts` was a pair of strings per meter,
which is English's answer to plurals and nobody else's.

**Three lists of English words became `Intl` calls.** `WEEKDAY_NAMES` was seven
strings that both Workouts screens shortened with `.slice(0, 3)` — three letters
is English's abbreviation and nobody else's, and `weekdayName(weekday, locale,
style)` now asks `Intl` for `long`, `short` or `narrow`. `listWords` joined with
a hardcoded "and"; `Intl.ListFormat` knows every language's conjunction,
including the "e" Spanish switches to before a word starting in `i`. `untilWords`
carried its vagueness in English adjectives — "in about an hour", "in a few
weeks" — and now carries it in the *unit* instead, rounding to the coarsest one
that still answers the question and handing it to `Intl.RelativeTimeFormat`.

**The tool-status verbs lost their object, and that was the fix.** `toolLabel`
turned `log_food` into "Logging food" by appending the rest of the tool name —
free in English and untranslatable everywhere else, because the object is a raw
identifier. A Bulgarian session read "Записвам food". The answer was not a
second table of twenty nouns: the whole argument for keying on the verb was that
a table of every tool name goes stale. The object was carrying almost nothing —
you know what you just typed — so the label is the verb alone.

**Six `.toLocaleString()` calls with no locale, and two `.toUpperCase()`.** The
first group follows the runtime's locale, which on a server-rendered page is the
container's; they are `formatNumber(value, locale)` now. The second is why
`capitalise` takes a locale: `toUpperCase()` is not the same map in every
language, and Turkish's dotless i is the standard example this app will meet.

**`intlLocale()`, because this app's English is British and CLDR's is not.**
Eleven display sites used to hardcode `en-GB`; when they became one `locale`
parameter, `'en'` started reaching `Intl` bare — and bare `en` is American. So
`formatDay` had been rendering "Wednesday, September 23" under a heading that
says "Fibre" ever since, and `Intl.ListFormat` would have added a serial comma
to "chicken, rice and peppers" the moment `listWords` stopped joining by hand.
One function maps `Locale` → the tag `Intl` should see, `'en'` → `'en-GB'`, and
every `Intl` call in `locale.ts` and `words.ts` goes through it. Deliberately
*not* widening the `Locale` enum: `users.locale` is a column, and a region
subtag only the formatter cares about is not worth a migration.

## The check that was missing

`pnpm messages` evaluates every message in every language and fails on anything
that throws, returns a non-string, prints `undefined`, or silently drops an
argument it was handed. It is the other half of the completeness check:

- `pnpm -r typecheck` proves every catalogue has every key, with the right
  signature.
- `pnpm messages` proves every value *runs* — a message that takes two arguments
  and interpolates one still typechecks, and so does one whose template
  references a parameter that has since been renamed.

Neither of them proves a string goes through a catalogue at all. That is the
lint still worth writing: fail on a bare string literal in JSX under `apps/web`
and `apps/mobile`, with an allowlist for the deliberate cases above. Until it
exists, "is it translated" is a thing somebody has to remember — and the
evidence that nobody does is that this section had to be rewritten.

## What it cost

The standing cost is the honest one: **every new string is now two strings.** The
typecheck catches a missing key, so nothing ships blank — but the app's copy has
a voice, and a machine translation of "Nothing planned" will not have it. Budget
a pass with a tone brief per language, or a person. The second language is where
the habit either sticks or quietly rots.
