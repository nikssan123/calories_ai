-- Signing in with Google.
--
-- A separate table rather than a `google_id` column on `users`, because the
-- relationship it records is genuinely one-to-many: one account, and over time
-- more than one way into it. Adding Apple or GitHub later is a row here, not
-- another nullable column and another migration.
--
-- `subject` is the provider's own immutable id for the person — Google's `sub`
-- claim. Deliberately not the email address: people change the address on a
-- Google account, and an identity keyed on email would silently become a
-- different identity the day they did. The email below is stored anyway, but
-- only as a record of what was seen; nothing is ever looked up by it.

CREATE TABLE oauth_identities (
  provider      TEXT NOT NULL,
  subject       TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- What the provider said the address was at the last sign-in. Informational.
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);

-- Deliberately not unique on (user_id, provider). An account reached from two
-- different Google accounts is not a conflict to resolve — both are doors into
-- the same room, and the person who owns a work address and a personal one
-- should not have the second sign-in fail with an integrity error.
CREATE INDEX oauth_identities_user ON oauth_identities (user_id);
