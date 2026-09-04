# Friends

Written 2026-09-04. Companion to `STREAKS.md`, whose one rule this obeys and
extends, and to `COMPETITION.md` §2, which lists social as "Low, deliberately
excluded" — a line that stands for almost everything in the category and not for
the two things below.

**The short version.** Two features on one graph. Friends send each other
**recipes**, and friends can see **whether the other showed up**. Nothing else
crosses between two accounts: no calorie figure, no macro, no weight, no target,
no entry, no photo. The mechanic every competitor ships is a ranking over the
deficit. This one ranks **days logged** and nothing else — §14 builds that board
— so the only number that travels is a count of days, and the way to win is to
log more rather than to eat less.

The build is smaller than it sounds. There is no feed, no inbox, no profile, and
no new tab. It is one join table, four provenance columns on tables that already
exist, and a handful of touchpoints on screens people already open — chiefly the
journal, which §12 covers and which is where a shared recipe actually lands.

---

## 1. The rule, extended

`STREAKS.md` §1 is the whole foundation: **reward showing up, never reward the
number.** A second reader adds one clause, because the original rule was written
for an audience of one:

> **Nothing that crosses between two accounts may be a quantity of food, a body
> weight, or anything derived from either.**

The stronger form is needed even though `adaptive.ts` is explicitly built to
tolerate under-logging. Its header says so:

> The estimate is calibrated against *logged* intake rather than true intake, so
> a consistent under-logger converges on a target that works for the way they
> log. That is deliberate.

The load-bearing word is **consistent**. A steady bias calibrates out; that is
the design. An audience does not produce a steady bias — it produces one that
switches on when somebody is watching and off when they are not. That is a
behaviour change *inside* the 14-day window, which is the one shape the
adaptive pass cannot absorb: `MAX_STEP_KCAL` and `SANITY_BAND` exist to damp
water weight, and spending that budget on social artifacts instead is a straight
loss.

`wellbeing.ts` is the other half of the argument. A surface ranked on deficit
pushes hardest at exactly the person `checkWellbeing()` exists to stop pushing,
and `adaptive.ts:349` already refuses to lower that person's target while
telling them to talk to a doctor. Shipping a leaderboard beside it is one
feature fighting another in the same request.

So what goes on the wire is a recipe, a run of days, and a boolean about today.

### What this does not close the door on

The rule is about the *scoring variable*, not about competition. A board ranked
on days logged, workouts completed, or streak length is fine and is arguably the
strongest retention mechanic available here — the way to win it is to log
**more**, including the biscuit, which points the incentive at honest logging
rather than against it. That is Strava's actual insight: it ranks segments
completed, not weight lost. **§14 builds that board**, and it costs no migration,
exactly as this paragraph predicted — §7's argument for an unranked list was
about 24 rows being easier to read, not about the rule.

## 2. What already exists

Almost all of the hard parts.

| Thing | Where | State |
| --- | --- | --- |
| Generated recipes | `recipes` (011) | Per-user, `saved`, `cooked_at`, per-portion macros |
| Library recipes | `library_recipes` (012) | Slug-keyed, public-domain USDA, images in web `public/` |
| Saving a library recipe | `saved_library_recipes` (012) | `PRIMARY KEY (user_id, slug)` |
| Both streaks | `services/streaks.ts` | Derived, never stored. `logHistory()` returns both date lists |
| The walk itself | `shared/day.ts` | `streakFrom()`, `weekStreakFrom()` — shared so an offline phone agrees |
| Badges | `achievements` (039) | 14 keys, write-once, `ACHIEVEMENT_KEYS` is the gate |
| Push | `push_tokens` (030), `services/push` | Registered per device, per platform |
| Alerts | `alerts` (037) | `kind` has a 4-value `CHECK` — extending it needs a migration |
| Recipe UI | `kitchen/RecipeTile`, `RecipeReader`, `Servings` | Both clients, same shapes |
| Sheets | mobile `components/Field.tsx` | The share sheet needs no new primitive |
| Copy | `messages/{en,bg,de,es,fr}.ts` | Five locales, and the completeness check that guards them |

**And one thing that does not exist anywhere: a second reader.** Every table in
the schema is `user_id`-scoped with `ON DELETE CASCADE`, and every route resolves
`request.userId` and reads only that. This is the first feature in the codebase
where one account reads a row belonging to another, and that — not the recipe
copying — is the part to review carefully.

## 3. The graph

**Mutual, small, and with no discovery.** No search by name, no suggested
friends, no follower counts, no public profiles. The only way in is a link
somebody sends you outside the app, which means the graph can only ever be
people who already know each other. That is not a privacy compromise made
reluctantly; it is what keeps the feature about cooking with people you cook
with.

