-- Three tiers, and the rename that comes with them.
--
-- `pro` becomes `plus`, which is a rename rather than a migration of meaning:
-- every account holding it was on the same entitlement and stays on it. The
-- name changed because a third tier arrived above it and "pro" is the wrong
-- word for the middle of three.
--
-- `coach` is new and nobody is on it. It exists because the kitchen — recipes
-- and meal plans — is the one part of the product that caching cannot make
-- cheaper. Logging is an input problem, so a cache fixes it; a meal plan is
-- 10k output tokens and output is never cached. Putting a $0.41 action inside
-- the same tier as a $0.03 one meant the tier was priced for whichever user
-- showed up, so the expensive half got its own price.
--
-- The CHECK is rewritten rather than extended because Postgres has no ALTER
-- CONSTRAINT for one, and doing it in this order — widen, backfill, narrow —
-- means the table is never briefly in a state that rejects its own rows.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;

UPDATE users SET plan = 'plus' WHERE plan = 'pro';

ALTER TABLE users ADD CONSTRAINT users_plan_check
  CHECK (plan IN ('free','plus','coach'));

-- ---- Counting a month -------------------------------------------------------
--
-- Every allowance below a day is already answered by a sequential scan of
-- `ai_usage` filtered to one account, which is fine at the size that table is.
-- A monthly window is not: it reads thirty times as many rows, on the hot path
-- of every chat turn, and it runs *before* the turn rather than after — so it
-- is latency the user is standing there waiting for.
--
-- `occurred_at DESC` rather than plain, because every one of these queries is
-- interested in the recent end and none of them ever reads the far end.
CREATE INDEX IF NOT EXISTS ai_usage_user_kind_recent
  ON ai_usage (user_id, kind, occurred_at DESC);
