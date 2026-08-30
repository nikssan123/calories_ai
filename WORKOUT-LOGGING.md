# Logging a session without typing it

Nothing here is built. This is the plan for making a gym session something you
tap rather than something you write, and for giving sports the same treatment.

It rests on one observation about *when* people log, which turns out to decide
almost every other choice below.

## The short version

Every fast gym logger — Hevy, Strong, FitNotes — is fast for the same reason:
you log **during** the session, one exercise at a time, in the ninety seconds
between sets. Hevy's celebrated "two taps per set" is two taps *twelve separate
times*, each paid out of rest you were spending anyway. The cost is real and it
is invisible.

This app logs **after**. The card is opened while you are still catching your
breath, or on the train home, or in the chat that evening — and the whole
session lands in one sitting. Twelve sets is not twelve cheap moments, it is one
expensive one. That is why the current card feels the way it does, and it is why
copying Hevy's set grid wholesale would not fix it.

For an after-the-fact log, the goal is not a faster keystroke. **It is no
keystroke.** Everything below follows from that:

1. The numbers are already there when the card opens, because the server
   already knows what you lifted last time and does not tell anyone.
2. An exercise is one line — `3 × 10 @ 60` — not a grid of six fields, because
   the six fields hold two distinct numbers.
3. You find an exercise by the muscle it works, not by remembering what this app
   decided to call it.
4. The chat stops being a rival to the card and starts being its front door: it
   hears "leg day, squats and lunges" and hands over a card with that already in
   it, instead of interrogating you for the rest of the sentence.

And separately, because it is nearly broken rather than merely slow: **two hours
of volleyball cannot be logged from the card at all** (§3).

---

## 1. What logging costs today

Measured, not estimated. Three exercises, three sets each, reps and load — the
example that started this.

| Step | Taps |
|---|---|
| Exercise tab → *Log a workout* | 1 |
| *add what you did* (`WorkoutCard.tsx:654`) | 1 |
| Find and tap 3 exercises among 25 unsorted chips | 3 + scanning |
| *another set* ×2 per exercise (each starts with one blank set) | 6 |
| Fill the grid: 3 × 3 × (reps, load) | **18 fields, ~40 keystrokes** |
| Duration chip | 1 |
| *Log it* | 1 |

Roughly thirty interactions and forty keystrokes, twelve of which retype a
number that has not changed since the set above it. Every one of the eighteen
fields is a bare `TextInput` (`Cell`, `WorkoutCard.tsx:759`) with a number pad
behind it.

Three separate things are wrong, and they have three separate fixes:

**The grid opens empty.** `previousSetsFor()` (`services/routines.ts:140`)
already returns the last recorded sets for *every* exercise this account has
ever done, in a single query. It is wired only to routines
(`GET /routines?withPrevious`). Tap "Bench press" from the picker and you get
blank cells although the server can say `3 × 10 @ 60, last Tuesday` without
another round trip.

**The grid is the wrong shape.** Nine set rows hold two numbers. "Three sets of
ten at sixty" is how it was planned, how it was done, and how it will be said —
but the UI insists on the expansion.

**The picker is a list, not a search.** 25 strength exercises, alphabetical, one
flat run of chips (`WorkoutCard.tsx:606`). No search, no grouping, no aliases.
`muscles` is populated on every built-in by migration `027` and used for nothing
but naming a saved routine. And if your exercise is not in the list, the UI
offers nothing at all — `define_exercise` is chat-only, there is no
`POST /exercise-types` and no `defineExercise` in `packages/api-client`.

---

## 2. What the incumbents actually do

Four mechanics recur across every serious logger. Three are worth taking.

**Previous, shown per set, autofilled.** Hevy prints your last performance
beside each set row and pre-fills sets, reps and weight when you add an exercise
you have done before — reviewers routinely call this the single most useful
feature in the category, because progressive overload *is* "last time plus a
bit". Strong does the same with less chrome. **Take this**, with one change
(§4).

