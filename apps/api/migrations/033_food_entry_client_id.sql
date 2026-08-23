-- The ids a phone gives entries before it has a network to send them over.
--
-- An offline outbox exists to resend, and the request it resends most often is
-- one the server already handled — the insert committed and the reply was lost
-- on the way back, which on a phone is the ordinary case rather than the exotic
-- one. Without a key from the client there is nothing to recognise that retry
-- by, and breakfast is logged twice.
--
-- That failure is worse than the one it is trying to fix. A meal that never
-- arrived is visible: the user looks at the day and it is not there. A meal
-- logged twice looks exactly like a meal logged once, until the day's total is
-- 600 kcal wrong and nobody can say why.
--
-- A table rather than a `client_id` column on `food_entries`, and the reason is
-- the delete. A column lives and dies with its row, so the moment somebody
-- removes the meal the key is free again — and the retry still sitting in the
-- queue writes it back. That is not a hypothetical: the reply being lost is
-- precisely the case where the entry *did* land, so the user sees it on the
-- next refresh, decides it was wrong, deletes it, and watches it return.
--
-- Here the key outlives the entry it was spent on. `entry_id` goes NULL on
-- delete and the row stays, which is the difference between "log this once"
-- and "log this at most once, ever".
CREATE TABLE food_entry_client_keys (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL,
  -- Null once the entry is gone: the key is spent and there is nothing to hand
  -- back, which is a 409 rather than a second insert.
  entry_id   UUID REFERENCES food_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

-- Deleting the account takes its keys with it, and `ON DELETE SET NULL` above
-- would otherwise run first and leave a table of orphans behind.
CREATE INDEX food_entry_client_keys_entry ON food_entry_client_keys (entry_id);
