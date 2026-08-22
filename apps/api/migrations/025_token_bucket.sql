-- Governing the metered lane in tokens rather than in requests.
--
-- One row per model, because Anthropic's rate limits are per model and `MODELS`
-- in `ai/client.ts` already routes by turn kind: a meal log on Haiku and a
-- weekly review on Opus draw on separate ceilings, and a single shared counter
-- would throttle each against the other's budget.
--
-- In Postgres, for the reason `turn_lock_until` is a column: an in-process
-- bucket stops defending anything the moment there is a second replica, which
-- is the direction this whole plan travels in. Redis is where the *request*
-- limiter's counters go, but Redis is optional there — a personal install runs
-- one process and needs none — and this ceiling has to hold on precisely the
-- deployment that is metered, configured cache or not.
--
-- No user_id, deliberately. This protects an org-wide per-model ceiling that
-- every account draws on together. The per-account ceilings live elsewhere and
-- are a different question: CHAT_LIMIT counts requests, the turn lease counts
-- concurrency, and the recipe budget is counted off the cost ledger.
CREATE TABLE IF NOT EXISTS model_token_buckets (
  model       TEXT PRIMARY KEY,
  -- Tokens available as of `refilled_at`. The balance is never read without
  -- the elapsed refill being applied to it, so the pair is one value in two
  -- columns rather than a number that ages.
  --
  -- Double precision because a refill is a rate times an interval, and
  -- rounding that down on every admission would leak capacity quietly.
  --
  -- Allowed to go negative: a turn that read more than it reserved settles the
  -- difference when it ends, and the honest record of an overshoot is a debt
  -- the next refill pays off rather than a zero that forgets it happened.
  tokens      DOUBLE PRECISION NOT NULL,
  refilled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
