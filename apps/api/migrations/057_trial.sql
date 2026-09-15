-- Free's model is a road now: a guest day, a seven-day trial from the moment the
-- account is saved, then none. See `LIMITS.free` in `services/plans.ts`.
--
-- The column is when the week began. Null is a guest — or an account whose
-- address is not proved yet, which is the same thing to the meter.
--
-- Every account that already exists starts its week today rather than on the
-- day it signed up: counting from sign-up would take the model away from most of
-- them the moment this ships, with no warning and no week to decide in. That is
-- every proved address, and the rows from before there were addresses at all.
-- Guests (056) and unconfirmed sign-ups are left null and start theirs when an
-- identity is proved — `startTrial`.
ALTER TABLE users ADD COLUMN trial_started_at TIMESTAMPTZ;

UPDATE users SET trial_started_at = now()
 WHERE guest_since IS NULL
   AND (email_verified_at IS NOT NULL OR email IS NULL);
