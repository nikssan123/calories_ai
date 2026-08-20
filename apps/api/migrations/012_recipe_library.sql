-- A starter library of real recipes, so Cook is not an empty room.
--
-- The generated recipes in `recipes` are the point of the feature, but they
-- cost a model call and they need a stocked kitchen to be any good — which is
-- exactly what a new account does not have. This is the cold start: a hundred
-- real recipes with real photographs and real nutrition, there on the first
-- visit, ranked by how well they fit today and how much of one you already own.
--
-- Its own table rather than rows in `recipes`, because the two are different
-- kinds of thing and only look alike:
--
--   recipes          generated for one person, from their pantry, against one
--                    day's budget. Per-ingredient macros, because the model
--                    priced every item and the entry is logged from them.
--   library_recipes  written by the USDA for everybody. Ingredients are the
--                    text a cook reads ("1 tablespoon vegetable oil"); the
--                    nutrition is measured per serving for the dish as a whole.
--
-- Folding them together would mean a nullable half of every row and a `user_id`
-- that is sometimes nobody.
--
-- Source: USDA MyPlate Kitchen. Works of the United States government are in
-- the public domain (17 USC § 105), and the original recipe pages carried the
-- Creative Commons Public Domain Mark. `source_url` is kept per row so every
-- recipe can be traced back to the page it came from.
CREATE TABLE library_recipes (
  -- The USDA's own slug is the key: it is stable, it is what `source_url`
  -- ends in, and it makes re-running the seed an upsert rather than a
  -- duplicate.
  slug          TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  summary       TEXT,
  category      TEXT NOT NULL,
  portions      INTEGER NOT NULL CHECK (portions >= 1),
  -- What one portion is, in the source's words: "1/8 of recipe", "1 cup".
  serving_size  TEXT,
  -- [{text, note}] — the line as a cook reads it. Deliberately not parsed into
  -- quantities: the nutrition below is measured for the finished dish, so a
  -- per-ingredient breakdown would have to be invented, and an invented number
  -- sitting beside measured ones is the worst of both.
  ingredients   JSONB NOT NULL,
  steps         JSONB NOT NULL,
  -- The food out of each ingredient line, lowercased and singular, so a pantry
  -- holding "chicken breast" matches "2 boneless, skinless chicken breasts".
  -- Precomputed at seed time because it is the same answer every time and this
  -- is read on every ranking.
  keywords      TEXT[] NOT NULL,
  -- Per portion, as published.
  kcal          NUMERIC(7,1) NOT NULL,
  protein_g     NUMERIC(6,1) NOT NULL,
  carbs_g       NUMERIC(6,1) NOT NULL,
  fat_g         NUMERIC(6,1) NOT NULL,
  food_groups   JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Served by the web app from `public/`, so it needs no signing and no route:
  -- unlike a meal photo, nothing here is private.
  image_path    TEXT,
  source        TEXT NOT NULL,
  source_url    TEXT,
  rating        NUMERIC(3,2),
  rating_count  INTEGER
);

CREATE INDEX library_recipes_kcal ON library_recipes (kcal);
-- The pantry match is an array overlap, which is what GIN is for.
CREATE INDEX library_recipes_keywords ON library_recipes USING GIN (keywords);

-- Cooking a library recipe writes an ordinary food entry, so there is nothing
-- to record here about it — but saving one is per-person, and the recipe is
-- not, so the relationship needs a row of its own.
CREATE TABLE saved_library_recipes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL REFERENCES library_recipes(slug) ON DELETE CASCADE,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slug)
);
