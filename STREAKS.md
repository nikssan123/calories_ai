# Streaks and achievements

Written 2026-08-27. What `BETS.md` recommended instead of a wager: the same
retention mechanic with none of the licensing, none of the payment rails, and
none of the incentive to eat less.

Companion to `NOTIFICATIONS.md`, which already sends a streak milestone to a
phone, and to `BETS.md`, which sets the one rule everything here obeys.

**The short version.** Half of this is already built and none of it is visible.
`currentStreak()` has been computing an unbroken run since 037; it is private to
`alerts.ts` and fires once, at 20:00, as a push. No screen draws it, no route
returns it, and the paywall already sells it. The work is to expose what exists,
add a small recorded badge set beside it, and hold the line on what a badge is
allowed to be about.

---

## 1. The rule

**Reward showing up. Never reward the number.**

`BETS.md` §5 is the whole argument and it does not weaken when the money is
removed. "Hit your target and not more" pays for eating less and pays for
logging less, and from inside the app those two are the same event. A badge is a
smaller prize than a pot, but it is the same shape of prize, and the failure
mode is identical: the cheapest way to earn it is not to log the biscuit.

So every streak and every badge below is keyed on *you logged*. None is keyed on
*you stayed under*, and none on *you lost weight*. That is not caution about
optics — it is the difference between a mechanic that makes our own data more
trustworthy and one that corrupts it, since adaptive TDEE is computed from
logged intake against the weight trend and has no second source to check against
(`COMPETITION.md` §2: zero Health/Fit references in the codebase).

The one existing exception stays as it is. `goal_reached` congratulates somebody
on the target weight *they wrote down*, once, on arrival. It is a destination
somebody chose, not a repeatable incentive, and no family of weight badges
should grow around it.

## 2. What already exists

| Thing | Where | State |
| --- | --- | --- |
| `currentStreak()` | `services/alerts.ts:270` | Correct. Private. 400-day scan. |
| `streak` alert kind | `037_alerts.sql` | Fires 20:00 local, milestone list of 7. |
| `STREAK_MILESTONES` | `services/alerts.ts` | `[7, 14, 30, 60, 100, 200, 365]` |
| `listAlerts()` | `services/alerts.ts` | **No route. No client reads it.** |
| Paywall copy | `messages/en.ts:963` | *"Your whole history, the ring, and the streak"* |

That last row is the reason this is worth doing before anything else on the
list: the streak is already being sold on the tier comparison and there is
nothing behind it. Same class of thing as `33e3e68`, and the honest fixes are
to draw it or to stop advertising it.

One correction to `BETS.md` §6, which says "the achievement enum in
`packages/shared/src/index.ts` already carries `weight_logged`". That is
`ChatAction.kind` (line 1808) — what the model did this turn, so the journal can
draw a card. There is no achievement enum. The plumbing credited there does not
exist; the plumbing that *does* exist is the alert table, which is a different
and better thing to build on.

## 3. The day boundary is the user's, not the calendar's

A day here runs from `day_start_hour` to `day_start_hour` — 04:00 by default,
so a 1am snack lands on the evening it belongs to. This is already handled
everywhere that matters: `food_entries.local_date` is denormalised through
`localDateFor()` (`shared/day.ts:49`), which subtracts the hour before resolving
the date, and `currentStreak` walks those dates.

The rule that has to hold in the new code, and the one that is easy to get
wrong:

> **"Today" always comes from `localDateFor(now, ctx)`. Never from a device
> calendar date, never from `new Date().toISOString().slice(0, 10)`.**

Get this wrong on the client and the streak appears to break at midnight — three
hours before it actually would, in the window where somebody is most likely to
be looking at their phone and least likely to be forgiving about it. The
existing code sidesteps the whole question by only running at 20:00, when the
two answers agree. A visible streak has no such luxury: it is on screen at
01:30.

The same context also decides how much time is left. At 01:30 with a 04:00 day
start, yesterday is still open — the copy must not say "log today to keep it"
when what it means is "you have two and a half hours".

## 4. The streak

**Strict, plus a best that is never lost.**

