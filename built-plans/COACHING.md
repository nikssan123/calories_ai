# From tracker to nutrition coach

## Context

Day So Far already does most of what a coach does: it sets a personal target
(`services/targets.ts`), corrects that target from measured TDEE rather than a
formula (`services/adaptive.ts`), publishes a weekly review that names patterns
and explains target changes (`ai/review.ts`, `scheduler.ts`), and answers
questions from real logged data (`get_progress`, `show_chart`).

Four things stop it short of being a coach, and this plan closes all four:

1. **It only knows energy and protein.** `food_items` carries kcal, protein,
   carbs and fat, so the app can coach "are you hitting your numbers" but not
   "is what you eat any good". Everything else here leans on having this data.
2. **It never speaks first.** The Monday review email is the only thing the app
   initiates. Nobody is nudged after four unlogged days, or when the scale has
   been flat for a fortnight against a `lose` goal.
3. **It only looks as far as tonight.** The kitchen answers "what can I cook
   right now". There is no week, no batch prep, no shopping list.
4. **Nothing protects the person.** No stance on medical conditions, no
   not-a-clinician line, and nothing notices sustained under-eating. The 1,200
   kcal floor in `targets.ts:23` protects the arithmetic, not the user.

Build in that order — the nutrient data feeds the nudge triggers and the
wellbeing checks, and forward planning is the largest and least coupled.

---

## 1. Diet-quality nutrients

Four fields: `fiber_g`, `sodium_mg`, `sat_fat_g`, `sugar_g`. These are the ones
a model can estimate honestly from a description; micronutrients are fiction
without a food database and are deliberately out of scope.

**Migration `016_nutrients.sql`** — four nullable columns on `food_items`, and
the same four on `recipes` (per portion, beside the existing macro columns).

Nullable with no default, and this is the load-bearing decision: `NULL` means
"never estimated" and `0` means "estimated as zero", and conflating them makes
every day total silently wrong. Every row written before this migration is NULL
forever; there is no honest backfill. `library_recipes` gets the columns too but
they stay NULL — the USDA data in `apps/api/data/library-recipes.json` carries
no fiber or sodium (verified), and inventing them beside measured macros would
be the worst of both. Re-scraping the source is separate, later work.

**Shared schema** (`packages/shared/src/index.ts`) — a new `DietQuality` object
with the four fields as `z.number().nullable()`, spread into both `FoodItem` and
`RecipeIngredient` the way `Nutrition.shape` already is (index.ts:73, :418).
Do **not** extend `Nutrition` itself: it is also `DaySummary.consumed` and
`Targets`' shape-mate, and widening it forces four more fields into every
literal (`summary.ts:29`, `HeroDemo.tsx`) for no gain.

Because `RecipeIngredient` picks the fields up too, `cookRecipe`
(`services/recipes.ts:141`) carries them into the logged entry with no mapping —
the same property that already makes recipe macros survive being logged.

**Day totals carry their own coverage.** `DaySummary` gains a `quality` block:
the four sums plus `coverage`, the share of the day's calories that came from
items actually carrying the figures, computed in SQL as
`SUM(kcal) FILTER (WHERE fiber_g IS NOT NULL) / SUM(kcal)`. Below ~0.6 the UI
and the agent say "partly measured" instead of printing a total that is missing
half the day. This is the same posture as the confidence weighting in
`adaptive.ts:52` — say how much you actually know.

**Targets are derived, not stored.** New `qualityTargetsFor(kcal)` in
`services/targets.ts`, beside `macrosFor`. No migration on `targets`: these are
a deterministic function of the calorie target with nothing personal to version.

- fiber `14 g / 1000 kcal` — a **floor**
- sodium `2300 mg` flat, not scaled — a **ceiling**
- sat fat `kcal × 0.10 / 9` — a **ceiling**
- sugar `kcal × 0.10 / 4` — a **ceiling**

Encode the direction (`'floor' | 'ceiling'`) in the returned shape rather than
leaving it implicit, so no screen ever throws confetti for hitting a sodium
target the way `MacroBars.tsx` does for protein.

**Where the numbers come from** — `itemShape` in `ai/shapes.ts` gains the four,
nullable and `.default(null)`, with descriptions saying when to estimate
(packaged food with a label, an obviously salty restaurant meal, a bowl of
lentils) and when `null` is the honest answer. That one shape is shared by
`log_food` and `propose_recipe`, which is exactly why `shapes.ts` exists.

