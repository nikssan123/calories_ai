# Languages

Nothing here is built. This is the plan for showing the whole app in someone's own language,
written down while the shape of it is still clear.

It starts from an unusual position: **the expensive half already works.** `ai/prompt.ts:130`
tells the model to reply in the language it was written to in and to keep to it for the whole
conversation. `ai/language.ts` detects that language and escalates the journal turn from Haiku
to Sonnet when it is one of the ten Haiku writes badly. Someone can log every meal for a year
in Bulgarian today and never see an English sentence in the journal.

What they will see in English is everything around it. The tab bar, the ring's caption, the
setup screen, the confirmation email, and — the one that actually stings — Monday's weekly
review, because a review is generated from statistics with no user message in front of it for
the language rule to catch.

So this is not an internationalisation project in the usual sense. It is a project about the
chrome, and about four background generations that nobody told what language they were in.

`COMPETITION.md` §6 names this as one of three paths that are actually open: *go where the
search box fails — non-English speakers, home-cooked and unpackaged cuisines.* MFP's 20M-item
database is useless for a plate of мусака. A sentence parser is not. That advantage exists
already and is currently sitting behind an English tab bar.

## The short version

One decision governs everything below: **locale is a rendering preference, exactly like
`units`.** It changes what is drawn on a screen and written into an email. It changes nothing
about what is stored, nothing about a tool argument, and nothing about a food name.

That is not an analogy — it is a template. `units` was built this way in `024_units.sql`, and
every seam this feature needs already has a `units` in it:

| Seam | `units` today | `locale` gets |
|---|---|---|
| Column | `users.units`, nullable | `users.locale`, nullable |
| Schema | `packages/shared/src/units.ts`, `unitsOf()` | `packages/shared/src/locale.ts`, `localeOf()` |
| Profile | `Profile.units` → `ProfileUpdate` by `.partial()` | same, free |
| Web | `apps/web/lib/units.ts` → `useUnits()` | `apps/web/lib/i18n.ts` → `useT()` |
| Mobile | `apps/mobile/lib/units.ts` → `useUnits()` | same file, same shape |
| Prompts | `unitsBrief(profile)` at `prompt.ts:304` | `languageBrief(profile)` beside it |
| Email | `notify.ts:212` passes `units` | passes `locale` |
| Learned by | `set_profile`'s `units` argument | `set_profile`'s `locale` argument |

Follow that table and the feature is mostly mechanical. Five phases, and the first one is the
only one with any thinking left in it.

## What does not get translated

Worth settling before the phases, because half of the work in a normal i18n project is
arguing about this list and here the arguments are already won.

- **Food names.** `prompt.ts:132` already says it: if they wrote "кюфте" or "kalamarakia",
  that is what the entry is called, because it is what they will search for later and what
  they will recognise in a list. A `locale` of `bg` does not make a Bulgarian speaker's
  "chicken breast" become "пилешко" — they typed English, they meant English.
- **Numbers and units.** `~650 kcal` is the same everywhere. `kcal`, `g`, `mg`, `kg` are
  written the same in every language this will ship in. Translating them helps nobody.
- **Tool arguments.** Same rule as units, and it needs saying in the brief for the same
  reason: `log_food`'s fields are an API, not prose.
- **Machine date formatting.** `api/src/time.ts:20` and `:111` use
  `Intl.DateTimeFormat('en-GB')` to pull *parts* out of an instant, not to show a date to
  anyone. `localPartsFor` builds `YYYY-MM-DD` from them. Localising those is a data-corruption
  bug wearing an i18n costume. **Do not touch `time.ts`.** Phase 5 says this again, louder.
- **The landing page.** Deferred on purpose — see the end.

## Phase 1 — The preference, and the four generations that ignore it

API only. No UI, and at the end of it the background copy stops being English.

### The migration

`apps/api/migrations/026_locale.sql`, in the shape `024_units.sql` established:

