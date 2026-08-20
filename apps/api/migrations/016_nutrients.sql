-- Diet quality: the four numbers that say whether food was any good.
--
-- Until now a day was energy and three macros, which answers "did you hit your
-- numbers" and nothing at all about what those numbers were made of. Two days
-- can be identical at 2,100 kcal and 150g protein and one of them is lentils
-- and the other is a bag of crisps and a protein shake.
--
-- Four fields, and only four. These are the ones a model can estimate honestly
-- from a description — a label it has read a thousand times, an obviously salty
-- restaurant meal, a bowl of beans. Micronutrients are fiction without a food
-- database behind them, and a fictional iron figure printed beside a measured
-- calorie one teaches people to trust both equally.

-- ---- Logged food -------------------------------------------------------------

-- Nullable with no default, and this is the load-bearing decision in the whole
-- migration: NULL means "never estimated" and 0 means "estimated as zero".
--
-- Conflating them makes every day total silently wrong — a day where half the
-- items predate this column would report the other half's fiber as the day's
-- fiber, and it would look like a plausible number rather than a missing one.
-- Every row written before today is NULL forever; there is no honest backfill,
-- because nobody can go back and taste last Tuesday's dinner.
ALTER TABLE food_items ADD COLUMN fiber_g   NUMERIC(6,1);
ALTER TABLE food_items ADD COLUMN sodium_mg NUMERIC(7,1);
ALTER TABLE food_items ADD COLUMN sat_fat_g NUMERIC(6,1);
ALTER TABLE food_items ADD COLUMN sugar_g   NUMERIC(6,1);

-- ---- Recipes -----------------------------------------------------------------

-- Per portion, beside the existing macro columns, for the same reason they are
-- per portion: this is what a card prints and what cooking one logs.
--
-- The ingredient array in `ingredients` picks the fields up on its own — it is
-- JSONB shaped like a food item, so widening the shared shape widens it — which
-- is what makes cooking a recipe carry fiber into the entry with no mapping.
ALTER TABLE recipes ADD COLUMN fiber_g   NUMERIC(6,1);
ALTER TABLE recipes ADD COLUMN sodium_mg NUMERIC(7,1);
ALTER TABLE recipes ADD COLUMN sat_fat_g NUMERIC(6,1);
ALTER TABLE recipes ADD COLUMN sugar_g   NUMERIC(6,1);

-- ---- The library -------------------------------------------------------------

-- The columns exist so that reading a library recipe and a generated one takes
-- one shape rather than two. They stay NULL, and that is not an oversight: the
-- USDA data in apps/api/data/library-recipes.json carries energy and the three
-- macros and no fiber or sodium at all. Inventing figures to fill these in
-- beside measured macros would be the worst of both — an estimate wearing the
-- authority of a government nutrition table.
--
-- Re-scraping the source for the fuller panel is separate, later work, and when
-- it happens it is an UPDATE against these columns rather than a migration.
ALTER TABLE library_recipes ADD COLUMN fiber_g   NUMERIC(6,1);
ALTER TABLE library_recipes ADD COLUMN sodium_mg NUMERIC(7,1);
ALTER TABLE library_recipes ADD COLUMN sat_fat_g NUMERIC(6,1);
ALTER TABLE library_recipes ADD COLUMN sugar_g   NUMERIC(6,1);
