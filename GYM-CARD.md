# The gym card, second pass

`built-plans/WORKOUT-LOGGING.md` made a session something you tap rather than
something you write, and the thing it got right is still right: `3 × 10 @ 60` on
one line, opened on last time's numbers. This is the pass over everything
*around* that line, plus the two problems the first pass did not see.

Two complaints, from using it:

1. **The card is hard to fill out.** It asks four questions in one chat bubble —
   kind, routine, length, exercises — and only one of them is a question the
   person came to answer. Measured at 2½ screens tall before you have typed
   anything.
2. **Every exercise looks the same, and you have to know its name.** The
   catalogue carries five emoji across 220 exercises, so 🏋️ means "strength"
   rather than "bench press". And the way in is a search box, which assumes you
   know that what you did is called a Romanian deadlift. Plenty of people know
   only that they trained biceps.

The second is the more interesting one, because the fix for "they all look the
same" turns out to also be the fix for "I don't know the name".

---

## 1. The icon is a muscle map

There is no emoji for a Romanian deadlift and there never will be. The five in
the catalogue are *category* glyphs wearing an exercise's clothes, so every
barbell movement collides by construction.

But every row already carries `muscles`, primary first, over fourteen groups.
One SVG body with fourteen highlightable regions turns that into a distinct icon
for all 220 — primary solid, secondary faded — with no assets to draw, no
licence to buy, correct in both themes, and still correct when the catalogue
grows. The figure shows the back view when the primary muscle lives there.

It also answers the more useful question. A novice cannot tell a good morning
from a rack pull by name; "this one lights up the back of your legs" lands
immediately.

Geometry lives in `packages/shared/src/body.ts` so the two clients cannot drift
apart on where a deltoid is.

## 2. Equipment, stored not guessed

The muscle map says what an exercise works. It cannot say what you pick up, and
"Barbell curl" versus "Cable curl" versus "Preacher curl" is exactly the
distinction a beginner is trying to make in the picker.

So: an `equipment` column — `barbell`, `dumbbell`, `cable`, `machine`,
`bodyweight`, `kettlebell`, `other` — and six small line glyphs. Nullable,
because a sport has no equipment and a user-defined exercise should not be
interrogated for one.

Deliberately a column and not a regex over the name. A pattern that reads
"machine" out of "Machine row" also reads it out of "Smith machine squat" and
then quietly fails on "Hack squat", and the failure is invisible — a wrong glyph
looks exactly like a right one.

## 3. A muscle is a complete answer

If somebody only knows they trained biceps, the app should take that. Fourteen
catalogue rows — `Biceps work`, `Chest work`, `Quads work` — ordinary
`ExerciseType`s with one muscle each, so nothing downstream changes: they get a
MET, they group under their muscle, they carry sets and reps like anything else.

The picker offers the muscle as the first answer under that muscle, above the
named exercises. The row stays upgradeable: it is an exercise like any other, so
tapping it later and picking a real one is an ordinary edit.

The honest cost: these read as "Biceps work — 3 × 12 @ 30 kg" in the history, and
they are a weaker `previous` than a named exercise, because two different curls
logged as `Biceps work` average into one line. That is the trade for not losing
the session altogether, which is what happens today.

Aliases are the body words only — `biceps`, `bicep`, `arms` — never the movement
words. `curl` staying unclaimed keeps it available for a future widening of
`findExerciseType`, which should prefer a real exercise over a generic.

## 4. The picker opens on a body

Search stops being the front door and becomes one of three ways in, ordered by
how often each is the answer:

1. **What you have done before** — people repeat themselves, and it costs
   nothing; it rides on the `with_previous` read the card already makes.
2. **The body** — tap a muscle. No vocabulary at all, which was the complaint.
3. **Search** — for somebody who knows the name.

And the sheet stays open across picks. Today every pick collapses the picker and
pushes the submit button further away, so four exercises is four round trips
down the card. Multi-select, then one Add.

## 5. The card stops asking two questions

**Category is derived, never asked.** `ExerciseType.category` already exists;
picking "Bench press" *tells* the app it is strength. This deletes the chip row,
and with it the trap where switching kind silently wipes the exercises
(`WorkoutCard.tsx:480` before this change). The catalogue read widens to every
category, which `listExerciseTypes` already supports — `category` has always
been optional.

**Length is a guess you can correct.** Its only job is pricing the burn, so it
stops being a labelled row of seven chips above the exercises and becomes one
muted line below them, seeded from the routine, then the last session of that
kind, then 45. Printed `≈ 45 min`, which is how the app labels every other
estimated number.

## 6. Strength gets a sheet; everything else keeps the card

A sport or a class is genuinely two taps — "two hours of football" is the whole
answer — and a full screen for it would be worse than what is there now. A
strength session is eight exercises and does not belong in a chat bubble.

So the split is by the weight of the answer, not by taste: `workout_prompt`
renders the card as today for the four non-strength kinds, and strength pushes a
sheet with a sticky footer. In the conversation the answered card collapses to
its receipt either way.

---

## Order

1. `packages/shared` — body geometry, equipment vocabulary, generic-muscle
   helpers.
2. Migration `048` — the column, its values, the fourteen rows.
3. API — carry `equipment` through `listExerciseTypes` and friends.
4. Mobile — `BodyFigure`, `EquipmentTag`, the picker, the card, the sheet.
5. Web — the same icon, so a coach reading a client's session sees what the
   client saw.

## What is not in this pass

**Live logging.** Ticking sets off during the session with a rest timer is where
Hevy wins, and it is a different product: it needs a resumable draft, a
notification, and a session that survives the app being closed. The first pass
argued this app logs *after*, and that is still true. Fixing the after-the-fact
form first is the cheaper half, and it is the half that is currently broken.

**Per-exercise illustrations.** 220 drawings in a house style, times two themes.
The muscle map gets most of the way there for none of the cost; if the animated
demonstration ever earns its place it should sit behind a tap on the row, not in
the list.