**A ✓ per set, which starts the rest timer.** You tap a checkmark to close a set
and a countdown begins. This is excellent and it is inseparable from logging
during the session — it is a *pacing* control that happens to also record. It
does not survive being moved to the train home. **Defer** (§7).

**Search plus filters, and a body map.** Fitbod searches by name, muscle group
or equipment; iMuscle and Vicifit let you tap a muscle on an anatomical figure
and see what works it. This is the direct answer to "people don't know the
names" — you do not know it is called a *Romanian deadlift*, but you know it is
the one for the back of your legs. **Take this.**

**Voice, as a 2026 category of its own.** Liftly, GhostFit, FitEcho and Gym
Journal all sell "speak your sets" — and they all work the same way: *short*
utterances, *mid-set*. "Bench, 135 for 10." That is four words about one
exercise, said while the bar is racked. This app's chat is used after the fact
for a whole session at once, which is the shape where dictation collapses —
which is exactly the complaint that opened this document. The lesson is not that
chat is wrong. It is that chat is wrong *for the long form*. **Take it as a
constraint on the nudge** (§5).

Worth naming what the friction actually costs: the reported abandonment on
workout apps runs around 70% inside 90 days, attributed largely to manual-entry
fatigue, and serious lifters still carry paper notebooks because paper has less
friction than most apps. Losing a log is losing the user.

---

## 3. Sports are nearly broken, not merely slow

The prompt that started this said "we should support sports as well — 2 hours
volleyball/football". Take that literally and the card cannot do it:

- **`DURATIONS = [30, 45, 60, 75, 90]`** (`WorkoutCard.tsx:70`, and the same
  line in the web card). There is no chip for 120 and no way to type one. A two
  hour session is unloggable from the card. Worse, `nearestDuration()`
  (`:882`) silently snaps a remembered 120 to 90, so a routine that carries a
  two-hour duration quietly loses half an hour when it is offered back.
- **Volleyball is not in the catalogue.** Migration `015` ships eleven sports —
  football, basketball, tennis, padel, squash, badminton, climbing, boxing,
  martial arts, golf, skiing. No volleyball, handball, hockey, rugby, table
  tennis, dancing, skating, or surfing.
- **A duration-only session does not record what the sport was.** With no
  exercises, `describe()` (`services/workouts.ts:536`) returns the category
  label, so the journal says "Sport", and `estimateBurn` falls through to
  `CATEGORY_MET.sport = 7.0` flat — the same figure for golf (4.8) and martial
  arts (10.3), a factor of two either way.
- **`tracks: 'distance'` has no UI.** Running, Walking, Cycling and Swimming are
  `distance` in the catalogue. The card branches on `tracks === 'reps'` and
  everything else falls to a *minutes* cell (`WorkoutCard.tsx:559`), so
  `distance_m` is never written by the card at all.

So the only working path for "2 hours volleyball" is the chat, via
`log_exercise` — which produces a *described* entry with a burn the model
invented, rather than a *counted* entry with a burn computed from bodyweight and
a MET. **The worse record is the only one reachable.** That is backwards, and it
is the cheapest thing in this document to fix.

---

## 4. The design

### 4.1 One line per exercise

The centrepiece. Replace the set grid with a single line, and put the grid
behind a disclosure for the sessions that genuinely need it.

```
  today                                  proposed
  ┌───────────────────────────┐          ┌──────────────────────────────────┐
  │ 🏋️ Bench press         × │          │ 🏋️ Bench press               ×  │
  │  1  [ 10 ]reps [ 60 ]kg   │          │    last time  3 × 10 @ 60         │
  │  2  [ 10 ]reps [ 60 ]kg   │          │   − 3 +      − 10 +     − 60 +    │
  │  3  [ 10 ]reps [ 60 ]kg   │          │    sets       reps       kg       │
  │     + another set         │          │   ⌄ sets differed                 │
  └───────────────────────────┘          └──────────────────────────────────┘
     6 fields, all typed                     3 steppers, usually 0 taps
```

Three decisions inside that box, each load-bearing:

