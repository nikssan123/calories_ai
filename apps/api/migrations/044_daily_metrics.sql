-- Ambient signals from a device: what the phone counted, kept apart from what
-- the person logged.
--
-- The table INTEGRATIONS.md §"Schema" specified, arriving ahead of the
-- providers it was drawn for. Only `steps` is written today, by the phone's own
-- pedometer; the rest of the columns are here because the shape is already
-- decided and adding a column to a table nobody reads is cheaper than a second
-- migration against one everybody does.
--
-- The whole design rests on one line from that document, and it is worth
-- repeating where the data lands rather than only where it was argued:
--
--     device data may inform the target, but it may never be subtracted from
--     intake unless a human would have logged it as a session.
--
-- Which is why this is not `exercise_entries` and never becomes it. A discrete
-- workout — a run somebody chose to go on — is a session, and it goes there. A
-- day's ambient walking is already inside `adaptive.ts`'s observed TDEE, and
-- priced a second time into `predictTdee`'s activity multiplier. Writing it to
-- `exercise_entries` as well would count it three times and pull the target
-- down for the people moving most.
CREATE TABLE IF NOT EXISTS daily_metrics (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The reader's local date, resolved through `localDateFor` with the account's
  -- timezone and `day_start_hour` — not the device's calendar day. Somebody
  -- with the default 4am rollover who walks home at 1am walked yesterday, and
  -- no pedometer knows that.
  local_date   DATE NOT NULL,

  -- Which sensor spoke. Part of the key rather than a plain column, because a
  -- phone and a watch reporting the same day is a real situation in which
  -- neither is wrong, and collapsing them on the way in would make the answer
  -- depend on which one synced last. Reconciling two feeds is a decision for
  -- whoever reads them, and it needs both rows to make it.
  source       TEXT NOT NULL DEFAULT 'device',

  steps        INTEGER CHECK (steps >= 0),

  -- Not read by anything yet. `active_kcal` and `total_kcal` in particular are
  -- the double-count trap in numeric form: when they do arrive, `total_kcal` is
  -- for anchoring `SANITY_BAND` against a measurement instead of a demographic
  -- average, and `active_kcal` is for nothing at all.
  active_kcal  NUMERIC(7,1),
  total_kcal   NUMERIC(7,1),
  resting_hr   SMALLINT,
  hrv_ms       NUMERIC(6,2),
  sleep_min    NUMERIC(6,1),

  -- Touched on every upsert. A day is re-sent constantly — today's count is
  -- still climbing at 3pm — so this is the only way to tell a figure that was
  -- confirmed a minute ago from one last heard on Tuesday.
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, local_date, source)
);

-- The two reads this table gets: one day for the summary, and a window for the
-- chart. The primary key already leads with `user_id`, so this exists only for
-- the range scan the window does — and it is the ordering the chart wants.
CREATE INDEX IF NOT EXISTS daily_metrics_user_date_idx
  ON daily_metrics (user_id, local_date DESC);