The current run breaks on one missed day. That keeps "12 days in a row" a
literally true sentence, which a rest-day allowance does not, and it avoids
inventing a currency — freezes to hold, spend, and eventually sell — for a
product that has an eleven-line reason in `BETS.md` §3 to stay off every
payments surface it can.

What absorbs the loss is a second number beside the first. Breaking a run at 47
days does not erase 47 days; it moves it. `best` is permanent in the way that
matters — a badge earned at day 30 is never revoked (§5) — and merely displayed
otherwise.

```
🔥 12 days      best 47
── miss a day ──
🔥 1 day        best 47
```

**Derived, not stored.** No counter column. Entries arrive late: the offline
outbox (`OFFLINE.md` §1) replays meals logged with no signal, carrying their
original `eaten_at` and therefore their original `local_date`. A stored counter
would be wrong from the moment the phone lost signal until the moment it synced,
and would need a repair path. Derivation gives the correct behaviour for free —
**a late entry retroactively repairs the streak it filled in.**

The cost is one indexed `DISTINCT local_date` scan per read. Three years of
daily logging is about eleven hundred rows on an index-only scan; this is not
the query to optimise before it is measured.

**One implementation, in `shared/day.ts`.** The walk becomes a pure function
over a sorted date list:

```ts
export function streakFrom(dates: string[], today: string): Streak
```

It goes in `day.ts` for the reason that file already states about itself: an
offline phone adds up a day from its cache plus its outbox and cannot ask the
server, and two implementations of the same arithmetic disagree eventually. The
server feeds it from SQL; the phone feeds it from cache plus outbox; the number
does not jump when the network returns.

`services/streaks.ts` becomes the server-side home — `currentStreak` moves out
of `alerts.ts`, which imports it back.

**The at-risk state.** A strict run "ending today" reads **0 for the first
sixteen hours of every day**, because today is not logged yet. The displayed
streak is therefore the run ending **today or yesterday**, with a flag:

| State | Condition | Reads as |
| --- | --- | --- |
| `alive` | run includes today | `🔥 12 days` |
| `at_risk` | run ends yesterday | `🔥 12 days · log today to keep it` |
| `none` | no run | nothing drawn |

This is the single most important detail in the document. Everything else here
is a nice-to-have; getting this wrong makes the feature actively worse than not
shipping it.

## 5. Exercise counts weeks, not days

**A daily exercise streak would be the calorie-ceiling badge wearing a
tracksuit.** "Train every day or lose your run" pays for training through a rest
day, and rest days are not laziness — they are where the adaptation happens. It
is the same failure §1 rejects: a mechanic whose cheapest winning move is a
behaviour the product should be discouraging. It is also the one that lands in
Apple's 1.4 physical-harm territory rather than merely being unwise.

So the exercise streak is **consecutive weeks with at least three active days**.

Three parts of that are load-bearing:

**Weeks.** A week is the natural unit of a training plan — every split in
`routines` repeats weekly, and `routine_days` is literally keyed on weekday. It
is also the unit that makes a rest day free.

**Active days, not sessions.** `Progress.exercise.sessions` is
`entries.length`, so somebody who logs bench, squat and deadlift as three
entries has three "sessions" from one gym visit. Counting distinct
`exercise_entries.local_date` is robust to how granularly a person logs, and
`active_days` already exists as a concept in `ExerciseSummary`.

**A fixed bar of three, not a declared one.** The tempting design reads the bar
off `routine_days` — "you did what you said you would". It is wrong, for a
reason that only shows up later: the schedule is editable, so declaring a sixth
training day on a Friday would retroactively break a twelve-week streak. A bar
that moves under the history is not a bar. Three is fixed, is roughly the WHO
150-minutes-a-week floor, and is one constant to change if it proves wrong.

Somebody training six days a week clears it easily, which is correct — the
streak measures consistency, not volume, and there is no leaderboard for it to
be unfair against (§1: nothing here compares one user to another).

**A weekly streak has to be watchable.** This is the part a daily streak gets
for free and the reason `Streaks.training_week` exists. "3 weeks" is a number
that only resolves on Sunday — too late to act on, too vague to feel like
anything on a Wednesday. So the week in progress travels beside the run as the
*days themselves*, not as a fraction: seven cells with three filled says how far
along the week is **and** which days it was, and a week with Monday and Tuesday
filled reads very differently on a Saturday than one with Thursday and Friday.

