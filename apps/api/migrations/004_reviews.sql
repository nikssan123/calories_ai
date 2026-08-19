-- Weekly reviews and adaptive targets.
--
-- The numbers in a review are computed in SQL (services/adaptive.ts); the prose
-- is written by the agent from those numbers. Both halves are stored: `stats` so
-- a review can be re-rendered or audited without re-running the model, `content`
-- because that is what the user actually reads.

CREATE TABLE weekly_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Inclusive local_date bounds of the week being reviewed.
  week_start   DATE NOT NULL,
  week_end     DATE NOT NULL,
  content      TEXT NOT NULL,
  stats        JSONB NOT NULL,
  -- The chat message this review was published as, so the journal and the
  -- Progress screen show the same text rather than two copies of it.
  message_id   UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One review per week per user. The scheduler relies on this: a second
  -- attempt in the same week is a no-op rather than a duplicate.
  UNIQUE (user_id, week_start)
);
CREATE INDEX weekly_reviews_recent ON weekly_reviews (user_id, week_start DESC);

-- When the adaptive pass last ran, so an hourly scheduler tick is cheap and a
-- restart cannot trigger a second review for a week already done.
ALTER TABLE users ADD COLUMN last_review_at TIMESTAMPTZ;

-- Adaptive targets need to distinguish "the user typed this number" from "the
-- weekly pass derived it". Both are is_custom = FALSE as far as the profile
-- recalculation is concerned; `source` records which produced the row.
ALTER TABLE targets ADD COLUMN source TEXT NOT NULL DEFAULT 'calculated'
  CHECK (source IN ('calculated','adaptive','manual'));

-- Existing rows written by a user override were already flagged is_custom.
UPDATE targets SET source = 'manual' WHERE is_custom = TRUE;
