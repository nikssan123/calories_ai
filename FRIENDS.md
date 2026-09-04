# Friends

Written 2026-09-04. Companion to `STREAKS.md`, whose one rule this obeys and
extends, and to `COMPETITION.md` §2, which lists social as "Low, deliberately
excluded" — a line that stands for almost everything in the category and not for
the two things below.

**The short version.** Two features on one graph. Friends send each other
**recipes**, and friends can see **whether the other showed up**. Nothing else
crosses between two accounts: no calorie figure, no macro, no weight, no target,
no entry, no photo. The mechanic every competitor ships is a ranking over the
deficit. This one ranks nothing, and the only number that travels is a count of
days logged.

The build is smaller than it sounds. There is no feed, no inbox, no profile, and
no new tab. It is one join table, four provenance columns on tables that already
exist, and three touchpoints on screens people already open.

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
completed, not weight lost. Nothing below builds that board, because §7 argues
the friend list should be unranked at this size, but the rule permits it and a
later change of mind costs no migration.

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

**3. The friend list lives under Progress**, as a row beside the badge wall —
the same door pattern `StreakChip` already uses to reach `/achievements`. It
belongs there because the list is about streaks and showing up, which is what
that screen is already about.

The list itself: a name, a flame with their run, a filled or hollow dot for
today, and the pair run where there is one. **Ordered by name, never by streak.**
Ordering by streak is ranking, ranking is the leaderboard, and the leaderboard is
the thing §1 exists to refuse. At 24 rows alphabetical is also simply easier to
read.

Empty state, on Progress, in full: *"Friends — invite someone you cook with."*
No count, no illustration, no badge.

### The invite flow

One button, the OS share sheet, a link. Not an email, not a code to type.

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
5. **Web and mobile** — share sheet, Cook strip, Progress row, friend list.
6. **`/f/<token>` and `/r/<slug>`** — the two public pages and the OG render.
7. **Push** — the one kind.

Steps 1–4 are the whole risk. 5–7 are surface over shapes that already exist.

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
- **Sequencing.** `COMPETITION.md` still calls Apple Health / Google Fit sync and
  offline logging blockers, and `OFFLINE.md` is a plan rather than a build. This
  is upside; those are one-star reviews.