**The in-progress week is otherwise the same problem as the in-progress day.** At
09:00 on Monday nobody has trained yet this week, and a streak that reads 0 until
Wednesday is a bug. Same three states, one granularity up:

| State | Condition |
| --- | --- |
| `alive` | this week already has three active days |
| `at_risk` | the run ends at last week; this week is not there yet |
| `none` | no run |

Weeks start Monday, matching the review (`REVIEW_WEEKDAY`), and the week a date
belongs to is resolved from its `local_date` — so the 04:00 day boundary carries
through to the week boundary for free. A Sunday-night session logged at 01:00
counts toward the week that is ending, not the one beginning.

## 6. Achievements

A new table, shaped like `alerts_once` and for the same reason — the write path
can run twice and only an index settles it.

```sql
CREATE TABLE achievements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  local_date DATE NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX achievements_once ON achievements (user_id, key);
```

**The key travels, not the sentence.** `alerts` stores rendered prose on
purpose — its wording is a format string over numbers that keep moving, so a row
holding only its inputs would render tomorrow's sentence when asked what
yesterday's said. That argument does not apply to a badge, whose wording is
fixed, and the cost of copying it here would be a badge wall in English on a
phone set to Bulgarian. Store `streak_30`; let the client say it.

**Never revoked.** Deleting a meal from March does not take back a badge
somebody was already shown. The displayed `best` is derived and may move if
history is edited; the badge does not. Insert-once, no delete path.

**Earned on the day-summary read for today.** Every log already round-trips
`ChatResponse.day`, so the badge appears the instant it is earned with no new
write path and no scheduler pass. Guarded two ways: skipped entirely unless
`localDate === today`, and short-circuited by one indexed read once all keys are
held. Newly inserted keys come back on the response so the client can celebrate
them once; a missed celebration costs nothing, because the badge is in the grid
either way.

### The set

Fourteen, in four rows. Every one earnable on the **free tier** — a grid where
half the cells are locked behind a plan is a paywall advertisement, not an
achievement.

| Row | Keys | Earned by |
| --- | --- | --- |
| Logging streak | `streak_7` `streak_30` `streak_100` `streak_365` | Consecutive logged days |
| Training weeks | `exercise_weeks_4` `exercise_weeks_12` `exercise_weeks_52` | Consecutive weeks with 3+ active days |
| Breadth | `first_photo` `first_barcode` `first_workout` `first_weigh_in` | One of each, ever |
| Volume | `days_100` `days_365` `workouts_100` | Totals, not runs |

Four streak badges against seven `STREAK_MILESTONES`. The notification list is
right for pushes — a fortnight matters when a week just did — and wrong for a
wall, where 7/14/30/60 is four near-identical cells of filler. The push list
does not change; the badge list is a subset of it.

The training ladder is a month, a season, a year — 4/12/52 — because weeks are
coarse and a ladder of 4/8/12/16 would be the same filler problem in a different
unit.

The volume row is the complement to a strict run: somebody who logs five days a
week forever never sees `streak_30`, and somebody who trains twice a week never
sees `exercise_weeks_4`. Neither should conclude the app has nothing to say
about two hundred logged days or a hundred workouts.

**Deliberately absent**, and each of these is a `BETS.md` §5 violation wearing a
different hat: days under target, a weight-lost ladder, a "perfect week" of
on-target days, anything about a calorie ceiling, anything comparing one user to
another.

### The wording

Three catalogues, not one, per `LANGUAGES.md`. Badge strings go in
`apps/web/messages` and `apps/mobile/messages`; the API never renders them.
Twenty-eight keys per catalogue — a name and a line of description each — across
five languages and two apps. `MessageKey` already proves every catalogue has
every key, so the duplication is compiler-guarded rather than drift-prone.

That is the real cost of this feature and it is worth stating plainly: about two
hundred and eighty strings for fourteen badges. It is also the argument for
stopping at fourteen.

## 7. Where it surfaces

**Today** — a chip beside the ring, because the ring is where the streak is
earned. Silent below four days: "1 day streak" is a sentence about having opened
the app, and drawing it on day one teaches that this app keeps score of
everything. `DaySummary.streaks`, non-null only when the date is today, so History
cells do not pay for a query about a number that means nothing on a March day.
The logging streak only: a training streak beside the calorie ring is a second
number answering a question nobody asked while logging lunch.

