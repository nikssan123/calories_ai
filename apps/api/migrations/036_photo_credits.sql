-- Photo scans bought outright, on top of what a plan grants.
--
-- Why photos and nothing else: a scan is $0.213 against a chat turn's $0.058,
-- so it is the one meter that decides whether a heavy month fits inside a tier.
-- Metering chat this way would put a price on the daily habit the whole product
-- depends on; nobody photographs a plate absent-mindedly, so photos can carry a
-- price without discouraging anything.
--
-- ---- A ledger rather than a counter -----------------------------------------
--
-- The obvious shape is `users.photo_credits INT` and a decrement. This is a
-- table of signed deltas instead, and the balance is their sum, for three
-- reasons that all showed up in `billing_events`' own design notes:
--
--   * **Idempotency.** A webhook worth having retries — RevenueCat redelivers
--     on any non-2xx — and a redelivered purchase against a bare counter is
--     free scans, silently, forever. Here the grant carries the store's event
--     id and a unique index refuses the second one. A counter has nowhere to
--     put that id.
--   * **Provenance.** When somebody writes in asking where their scans went,
--     the answer is a list of rows, not a number that has always been what it
--     is now.
--   * **Refunds.** A REFUND event is a negative row, which is the same code
--     path as a purchase. Against a counter it is a special case that clamps at
--     zero and loses the fact that it happened.
--
-- Balance is `sum(delta)` over one account, which is a sequential scan of a
-- handful of rows behind the index below, and it is read once per photo turn
-- rather than once per request.
CREATE TABLE IF NOT EXISTS photo_credits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Positive for a purchase, negative for a scan that drew on the balance or a
  -- refund that took it back. Never zero: a row that changes nothing is noise
  -- in the audit this table exists to be.
  delta      INTEGER NOT NULL CHECK (delta <> 0),
  reason     TEXT NOT NULL CHECK (reason IN ('purchase','spend','refund','grant')),
  -- The store's own event id for a purchase, and what makes a redelivery a
  -- no-op. Null for a spend, which has no external identity — hence a partial
  -- unique index rather than a unique column, so the nulls do not collide.
  event_id   TEXT,
  -- Which bundle, for the audit. Null on a spend.
  bundle_id  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS photo_credits_event
  ON photo_credits (event_id) WHERE event_id IS NOT NULL;

-- The balance query, which runs on the hot path of a photo turn: one account,
-- every row. Covering `delta` means the sum never touches the heap.
CREATE INDEX IF NOT EXISTS photo_credits_user ON photo_credits (user_id) INCLUDE (delta);
