-- When a coach's card stopped working. `lapsed` keeps Plus on every seat for a
-- grace period counted from here — see `expireLapsed` — and clears the moment
-- the subscription is active again.
ALTER TABLE coach_accounts ADD COLUMN lapsed_at TIMESTAMPTZ;