```sql
-- One row per pair, never two. The ordering is what makes mutuality a
-- constraint instead of two rows and a job to keep them agreeing: the pair is
-- the primary key, so "are we friends" is one lookup in either direction and
-- there is no state in which A follows B but B does not follow A.
--
-- No `status` column, and therefore no pending state. Acceptance happens at the
-- invite, which is the only place it can happen: a link you were sent is a
-- request that has already been made, and a row here means it was taken.
CREATE TABLE friendships (
  user_lo    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_hi    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_lo, user_hi),
  CHECK (user_lo < user_hi)
);
CREATE INDEX friendships_hi ON friendships (user_hi);

-- Single-use, expiring, and hashed like everything else that arrives as a
-- secret in a URL — the same discipline `auth_tokens` uses, for the same
-- reason: a token in a database is a token in a backup.
--
-- No six-digit code beside it, unlike 012. That code exists because a
-- verification gate is hit on a phone while signed in on a laptop, so typing
-- beats forwarding. A friend link is tapped by the person it was sent to, on
-- the device they read the message on, and there is nothing worth guessing.
CREATE TABLE friend_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX friend_invites_token ON friend_invites (token_hash);
CREATE INDEX friend_invites_inviter ON friend_invites (inviter_id, created_at DESC);
```

**A cap, and a low one: 24.** The number is arbitrary and should be measured,
but the direction is not. A cap is what stops a friend list becoming a follower
count, and it is far cheaper to raise later than to walk back.

The invite link is `daysofar.com/f/<token>`, and §7 covers what happens when the
person who taps it does not have an account yet.

## 4. Sharing a recipe

The two recipe kinds are different objects and need different answers.

**Library recipes are already public.** Public-domain USDA text, an image served
from web `public/` with no signing, a stable slug. Sharing one is a URL and
needs no new table.

**Generated recipes cannot be shared as links.** `recipes.generated_for` holds
`{local_date, kcal_remaining, protein_remaining, missing}` — the budget the
recipe was written against, which is a fact about the sender's intake on a
particular day. That column is exactly what §1 forbids from travelling.

So a shared generated recipe is **copied, not linked**, and the copy is where
the rule gets enforced:

- `generated_for` is dropped at the copy boundary. Not nulled by a view that
  somebody later forgets to apply — absent from the row.
- The recipient owns an ordinary `recipes` row, so scaling, cooking, logging and
  deleting all work through paths that already exist with no special case.
- The sender can regenerate or delete theirs without breaking anything.

That turns the whole feature into provenance columns on two tables that already
exist:

```sql
-- On `recipes`, and mirrored on `saved_library_recipes`.
ALTER TABLE recipes ADD COLUMN shared_from UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE recipes ADD COLUMN shared_note TEXT;
ALTER TABLE recipes ADD COLUMN shared_at   TIMESTAMPTZ;
ALTER TABLE recipes ADD COLUMN seen_at     TIMESTAMPTZ;
```

`ON DELETE SET NULL` rather than cascade: somebody closing their account should
not delete a recipe their friend now cooks every week. The row stays, the
attribution goes.

`shared_note` is one line, capped at 140 characters, and it is most of the value
of the feature. "Try this, it's what I made Tuesday" is the reason a recipe gets
cooked; a bare recipe with no sentence attached is a link, and people already
have somewhere to send links.

**Copied on send, not on accept.** There is no pending state and no accept
button, which removes a table, a screen and a notification. The objection is
that a friend can then write rows into your account — true, and bounded by a
mutual graph capped at 24, a rate limit on the route, and the fact that this is
what a message is. An accept flow would buy nothing except a second thing to
tap.

The recipient's "shared with you" is then a filter, not a table:
`shared_from IS NOT NULL AND seen_at IS NULL`.

For library recipes the same three columns go on `saved_library_recipes`, and
sharing one is an insert of a saved row on the recipient's behalf.
`PRIMARY KEY (user_id, slug)` already settles the case where they had saved it
themselves: `ON CONFLICT DO UPDATE` the note only while `seen_at IS NULL`, so a
second share of the same dish does not resurface something already read.

## 5. The public recipe page

`/r/<slug>` for **library recipes only**: no auth, real OG image, a "save this to
your kitchen" button that becomes a sign-up. This is the acquisition half of the
feature — a link that works for somebody who does not have the app.

Generated recipes get no public page. They are one person's pantry against one
person's budget, and making them public would need a scrub pass that nobody
would maintain correctly forever. In-app, between friends, only.

The OG image should be rendered per slug in the app's own design system —
`scripts/content/cards.mjs` already draws cards from `store/icon-512.png` and
the vendored Baloo2, which is why a card, the Play feature graphic and the web
OG image look like one product. A per-portion kcal figure **is** allowed on this
card: it is USDA's published number about a dish, not a number about a person,
so §1 does not reach it. This is the same distinction `CONTENT_ENGINE.md` draws
when it forbids calorie numbers on generated food images — a number is only as
good as the thing it describes.

## 6. What friends see about each other