```sql
-- Which language this person reads the app in. Storage is untouched by it —
-- see LANGUAGES.md — so this column changes rendering and nothing else.
--
-- Nullable on purpose: null means nobody has asked yet, which is what lets the
-- client fall back to the device's language for a first session and the journal
-- learn it from how they write. Existing rows are backfilled to English because
-- English is what they have been shown since they signed up.
ALTER TABLE users ADD COLUMN locale TEXT;

UPDATE users SET locale = 'en';
```

No `CHECK` constraint, unlike `units`. The set of shipped languages will change more often
than the schema should, and a `CHECK` that has to be dropped and recreated to add Polish is a
migration for nothing. The Zod enum in `shared/locale.ts` is the real gate — it is what the
PATCH route validates against — and an unknown value read back off a row resolves to English
through `localeOf()` rather than throwing.

### `packages/shared/src/locale.ts`

Mirrors `units.ts`, including the null-means-never-asked note:

```ts
export const LOCALES = ['en', 'bg'] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;

/** What each is called in itself. A language picker that says "Bulgarian" to a
    Bulgarian speaker is a picker written for somebody else. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', bg: 'Български' };

/** The name to give the model, in English, because the prompt is in English. */
export const LOCALE_ENGLISH_NAMES: Record<Locale, string> = { en: 'English', bg: 'Bulgarian' };

export function localeOf(profile: { locale?: string | null } | null | undefined): Locale {
  const parsed = Locale.safeParse(profile?.locale);
  return parsed.success ? parsed.data : 'en';
}
```

Then `Profile` in `shared/index.ts:~377` gains `locale: Locale.nullable()` right below `units`,
with a comment carrying the same weight as the one above it. `ProfileUpdate` picks it up free —
it is `Profile.omit({...}).partial()` and `locale` is not on the omit list.

One thing to watch in `routes/index.ts:563`: the `complete` check that decides
`is_setup_complete` lists every field onboarding must have learned. **`locale` does not go on
that list.** A null locale is not an incomplete profile — it is someone who has only ever used
the app in one language and never had reason to say so. Adding it there would re-open
onboarding for every existing account on the next deploy.

### `languageBrief(profile)`

The whole reason the background copy is English. Goes in `prompt.ts` directly beneath
`unitsBrief` at `:304`, and returns null for English for the same reason `unitsBrief` returns
null for metric — English is what the model does unprompted, and a line confirming it is
tokens spent on every turn to buy a behaviour that was already there.

```ts
export function languageBrief(profile: Profile): string | null {
  const locale = localeOf(profile);
  if (locale === 'en') return null;
  const name = LOCALE_ENGLISH_NAMES[locale];
  return [
    `Language: write to this person in ${name}. Not a translation of an English draft — write it`,
    `in ${name}, the way somebody who thinks in it would.`,
    'Food names stay in whatever language they were given to you in, and numbers and units are',
    'unchanged: "~650 kcal" is the same everywhere. **Tool arguments never change** — every field',
    'name and every enum value is English whatever the conversation is in.',
  ].join(' ');
}
```

Then wire it into the same four places `unitsBrief` already reaches, which is the entire
change and is why this phase is short:

- `prompt.ts:362` — `dayContextPrompt`. Belt and braces: the journal already gets this right
  from the text in front of it, and this makes it right on a turn that is a bare photo with no
  caption, which today has nothing to detect.
- `prompt.ts:631` — `reviewTaskPrompt`. **The one that matters.** Monday's review is generated
  from `ReviewStats` and there is no user prose anywhere near it.
- `prompt.ts:701` — `nudgeTaskPrompt`. Same problem, same fix.
- `ai/recipes.ts:211` — recipes, meal plans, the kitchen. A recipe written in English for
  someone who logs in Bulgarian is the feature failing at the last step.

`ai/pantry.ts` needs a look too — a fridge scan lists what it can see so the user can confirm
it, and those labels are read by a human.

### The model routing already handles it