**Prompt** — a `# Diet quality` section in `STABLE_SYSTEM_PROMPT`
(`ai/prompt.ts`): these are looser estimates than calories; null is a real
answer; fiber is a floor and the other three are ceilings; mention them when
asked or when a week-long pattern is worth naming, not after every meal. Restate
the no-judgement rule here specifically — a high-sodium dinner is the single
most likely place for the model to start moralising about food.

**Files:** `services/log.ts` (both INSERTs at :59 and :240, the entry aggregate
at :137/:144), `services/summary.ts`, `services/recipes.ts` (`totalNutrition`,
`dividePortions`, `cookRecipe`), `ai/kitchen.ts`, `seed.ts`.

**Web** — not in `MacroBars`; three tracks is a glance and seven is a table. A
compact "Diet quality" group under the macros on Today, and the trend view in
Progress, both showing coverage when it is low.

---

## 2. Safety rails

Two halves — what the agent says, and what the code checks. Nothing gets gated:
consistent with how email verification already gates nothing, the app keeps
working, it just stops cheerfully optimising in a direction that hurts.

**Prompt** — a `# Where you stop` section in `STABLE_SYSTEM_PROMPT`:

- Not a clinician, and this is not medical advice. Said once, plainly, where it
  matters — never stapled to every reply.
- Pregnancy, breastfeeding, diabetes, kidney disease, a history of disordered
  eating: the target here is population arithmetic and they should get their
  number from someone who knows their case. Say it, keep logging, don't refuse
  to work.
- Never encourage a larger deficit, never validate a very low intake as
  discipline, never suggest skipping a meal to bank calories. The existing
  "exercise never raises the eating budget" rule is this rule's twin.
- If they describe restriction, purging, or distress about food: drop the
  numbers entirely for that turn, say the plain human thing, point at help.

**New `services/wellbeing.ts`** — plain-noun naming to match `adaptive.ts` and
`targets.ts`. Computes two checks in SQL, reusing `dailyIntake()` and the weight
slope machinery already in `adaptive.ts`:

- `intake_below_floor` — mean logged intake over the last 7 days under
  `MIN_TARGET_KCAL` (reuse the constant), with enough logged days to be real.
- `losing_too_fast` — sustained loss beyond ~1% bodyweight per week, off the
  `weight_change_kg_per_week` that `estimateTdee` already returns.

When either fires: one line in `dayContextPrompt` so the model knows without
having to notice, and — the real behaviour change — `proposeTargets`
(`adaptive.ts:227`) clamps its step to ≥ 0 and returns a new `AdaptiveBlocker`
value. Today the adaptive pass will happily keep lowering a target for someone
already eating too little. Add `'intake_below_floor'` to `ADAPTIVE_BLOCKERS`
(index.ts:777) and `BLOCKER_TEXT` (`adaptive.ts:295`).

The setup screen and `set_profile` should also carry one honest line about where
the calculated number comes from and what it is not.

---

## 3. Proactive nudges

The channel already exists and is proven: `generateWeeklyReview` writes an
assistant message with `insertMessage` and then optionally emails it. A nudge is
the same shape, smaller. **In-app message always; email only on an explicit
opt-in.** Push notifications are deliberately later work — `services/devices.ts`
is sign-in fingerprinting, not a push channel, so there is nothing to build on
until the native apps land. Keep the nudge's delivery a named `channel` so
adding push is a sender, not a reshaping.

**Migration `017_nudges.sql`:**

- `nudges` (id, user_id, kind, local_date, content, message_id, created_at) with
  `UNIQUE (user_id, kind, local_date)` — the same idempotency trick as
  `weekly_reviews.UNIQUE(user_id, week_start)`, so the hourly tick can run as
  often as it likes and a second attempt is a no-op.
- `users.notify_nudges BOOLEAN NOT NULL DEFAULT FALSE` — opt-in, unlike the
  review, because this one arrives unprompted.
- Widen the `ai_usage` kind CHECK to add `'nudge'`, following
  `011_kitchen.sql:100`. Skipping this means nudges spend real money and record
  nothing, silently — `recordUsage` swallows its own write failures by design.

**Triggers, computed in SQL** — the model decides how to word a nudge, never
whether to send one. Same split as the weekly review, for the same reason.

- `dormant` — nothing logged for 3+ days after a stretch of regular logging.
- `stalled` — goal is `lose`, 14+ days of data, weight slope flat. Reuses
  `estimateTdee`.
- `protein_short` — protein under target all seven days.
- `quality_short` — fiber under floor all week. Needs workstream 1, and only
  fires where coverage is high enough to mean anything.

**Rate limiting is a hard rule in code, not prompt guidance:** at most one nudge
per user per week, and never within 24h of the Monday review. A coach that pings
four times a week gets uninstalled.

