-- A failed send used to be permanent.
--
-- `claimDelivery` writes its row *before* the request, which is right: a crash
-- between sending and recording would otherwise leave the key unclaimed and let
-- a retry put a second copy in somebody's inbox. What it missed is the other
-- half. The row stays behind after a failure too, and `ON CONFLICT DO NOTHING`
-- cannot tell "already sent" from "tried once, the provider was having an
-- afternoon" — so every later attempt at that key was answered "already sent"
-- and the message was never sent at all.
--
-- One user in a thousand is a rounding error until the thing being sent is the
-- weekly review, which goes out to everybody at once, over a provider with a
-- per-second rate limit, on the one morning of the week it can. At that volume
-- a handful of 429s and 5xxs is not a possibility, it is arithmetic — and each
-- one was a paying customer who silently never received the thing they pay for.
--
-- These two columns are what lets the claim be re-taken. `attempts` is the
-- bound: retrying forever would turn a hard bounce into an hourly ritual, so a
-- claim is only re-granted while the count is under `MAX_DELIVERY_ATTEMPTS` in
-- `email/send.ts`. `last_attempt_at` is what makes a row stuck at 'pending'
-- recoverable — that is a process killed mid-send, and without a clock on it
-- there is no way to tell one from a send that is in flight right now.

ALTER TABLE email_deliveries
  -- One, not zero: every existing row is the record of an attempt that was
  -- made. A default of zero would say the opposite about every send this
  -- deployment has ever done.
  ADD COLUMN attempts        INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfilled from the row's own creation rather than left at the default, so
-- the column means "when was this last tried" for history as well as for
-- everything written from here on. `now()` on every historical row would date
-- the whole table to this migration.
UPDATE email_deliveries SET last_attempt_at = created_at;

-- What the retry path actually looks up: the deliveries still owed something.
-- Partial, because the rows worth finding are a vanishing fraction of the table
-- — everything else is 'sent' and stays that way forever.
CREATE INDEX email_deliveries_unsettled
    ON email_deliveries (last_attempt_at)
 WHERE status IN ('pending', 'failed');
