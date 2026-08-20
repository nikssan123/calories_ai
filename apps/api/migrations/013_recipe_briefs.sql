-- Telling the kitchen what you need, once and per request.
--
-- Until now the only way to steer a recipe was a free-text box, and the only
-- way to record "I don't eat pork" was to have said it to the journal at some
-- point and hope `remember` caught it. That works, and it keeps working — a
-- standing note is still injected into every recipe prompt — but it is a poor
-- home for the two facts that are true of every meal a person will ever eat.

-- ---- What you don't eat ------------------------------------------------------

-- A pattern, rather than a list of banned foods. `vegetarian` is one word that
-- excludes hundreds of ingredients, and asking someone to enumerate them is
-- both tedious and certain to miss one.
--
-- Deliberately short. These are the four that change what an ingredient list
-- may contain and that a recipe writer can actually honour. Halal and kosher
-- are about how food was sourced and slaughtered, which nothing here can
-- verify — promising to respect them from a recipe prompt would be a claim the
-- product cannot keep, and `avoids` below is the honest place for the parts of
-- them that are about ingredients.
ALTER TABLE users ADD COLUMN diet TEXT NOT NULL DEFAULT 'none'
  CHECK (diet IN ('none','vegetarian','vegan','pescatarian'));

-- Everything a pattern does not cover: an allergy, a dislike, a thing you are
-- simply sick of. Free text in the user's own words, because "coriander tastes
-- like soap" is not an enum and the model reads it perfectly well.
--
-- An array rather than one string so the form can offer them as removable
-- chips, and so a single bad entry can be deleted without retyping the rest.
ALTER TABLE users ADD COLUMN avoids TEXT[] NOT NULL DEFAULT '{}';

-- ---- Where a recipe came from ------------------------------------------------

-- A generated recipe used to have exactly one origin: invented from the pantry.
-- Now it can also be a library recipe reworked to fit, or one the user brought
-- and asked to have priced. The card says which, because "adapted from Baked
-- Trout" and "your recipe, as you gave it" earn very different amounts of trust
-- and the macros behind them were arrived at differently.
ALTER TABLE recipes ADD COLUMN origin TEXT NOT NULL DEFAULT 'invented'
  CHECK (origin IN ('invented','adapted','imported'));

-- The library recipe an adaptation started from, so the card can link back to
-- the original and its photograph. SET NULL rather than CASCADE: re-seeding the
-- library must never delete somebody's saved recipe.
ALTER TABLE recipes ADD COLUMN adapted_from TEXT
  REFERENCES library_recipes(slug) ON DELETE SET NULL;