**The steppers move by the real granularity.** Reps ±1. Load **±2.5 kg / ±5 lb**
— a plate, not an integer, because nobody has ever added one kilogram to a
barbell. Long-press accelerates; tapping the number itself opens the keypad for
the rare exact figure. The unit follows `useUnits()` exactly as `Cell` does now.

**`DraftExercise.sets[]` stays.** The line is a *writer* over the existing array
— moving the sets stepper adds or drops copies of the current values. Nothing
downstream changes: `toExercise()`, the payload, `writeSets`, the per-set rows in
`exercise_sets`. This is a view over the model, not a new model, which is what
keeps "sets differed" free.

**"Sets differed" is the escape hatch, not the default.** Drop sets, pyramids
and a set you failed early are real and rare. Expanded, it is exactly today's
grid, and it is the only place per-set numbers can diverge.

### 4.2 Prefill from history, with the provenance visible

`previousSetsFor()` already computes this for the whole account in one query.
Expose it: `GET /exercise-types` gains `?with_previous=1` and each type carries
`previous: SetValues[]`. The card fetches it with the catalogue it already
fetches on category change (`WorkoutCard.tsx:172`), so this costs one join, not
one request.

Adding any exercise from the picker then opens on what you did last time —
sets, reps and load — not on blanks.

**The one place we diverge from Hevy.** Hevy autofills the fields and the number
becomes indistinguishable from one you entered. We prefill *and* print
`last time 3 × 10 @ 60` above the steppers. A prefilled figure is a claim you
accepted rather than one you made, and the app's whole posture on estimates —
`confidence` on every entry, "partly measured" on day totals — says provenance
gets shown. It is also just useful: the line you are trying to beat is the line
you want on screen.

**The combined effect.** The thirty-interaction session at the top becomes:

| Step | Taps |
|---|---|
| *Log a workout* | 1 |
| Tap the **Legs** routine chip — whole grid fills from last time | 1 |
| Nudge the one lift that moved | 1–2 |
| *Log it* | 1 |

**Four taps, zero keystrokes.** With no saved routine yet: search, three picks,
three loads typed, log — about ten taps. Note how hard this leans on routines
already existing, which is §4.5.

### 4.3 Finding the exercise

A search field above the chips, and grouping under it.

- **Search matches name, muscle and alias.** `leg` → everything hitting quads,
  hamstrings, glutes or calves. `chest` → bench, fly, push-up, dip. Aliases go
  in a new `aliases TEXT[]` column on `exercise_types` so `bench`, `BP`, `RDL`,
  `pulldown`, `curls`, `OHP`, `squat rack thing` all land somewhere.
- **Chips group under muscle headers** — Chest, Back, Legs, Shoulders, Arms,
  Core — instead of one alphabetical run. `MUSCLE_GROUPS` and `MUSCLE_LABEL`
  (`packages/shared/src/index.ts:346`) already exist for this.
- **Your recents first**, above the catalogue. It comes free with the
  `with_previous` join: an exercise with history sorts ahead of one without.
- **The miss path is a chip, not a dead end.** No match on what you typed →
  `＋ Add "landmine press"`. Needs `POST /exercise-types` and `api.defineExercise`
  in the client. Category comes from the card, `tracks` and MET can be guessed
  from the category with a sane default (`reps`, 5.0) and corrected later —
  getting the exercise into the picker matters more than getting its MET right,
  because the burn on a strength session is the number nobody came for.

A body map is the obvious extension and is deliberately **not** in this phase.
Search-by-muscle gets most of its value in a fraction of the work; if the search
box turns out not to close the naming gap, the map is the next thing to try.

### 4.4 Sports, as their own shape

Not strength with the fields hidden. A sport session is three facts: what, how
long, and — sometimes — how far.

```
  Sport ▸
  ⚽ Football   🏐 Volleyball   🎾 Tennis   🏀 Basketball   🧗 Climbing   …
  How long
  [30] [45] [60] [90] [ 2h ] [ ⌨ ]
```

