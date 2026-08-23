-- Where a notification goes when it is not an email.
--
-- `notify_weekly_review` and `notify_nudges` have been on the users table since
-- the beginning and have only ever meant *mail*. On a phone that is the wrong
-- channel for a nudge: the switch is the person saying yes to being told
-- something, and answering that with an email is answering a different
-- question. This is the address the answer needs.
--
-- One row per device rather than per account. A person may carry a phone and a
-- tablet, and either may be reinstalled, restored from a backup, or handed on;
-- the token is the only thing that identifies which of those we are talking to,
-- so it is the key.
CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE CASCADE, and this is the one decision here worth arguing.
  --
  -- `email_deliveries.user_id` is ON DELETE SET NULL, because a record of what
  -- was sent should outlive the account it was sent to. That reasoning does not
  -- transfer, and 028 is the migration that explains why: severing `user_id`
  -- severs a join, not an identity. A push token *is* a live address — it is
  -- the handle that makes a phone buzz — so an orphaned one is not a record of
  -- anything, it is a way to reach somebody who has asked to be forgotten.
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Expo's token, not the raw FCM or APNs one. The relay is what lets a single
  -- server-side call reach both platforms without this table growing a column
  -- of per-platform credentials, and without the API learning two protocols to
  -- say one sentence.
  --
  -- Unique across every account, not per account. A phone handed to somebody
  -- else keeps its token, and the second person to sign in on it must *take*
  -- that address rather than share it — two rows would mean one device
  -- receiving another person's food log.
  token       TEXT NOT NULL UNIQUE,

  -- For nothing but reading the table: what is sent is identical either way.
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Touched every time the app registers, which is every cold start that has
  -- permission. A token nobody has confirmed in months belongs to an app that
  -- was deleted without telling us, and Expo will eventually say so — but a
  -- date is cheaper to sweep than a send is to attempt.
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only read this table gets: every device for one person, at send time.
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id);
