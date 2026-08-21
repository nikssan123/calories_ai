-- The half of the shopping list that no recipe can produce.
--
-- The list has never been a list. It is a projection — the planned week's
-- ingredients, minus what the kitchen already holds, derived on every read and
-- stored nowhere. That is exactly why it can never be stale, and exactly why
-- there has been no way to put kitchen roll on it: nothing in a recipe produces
-- kitchen roll, so nothing could hold it.
--
-- This table is the other half: the lines somebody writes themselves. Kept
-- deliberately separate from the derived half rather than materialising the
-- whole list, because the property that makes the derived half trustworthy is
-- that swapping a Tuesday rewrites its own ingredients and nothing else. A
-- stored union would have to decide what a swap does to a row somebody typed,
-- and every answer to that is wrong.

CREATE TABLE shopping_extras (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- In their words, like pantry_items.quantity_desc. Never a number, because
  -- nothing downstream does arithmetic on it: the derived half sums weights
  -- because recipes state them in grams, and a hand-written line states
  -- whatever the person felt like stating — "2 rolls", "whatever's on offer".
  quantity_desc TEXT,
  -- The Monday of the week it was written for.
  --
  -- Not a boundary. A line still pending carries forward onto every later
  -- week's list, because "we still need kitchen roll" does not stop being true
  -- at midnight on Sunday, and a list that quietly empties itself once a week
  -- is a list people stop writing on. What this column actually pins down is
  -- the ticked-off ones — see below.
  week_start    DATE NOT NULL,
  -- Ticked off rather than deleted, so a shop in progress can still show what
  -- has already gone in the trolley. A ticked line stays on the week it was
  -- written for and does not follow anyone into the next one: it is done, and
  -- the only reason left to draw it is the shop it was ticked during.
  bought_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One *pending* line per name, case-insensitively, for the reason the pantry
-- has the same index: "Milk" and "milk" sitting on one list is the failure that
-- makes somebody stop trusting every other line on it. Writing a name that is
-- already pending refreshes its quantity instead of stacking up.
--
-- Partial, so the history stays addable-to: something ticked off in March can
-- be written again in April without colliding with the row that records it was
-- bought.
CREATE UNIQUE INDEX shopping_extras_pending ON shopping_extras (user_id, lower(name))
  WHERE bought_at IS NULL;

-- Every read is "this user, this week or anything still pending from before".
CREATE INDEX shopping_extras_week ON shopping_extras (user_id, week_start);
