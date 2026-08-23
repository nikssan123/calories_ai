-- The week somebody says they train, as opposed to the week they turn out to.
--
-- `exercise_entries.routine_id` already makes the second one readable: a
-- routine done on three Mondays is a Monday habit, worked out from history with
-- nothing to configure. That is the right default and it has one flaw — it
-- knows nothing until the third week. Somebody who has just arrived, and who
-- could tell you their split in ten seconds, gets nothing from it.
--
-- So this is the declared half. What they say outranks what was inferred,
-- because it is a statement of intent rather than an observation, and a person
-- describing their own training is a better source than an average over four
-- data points. Days left blank keep falling back to the inference, so filling
-- this in stays optional and partial answers are useful.

-- One routine per day of the week, per person.
--
-- A row per day rather than a column on `routines`, because the mapping is
-- many-to-one in the direction that matters: push/pull/legs run twice through a
-- six-day week, so "Push" is Monday *and* Thursday. A `weekday` column on the
-- routine could only ever hold one of them.
--
-- The primary key is the constraint that matters: a day has at most one
-- planned workout. Setting Monday again replaces Monday.
CREATE TABLE routine_days (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 0 = Sunday, matching Postgres' EXTRACT(DOW) and JavaScript's getDay, so the
  -- declared half and the inferred half are directly comparable without either
  -- side translating.
  weekday    SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  -- CASCADE, unlike the reference from `exercise_entries`: a schedule entry
  -- pointing at a deleted routine is a plan to do something that no longer
  -- exists, where a *session* pointing at one is a record of something that
  -- actually happened and must survive.
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, weekday)
);

-- "Which days is this routine on?", for showing the schedule against the
-- routine rather than against the week.
CREATE INDEX routine_days_routine ON routine_days (routine_id);
