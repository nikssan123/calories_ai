-- Which prompt asked for the account, on the two funnel steps that have one.
--
-- 055 counts `save_prompt` and `account` flat, and that is one number short of
-- the question the guest design exists to answer. The save-your-account screen
-- is opened from four places (the ladder in GUEST-ACCOUNTS.md): the spent guest
-- meter, a purchase, the You tab, and the soft ask after a first meal. Only the
-- first of those is the wall that the guest allowance is built around, and on
-- 2026-09-20 a French guest spent all four of their logs, was shown the screen,
-- and closed it — visible in the funnel as `save_prompt 1, account 0`, with no
-- way to tell that rung from somebody idly tapping the You tab.
--
-- Still a count and not a record. The column holds one of four words shared by
-- every install that reaches the screen — `SAVE_REASONS` in `@ct/shared` — and
-- nothing about a phone. It is null on every other step, and on an `account`
-- that came in off the sign-in screen, which has no prompt behind it.
ALTER TABLE onboarding_funnel ADD COLUMN reason TEXT;

COMMENT ON COLUMN onboarding_funnel.reason IS
  'which prompt asked, on save_prompt and account; null elsewhere — see SAVE_REASONS in @ct/shared';

-- The key gains the column, which a PRIMARY KEY cannot express: `reason` is
-- null on most rows, and two nulls are distinct to a primary key, so every
-- `welcome` ping would insert a new row instead of finding the one to increment.
-- A unique index with NULLS NOT DISTINCT (PG15+) is the same constraint with
-- the nulls folded together, and serves as the ON CONFLICT target the same way.
--
-- The old four-column `ON CONFLICT` cannot infer this index — it errors — so the
-- API that ships with this migration is the only one that can write the table.
-- That is safe because migrations run before the new container binds and the old
-- one is already gone by then: pings in the restart gap fail to connect, which
-- the phone already treats as "not sent" and tries again.
ALTER TABLE onboarding_funnel DROP CONSTRAINT onboarding_funnel_pkey;
CREATE UNIQUE INDEX onboarding_funnel_key
  ON onboarding_funnel (day, step, platform, app_version, reason) NULLS NOT DISTINCT;
