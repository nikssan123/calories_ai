-- The kitchen: what you have, and what you could cook with it.
--
-- The journal knows what you ate and what is left of today. It has never been
-- able to answer the question that follows — so what do I make? These two
-- tables are that answer's working memory.

-- ---- Pantry -----------------------------------------------------------------

-- What the user says is in their kitchen.
--
-- This is a memory, not an inventory. `quantity_desc` is free text in their own
-- words ("half a bag", "two-ish") and is never a tracked count; nothing here is
-- decremented when a recipe is cooked. That is deliberate: keeping counts
-- accurate is daily work, and the apps that ask for it get abandoned by week
-- three, at which point the data is worse than none because it is still
-- believed.
--
-- `last_seen_at` is how the staleness stays visible instead of being pretended
-- away — the same posture as `confidence` on a food entry. The recipe prompt is
-- given the age of every item and told to treat an old one as a maybe.
CREATE TABLE pantry_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  quantity_desc TEXT,
  -- Olive oil, salt, the jar of stock cubes. Exempt from ageing, because asking
  -- someone to re-confirm they still own salt is exactly the friction that
  -- makes a pantry feature not worth opening.
  is_staple     BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Whether it was typed or came off a fridge photo. Kept because a scanned
  -- list is a machine's reading of a cluttered shelf and a typed one is not.
  source        TEXT NOT NULL DEFAULT 'typed' CHECK (source IN ('typed','photo')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive, so a scan that reads "Eggs" onto a shelf already holding
-- "eggs" refreshes the row instead of doubling it. The upsert in
-- services/pantry.ts targets this index by name.
CREATE UNIQUE INDEX pantry_items_unique ON pantry_items (user_id, lower(name));
CREATE INDEX pantry_items_user ON pantry_items (user_id, is_staple, last_seen_at DESC);

-- ---- Recipes ----------------------------------------------------------------

-- One generated idea, stored because it is an artifact someone comes back to —
-- cooked tomorrow, saved for next week, or read once and dropped.
CREATE TABLE recipes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  -- One line on why this, right now. The part that makes a suggestion feel
  -- addressed to the reader rather than scraped from a search result.
  summary       TEXT,
  -- Here from the first migration even though nothing scales yet: batch prep is
  -- the next feature, and a portions column added later would mean rewriting
  -- every macro figure already stored against an implied single serving.
  portions      INTEGER NOT NULL DEFAULT 1 CHECK (portions >= 1),
  minutes       INTEGER,
  -- Both JSONB for the same reason `weekly_reviews.stats` is: they are read
  -- whole and never queried by part. A recipe is not corrected in place the way
  -- a food entry is — a wrong one is regenerated, not edited.
  steps         JSONB NOT NULL,
  -- Shaped exactly like `food_items`, which is the point: cooking a recipe
  -- hands this array straight to createFoodEntry with no mapping and no second
  -- estimate. The macros were settled when the recipe was written.
  ingredients   JSONB NOT NULL,
  -- Per portion, so a card can print a number without the reader doing
  -- arithmetic — and so the same row means the same thing once a recipe can be
  -- scaled to four.
  kcal          NUMERIC(7,1) NOT NULL,
  protein_g     NUMERIC(6,1) NOT NULL,
  carbs_g       NUMERIC(6,1) NOT NULL,
  fat_g         NUMERIC(6,1) NOT NULL,
  confidence    TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  -- The budget it was written against: {local_date, kcal_remaining,
  -- protein_remaining, missing}. A recipe opened next week can then explain why
  -- it was suggested, rather than looking arbitrary next to a different day.
  generated_for JSONB,
  saved         BOOLEAN NOT NULL DEFAULT FALSE,
  -- Stamped when it is logged. Not a foreign key to the entry: cooking the same
  -- thing twice is ordinary, and the entries are the record of that, not this.
  cooked_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX recipes_recent ON recipes (user_id, created_at DESC);
CREATE INDEX recipes_saved ON recipes (user_id, created_at DESC) WHERE saved;

-- ---- Cost accounting for the new turns --------------------------------------

-- Two new kinds of agent run, and therefore two new kinds of cost.
--
-- This constraint is the whole reason the migration cannot be skipped:
-- `recordUsage` swallows its own write failures on purpose, so that a broken
-- cost write can never take down the turn it is measuring. Without widening the
-- check, a fridge scan and a recipe run would each spend real money and record
-- nothing at all — silently, and precisely on the two most expensive things the
-- product does.
ALTER TABLE ai_usage DROP CONSTRAINT ai_usage_kind_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_kind_check
  CHECK (kind IN ('text_log','photo_log','setup','review','pantry_scan','recipe'));

-- ---- Plans ------------------------------------------------------------------

-- The entitlement seam, with no payment provider behind it yet.
--
-- What it buys is the shape: every account resolves to a plan on every request,
-- and the routes that spend money read their ceilings from it. `free`
-- reproduces the limits that were hardcoded in routes/index.ts, so nobody
-- signed in today notices this landed. When billing arrives it flips this
-- column from a webhook and touches nothing else.
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free','pro'));
