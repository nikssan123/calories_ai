-- The third outcome of a scan: catalogued, but without the numbers.
--
-- `found` has carried two answers since 020 — we have the panel, or nobody has
-- the product — and a real shelf has a third. Open Food Facts keeps rows that
-- are a name, a brand, a photograph of the nutrition label and no transcription
-- of it, flagged upstream as `en:nutrition-facts-to-be-completed`. A lookup
-- refuses those, correctly: a row without all four figures would log as a
-- zero-calorie food, which is worse than finding nothing.
--
-- Folded into `found = false` it cost the user twice. They were told nobody had
-- catalogued a product that is plainly catalogued, and the negative row sat
-- there for the full week a real miss gets — so the rescan in the shop, and
-- every rescan until the clock ran out, repeated an answer that was already
-- wrong rather than asking again.
--
-- So the column exists to be a clock and a sentence. It picks the short TTL in
-- `barcode.ts`, because the gap here is one contributor typing in four numbers
-- off a photo that is already uploaded, and it tells the client to say we only
-- got part of the label rather than that the packet is unknown.
--
-- Only ever true where `found` is false: a row with a usable panel is a hit,
-- whatever else the catalogue left blank.
ALTER TABLE barcode_products
  ADD COLUMN partial BOOLEAN NOT NULL DEFAULT FALSE;

-- Every row written before today claimed to be a plain miss, and the ones that
-- were actually half-filled cannot be told apart after the fact — nothing was
-- kept but `found`. They expire inside the week either way, so the default is
-- accurate soon enough and rewriting history here would be a guess.
