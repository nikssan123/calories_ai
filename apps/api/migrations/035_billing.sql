-- Where a plan came from, and when it runs out.
--
-- `034` gave an account a tier. This gives it a *provenance* and a *deadline*,
-- which are the two things a store subscription has and a hand-set column does
-- not.
--
-- `plan_source` exists because the sweep at the foot of `services/billing.ts`
-- has to tell a subscription apart from a grant. A comped account and an expired
-- subscriber both sit on `plus` with no future renewal; only the source says
-- which is which, and without it the one query that protects revenue is also
-- the one that cancels the founder's own account.
--
-- 'manual' is the default rather than 'none' for the same reason: every row that
-- exists today was set by hand or by nobody, and both are things the sweep must
-- leave alone.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_source TEXT NOT NULL DEFAULT 'manual'
  CHECK (plan_source IN ('manual','stripe','play','app_store'));

-- Null means "does not expire", which is what a manual grant is. A store
-- subscription always carries one, and it is the renewal date rather than the
-- cancellation date — a cancelled subscription still has time left on it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- Every notification we were sent, whether or not it changed anything.
--
-- The primary key is the store's own event id and that is the entire
-- idempotency mechanism. A webhook worth having retries — RevenueCat redelivers
-- on any non-2xx — and a redelivered RENEWAL that extended the period a second
-- time is a subscription outliving what was paid for. Insert first, conflict,
-- do nothing, answer 200.
--
-- `payload` is kept whole. When a disputed charge turns up months later the
-- question is what the store actually said, and a schema designed before the
-- question was asked will not have kept the field that answers it.
CREATE TABLE IF NOT EXISTS billing_events (
  id           TEXT PRIMARY KEY,
  -- Deliberately not a foreign key. An event for an account that has since been
  -- deleted is still the record of a real payment, and losing the audit row is
  -- worse than holding an id that resolves to nobody.
  user_id      UUID,
  type         TEXT NOT NULL,
  store        TEXT,
  product_id   TEXT,
  expires_at   TIMESTAMPTZ,
  environment  TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload      JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_events_user ON billing_events (user_id, received_at DESC);

-- The sweep's index. It reads one narrow slice — paid, from a store, past due —
-- and without this it is a sequential scan of every account on an hourly tick.
CREATE INDEX IF NOT EXISTS users_plan_expiry ON users (plan_expires_at)
  WHERE plan_expires_at IS NOT NULL;