Four changes, all small:

1. **Migration `040_catalogue_sports.sql`** — volleyball (6.0), handball (8.0),
   hockey (7.8), rugby (8.3), table tennis (4.0), dancing (5.5), skating (7.0),
   surfing (3.0), plus `aliases` from §4.3. Compendium values, rounded, same as
   `015`.
2. **The picker leads for non-strength categories.** Pick `Sport` and the sport
   chips are what you see — one tap, and it is the *first* tap rather than one
   hidden behind "add what you did". The session then carries a `type_id`, so
   `describe()` says "Volleyball" and `metFor` uses 6.0 instead of the category's
   flat 7.0.
3. **Duration stops topping out at 90.** Chips gain `2h`, and a keypad affordance
   beside them for anything else. `nearestDuration()` must stop rounding an
   out-of-range figure into the chip set — a remembered 120 shows as 120.
4. **A distance cell exists.** Third branch on `tracks`, writing `distance_m`,
   in whatever `distanceUnit(units)` says. Today `distance` silently renders as
   minutes, which is a wrong number rather than a missing one.

The result: *2 hours volleyball* is three taps, produces a counted entry with a
real MET behind it, and can be saved as a routine and repeated like anything
else. Today it is unreachable from the card and lands as a model's guess.

### 4.5 Routines do the heavy lifting — so stop hiding them

Everything in §4.2 pays out best through a saved routine, and routines are the
part of this system that is already right: a routine stores the *list and the set
counts*, never the loads, and the loads come from history
(`services/routines.ts:87`). That is the correct call and this plan does not
touch it.

The problem is purely that routines are hard to acquire. Today one is created by
the agent offering after a logged session, or by `RoutineEditor` behind a
"build one" link in the corner of a panel (`exercise/Workouts.tsx:146`).

- **Offer the save in the card, not only in the chat.** `offerSave` already
  computes a name and a condition (`WorkoutCard.tsx:249`); it appears after the
  fact. Show it on the *second* session that matches an existing one by exercise
  list — `matchRoutine` at `ROUTINE_MATCH_LIKELY` already does this arithmetic.
- **Strength opens on the routine chips and the grid, not on the duration.** The
  card's current shape — duration required, exercises optional behind a link —
  is right for cardio, class, sport and flexibility, and wrong for strength,
  where the exercises *are* the session and the duration is the throwaway. Branch
  on category.

---

## 5. The chat, as the card's front door

The handover is currently lossy, and that is the whole reason a nudge would
annoy people rather than help them. `ask_workout` (`ai/tools.ts:811`) takes
`category`, `when` and `heard` — say three exercises and you are handed an empty
card. You are punished for having used chat.

**Give `ask_workout` an `exercises` field.** Name plus whatever sets, reps and
load were heard, in the shape `workoutExercisesField` already defines for
`log_workout` (`ai/tools.ts:615`) with everything nullable. The card opens seeded
with it, blanks filled from history per §4.2. Handover becomes lossless, and
only then is nudging fair.

**Then the prompt rule.** In `ai/prompt.ts` §"Which exercise tool", one addition:

> The moment a turn is *enumerating* — two or more exercises, or any sets, reps
> or loads being read out — stop collecting in prose. Take what you have,
> call `ask_workout` with it, and let them finish on the card:
> *"Put your leg day in — check the weights."* Never ask a second question to
> complete a list. One-liners stay in the chat: "bench 3×8 at 80" is
> `log_workout` and always was.

That line is drawn where the research says to draw it. Short utterance about one
exercise: chat wins, and that is the whole business model of the voice loggers.
Whole session at once: the card wins, and it is not close.

**And one nudge, once.** After the first seeded card, a single clause — *"next
time, tap Log a workout on the Exercise tab; it opens on last week's numbers."*
Once per account, then never again. The same posture as the habit-noticing rule
already in the prompt: say it once, do not make a project of it.

---

## 6. Order