`ai/language.ts` needs nothing. `needsCapableModel` reads the user's recent text and escalates
on it, which is the correct signal — it is measuring what the *turn* is written in, not what
the profile says. Someone whose locale is `bg` but who types a meal in English gets Haiku, and
should.

The background generations are unaffected: `review.ts:51` and the recipe runs are already on
Sonnet, which `ai/client.ts:103` records as writing every language on the list cleanly.

### The model learns it, like it learns units

Add `locale` to `set_profile` in `ai/tools.ts:809`, worded the way the `units` argument is —
*set it from how they answer rather than asking twice.* Somebody who has written three meals
in Bulgarian has told you. This is better than a second detector: `franc` is already in the
codebase for the routing decision, but it answers "is this a language Haiku struggles with",
not "what should the tab bar say", and a trigram guess off nine characters is not a thing to
rewrite somebody's UI from.

The client picks the change up for free — `AuthGate`'s `adoptProfile` exists precisely because
`set_profile` can change the profile mid-conversation, and a chat turn comes back with the new
one. Saying "говори ми на български" in the journal will re-render the app in Bulgarian
without a round trip. That is a genuinely lovely thing that falls out of the existing wiring.

### Tests

`apps/api/test/` — one per phase-1 claim: `languageBrief` is null for `en` and for a null
locale; a review prompt for a `bg` profile contains the brief; the PATCH route rejects `xx`;
`localeOf` resolves an unknown stored value to `en` rather than throwing. Run them one file at
a time, per the repo's usual TRUNCATE problem.

## Phase 2 — The web strings

The big-looking phase, which is smaller than it looks. Extraction of ~350–450 strings, of which
maybe 1,200–1,500 words are real copy — the rest of what a grep finds is Tailwind classes and
import paths.

### No i18n library

66 of 79 components under `apps/web` are `'use client'`. The app is a client-rendered SPA
behind `AuthGate`, and the locale arrives on the profile from `/me` rather than from the URL.
`next-intl`'s server-component machinery, its `[locale]` segment and its middleware all solve
problems this app does not have, and would drag routing changes through every page to do it.

So: a plain dictionary and a hook, in `apps/web/lib/i18n.ts`, mirroring `lib/units.ts` down to
the doc comment.

```ts
'use client';

export function useT(): (key: MessageKey) => string {
  const locale = localeOf(useAuth().profile);
  return useCallback((key) => MESSAGES[locale][key] ?? MESSAGES.en[key], [locale]);
}
```

`MessageKey` is `keyof typeof MESSAGES.en`, so `MESSAGES.bg` is typed as
`Record<MessageKey, string>` and a missing Bulgarian string is a typecheck failure rather than
a blank label. `pnpm -r typecheck` becomes the completeness check, which is worth more than
any extraction tool.

Messages live in `apps/web/messages/en.ts` and `bg.ts` — TypeScript, not JSON, so the keys are
inferred and a long string can carry a comment explaining the tone it is going for.

### Keys read like sentences

`today.remaining` and `journal.emptyPrompt`, not `label_1`. The app's copy has a voice —
"Nothing planned", "Write one now", the whole of `Landing.tsx` — and a key that says what the
string is *for* is what lets a translator keep it.

### Interpolation

A handful of strings need a number in them. Do not reach for ICU MessageFormat; take a
function instead:

```ts
'today.left': (n: string) => `${n} left`,
```

Plurals are the reason libraries exist here, and Bulgarian's plural rules are the easy kind
(one/other, same as English). A language with more categories — Polish, Russian — is the point
at which `Intl.PluralRules` gets pulled in, and it can be pulled in for the four strings that
need it rather than for the whole file.

### The pass itself

Work file by file down the list in `apps/web/app` and `apps/web/components`, skipping
`components/landing/` and `components/admin/` — the landing page is deferred, and the admin
panel is read by one person who reads English.

## Phase 3 — Mobile