Exhaustively. If it is not in the left column, it does not leave the account.

| Visible | Never visible |
| --- | --- |
| Display name | Any kcal, macro, or gram |
| Logged today — yes or no | Weight, target weight, TDEE, or trend |
| Current streak, best streak | What they ate, and every photo of it |
| Badges earned (the 14 keys) | Their journal, their chat, their notes |
| Days logged this month | Their plan tier, their meters, their spend |
| Your shared pair run (§below) | Whether they hit target, ever |

Every entry on the left is **effort**. That is the whole test, and it is the one
to apply to anything added later.

### The reward: a pair run

The cooperative twin of the streak — **consecutive days you both logged.**

It is the right mechanic here because it cannot be won by eating less. It can
only be won by two people both putting something in the log, which is the
behaviour the app wants and the behaviour that makes its data worth anything. It
is also the first thing in the product that gives somebody a reason to care
whether their friend opened the app, without giving them a number to compare
against.

The arithmetic is free. `logHistory()` already returns each person's distinct
logged dates; the pair run is `streakFrom()` over the intersection of two of
those lists. Nothing stored, for the reason `streaks.ts` gives about itself — so
it inherits the property that a late entry replayed from the offline outbox
retroactively repairs the run it filled in, for both people at once.

**No new badges in v1.** A badge that depends on another person is a dead cell on
the wall of anybody with no friends. The nearest existing principle is about
money rather than about friends — `shared/index.ts` says every badge is earnable
on the free tier, because "a grid where half the cells need a subscription is an
advertisement wearing a trophy" — but the shape of the objection carries: a
locked cell is a locked cell, whether what unlocks it is a payment or a person.
A `cooked_together` key in a group that only appears once a friendship exists is
a reasonable later answer, and it extends a rule rather than following one, so it
should be argued on its own rather than smuggled in with this. The pair run is
already its own reward and it is drawn where it is earned.

§14.6 takes the shape this paragraph proposed and fills it: a `together` group
that is absent from a solo wall, holding the two board badges and nothing else.
The pair run still ships without one.

## 7. The UI, which is the actual work

The rule for the whole surface: **the feature is invisible until it is yours.**
No zero states, no empty counts, no dot with nothing behind it. An account with
no friends should not be able to tell this shipped.

**No new tab.** Both clients already run six — journal, today, progress,
exercise, cook, you — and a seventh is the most expensive thing this feature
could ask for. Friends is not a daily destination anyway: it is checked weekly,
and the parts that matter come to you.

### The three touchpoints

**1. Sharing lives where the recipe is.** A share control on `RecipeReader` —
the page you are already on at the moment you decide a recipe is good — and in
the tile's overflow for the grid. Tapping it opens a sheet: your friends as a
checklist, one note field, one Send. Two taps for the common case. On mobile
that is the existing `Sheet` from `components/Field.tsx`; no new primitive.

**2. Receiving lives where you cook.** Shared recipes arrive as a strip above the
Cook grid — *"From your friends · 2"* — drawn with the existing `RecipeTile`,
with "from Marta" and the note in the slot where `fits_today` normally sits.

The reasoning matters more than the layout: a shared recipe *is* a recipe
suggestion, and Cook is already the room for those. A dedicated inbox would be a
second place to check, and a second place to check is a place nobody checks.
Once seen, the strip empties and the recipes fall into the ordinary grid,
because that is what they now are.

§12 demotes this. The arrival is a turn in the journal, which is the surface
people actually open; the strip stays as the backstop for one that scrolled
away.

**3. The friend list lives under Progress**, as a row beside the badge wall —
the same door pattern `StreakChip` already uses to reach `/achievements`. It
belongs there because the list is about streaks and showing up, which is what
that screen is already about.

The list itself: a name, a flame with their run, a filled or hollow dot for
today, and the pair run where there is one.

**Superseded by §14.7.** This section originally ordered the list by name and
refused to rank it. The refusal was aimed at ranking a *deficit*, which §1 had
already ruled out on its own; ranking days logged is the thing §1 explicitly
permits, and §14 argues it is the strongest retention mechanic available here. So
the list is ordered by this week's days logged, then by streak, with the reader's
own row pinned wherever it falls.

Empty state, on Progress, in full: *"Friends — invite someone you cook with."*
No count, no illustration, no badge.

### The invite flow

One button, the OS share sheet, a link. Not an email, not a code to type. §13
walks the whole path, including the three doors that get somebody as far as
pressing the button.

The flow that needs care is the one where the recipient does not have the app.
They tap `/f/<token>` in a browser, land on a page that says who invited them and
what the app is, and install. The token then has to survive a cold install, a
sign-up, and an onboarding that asks for height, weight, units and a language
before it lets anybody through. So: **hold the token, bind at the end**, and make
"You and Marta are friends" the last card of onboarding rather than an
interruption in the middle of it. A friendship offered before somebody has a
streak to show is a friendship offered too early.

