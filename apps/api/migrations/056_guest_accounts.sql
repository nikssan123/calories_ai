-- Guest accounts: the app first, the address later (GUEST-ACCOUNTS.md).
--
-- On 2026-09-14/15 about twenty paid installs finished the first-run questions
-- and made no accounts: the walk ended on a sign-up form and nobody filled it
-- in. From here a phone that finishes the walk gets a real user row with no
-- address and a session, goes straight into the app, and attaches an address
-- (or Google, or Apple) to that same row when the account is worth saving.
--
-- `guest_since` is set when the row is made that way and cleared when an
-- identity on it is proved — a confirmed address or a linked provider. So
-- "guest" means "has not proved who they are yet", which covers both a row with
-- no address at all and one whose address is claimed but unconfirmed. Rows made
-- before this migration, and ordinary sign-ups, are null and never guests.
ALTER TABLE users ADD COLUMN guest_since TIMESTAMPTZ;

COMMENT ON COLUMN users.guest_since IS
  'set when the row was created as a guest; cleared once an identity on it is proved';

-- Guests that never came back are removed by the scheduler; this is its scan.
CREATE INDEX users_guests ON users (guest_since) WHERE guest_since IS NOT NULL;
