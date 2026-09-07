-- The Monday digest is the one email the coach product sends on its own, so
-- it gets its own switch — on the coach row, not on `users.notify_weekly_review`,
-- which is the coach's *own* journal preference and must not be conflated.
ALTER TABLE coach_accounts ADD COLUMN notify_digest BOOLEAN NOT NULL DEFAULT TRUE;