### Notifications

One push, and a strict one: **"Marta sent you a recipe."** That is a thing a
person did, addressed to you.

Explicitly not shipped: any push about a friend's logging, their streak, or their
absence. A notification about another person's behaviour is the leaderboard
again, delivered to a lock screen, and it is the single fastest way to turn this
feature into the thing §1 refuses.

The one edge that is allowed: when a **pair run is at risk and the reader is the
one who has not logged**, at the existing 20:00 local slot beside the streak
alert. It qualifies because it is a sentence about the reader's own missing
action. If it ever has to name what the friend did or did not do, it is out.

Note that `alerts.kind` carries a 4-value `CHECK` (037), so any of this landing
as an alert row rather than a bare push needs a migration to widen it.

## 8. Privacy, removal, and erasure

- **Either side can remove, immediately, and the other is not told.** A
  notification would make removal a social act, which is how people end up
  staying friends with somebody they would rather not.
- **Already-shared recipes stay.** They are the recipient's own rows. Provenance
  survives an unfriending too — "from Marta" remains true, and the recipe is
  still good.
- **Account erasure must clear both.** `028_erase_mail_with_account` sets the
  precedent; the erase path needs to delete `friendships` and `friend_invites`
  rows on both sides and let `ON DELETE SET NULL` do the rest.
- **`users.display_name` is nullable**, and a friend row needs something to draw.
  Require it before the first invite — one field, asked once, at the moment
  there is an obvious reason for it.

## 9. Entitlement

**Free, on every tier.**

The graph is the acquisition loop, and taxing it taxes growth. Sharing costs no
model call: the copy is a row insert, because the sender already spent their own
`recipe` meter to generate the thing.

That is also the line to hold — **a share spends the sender's meter and never the
recipient's, and a recipient can never cause a sender to spend.** Both are
automatically true when the copy happens at send time, which is a second reason
to prefer it over copy-on-accept.

The obvious exploit, named so it is not discovered later as a surprise: two free
accounts can trade generated recipes and each end up with more recipes than
their meter allows. They cannot end up with more *generations* — each still paid
for what they made. Sharing multiplies the value of a spend rather than the
count of them, which is the feature working, not a hole in it.

## 10. Build order

1. **Migration 044** — `friendships`, `friend_invites`, provenance columns on
   `recipes` and `saved_library_recipes`.
2. **`shared/`** — zod schemas for the friend and share shapes, and the pair run
   in `day.ts` beside `streakFrom()`, so an offline phone computes the same
   answer as the server.
3. **`routes/friends.ts`** — invite create and accept, list with streaks, share,
   mark seen, remove. Rate limits on invite and share.
4. **Erasure and account deletion** — before any client work, so the first
   friendship created is already deletable.
5. **The journal arrival** (§12.1) — two `ChatAction` kinds, the templated frame
   in five locales, and the `insertMessage` call on the share path. No client
   work: it draws with the `recipes` card that is already there.
6. **Web and mobile** — share control on `RecipeReader` (shipping with the
   empty-graph invite path, §13), Cook strip, Progress row, friend list.
7. **`/f/<token>` and `/r/<slug>`** — the two public pages, the App Link and AASA
   entries, and the OG render.
8. **`shareRecipe` tool** (§12.2) and the friend names in the prompt — after the
   route works, because the tool is a caller of it and not a second
   implementation.
9. **Push and the two nudge kinds** — `recipe_shared`, then `pair_run_at_risk`
   and `friends_offer` behind the widened `CHECK` on `018_nudges.sql:22`.
10. **The board** (§14) — the group query, the Progress ordering, the opt-out
    column on `users`, and `perfect_week` in `streaks`.
11. **The Monday settlement** — its own pass beside the review's, model-free and
    free of charge, plus the `together` badge group. Last, because it is the only
    part that needs a week of real data to look right.

Steps 1–4 are the whole risk. 5–11 are surface over shapes that already exist.

## 11. Open questions

- **The 24 cap** is a guess. Measure the distribution before defending it.
- **`cooked_together` as a badge** — worth it, against a dead cell on a solo
  wall? (§6.)
- **OG rendering at request time.** `cards.mjs` shells out; whether Next's
  runtime can do the same per slug, or whether this wants a small render worker,
  is unresolved.
- **Whether a shared recipe should be visible to the sender as "cooked".** It is
  the most natural next social beat and the most likely place to accidentally
  reintroduce a comparison. Left out of v1 on purpose.
- **Single-use invites.** A link pasted into a group chat binds the first
  tapper and fails for everyone else. The alternative is an invite that accepts
  up to *n* people until it expires, which is friendlier and is also how a graph
  stops being small. Copy carries it in v1; measure how often a link is tapped
  twice.
