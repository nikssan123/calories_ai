-- Which turns the sold grants are allowed to count, and which ones earned it.
--
-- `ai_usage` has been two instruments in one table since 006. It is the cost
-- ledger, which must hold every turn that spent a token — including the ones
-- that failed — and it is the meter, which decides when somebody is refused.
-- The two agreed for as long as every turn did the same kind of work, and they
-- stopped agreeing the day the journal learned to answer a sentence that logs
-- nothing.
--
-- On 2026-09-22 a Bulgarian guest opened the app, typed "Здрасти", was greeted
-- back, logged eggs, logged fried bread, and was refused at the fourth message.
-- A guest's grant is three (`GUEST` in @ct/shared) and a third of it went on
-- hello. They closed the save-your-account screen and did not come back — the
-- only `guest_limit` rung the funnel has recorded since the grant was cut to
-- three, spent on a greeting.
--
-- The greeting was also the most expensive of that guest's three turns — $0.10
-- against $0.027 each — because the first turn of a session pays for the prompt
-- cache write. So a price threshold would have charged for the hello and waved
-- the two real meals through, which is the wrong way round twice. What actually
-- separates that turn from the other two is not what it cost. It is that
-- nothing was written to the journal.
--
-- ---- Two columns, because "free when it logs nothing" is a free model ---------
--
-- `metered` is the grant's question: did this turn spend one of the account's
-- units. `changed_journal` is the journal's: did a tool write anything. They
-- are not the same question, and collapsing them into one is how the obvious
-- version of this becomes abusable.
--
-- The obvious version gives every account a few free journal-less turns a day.
-- It does not survive contact: a guest install is a fresh row, so "a day" is
-- the whole life of the account, and the allowance is really "free turns per
-- reinstall". Worse, if a chatter turn charged past that allowance were also
-- allowed to *earn* the next free one, hello and hello alternate for as long as
-- the grant lasts and every guest costs twice what they used to.
--
-- So the free turns are earned rather than granted: `FREE_TURNS.starter` to
-- begin with — enough to be greeted back and to ask what the app does — and one
-- more for each turn that actually put something in the journal. Somebody who
-- logs nothing gets the starter and nothing else, and then every message costs
-- a unit like it did before. Somebody logging their meals is never charged for
-- talking about them. The ceiling is not a number anybody had to choose: it is
-- the starter plus the grant, because earning one costs a unit of the grant.
ALTER TABLE ai_usage ADD COLUMN metered BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN ai_usage.metered IS
  'whether this turn spent a unit of the plan grant; false on a successful turn that changed nothing — see FREE_TURNS in @ct/shared';

-- Nullable, and null is not a third state of the grant: it means the turn had
-- no journal to change. A weekly review, a nudge, a recipe and a fridge scan
-- all write rows here and none of them logs a meal, so the earning count asks
-- `WHERE changed_journal` and a null falls out of it on its own. Every row
-- written before this migration is null for the same reason it is harmless:
-- the earning window is a rolling day, and none of them is in it.
ALTER TABLE ai_usage ADD COLUMN changed_journal BOOLEAN;

COMMENT ON COLUMN ai_usage.changed_journal IS
  'whether a journal turn wrote to the log; null on turns with no journal behind them — earns one free turn, see FREE_TURNS';

-- No index. Both counts are one account over one rolling day, which
-- `ai_usage_user` (006) already narrows to a handful of rows; the flags are a
-- recheck on those, not a scan. The cost reports, which are the only thing here
-- that reads the far end of the table, do not filter on either column.
--
-- TRUE by default on `metered`, and that is the load-bearing part of the
-- DEFAULT: every row already written stays counted, so nobody is handed back
-- turns they have already spent. It is also what makes this safe to deploy in
-- either order, unlike 060 and 062 — an old container's INSERT simply omits
-- both columns and gets a counted turn, which is exactly what it meant. A NOT
-- NULL with a constant default is metadata-only on PG11+, so nothing rewrites
-- the table.