1. **§4.2 prefill + §4.1 the exercise line.** The thirty-interaction session
   becomes four taps. Mobile and web cards, plus the `with_previous` query
   parameter. Largest win, entirely additive, no migration.
2. **§4.4 sports.** Smallest, and it fixes something that does not work at all.
   One migration, one duration control, one distance cell.
3. **§4.3 the picker.** Search, muscle grouping, recents, add-your-own. One
   migration for `aliases`, one new route.
4. **§4.5 routines surfaced** in the card.
5. **§5 `ask_workout(exercises)` + the prompt rule.** Last on purpose: nudging
   toward the card is only honest once the card is the better place to land.

---

## 7. Deliberately not doing

**A live in-gym mode** — start a session, tick each set off with a ✓, rest timer
between. It is what makes Hevy feel fast, and it is a second app inside this one:
a foreground session with its own state, notifications, a lock-screen presence,
and an answer for the session you forgot to end. This app's posture is *log
after, ask in the chat*, and §4.1–4.3 are a bet that an after-the-fact log can be
four taps without it. Revisit if that bet fails; the ✓-per-set mechanic is the
thing to build first if it does.

**A body map picker.** See §4.3 — search-by-muscle first, and only build the
figure if naming is still the thing stopping people.

**Per-set RPE, warm-up flags, supersets, plate calculators, 1RM estimates.**
Hevy and Strong have all of these. They are for people who have already decided
to log every session for a year, and this document is about the people who have
not decided that yet.

**Storing loads on a routine.** Repeating the tempting mistake: a routine is a
plan, sets are part of the plan, and sixty kilos happened last Tuesday. The
existing design is right.

---

## Sources

- [Hevy — Track workouts](https://www.hevyapp.com/features/track-workouts/) · [Hevy features](https://www.hevyapp.com/features/) · [Hevy tutorial](https://www.hevyapp.com/hevy-tutorial/) · [Hevy rest timer](https://www.hevyapp.com/features/workout-rest-timer/)
- [Hevy vs Strong (2026), PRPath](https://prpath.app/blog/strong-vs-hevy-2026.html) · [Hevy vs Strong, Setgraph](https://setgraph.app/ai-blog/hevy-vs-strong-app-comparison-2026) · [Strong vs Hevy, GymGod](https://gymgod.app/blog/strong-vs-hevy)
- [Best workout tracking app on logging speed, RepReturn](https://repreturn.com/best-workout-tracking-app/) · [Hevy vs Strong vs Fitbod vs Jefit, Sensai](https://www.sensai.fit/blog/hevy-vs-strong-vs-fitbod-vs-jefit)
- [Fitbod (App Store)](https://apps.apple.com/us/app/fitbod-gym-fitness-planner/id1041517543) · [Exercise filtering for trainers, FitSW](https://www.fitsw.com/blog/personal-trainer-exercise-filtering/) · [iMuscle body-map picker](https://www.medgadget.com/2011/06/imuscle-app-helps-you-craft-workouts-for-specific-muscle-groups.html)
- Voice loggers: [Liftly](https://apps.apple.com/us/app/liftly-voice-workout-logging/id6752257498) · [GhostFit](https://ghostfit.ai/) · [FitEcho](https://fitecho.ai/blog/what-is-fitecho-voice-workout-tracker) · [Gym Journal](https://apps.apple.com/us/app/gym-journal-ai-workout-log/id6756803786)
- Friction and abandonment: [Why fitness apps make consistency harder, GainStrong](https://getgainstrong.com/blog/why-fitness-apps-make-consistency-harder) · [Pen and paper vs apps, ForgeLogbooks](https://www.forgelogbooks.com/blog/workout-logging-guide-pen-paper-vs-apps) · [Voice logging vs typing, TuffWraps](https://www.tuffwraps.com/blogs/news/stop-typing-between-sets-how-voice-logging-changed-my-workouts)
- Manual sport entry conventions: [Strava manual activities](https://support.strava.com/en-us/articles/15402188-uploading-manual-activities) · [Apple Health, add a workout manually](https://support.apple.com/en-us/101952)