- **Invite lifetime.** Unspecified above. Long enough to survive an unread
  message and a cold install, short enough that a link in a chat history is not
  live forever — two weeks is the guess.
- **The `friends_offer` line** (§13). One sentence, once per account, and it is
  still an interruption in a journal that has earned the right not to interrupt.
  Worth checking it converts at all before defending the licence.
- **Leagues, and why not.** Duolingo's promotion/demotion tiers are the
  strongest retention mechanic in the category and they need a matchmaking pool
  of thirty strangers. §3's graph is mutual, small and undiscoverable by design,
  so a league is not a feature to add here — it is a different product with a
  different graph. Named so it is refused deliberately rather than forgotten.
- **A global board** fails the same way and faster: it would be won in week one
  by whoever installed the app earliest, and it would need the discovery §3
  refuses.
- **The 7/7 ceiling** (§14.1) may be too easy for a committed group — everybody
  ties at first from March onward and the board stops saying anything. The
  tiebreak carries it for a while. Measure the distribution of weekly finishes
  before adding a second axis, and do not let the second axis be a quantity of
  food.
- **Sequencing.** `COMPETITION.md` still calls Apple Health / Google Fit sync and
  offline logging blockers, and `OFFLINE.md` is a plan rather than a build. This
  is upside; those are one-star reviews.

## 12. The journal, which is where people actually are

Everything in §7 is a room somebody has to decide to enter. Cook is opened when
there is a decision about dinner; Progress is opened weekly at best. The journal
is the app — first tab, where logging happens, and the only surface with a
reason to be looked at more than once a day. A social feature that never touches
it is a social feature routed around its own traffic.

The journal already knows how to receive things nobody typed. `ai/nudge.ts:92`
and `ai/review.ts:89` both end by calling `insertMessage(id, 'assistant', …)`
with a `tool_trace.kind` and, in the review's case, a card. An unprompted arrival
in the conversation is a solved shape with two callers already. Friends is the
third, and it is the cheapest of the three because it needs no model at all.

### 12.1 Arrival is a turn, not a badge

A shared recipe lands as an assistant message carrying the existing `recipes`
card:

> **Marta sent you a recipe** — *"try this, it's what I made Tuesday"*
> [ the ordinary recipe card: servings stepper, cook button, macros ]

No new `ChatCard` variant. The card the journal already draws for
`suggest_recipes` is the whole recipe with everything actionable on it, and a
shared recipe is a recipe — the only new information is the sentence above it,
which is a message, and messages are already text. The variant that does not get
added is the one that would have to be added twice, in `ChatCard.tsx` and its web
twin, whose switches have no `default` branch (`ChatCard.tsx:174`); a card type
an older build has never heard of renders as nothing at all.

**Nothing here calls a model.** The frame is a template in
`messages/{en,bg,de,es,fr}.ts`, drawn in the *recipient's* language, and the note
is the sender's own words reproduced verbatim in whatever language they wrote
them. That split is the honest one: the app speaks the reader's language, and a
friend speaks their own. It also means a share costs nothing and cannot
hallucinate a number, which is a stronger guarantee than §1 asks for and comes
free.

Two new `ChatAction` kinds, and only two:

- `recipe_shared` — the arrival, carrying the `recipes` card.
- `recipe_sent` — the sender's receipt, `card: null`. It is a line of text for
  the same reason a deletion is.

Adding to that enum is safe in a way adding a card type is not: the clients do
not validate what comes back (`packages/api-client/src/index.ts:980` is a
`JSON.parse` and a cast), nothing switches on `kind` except `isDeletion()`, and
an unrecognised kind renders its `summary` like any other.

### 12.2 Sending is a tool

`shareRecipe`, beside `saveRecipeTool` (`ai/tools.ts:2008`). "send that to
Marta" is the most natural sentence in the app, and it is typed into the one
surface built to receive sentences. Making people leave the conversation, open
Cook, find the recipe and press an icon is asking them to do the navigation the
agent exists to remove.

This is the first tool in the file that writes a row into an account other than
the caller's, so it is fenced differently from every other one:

- **It can only follow an edge that already exists.** The tool resolves a name
  against the caller's friend list and nothing else. It cannot create a
  friendship, send an invite, or address a stranger.
- **An ambiguous name is a question, not a guess.** Two friends called Marta is
  a turn that asks which; the alternative is a recipe delivered to the wrong
  person with no undo.
- **The note is the user's, not the model's.** If they did not write one, the
  share goes without one. A model-written note in somebody else's voice is a
  forgery, and the note is the part that gets read.

### 12.3 What the model is told about friends

**Names and ids. Nothing else.** The friend list enters `dynamicSystemPrompt`
(`ai/prompt.ts`) as a bare list so that "Marta" can be resolved to an argument.

