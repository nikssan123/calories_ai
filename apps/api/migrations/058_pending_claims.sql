-- An address a guest has typed is not the account's address until it is proved.
--
-- 056 put a guest's claimed address straight into `users.email`, unconfirmed.
-- Everything else in the server treats `users.email` as who the account is: the
-- password reset looks rows up by it, the admin allowlist and the subscription
-- lane grant privileges by it, the new-sign-in alert and the deletion receipt
-- are sent to it. A guest who typed a stranger's address — by mistake, or on
-- purpose — therefore handed that stranger a reset link into the guest's journal,
-- or pointed an owner-only privilege at a row nobody had proved.
--
-- So the claimed address waits here instead, and moves to `email` only when the
-- six-digit code comes back through the guest's own session. Until then the row
-- has no address as far as anything else can tell.
ALTER TABLE users ADD COLUMN pending_email TEXT;

COMMENT ON COLUMN users.pending_email IS
  'a guest''s claimed address, unconfirmed; moves to email when the code is entered in the guest''s own session';

-- Rows 056 left with an unconfirmed claim in `email` (development only — 056 was
-- never deployed) are moved to the new column.
UPDATE users
   SET pending_email = email, email = NULL
 WHERE guest_since IS NOT NULL AND email IS NOT NULL AND email_verified_at IS NULL;

-- The Google identity a guest is saving with, carried from the callback to the
-- exchange. The callback runs in whatever browser opened the consent screen, so
-- it must not attach anything; the exchange runs with the guest's own session.
ALTER TABLE auth_tokens ADD COLUMN payload JSONB;
