-- Speaking first.
--
-- Until now the app has been entirely reactive except for one thing: the Monday
-- review. Everything else waits to be opened. That is the right default for a
-- journal and the wrong one for a coach — nobody is told when they have not
-- logged for four days, or when the scale has been flat for a fortnight against
-- a goal of losing.
--
-- The channel already exists and is proven. A review writes an assistant
-- message into the journal and then optionally emails it; a nudge is the same
-- shape, smaller. What this migration adds is the record of having sent one,
-- which is what makes the whole thing safe to run on an hourly tick.

-- ---- What was sent, and when -------------------------------------------------

CREATE TABLE nudges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which pattern fired. Not a free-text label: the trigger is decided in SQL
  -- and the model only chooses the wording, so this column is the honest record
  -- of why the app spoke rather than a summary of what it said.
  kind       TEXT NOT NULL CHECK (kind IN ('dormant','stalled','protein_short','quality_short')),
  local_date DATE NOT NULL,
  content    TEXT NOT NULL,
  -- The journal message this became. Nullable because the message is written
  -- first and a nudge with no message would still be worth not re-sending.
  message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The same idempotency trick as weekly_reviews.UNIQUE(user_id, week_start), and
-- it is doing the same job: the tick runs hourly, in every timezone, and this is
-- what makes a second attempt at the same nudge a no-op rather than a duplicate
-- arriving in somebody's inbox at 19:00 and again at 20:00.
CREATE UNIQUE INDEX nudges_once ON nudges (user_id, kind, local_date);

-- Read on every tick to answer "have they had one recently", which is the rate
-- limit that keeps this from becoming the reason someone uninstalls.
CREATE INDEX nudges_recent ON nudges (user_id, local_date DESC);

-- ---- Whether they want one at all --------------------------------------------

-- Opt-in, unlike the weekly review, and the difference is the point: a review
-- is a thing you asked for that arrives on a schedule you know about. A nudge
-- arrives because the app decided to say something. Defaulting that to on for
-- every existing account would be sending unsolicited mail on their behalf.
--
-- This governs the *email* only. The in-app message is always written, because
-- a message sitting in the journal next time they open it is not an
-- interruption — it is the journal doing what it already does.
ALTER TABLE users ADD COLUMN notify_nudges BOOLEAN NOT NULL DEFAULT FALSE;

-- ---- Cost accounting ---------------------------------------------------------

-- A third kind of agent run, and therefore a third kind of cost.
--
-- Same reason 011 widened this and the same consequence for skipping it:
-- `recordUsage` swallows its own write failures on purpose, so a nudge would
-- spend real money and record nothing at all, silently.
ALTER TABLE ai_usage DROP CONSTRAINT ai_usage_kind_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_kind_check
  CHECK (kind IN ('text_log','photo_log','setup','review','pantry_scan','recipe','nudge'));