The same file, the same shape, one third the strings — `apps/mobile/lib/i18n.ts` next to
`apps/mobile/lib/units.ts`, reading `useAuth().profile` exactly as `useUnits()` does. About
300–400 words of real copy across the tab bar, `today.tsx`, `history.tsx` and `login.tsx`.

Two things web does not have:

**The device language is the pre-login default.** A signed-out login screen has no profile to
read a locale from. `expo-localization`'s `getLocales()[0].languageCode`, narrowed through
`Locale.safeParse` and defaulting to `en`, covers the login and signup screens. The same
answer, sent as the `locale` on the signup request, is what gives a brand-new account a
sensible starting value instead of null.

**The display font cannot render Cyrillic.** This one is a genuine blocker and is easy to
miss until it is on a screenshot — see below.

## Phase 4 — Emails

Split cleanly in two, and only one half is work.

**The review and the nudge** are AI prose. `notify.ts:207` sends `review.content` straight
through, and phase 1 already made that content Bulgarian. What is left is the chrome around
it: `templates.ts:290` and `:357` label the stat block `Weight`, `Meals logged`, `Messages`.
Those get the same dictionary treatment, threaded from `notify.ts:212` where `units` is
already passed — add `locale: recipient.locale` beside it and take it through
`templates.ts:277`.

**The transactional mail** — confirm your email, reset your password, password changed, new
sign-in, account deleted — is ~800 words of static English in `templates.ts` and `layout.ts`,
and it is the half with the awkward case in it: *a confirmation email is sent to somebody who
does not have a profile yet.*

So signup has to carry a locale. Two sources, in order: the `locale` field on the signup
request (mobile knows the device language; web knows `navigator.language`), and failing that
the `Accept-Language` header on the request, parsed to a bare language tag and narrowed
through `Locale.safeParse`. Store it on the row at `user.ts:140` so the confirmation mail and
everything after it agree.

Not worth over-engineering. Someone whose browser says `bg` and who wanted English can change
it on the setup screen thirty seconds later.

## Phase 5 — Dates and numbers

Small, and last because it is the one that can quietly break something.

**Eleven display sites** hardcode `'en-GB'`, all doing the same thing — turning a `YYYY-MM-DD`
into a readable day:

```
apps/web/app/today/page.tsx:441        apps/mobile/app/history.tsx:477, :486
apps/web/app/exercise/page.tsx:308     apps/mobile/app/(tabs)/today.tsx:534
apps/web/app/history/page.tsx:431,:440 apps/mobile/components/ChatCard.tsx:781
apps/web/app/plan/page.tsx:623
apps/web/components/ChatCard.tsx:741
apps/web/components/WeeklyReview.tsx:126
```

Eleven copies of the same six lines is its own small smell. Collapse them into
`formatDay(date, locale)` and `formatMonth(date, locale)` in `shared/locale.ts` and the
localisation is a parameter rather than eleven edits. `notify.ts:268` and `:289` do the email
side of the same job and take the recipient's locale.

**Three sites must not change.** `api/src/time.ts:20`, `:111` and the `:128` midnight
workaround are parsing, not display — `localPartsFor` reads `formatToParts` to assemble a
`YYYY-MM-DD` for the day-boundary logic. A locale flowing into those changes which day a meal
counts toward. Leave them. If anything, they should be moved to `'en-CA'`-style ISO output or
have a comment added saying why they are not on the list above, because the next person to run
this grep will find them.

**Number grouping** is mostly already right by accident: `toLocaleString()` with no argument
follows the runtime, so a Bulgarian browser gets `1 234`. The exception is
`shared/index.ts:1207`, where `formatKcal` pins `'en-US'`. It takes a locale or it takes
nothing — it is server-side too, so "follow the runtime" is the wrong default there.

**RTL is out of scope.** Arabic and Hebrew mean a mirrored layout, not a dictionary, and
nothing in the first languages needs it.

## The font problem

Checked in the repo rather than assumed, from the packaged metadata:

