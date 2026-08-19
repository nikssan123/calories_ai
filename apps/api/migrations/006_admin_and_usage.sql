-- Admin panel and per-turn AI cost accounting.
--
-- Two unrelated-looking things ship together because they answer the same
-- question: "is this viable as a product?" needs cost per turn, and the panel
-- that reads it needs somewhere to disable an account from.

-- ---- Cost accounting --------------------------------------------------------

-- One row per agent run. `cost_usd` was previously buried in the tool_trace
-- JSONB of a chat message, which made it unqueryable and lost every turn that
-- failed before a message was written — precisely the turns that cost money
-- without producing value.
CREATE TABLE ai_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deliberately SET NULL rather than CASCADE: deleting an account must not
  -- rewrite the cost history the viability question is answered from.
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider     TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('text_log','photo_log','setup','review')),
  -- The model the turn was routed to. The per-model split (a turn can touch
  -- several) is in `breakdown`; this is the one the router asked for.
  model        TEXT NOT NULL,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd     NUMERIC(12,6) NOT NULL DEFAULT 0,
  -- Where the number came from, because they are not equally trustworthy:
  --   reported  — the provider priced it (Claude Code returns total_cost_usd)
  --   estimated — we priced it ourselves from a rate card that will go stale
  --   unknown   — tokens counted, no price available; cost_usd is 0, not free
  cost_source  TEXT NOT NULL DEFAULT 'unknown'
    CHECK (cost_source IN ('reported','estimated','unknown')),
  duration_ms  INTEGER,
  num_turns    INTEGER NOT NULL DEFAULT 0,
  -- Failed turns are recorded too: a turn that burns tokens and then errors is
  -- the worst kind of cost, and averaging it away would flatter the numbers.
  ok           BOOLEAN NOT NULL DEFAULT TRUE,
  error        TEXT,
  breakdown    JSONB
);
CREATE INDEX ai_usage_recent ON ai_usage (occurred_at DESC);
CREATE INDEX ai_usage_user ON ai_usage (user_id, occurred_at DESC);

-- ---- Admin ------------------------------------------------------------------

-- Suspends an account without destroying anything it logged. The session hook
-- rejects a disabled user, so existing cookies stop working immediately.
ALTER TABLE users ADD COLUMN disabled_at TIMESTAMPTZ;