**Progress** — both streak cards and the badge grid, under the existing charts.
`Progress.achievements` carries earned keys and dates; the grid draws the full
set with the unearned ones dimmed, because a badge you cannot see is not a goal.

**Exercise tab** — the training week and its run, above the log and *outside*
the empty-state branch. A week with nothing in it yet is exactly when somebody
needs to see what the bar is: three empty dots short of a streak is a goal, and
a card that says "nothing logged" is not.

**Nothing new on the lock screen.** The existing `streak` alert already covers
milestones, and the interruption budget is one unprompted message a week
(`interruptions.ts`). A buzz for scanning a first barcode would spend somebody's
whole week's allowance on a fact they already know, having just scanned it.

## 8. The gap this made visible — closed

`alerts.title` and `alerts.body` were English format strings, so a phone set to
Bulgarian got a Bulgarian badge grid and an English push about the same streak.

The row still stores rendered prose, which 037 is right about: the wording is a
format string over numbers that keep moving, and a row holding only its inputs
would render tomorrow's sentence when asked what yesterday's said. What it got
wrong was assuming *one* language. `AlertPrefs` now carries `locale` — the
scheduler already had it on the recipient — and all four kinds are worded from
`email/messages.ts` at the moment they are written. Somebody who later switches
language keeps the sentences they were actually sent, which is what a record of
having spoken should say.

Two smaller things fell out of it:

- The recap's figures go through `formatNumber` rather than
  `toLocaleString('en-US')`, so the separator is the reader's.
- `alert.streakTitles` is an **array indexed by position in
  `STREAK_MILESTONES`**, because the seven titles are bespoke and the
  catalogue's type derivation understands strings, functions and string arrays
  and nothing else. Parallel arrays want a guard, and there is a test that fails
  if either list changes length.

**Still open, and deliberately not fixed here.** `formatBodyWeight(kg, units)`
takes no locale, so the goal alert reads "77.4 kg" inside an otherwise Bulgarian
sentence. Correcting it only there would make the notification disagree with the
app: every screen has the same dot, because the helper is the same one. Widening
it is fifteen call sites across both clients and the prompt — its own job.

## 9. Order of work

- [x] `shared/index.ts` — `Streak`, `Streaks`, `Achievement` on the wire.
- [x] `shared/day.ts` — `weekStartFor()`, `streakFrom()`, `weekStreakFrom()`, pure.
- [x] `apps/api/test/streaks.test.ts` — 18 cases over the arithmetic.
- [x] `services/streaks.ts` — the two reads; `currentStreak` moved out of
      `alerts.ts`, which imports `loggingStreak` back.
- [x] Migration `039_achievements.sql`.
- [x] `services/achievements.ts` — evaluate-and-insert, guarded two ways.
- [x] `buildDaySummary` (today only) and `buildProgress`.
- [x] `apps/api/test/achievements.test.ts` — 19 cases, including the one that
      fails if somebody adds a badge keyed on a calorie ceiling.
- [x] `Streaks.training_week` — the week as days, so the bar is watchable.
- [x] `ExerciseSummary.streak` / `.week`, so the Exercise tab needs no second
      fetch about food to draw a line about training.
- [x] Mobile: `StreakChip` on Today, `TrainingWeek` on Progress and Exercise,
      `Achievements` grid on Progress.
- [x] Web: the same, plus the chip on the desktop `DayRail`.
- [x] 43 keys × 5 languages × 2 catalogues. `pnpm messages` renders all 7,245.
- [x] §8: the milestone push, worded in the reader's language.

All of it is in. The tier list's promise of "your whole history, the ring, and
the streak" is now true.

**One thing changed in the building.** `buildProgress` was specified to *list*
badges while `buildDaySummary` earned them. That is wrong for anybody whose first
stop is Progress: a badge deserved by a workout added on the web would sit
unearned until they next opened Today. Both doors evaluate now, and both swallow
the write's failures — an uncelebrated badge is a nuisance, while a day summary
that 500s because a congratulation could not be written is the app refusing to
show somebody their food.
