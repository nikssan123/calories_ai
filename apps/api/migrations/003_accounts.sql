-- Multi-user. Every table already carried user_id, so this migration only adds
-- credentials, sessions, and the onboarding marker.

ALTER TABLE users ADD COLUMN email         TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMPTZ;

-- Case-insensitive uniqueness, but only for rows that have an email: the
-- pre-existing single-user row has none until it is claimed at first signup.
CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE auth_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Only the hash is stored; the raw token exists solely in the user's cookie.
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user ON auth_sessions (user_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions (expires_at);

-- Anyone who finished setup under the single-user build counts as onboarded.
UPDATE users SET onboarding_completed_at = now() WHERE is_setup_complete = TRUE;