**Scheduler** — `runDueNudges(now)` beside `runDueReviews` in `scheduler.ts`,
driven by the same hourly tick and the same per-user local clock. Export it the
same way so a test can drive one pass directly.

**Prompt** — `NUDGE_SYSTEM_PROMPT` and `nudgeTaskPrompt(trigger, stats)` in
`ai/prompt.ts`, siblings of the review prompts. One or two sentences. No guilt
for not logging — someone who feels nagged stops opening the app, which is the
same failure the no-judgement rule exists to prevent. Offer the smallest
possible next step.

**Plan limits** — `nudgesPerWeek` in `PlanLimits` (`services/plans.ts`).
**Email** — `sendNudgeEmail` in `email/notify.ts` copying `sendWeeklyReviewEmail`
(:187) including the idempotency key and unsubscribe headers; a `nudge` template;
`notify_nudges` on the setup screen beside the existing review toggle
(`setup/page.tsx:449`) and in the unsubscribe path (`user.ts:242`).

---

## 4. Forward planning

Seven dinner slots for the week, batch-aware — a recipe cooked at `portions > 1`
fills several. This is what `011_kitchen.sql` anticipated when it added
`recipes.portions` "even though nothing scales yet: batch prep is the next
feature". Breakfast and lunch are deliberately not planned; those slots would go
stale and make the whole plan read as wrong.

**Migration `018_meal_plans.sql`:**

- `meal_plans` (id, user_id, week_start, brief JSONB, created_at), unique on
  (user_id, week_start).
- `meal_plan_slots` (plan_id, local_date, recipe_id, portions, cooked_at). The
  slot points at a generated `recipes` row; adapting a library recipe already
  produces one of those via `origin`/`adapted_from` (013), so the duality is
  handled without a nullable second foreign key.
- Widen the `ai_usage` kind CHECK again for `'meal_plan'`.

**Generation** — one agent run producing the week, reusing
`RECIPE_SYSTEM_PROMPT`'s rules (fit the budget, cook what they cook, name
missing ingredients, diet and avoids are absolute) with a plan-level task prompt
on top: vary the week, let one cook cover two nights, respect each day's target.
Extends `suggestRecipes` (`ai/recipes.ts:78`) rather than duplicating it.

**Shopping list is derived, never stored** — the union of slot ingredients minus
pantry staples, from `totalNutrition` and the existing ingredient shape. A
stored list would drift out of date the moment a slot is swapped.

**Cooking a slot** calls `cookRecipe` unchanged — nothing re-estimated, macros
settled when the recipe was written, `cooked_at` stamped on the slot.

**Routes** (`routes/kitchen.ts`): `POST /plan`, `GET /plan`,
`PATCH /plan/slots/:id` (swap or skip), `GET /plan/shopping-list`.
`mealPlansPerWeek` in `PlanLimits` — a week of recipes is the most expensive
call in the product, several times the ~$0.22 recipe run costed in
`plans.ts`, so this is pro-shaped and the ceiling should say so.

**Web** — a `/plan` route reusing `RecipeCard`, `Brief` and `Servings`; the Cook
tab gains a "This week" entry point.

---

## Verification

Per workstream, before moving to the next:

- `pnpm typecheck` and `pnpm test` (vitest; `test/helpers/factories.ts` has
  `createUser`, `addMeal`, `addWeight`, `seedAdaptiveWindow` for fixtures).
- **Nutrients:** a test that a day of items where only some carry fiber reports
  the right sum *and* the right coverage; that `cookRecipe` carries the four
  fields through; that `qualityTargetsFor` returns fiber as a floor. Run
  `pnpm dev`, log "two eggs and toast" and check the columns land.
- **Safety rails:** extend `test/adaptive.test.ts` — a user under the floor must
  get `blocked_by: 'intake_below_floor'` and an unchanged target, and the
  clamp must not block an *upward* move. `test/prompt.test.ts` for the new
  section.
- **Nudges:** drive `runDueNudges` directly from a test the way
  `test/scheduler.test.ts` drives `runDueReviews` — assert one message written,
  a second pass a no-op, and the once-a-week rule holding. Check `ai_usage`
  records a `nudge` row.
- **Planning:** generate a plan against a seeded pantry, cook a slot, assert the
  food entry matches the recipe's macros exactly and the shopping list drops
  staples.

End to end: `pnpm db:reset && pnpm setup`, then
`pnpm seed -- --email=you@example.com` for 21 days of history — enough for the
adaptive pass, the stalled-weight trigger and a real weekly review to all fire.
