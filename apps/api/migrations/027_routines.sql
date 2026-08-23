-- The workout somebody actually does, saved so they never build it twice.
--
-- The card that collects a session started by asking for everything: pick from
-- twenty-four exercises, then type reps and a load into every set. That is the
-- right shape for a session nobody has ever done before and the wrong shape for
-- the truth, which is that people repeat themselves. A lifter has three or four
-- workouts and rotates them; the fourth chest day of the month is the third one
-- with two and a half kilos more on it.
--
-- So: a routine is the *list*, and the numbers come from history.
--
-- That split is the one design decision here worth defending, and it is what
-- every serious tracker converged on. A routine that stores loads is a routine
-- that is wrong within a fortnight and has to be maintained; a routine that
-- stores only which exercises, in which order, is true forever, and the weight
-- to put in front of somebody is the weight they used last time — which the
-- sets table already knows.

-- ---- What a muscle group is ---------------------------------------------------

-- Which muscles an exercise is for.
--
-- The catalogue could say what an exercise *is* but not what it is *for*, and
-- without that the app cannot form the sentence anybody actually uses to name a
-- session. "Chest day" is not a category — the category is `strength` for all
-- of it — it is a statement about which muscles the work landed on, and naming
-- a routine, spotting that Monday is always chest, and reporting that shoulders
-- have not been trained in three weeks all need this same column.
--
-- Ordered, primary first: an array rather than a single value because a bench
-- press is chest *and* triceps *and* front delts, and pretending otherwise
-- undercounts two of the three every time. The first element is the one the
-- exercise is chosen for, and it is what names a day.
--
-- Empty for everything that is not lifting. A 5km run has no primary muscle in
-- any sense worth storing, and a yoga class has all of them.
ALTER TABLE exercise_types ADD COLUMN muscles TEXT[] NOT NULL DEFAULT '{}';

-- Every muscle named anywhere must come from this list, or the same muscle
-- arrives as "abs", "core" and "Abdominals" from three different sources and
-- nothing groups. Enforced here rather than in the application because the
-- agent writes this column too, via define_exercise.
ALTER TABLE exercise_types ADD CONSTRAINT exercise_types_muscles_known CHECK (
  muscles <@ ARRAY[
    'chest','back','shoulders','biceps','triceps',
    'quads','hamstrings','glutes','calves','core'
  ]::TEXT[]
);

-- The built-in catalogue, tagged. Primary first in every one of them.
UPDATE exercise_types SET muscles = v.muscles FROM (VALUES
  ('bench press',           ARRAY['chest','triceps','shoulders']),
  ('chest fly',             ARRAY['chest']),
  ('push-up',               ARRAY['chest','triceps']),
  ('dip',                   ARRAY['triceps','chest']),
  ('overhead press',        ARRAY['shoulders','triceps']),
  ('lateral raise',         ARRAY['shoulders']),
  ('face pull',             ARRAY['shoulders','back']),
  ('tricep extension',      ARRAY['triceps']),
  ('barbell row',           ARRAY['back','biceps']),
  ('lat pulldown',          ARRAY['back','biceps']),
  ('seated row',            ARRAY['back','biceps']),
  ('pull-up',               ARRAY['back','biceps']),
  ('bicep curl',            ARRAY['biceps']),
  ('deadlift',              ARRAY['back','hamstrings','glutes']),
  ('romanian deadlift',     ARRAY['hamstrings','glutes']),
  ('squat',                 ARRAY['quads','glutes']),
  ('leg press',             ARRAY['quads','glutes']),
  ('leg extension',         ARRAY['quads']),
  ('leg curl',              ARRAY['hamstrings']),
  ('lunge',                 ARRAY['quads','glutes']),
  ('bulgarian split squat', ARRAY['quads','glutes']),
  ('hip thrust',            ARRAY['glutes','hamstrings']),
  ('calf raise',            ARRAY['calves']),
  ('sit-up',                ARRAY['core']),
  ('plank',                 ARRAY['core'])
) AS v(name, muscles)
WHERE exercise_types.user_id IS NULL AND lower(exercise_types.name) = v.name;

-- ---- The routine --------------------------------------------------------------

-- A workout with a name, belonging to one person.
--
-- Never built from a blank form if it can be helped. The best moment to save a
-- routine is immediately after doing it, when the app already has the exact
-- list and the person is holding their phone — so the ordinary way one of these
-- gets created is a single tap on a session that has just been logged, with a
-- name guessed from the muscles it hit.
CREATE TABLE routines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Theirs to choose, and usually accepted from a suggestion: "Chest day",
  -- "Push", "Legs A". The app guesses from the muscles and gets out of the way.
  name         TEXT NOT NULL,
  emoji        TEXT NOT NULL DEFAULT '🏋️',
  category     TEXT NOT NULL
    CHECK (category IN ('strength','cardio','class','sport','flexibility')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Denormalised from the entries below purely for ordering the picker. The
  -- routine somebody did on Tuesday should be near the top on Thursday, and
  -- computing that with a join on every card render is a lot of work to sort
  -- four rows.
  last_used_at TIMESTAMPTZ
);

-- One name per person. Saving "Chest day" twice is somebody expecting to
-- replace the one they have, not to end up with two identical pickers entries.
CREATE UNIQUE INDEX routines_name ON routines (user_id, lower(name));
CREATE INDEX routines_recent ON routines (user_id, last_used_at DESC NULLS LAST);

-- What is in it, in the order it is done.
--
-- No loads and no reps, deliberately — see the note at the top of this file.
-- `target_sets` is the one number that belongs to the routine rather than to
-- history, because "three sets of this" is part of the plan in a way that
-- "sixty kilos" is not: the plan survives the load going up.
CREATE TABLE routine_exercises (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id  UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  -- SET NULL with the name copied beside it, exactly as exercise_sets does:
  -- deleting a custom exercise must not silently rewrite what a routine is.
  type_id     UUID REFERENCES exercise_types(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  position    SMALLINT NOT NULL,
  target_sets SMALLINT
);
CREATE INDEX routine_exercises_routine ON routine_exercises (routine_id, position);

-- ---- Which routine a session was -----------------------------------------------

-- Sessions remember the routine they came from.
--
-- This is what turns a pile of entries into a pattern. "Monday is chest day" is
-- not something anybody should have to configure — it is a fact already sitting
-- in the history, one row per session, and it only needs the routine written
-- down at the time to be readable later.
--
-- SET NULL rather than CASCADE: deleting a routine you have stopped doing must
-- not delete the record of the months you did it.
ALTER TABLE exercise_entries ADD COLUMN routine_id UUID
  REFERENCES routines(id) ON DELETE SET NULL;

-- The pattern query: this person's sessions, by routine, by weekday.
CREATE INDEX exercise_entries_routine ON exercise_entries (user_id, routine_id, performed_at DESC)
  WHERE routine_id IS NOT NULL;
