-- The trial an account was actually sold, written onto the account.
--
-- The free trial was cut from seven days and 28 messages to three and 9. An
-- account whose trial had already started keeps the old terms, and this is the
-- column that remembers which.
--
-- ---- Why a column and not a cutover date -------------------------------------
--
-- The cheaper shape is a constant: trials started before instant X keep the
-- week. It cannot be made correct. X has to be the moment the new server
-- deploys, and that is not a date anybody knows while writing the constant.
-- Set it before the deploy and every account saved in between is promised seven
-- days by the app it is holding and refused at the fourth message by the server
-- — which is indistinguishable from a bug, and is reported as one. Set it after
-- and the change silently does nothing until the date passes.
--
-- Stamping the terms at the moment the trial starts has neither failure. The
-- promise and the ceiling are decided together, once, and they cannot drift.
ALTER TABLE users ADD COLUMN trial_terms JSONB;

COMMENT ON COLUMN users.trial_terms IS
  'the trial this account was sold: {days, chat, photo}; null means it has not started one';

-- Every trial already running keeps the seven days and the 28 messages.
--
-- `COALESCE(trial_started_at, email_verified_at)` rather than `trial_started_at`
-- alone, because that is exactly how `allowanceFor` decides an account is on the
-- road: accounts confirmed before `057` added the column have a trial by virtue
-- of their confirmation date and no `trial_started_at` at all. Stamping only the
-- explicit column would leave those reading as unstamped, which is today's
-- terms, which is the cut this migration exists to prevent.
--
-- Trials that have long since ended are stamped too. It costs a column write and
-- it keeps the rule with no exceptions: `ended` is `allowed: null` on either
-- terms, so the stamp changes nothing for them and is simply true.
UPDATE users
   SET trial_terms = '{"days": 7, "chat": 28, "photo": 1}'::jsonb
 WHERE COALESCE(trial_started_at, email_verified_at) IS NOT NULL;