Not the streaks, not the dots, not who logged today — even though §6 says all
three are things a friend is allowed to see. The reason is not that the data is
secret; it is that **anything in the context window is a thing the model will
eventually volunteer.** A model that knows Marta is on eleven days will mention
it in a turn about something else, and the mention will be a comparison, which is
the one thing §1 exists to prevent. The friend list on the Progress screen is a
place somebody goes to look. The journal is a place things are said, and it
should not be able to say this.

### 12.4 The pair run rides the nudge lane

`018_nudges.sql:22` carries a four-value `CHECK` on `kind`; widen it and add
`pair_run_at_risk` to `NUDGE_KINDS`. That buys the whole existing pipeline: the
20:00 local slot, the `nudges_once` unique index on `(user_id, kind, local_date)`
that makes a double send impossible, model-written prose over server-computed
stats, and the journal message at the end of it.

`NudgeStats` gains the run length and the friend's display name and nothing else,
because nothing else is needed to write the one sentence this is allowed to be —
a sentence about the reader's own missing log. This is the thinnest part of the
wall in the whole document and it should be said out loud: a run of eleven days
that is at risk because *you* have not logged does imply that the other person
has. §7 accepts that implication and refuses the explicit form, which is a line
that has to be held in the prompt rather than in the schema.

### 12.5 What never arrives in the journal

Exactly two things may be inserted, and both are *a person did a thing addressed
to you*:

1. A recipe somebody sent.
2. A friendship starting — one line, no card, on both sides. The inviter
   otherwise sends a link into a void, and §13 leans on this.

Not: a friend's log, streak, badge, absence, or return. Not a weekly digest of
what friends did. Not a friend's arrival on the app. Every one of those is the
leaderboard wearing a conversation, and the journal is the surface where it would
do the most damage, because the journal is the surface people believe.

### 12.6 Delivery, and what `seen_at` means

`routes/sse.ts` is a per-turn stream, not a socket — there is no channel to push
a friend's share down and no fanout should be built for one. A share lands in the
database, the push from §7 fires, and the message is there on next open. That is
the correct latency for a recipe.

`seen_at` is set when the recipe is **opened**, on whichever surface got there
first — the journal card or the Cook strip. Not on delivery, and not on scroll: a
message scrolled past is not a recipe read, and the strip in §7 exists precisely
to catch the one that was.

This demotes §7's touchpoint 2. The Cook strip is no longer the arrival; it is
the backstop for arrivals that scrolled away, which is a smaller job and a better
one — it stops being a second inbox and becomes what it should have been, a
filter on the grid.

## 13. How anyone finds out this exists

§7 says the feature is invisible until it is yours, and then gives it an empty
state on Progress. That is a contradiction, and resolving it is most of the
discovery problem:

> **The app may say it once, in a sentence, at a moment that earns it. It may
> never draw it.**

No dot, no count, no badge, no illustration, no tab, no card on the home screen.
A sentence is not decoration; it is the app talking, which it already does.

### The four doors

| Door | Who walks through it | What it costs |
| --- | --- | --- |
| Share, on a recipe | Somebody who already wants to send this | Nothing — the control ships either way |
| One line in the journal | Somebody with a streak and a cooked recipe | One nudge kind, no push |
| The Progress row | Somebody who has already heard of it | The row §7 already specifies |
| **A link from a friend** | **Everyone else** | The invite page |

The fourth is the only one that scales, and the other three exist to start it.
After the first cohort, this feature spreads because people send recipes — not
because the app advertised.

**1. The share control ships whether or not you have friends.** This is the
strongest door and it costs nothing, because a share button on a recipe is not
friends UI — every recipe app has one and nobody reads it as a social feature.
Tapping it with an empty graph opens the OS share sheet with an invite link
already attached; tapping it with friends opens the checklist from §7. The
person walking through this door has already decided they want to send a recipe
to somebody, which is the entire feature, arrived at without ever being told
about it.

This is also the one zero state the feature is allowed, and it does not break
§7's rule: §7 forbids empty states on screens people did not ask for. A share
sheet is only ever open because it was opened.

**2. One line in the journal, once per account, ever.** Deterministic, not a
model's decision, and gated on the moment the doc's own logic points at: the
first day somebody holds a 7-day streak *and* has cooked a recipe. That is a
person with something to be proud of and something to send. Before that there is
nothing to invite anybody to.

It rides the nudge table for the once-only guarantee — a `friends_offer` kind and
the `nudges_once` index — with **push suppressed**. It is a line in the journal
next time they open it, not an interruption, and it is a template rather than
model prose: an LLM paraphrasing a feature description will invent a feature.

**3. The Progress row is findable, not discoverable.** Those are different jobs
and it should only be asked to do the second one. §7's copy stands as written.

### The invite flow, end to end

**Before the first invite: a name.** `users.display_name` is nullable (§8) and a
friend row needs something to draw. One field, asked once, at the moment there is
an obvious reason to ask — the share sheet, not onboarding.

