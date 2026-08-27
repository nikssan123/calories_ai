-- The badges, and the one thing about them that has to be written down.
--
-- Almost everything in this feature is derived. Both streaks are a walk over
-- `food_entries.local_date` and `exercise_entries.local_date` with nothing
-- stored, on purpose: the offline outbox replays meals carrying their original
-- `eaten_at`, so a counter column would be wrong from the moment a phone lost
-- signal until the moment it synced. Deriving means a late entry retroactively
-- repairs the run it filled in, which is the behaviour anybody would expect and
-- nobody would think to ask for.
--
-- This table is the exception, and the reason is that a badge is a fact about
-- the past rather than about the log. Somebody told they had logged a hundred
-- days should not lose that by tidying up an entry from March. So the moment of
-- earning is recorded, once, and never revoked — while the `best` number beside
-- it stays derived and is allowed to move if the history underneath it does.

CREATE TABLE achievements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The key, never the sentence.
  --
  -- This is the deliberate divergence from `alerts`, which stores rendered
  -- `title` and `body` and has a good reason to: its wording is a format string
  -- over numbers that keep moving, so a row holding only its inputs would
  -- render tomorrow's sentence when asked what yesterday's said. A badge's
  -- wording is fixed, so that argument does not reach here — and copying the
  -- pattern would buy a badge wall in English on a phone set to Bulgarian.
  --
  -- No CHECK constraint, for the reason 038 gives about `locale`: the set will
  -- change more often than the schema should, and a migration to add a
  -- fifteenth badge is a migration for nothing. `ACHIEVEMENT_KEYS` in
  -- packages/shared is the real gate, and it is what the write path validates
  -- against.
  key        TEXT NOT NULL,

  -- The reader's own date, so "earned 3 March" is their 3 March and not the
  -- server's. Runs from `day_start_hour`, like every other date in this schema.
  local_date DATE NOT NULL,

  earned_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The idempotency, in an index rather than in a check-then-write — the same job
-- `alerts_once` and `nudges_once` do, and the same reason. The evaluation runs
-- on an ordinary day-summary read, which means it runs on every log, from every
-- replica, and two of them can pass the same read. Only the index settles it.
--
-- It is also what makes the badge permanent: there is no update path and no
-- delete path, so a row here can only ever be written once.
CREATE UNIQUE INDEX achievements_once ON achievements (user_id, key);

-- Read whole on the Progress screen, and read on every evaluation to answer
-- "which of these does this person already hold" before computing anything
-- expensive. Small by construction — fourteen rows at most.
CREATE INDEX achievements_owner ON achievements (user_id, earned_at DESC);
