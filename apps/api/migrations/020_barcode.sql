-- Reading a packet.
--
-- A barcode answers exactly one question — what is in 100g of this product —
-- and the whole feature lives in the gap between that and what somebody
-- actually ate. Nothing here logs anything. This table is a cache in front of
-- two free, uneven, crowd-sourced catalogues, and the portion is a separate
-- step happening somewhere else entirely.

-- ---- The cache ---------------------------------------------------------------

-- Keyed on the barcode itself rather than a surrogate id, because the barcode
-- *is* the identity: it is global, it is printed on the packet, and two rows
-- for one GTIN is the only way this table can be wrong.
--
-- Not scoped to a user, and that is the point. A jar of peanut butter is the
-- same jar in every kitchen, so the first person to scan one pays the round
-- trip and everybody after them reads a row. There is nothing personal in here
-- to leak — every field came off a public catalogue.
CREATE TABLE barcode_products (
  -- Normalised to GTIN-13 before it gets here: a UPC-A scanned off an American
  -- packet arrives as 12 digits and zero-pads, so that one physical product is
  -- one row rather than two that disagree.
  barcode        TEXT PRIMARY KEY,
  -- What makes this a cache and not a product table.
  --
  -- A scan of something nobody has catalogued is the single likeliest outcome
  -- in a real supermarket, and without a row saying so, every rescan of the
  -- same own-brand oat milk is another round trip that returns nothing. The
  -- miss has to be remembered as firmly as the hit.
  found          BOOLEAN NOT NULL,
  brand          TEXT,
  name           TEXT,
  -- Per 100g, always, whichever catalogue answered. Serving-sized figures are
  -- converted on the way in, so nothing downstream has to ask which basis it
  -- is looking at.
  kcal_100g      NUMERIC(7,1),
  protein_100g   NUMERIC(6,1),
  carbs_100g     NUMERIC(6,1),
  fat_100g       NUMERIC(6,1),
  -- Null when the label does not say, which is common and is not an error. It
  -- decides one thing on the card: whether "1 serving" is offered at all, or
  -- whether the portion picker opens on 100g instead.
  serving_g      NUMERIC(7,1),
  serving_desc   TEXT,
  source         TEXT NOT NULL CHECK (source IN ('off', 'fdc')),
  source_url     TEXT,
  -- The clock the two lifetimes below are measured against. A hit is good for
  -- months — a printed label does not change — while a miss has to expire
  -- inside a week, because Open Food Facts gains products daily and a
  -- remembered miss is a permanently broken scan.
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sweeping expired rows is a scan of a small table by date, and every read is
-- already a primary-key lookup, so this exists for the sweep alone.
CREATE INDEX barcode_products_fetched ON barcode_products (fetched_at);

-- ---- Where the entry says it came from ---------------------------------------

-- `food_entries.source` has carried the same four values since 001, and an
-- entry logged off a packet is none of them: it is not typed text, not a photo,
-- not a saved quick-add, and not hand-entered numbers. Saying 'manual' would
-- work and would quietly lose the one fact worth keeping — that these figures
-- were read off a label rather than estimated by a model, which is exactly the
-- distinction a correction screen wants to know about.
ALTER TABLE food_entries DROP CONSTRAINT food_entries_source_check;
ALTER TABLE food_entries ADD CONSTRAINT food_entries_source_check
  CHECK (source IN ('text', 'photo', 'quick', 'manual', 'barcode'));

-- `exercise_entries.source` is deliberately left alone. It shares the shared
-- enum with food, so the zod type widens for both, but nothing writes a barcode
-- to an exercise row and nothing ever will — there is no code path from a
-- packet to a workout. Widening the constraint to match the type would be
-- tidiness that permits a row nobody wants.