**Sending.** One button, the OS share sheet, `daysofar.com/f/<token>`. Single-use
and expiring, which the copy has to carry rather than hide: *"this link works
once."* A link pasted into a family group chat binds whoever taps first, and
somebody discovering that by accident is a bad first impression of a feature
about trust. (Whether single-use is right at all is an open question below.)

**Receiving splits three ways, and only one of them is hard.**

- **App installed, signed in.** The App Link opens `/f/<token>` in-app as a
  sheet, not a screen: who invited you, what a friend can and cannot see, Accept.
  `app.json` currently verifies only `/progress` and `/today`, so this needs a
  third `pathPrefix` and a matching path in
  `apps/web/app/.well-known/apple-app-site-association`.
- **App installed, signed out.** Land on login holding the token; bind after
  auth. Nothing new — this is the shape `026_oauth_handoff` already has.
- **No app.** The web page at `/f/<token>`: who invited them, what the app is,
  store buttons. Then the genuinely hard part.

**The cold-install problem, honestly.** A token cannot cross an install on iOS.
Universal Links only fire for an app that is already there, and the alternatives
are attribution SDKs that fingerprint, which is not a trade worth making for a
friend invite. Android is different — the Play Install Referrer survives the
install and can carry the token — but building the flow around a capability one
platform has is how you ship a feature that works for half your users and gets
debugged by the other half.

So: **design for the second tap on both platforms, and let Android's referrer
make it invisible where it works.** The web page's post-install call to action is
"open the app," the invite stays valid long enough for that to be a real
instruction rather than a race, and the link is still sitting in the message they
were sent. On Android the second tap usually never happens because the referrer
already bound it.

**Binding lands at the end of onboarding, not the middle.** `onboarding.tsx:175`
builds `steps` from state and the rail re-scales itself — the same mechanism that
drops the goal-weight question for somebody maintaining. A held token appends one
final card, after the building screen: *"You and Marta are friends."* A
friendship offered before somebody has a streak to show is offered too early, and
a question about friends between the height question and the weight question is
an interruption in a flow that is already asking a lot.

**Acceptance is the disclosure moment.** The person accepting has one friend and
has never seen this feature; the sheet's confirmation is the only place the §6
table is shown as UI — two short columns, what travels and what does not. It is
the honest place for it, it is the answer to the question a careful person is
about to ask, and it is what an app reviewer will look for.

**Both sides get the journal line from §12.5.** The inviter needs to know the
link was taken, or they sent it into nothing; the acceptor needs one thing in the
app that says the friendship is real. One line each, no card, no push for the
inviter beyond the ordinary badge count.

## 14. The board

§1 left this door open and named the key: *"the way to win it is to log **more**,
including the biscuit, which points the incentive at honest logging rather than
against it."* §7 declined to walk through it on ergonomic grounds — 24 rows read
better alphabetically — which was a judgement about a list, not a principle. This
section overrides that judgement and keeps the principle.

**What is ranked: days logged. Nothing else is ever ranked.**

### 14.1 A window, not a total

The obvious board is current streak, and it is the wrong one. A streak board is
decided by join date: somebody at 400 days cannot be caught by anybody, ever,
and a person joining in March sees a wall they will still be looking at in
December. That is a scoreboard with the result already printed on it.

So the primary board is **days logged this week, Monday to Sunday, 0–7**,
resetting every Monday morning. Everybody starts the week at zero on the same
morning. This is what Strava's weekly leaderboard actually is, and the reason
its segment boards work *beside* it rather than instead of it.

**The ceiling is a feature, not a limitation.** Seven is the maximum and a lot of
people will reach it, which means ties at the top — and the board should draw
them as ties rather than inventing a winner:

```
This week
  1st   You · Marta · Ivan          7/7
  4th   Sofia                       6/7
  5th   Tom                         4/7
        Priya                       0/7
```

A board that many people can max out is a board that stops pushing the moment
somebody has done the thing being asked of them. Distance has no ceiling and so
Strava's board never stops; a habit does have one, and ours should stop. Shared
first place is the target state of this feature, not a degenerate case of it.

**The tiebreak is current streak.** Never a count of entries — that rewards
logging a glass of water five times — and never anything measured in grams or
kilocalories.

**Current streak is a wall, not a race.** It sits beside the week board as a
second, explicitly secondary column: a flame and a number, unordered against
anybody. Somebody's 400 days is unbeatable, which is fine, because it is the
segment board — a thing to look at rather than a thing to win this week.

### 14.2 What must never be ranked

kcal, deficit, weight, weight lost, macros, adherence.

And one that is neither obvious nor safe, and will be proposed: **percentage of
days on target.** It looks like a compliance metric and it is a deficit board in
a costume. Winning it means eating to the number; losing it means the honest
logger who ate the biscuit and wrote it down finishes last. Days logged is the
only variable in this app where the winning move is to log *more*, and it is the
only one that goes on a board.

### 14.3 It reveals nothing new

