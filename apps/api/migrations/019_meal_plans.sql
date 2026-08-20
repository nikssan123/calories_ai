-- The week ahead.
--
-- The kitchen answers "what can I cook right now", which is the question at
-- 18:40 on a Tuesday with the fridge open. It has never been able to answer the
-- one asked on Sunday afternoon: what are we eating this week, and what do I
-- need to buy.
--
-- Seven dinner slots, and dinner only. Breakfast and lunch are deliberately not
-- planned — those slots are habitual, they go stale within days, and a plan
-- carrying four wrong entries for every right one reads as wrong in its
-- entirety. Dinner is the meal people actually decide about.

-- ---- The plan ----------------------------------------------------------------

CREATE TABLE meal_plans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The Monday the week starts on. A date rather than a range because the range
  -- is always seven days, and storing both ends is two ways to say one thing.
  week_start DATE NOT NULL,
  -- What was asked for when it was generated: minutes, portions, wants. Same
  -- JSONB-because-it-is-read-whole reasoning as recipes.generated_for, and the
  -- same purpose — a plan opened on Thursday can explain why Wednesday is what
  -- it is.
  brief      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One plan per week, and the index is the idempotency: regenerating replaces
-- rather than accumulating, and two requests racing cannot leave somebody with
-- two Tuesdays.
CREATE UNIQUE INDEX meal_plans_week ON meal_plans (user_id, week_start);

-- ---- The slots ---------------------------------------------------------------

-- One dinner. Points at a `recipes` row and nothing else.
--
-- That single foreign key is the whole reason this table is simple. A generated
-- recipe and an adapted library recipe are both rows in `recipes` — 013 made
-- adaptation produce one, with `origin` and `adapted_from` recording where it
-- came from — so a slot never has to be "either a recipe or a library slug",
-- which would mean two nullable columns and a check constraint holding them
-- apart.
CREATE TABLE meal_plan_slots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  -- Nullable, because a skipped night is a real answer. Someone eating out on
  -- Friday wants the slot to say so, not to hold a recipe they will not cook.
  recipe_id  UUID REFERENCES recipes(id) ON DELETE SET NULL,
  -- How many this cook makes. More than one is the batch: 011 added
  -- recipes.portions "even though nothing scales yet: batch prep is the next
  -- feature", and this is that feature — one cook on Sunday filling Monday too.
  portions   INTEGER NOT NULL DEFAULT 1 CHECK (portions >= 1),
  -- Stamped when the slot is actually cooked, so a week can be read back as
  -- what happened rather than only as what was intended.
  cooked_at  TIMESTAMPTZ
);

-- One slot per night. A plan is a calendar, and two dinners on Wednesday is not
-- a plan someone can shop for.
CREATE UNIQUE INDEX meal_plan_slots_day ON meal_plan_slots (plan_id, local_date);
CREATE INDEX meal_plan_slots_recipe ON meal_plan_slots (recipe_id);

-- ---- Cost accounting ---------------------------------------------------------

-- The most expensive single call in the product: a week of recipes is several
-- times the ~$0.22 a three-recipe run costs. Recording it is not optional for
-- the usual reason — `recordUsage` swallows its own write failures by design,
-- so an unwidened CHECK means the priciest thing here spends silently.
ALTER TABLE ai_usage DROP CONSTRAINT ai_usage_kind_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_kind_check
  CHECK (kind IN ('text_log','photo_log','setup','review','pantry_scan','recipe','nudge','meal_plan'));