- **Nunito** — `["cyrillic", "cyrillic-ext", "latin", "latin-ext", "vietnamese"]`. Fine.
- **Baloo 2** — `["devanagari", "latin", "latin-ext", "vietnamese"]`. **No Cyrillic.**

Baloo is the display face. It draws the ring's figure, every heading, the landing headline —
`app/layout.tsx:24` describes it as the face "there for the shouting". In Bulgarian it would
shout in whatever the system fallback is, on the largest text on every screen, which is the
most visible possible way for a localisation to look unfinished.

Three ways out, and the choice belongs to whoever owns the look:

1. **Nunito 900 as the display face for Cyrillic locales.** Already loaded, has the subset,
   same family so nothing clashes. Loses the wide rounded bowls that make the figure feel like
   the figure. Lowest risk, and the right answer if Bulgarian is a test rather than a bet.
2. **A second display face for Cyrillic locales.** Comfortaa and Rubik both claim Cyrillic and
   are in the right neighbourhood — verify the subset list in the package the way the two
   above were verified, do not trust a memory of it, and look at `800` weight at the ring's
   size before committing.
3. **Subset Baloo yourself.** It is OFL. This is real font work and is not worth it here.

Also, whichever way it goes: `layout.tsx:19` and `:28` pass `subsets: ['latin']` to
`next/font/google`, and mobile loads static weights through `@expo-google-fonts`. Both need
the Cyrillic subset added for the faces that have one.

## Which languages

**Bulgarian first**, and not only because it is the author's. It is the one the codebase has
already been tested against — `ai/language.ts` documents a measurement run on it, its broken
Haiku output is the reason the escalation exists, `RUSSIAN_WORDS`/`BULGARIAN_WORDS` were hand-
tuned for it, and `users.timezone` defaults to `Europe/Sofia`. It is also the exact case
`COMPETITION.md` argues is defensible: a home-cooked Bulgarian meal that no product database
has ever contained.

It is also the harder one, which is the argument for doing it first: it brings the Cyrillic
font problem, and a second Latin language shipped first would have hidden it.

**Then one Latin language to prove the plural of the thing.** Any of them; the machinery is
identical and the only new question is whether a longer language breaks a layout. German is
the usual stress test for that.

Everything after that is a `messages/xx.ts` file, and the model needs nothing at all — the
whole of `ai/language.ts`'s list already works.

## The landing page, deferred

`components/landing/` is ~1,000 words of the most carefully written copy in the repo, and
translating it is a different project from translating the app:

- Localised marketing needs the `[locale]` routing this plan deliberately avoided, plus
  `hreflang`, plus a `sitemap.ts` and `robots.ts` — neither of which exists yet.
- The copy is rewritten often. N translations of a page that changes monthly is a standing tax
  paid forever, in exchange for SEO on a site that is not currently doing SEO at all.
- The `metadata` block in `app/layout.tsx:47` — title, description, OG, Twitter — is part of
  the same job.

Ship the app in Bulgarian, see whether anyone arrives, and localise the front door once there
is evidence it is the door they are trying. If a cheap gesture is wanted in the meantime, a
single line offering the app in Bulgarian, shown on `Accept-Language`, costs nothing.

## What it costs

- **Phase 1** — half a day. It is a migration, a small module, one prompt function and four
  call sites that already have the identical function wired through them.
- **Phases 2–4** — two to three days of extraction, mostly mechanical, plus whatever the font
  decision turns into.
- **Phase 5** — a couple of hours, and eleven duplicated helpers get collapsed on the way.
- **Per language after that** — translation only. ~3,000 words of chrome.

The standing cost is the honest one to state: **every new string is now two strings.** The
typecheck catches a missing key, so nothing ships blank — but the app's copy is written with a
voice, and a machine translation of "Nothing planned" will not have it. Budget a pass with a
tone brief per language, or a person, and accept that the second language is where the habit
either sticks or quietly rots.