§6 already puts **current streak** and **logged today** on the visible side of
the table. The board adds no field: it sorts fields §6 already permits. That is
the entire privacy argument for this section, and it is why the change is small
enough to make at all.

### 14.4 The settlement is the mechanic

The live board is not the retention loop. A board that ticks invites refreshing;
a week that settles invites logging.

So on Monday morning a `leaderboard` card arrives in the journal, the way §12
says things arrive: where you finished, who was on the podium, your run, and the
week starting from zero again.

**It cannot ride the weekly review.** The review is sold — `scheduler.ts:163` is
explicit that it is the only path that spends one, and `POST /reviews/run`
answers 402 to a plan with none left — and §9 puts friends on every tier for
free. So the settlement is its own Monday pass at the same local hour as
`REVIEW_WEEKDAY` (`scheduler.ts:77`), with **no model call at all**: a template
over server-computed numbers, in five locales, for the same reason §12.1 gives.
It costs the price of one query per friend group and it is the cheapest thing in
this document.

**No push about anybody's position, ever.** §7's rule stands unchanged. "Marta
passed you" is the leaderboard delivered to a lock screen, and it is the single
fastest way to turn this into the thing §1 refuses. The settlement may push as a
fact about the reader's own week — the shape `push/notify.ts:63` already uses for
the review, routing to `/progress` — or it may not push at all.

### 14.5 No new tables

The live board is `loggedDates` (`services/streaks.ts:35`) widened from one user
to a list:

```sql
-- The friend list is already in hand from `friendships`; this is one
-- index-only scan over `food_entries_day` for the whole group rather than one
-- per member. `local_date` is each person's own date, in their own timezone at
-- their own `day_start_hour`, so "how many of your days did you log" needs no
-- timezone arithmetic here — only the *window* is the reader's, and
-- `weekStartFor()` (`shared/day.ts:156`) supplies it, already starting on the
-- Monday `REVIEW_WEEKDAY` starts on.
SELECT user_id, count(DISTINCT local_date) AS days
  FROM food_entries
 WHERE user_id = ANY($1) AND local_date >= $2 AND local_date <= $3
 GROUP BY user_id;
```

Nothing is stored, for the reason `streaks.ts` gives about itself — so a meal
replayed from the offline outbox retroactively repairs the standing it should
have produced.

The **settled** week is different and freezes: the Monday card carries its own
numbers inside `chat_messages.actions`, exactly as the `review` card already
carries the week it describes. That asymmetry is the correct one. The present is
what is true; history is what it said at the time. A card that quietly rewrote
last week's podium three days later would be a card nobody could quote.

### 14.6 One badge group, and it only exists for people with friends

§6 refused friend-dependent badges as dead cells on a solo wall and proposed its
own answer: a group that appears only once a friendship does.
`ACHIEVEMENT_GROUP_KEYS` gains `'together'`, and `GROUP_OF` being a
`Record<AchievementKey, …>` means a key added without a group will not compile
(`index.ts:1500`).

| Key | Group | Needs a friend |
| --- | --- | --- |
| `perfect_week` | `streaks` | No — 7/7 is worth marking alone |
| `week_won` | `together` | Yes — finished first, ties count |
| `week_won_5` | `together` | Yes |

`achievements` (039) is write-once, so `week_won` marks the first time and never
becomes a counter. The board is the ongoing reward; the badge is the receipt for
the first one.

### 14.7 Where it lives, and how to leave it

**§7's friend list becomes the board.** Not a second screen — the same rows on
Progress, ordered by this week's days and then by streak instead of by name. §7's
stated reason for alphabetical was that ranking is the leaderboard; that is now
the point rather than the objection. Its unstated one — that 24 shuffling rows
are harder to scan than 24 fixed ones — is real, and the answer is that the
reader's own row is pinned and marked wherever it falls.

With no friends there is no board, and Progress shows §13's one-line invite row.
A leaderboard with one row on it is the saddest object in software.

**One toggle, and leaving is silent.** Off means you are a friend who is not on
the board, and nobody is told — the same principle §8 applies to removal, for the
same reason. A board you cannot leave is a board that is doing something to you
rather than for you.

### 14.8 The wellbeing argument, restated for this

§1's case against a deficit board — that it pushes hardest at exactly the person
`checkWellbeing()` exists to stop pushing — does not reach a logging board. The
way to win is to log, `adaptive.ts` is built to calibrate against what actually
gets logged, and a person under pressure to post a 7 is under pressure to write
down the biscuit rather than to skip it.

The residual risk is a different one and should be written down rather than
waved off: **a board can make daily logging compulsive for somebody for whom
logging is already the problem.** That is what §14.7's toggle is for, and it is
the reason the board settles weekly instead of ticking live. If `checkWellbeing()`
is firing for somebody, the settlement card is the wrong thing to hand them that
Monday and should be held.
