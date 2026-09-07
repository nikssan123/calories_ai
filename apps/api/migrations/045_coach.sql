-- The coach seat. See COACH.md.
--
-- A coach is an ordinary account with one extra row, and a client is an
-- ordinary account with one active link. Nothing about the journal changes for
-- either of them; what the link grants is a *read* of the client's log by one
-- named person, and a place for that person to write back.
--
-- This crosses the line FRIENDS.md §1 draws — a body weight and a food quantity
-- travel between two accounts — and does so on purpose: a coach is the one
-- audience a person hires precisely to see the number. The consent is explicit,
-- scoped, and revocable, and every column below that carries it says so.

CREATE TABLE coach_accounts (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name  TEXT,
  -- `trial` and `paid` carry Plus on every seat; `solo` and `lapsed` do not.
  -- The seat count is the only other thing a plan decides, and it is a column
  -- rather than a lookup so the webhook can write what was actually bought.
  plan           TEXT NOT NULL DEFAULT 'trial'
                 CHECK (plan IN ('trial','solo','paid','lapsed')),
  seat_limit     INTEGER NOT NULL DEFAULT 5 CHECK (seat_limit >= 0),
  trial_ends_at  TIMESTAMPTZ,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE coach_invites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id  UUID NOT NULL REFERENCES coach_accounts(user_id) ON DELETE CASCADE,
  -- Eight characters from an alphabet with no 0/O or 1/I, stored without the
  -- dash the client shows. Unique across every coach, so a code identifies the
  -- coach on its own and the accept screen needs nothing else typed.
  code           TEXT NOT NULL UNIQUE,
  email          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  accepted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at    TIMESTAMPTZ
);

CREATE INDEX coach_invites_by_coach ON coach_invites (coach_user_id, created_at DESC);

CREATE TABLE coach_clients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id  UUID NOT NULL REFERENCES coach_accounts(user_id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('active','revoked')),
  -- What the client agreed to show. Meals and weight are on by the accept
  -- screen's own wording; the device metrics are the one toggle that starts
  -- off, because nobody reads "steps, sleep and heart data" as part of a food
  -- log until they are asked.
  scope          JSONB NOT NULL DEFAULT '{"meals": true, "weight": true, "metrics": false}',
  accepted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at     TIMESTAMPTZ,
  revoked_by     TEXT CHECK (revoked_by IN ('client','coach','system')),
  UNIQUE (coach_user_id, client_user_id)
);

-- One coach at a time. A partial unique index rather than a column on users,
-- so the history of who coached whom survives a revoke and a re-accept.
CREATE UNIQUE INDEX coach_clients_one_active
  ON coach_clients (client_user_id) WHERE status = 'active';
CREATE INDEX coach_clients_by_coach ON coach_clients (coach_user_id, status, accepted_at);

CREATE TABLE coach_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date     DATE NOT NULL,
  food_entry_id  UUID REFERENCES food_entries(id) ON DELETE SET NULL,
  body           TEXT NOT NULL,
  -- The journal row the comment was published as. The journal is the one
  -- screen the client already opens, and a review and a nudge land there the
  -- same way; a third role draws a third kind of bubble.
  message_id     UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at        TIMESTAMPTZ
);

CREATE INDEX coach_comments_by_client ON coach_comments (client_user_id, created_at DESC);

-- Private to the coach. Never joined into anything the client can read.
CREATE TABLE coach_notes (
  coach_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body           TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_user_id, client_user_id)
);

CREATE TABLE coach_digests (
  coach_user_id  UUID NOT NULL REFERENCES coach_accounts(user_id) ON DELETE CASCADE,
  week_start     DATE NOT NULL,
  stats          JSONB NOT NULL,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_user_id, week_start)
);

-- The three existing tables that learn a new value.

ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_role_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_role_check
  CHECK (role IN ('user','assistant','coach'));

ALTER TABLE targets DROP CONSTRAINT targets_source_check;
ALTER TABLE targets ADD CONSTRAINT targets_source_check
  CHECK (source IN ('calculated','adaptive','manual','coach'));

-- A seat is a plan source like a store is: `expirePlans` leaves `manual`
-- alone and sweeps everything with an expiry, and a seat has none until the
-- coach lapses — at which point `syncSeats` writes one.
ALTER TABLE users DROP CONSTRAINT users_plan_source_check;
ALTER TABLE users ADD CONSTRAINT users_plan_source_check
  CHECK (plan_source IN ('manual','stripe','play','app_store','coach_seat'));
