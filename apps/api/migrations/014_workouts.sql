-- Workouts with structure: what you did, how many, how heavy.
--
-- `exercise_entries` was built around one sentence and an estimated burn, which
-- is exactly right for "5km run" and useless for "bench 3×8 at 80kg". The
-- difference is not detail for its own sake — for anything in a gym the burn is
-- the number nobody cares about and the load is the whole point, because the
-- question being asked is "is the 80 going up?" and a description cannot answer
-- it.
--
-- So the entry stays the session, and the sets underneath it carry the work.

-- ---- What an exercise is -----------------------------------------------------

-- A catalogue, shared where it can be and personal where it has to be.
--
-- `user_id IS NULL` is a built-in that everyone sees; a row with a user is one
-- this account invented — or, more often, one the agent invented on their
-- behalf when they mentioned something the catalogue had never heard of. That
-- is the point: nobody should have to pick "Other" because their gym does an
-- exercise this app has not been told about.
CREATE TABLE exercise_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL
    CHECK (category IN ('strength','cardio','class','sport','flexibility')),
  -- Decoration, and deliberately stored rather than derived. The keyword table
  -- in the web app guesses a picture from a sentence, which is the right tool
  -- when all you have is a sentence; here the exercise is a known thing and its
  -- picture should not change because somebody reworded the name.
  emoji       TEXT NOT NULL,
  -- What one set of this is measured in, which is what the builder has to know
  -- to draw the right fields: reps and a weight, or a clock, or a distance.
  tracks      TEXT NOT NULL CHECK (tracks IN ('reps','duration','distance')),
  -- Metabolic equivalent, for estimating burn from bodyweight and time. A
  -- single number is a crude model of effort and it is the same crude model
  -- every fitness tracker uses; what matters is that it is applied
  -- consistently, and that §9 still holds — burn is reported beside food, never
  -- netted off the target.
  met         NUMERIC(4,1) NOT NULL DEFAULT 4.0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Two partial indexes rather than one constraint, because a NULL user_id does
-- not collide with itself in Postgres: without the first, the seed could insert
-- "Bench press" as a built-in twice and never notice.
CREATE UNIQUE INDEX exercise_types_builtin ON exercise_types (lower(name))
  WHERE user_id IS NULL;
CREATE UNIQUE INDEX exercise_types_custom ON exercise_types (user_id, lower(name))
  WHERE user_id IS NOT NULL;
CREATE INDEX exercise_types_category ON exercise_types (category);

-- ---- The work itself ---------------------------------------------------------

-- One row per set. "3×8 at 80kg" is three rows, not one row saying three.
--
-- It is more rows and it is the right shape: a set is the thing that varies —
-- the last one is where the reps drop — and collapsing them into a count throws
-- away the only evidence of that. Every progression question anybody asks of
-- this data is a query over these rows.
CREATE TABLE exercise_sets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id     UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
  -- SET NULL rather than CASCADE, and the name is copied alongside: deleting a
  -- custom exercise definition must not quietly delete the history of having
  -- done it.
  type_id      UUID REFERENCES exercise_types(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  -- Which exercise within the session, and which set within the exercise. Both
  -- are needed to redraw a session in the order it was actually done.
  position     SMALLINT NOT NULL,
  set_number   SMALLINT NOT NULL,
  reps         SMALLINT,
  weight_kg    NUMERIC(6,2),
  duration_sec INTEGER,
  distance_m   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX exercise_sets_entry ON exercise_sets (entry_id, position, set_number);
-- The progression query: this exercise, over time, heaviest first.
CREATE INDEX exercise_sets_history ON exercise_sets (type_id, created_at DESC);

-- ---- The session -------------------------------------------------------------

-- Which kind of session it was, so a list of them can be read at a glance and
-- so the burn estimate knows what it is estimating.
ALTER TABLE exercise_entries ADD COLUMN category TEXT
  CHECK (category IN ('strength','cardio','class','sport','flexibility'));

-- Where the numbers came from. 'estimated' is the agent reading a sentence;
-- 'counted' means a person filled in the sets and the burn is arithmetic over
-- them rather than a guess about them. The two deserve different confidence and
-- the entry should say which it is.
ALTER TABLE exercise_entries ADD COLUMN detail TEXT NOT NULL DEFAULT 'estimated'
  CHECK (detail IN ('estimated','counted'));

-- 'workout' joins text/photo/quick/manual: an entry built by somebody filling
-- in the card, which is neither the agent reading a sentence nor a form on a
-- settings screen.
ALTER TABLE exercise_entries DROP CONSTRAINT exercise_entries_source_check;
ALTER TABLE exercise_entries ADD CONSTRAINT exercise_entries_source_check
  CHECK (source IN ('text','photo','quick','manual','workout'));
