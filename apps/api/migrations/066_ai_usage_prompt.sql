-- What was actually asked, alongside what it cost.
--
-- Every row in `ai_usage` is a price with no subject: a $0.11 photo_log and a
-- $0.0007 text_log look the same in the panel, and the only way to find out
-- which sentence produced either was to open the account's conversation and
-- match on the clock. That is unworkable for the rows the table exists to
-- explain — the failed turn, the turn that cost ten times its neighbours, the
-- greeting that ate a third of a guest's grant (see 063, which is the story of
-- one such turn reconstructed by hand).
--
-- Nullable, and null is the common case rather than a defect: a weekly review,
-- a nudge, a fridge scan and a photo with no caption are all turns nobody typed
-- a sentence for, and inventing one for them ("Log this meal.") would fill the
-- column with the prompt this program wrote. Only a turn with a person's own
-- words in it carries them.
ALTER TABLE ai_usage ADD COLUMN prompt TEXT;

COMMENT ON COLUMN ai_usage.prompt IS
  'the user''s own words for this turn, truncated at write; null when nobody typed any — see PROMPT_KEPT in services/usage.ts';

-- No index, and no backfill. The column is read in the admin panel's newest-50
-- listing and nowhere else, and there is nothing to backfill from: the rows
-- already written did not keep it.
--
-- ---- Deletion --------------------------------------------------------------
--
-- This is the first column here that holds anything a person wrote, which makes
-- it the first one an account deletion has to care about. `user_id` is
-- ON DELETE SET NULL by design (006) so the cost history survives the account,
-- and a surviving row that still quotes the deleted account defeats the
-- deletion while looking like an accounting decision. `deleteAccount` in
-- services/admin.ts clears this column before the user row goes; the numbers
-- stay, the words do not.
