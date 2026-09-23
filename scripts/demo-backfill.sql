-- Refill the App Store reviewer's journal so it ends today.
--
--   ssh "$DEPLOY_SSH_HOST" "docker exec -i calorytracker-db psql -U ct -d calorytracker -v ON_ERROR_STOP=1" \
--     < scripts/demo-backfill.sql
--
-- App Review Information tells the reviewer the demo account "has several days
-- of history so Today, History and Progress have real data in them". That
-- sentence was true when it was written and stops being true a week later: on
-- 2026-09-23 the newest meal on `appreview@daysofar.com` was three weeks old and
-- the reviewer would have opened an empty Today. A journal that contradicts the
-- notes reads as a broken app, which is a 2.1 rejection wearing a different hat.
--
-- So this is written to be run again rather than once — before every submission,
-- and again if a review drags. It is idempotent by owning a trailing window and
-- rebuilding it: **10 days** of meals, exercise and journal turns, **31 days** of
-- weights. Anything older is left alone, which is why the August weights that
-- open the trend survive.
--
-- Everything is anchored to the account's *own* local date, read through its
-- timezone (America/Los_Angeles), not the server's. The last day is deliberately
-- half-logged — breakfast and lunch, no dinner — because a day that is already
-- complete at three in the afternoon looks seeded.
--
-- See [[store-reviewer-accounts-are-permanent]]: this account may never be
-- purged, and `trialNeverEnds` in apps/api/src/services/trial.ts keeps its
-- allowance rolling so the journal always answers.

BEGIN;

CREATE TEMP TABLE seed_ctx ON COMMIT DROP AS
SELECT id AS user_id,
       timezone AS tz,
       (now() AT TIME ZONE timezone)::date AS today
  FROM users
 WHERE lower(email) = 'appreview@daysofar.com';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM seed_ctx) THEN
    RAISE EXCEPTION 'appreview@daysofar.com is not on this database';
  END IF;
END $$;

-- The window this script owns. Deleted first so a re-run replaces rather than
-- doubles; the cascade from food_entries takes food_items with it.
DELETE FROM food_entries
 WHERE user_id = (SELECT user_id FROM seed_ctx)
   AND local_date >= (SELECT today - 9 FROM seed_ctx);

DELETE FROM exercise_entries
 WHERE user_id = (SELECT user_id FROM seed_ctx)
   AND local_date >= (SELECT today - 9 FROM seed_ctx);

DELETE FROM weight_entries
 WHERE user_id = (SELECT user_id FROM seed_ctx)
   AND local_date >= (SELECT today - 30 FROM seed_ctx);

DELETE FROM chat_messages
 WHERE user_id = (SELECT user_id FROM seed_ctx)
   AND created_at >= (SELECT ((today - 9)::text || ' 00:00')::timestamp AT TIME ZONE tz FROM seed_ctx);

-- The meal library. Items are [name, grams, kcal, protein_g, carbs_g, fat_g],
-- positional to keep a day readable on one line below.
CREATE TEMP TABLE seed_plan ON COMMIT DROP AS SELECT '
{
  "meals": {
    "eggs_toast":      {"desc": "Two scrambled eggs on sourdough toast", "items": [
      ["Eggs, scrambled", 110, 172, 13.5, 1.4, 12.4],
      ["Sourdough bread", 60, 158, 6.3, 30.6, 1.2],
      ["Butter", 8, 57, 0.1, 0.0, 6.5]]},
    "yogurt_berries":  {"desc": "Greek yogurt with berries, granola and honey", "items": [
      ["Greek yogurt, 2%", 200, 146, 20.0, 8.0, 4.0],
      ["Blueberries", 80, 46, 0.6, 11.6, 0.3],
      ["Granola", 30, 133, 3.2, 18.5, 5.4],
      ["Honey", 15, 46, 0.1, 12.5, 0.0]]},
    "oats_banana":     {"desc": "Porridge with banana and peanut butter", "items": [
      ["Rolled oats", 60, 233, 8.1, 39.7, 4.1],
      ["Milk, semi-skimmed", 200, 100, 7.0, 9.6, 3.6],
      ["Banana", 120, 107, 1.3, 27.4, 0.4],
      ["Peanut butter", 20, 118, 5.0, 4.0, 9.9]]},
    "omelette_feta":   {"desc": "Three-egg omelette with feta and spinach", "items": [
      ["Eggs", 165, 234, 20.6, 1.2, 16.5],
      ["Feta", 40, 106, 5.6, 1.6, 8.6],
      ["Spinach", 40, 9, 1.1, 1.4, 0.2],
      ["Olive oil", 8, 71, 0.0, 0.0, 8.0],
      ["Wholemeal toast", 35, 87, 3.8, 15.1, 1.2]]},
    "burrito_bowl":    {"desc": "Chicken burrito bowl", "items": [
      ["Chicken breast", 150, 248, 53.0, 0.0, 1.5],
      ["Brown rice, cooked", 180, 198, 4.5, 41.0, 1.6],
      ["Black beans", 100, 132, 8.9, 23.7, 0.5],
      ["Guacamole", 50, 80, 1.0, 4.5, 7.0],
      ["Salsa", 40, 14, 0.7, 3.0, 0.1]]},
    "turkey_sandwich": {"desc": "Turkey and avocado sandwich", "items": [
      ["Turkey breast, sliced", 100, 104, 22.0, 1.5, 1.2],
      ["Wholemeal bread", 70, 173, 7.6, 30.1, 2.4],
      ["Avocado", 60, 96, 1.2, 5.1, 8.8],
      ["Spinach", 20, 5, 0.6, 0.7, 0.1]]},
    "chicken_salad":   {"desc": "Chicken salad with feta and croutons", "items": [
      ["Chicken breast", 150, 248, 53.0, 0.0, 1.5],
      ["Mixed leaves", 80, 18, 1.8, 2.4, 0.3],
      ["Cherry tomatoes", 100, 18, 0.9, 3.9, 0.2],
      ["Feta", 30, 80, 4.2, 1.2, 6.5],
      ["Olive oil", 10, 88, 0.0, 0.0, 10.0],
      ["Croutons", 20, 84, 2.2, 13.0, 2.6]]},
    "leftover_chilli": {"desc": "Leftover chilli with rice", "items": [
      ["Beef chilli", 250, 330, 28.0, 18.0, 15.0],
      ["White rice, cooked", 150, 195, 4.3, 43.0, 0.3]]},
    "salmon_potatoes": {"desc": "Salmon with roast potatoes and greens", "items": [
      ["Salmon fillet", 150, 354, 38.3, 0.0, 21.6],
      ["Roast potatoes", 200, 298, 5.0, 44.0, 11.4],
      ["Broccoli", 120, 41, 3.4, 8.0, 0.5]]},
    "bolognese":       {"desc": "Spaghetti bolognese", "items": [
      ["Beef mince, 5%", 150, 206, 31.0, 0.0, 8.0],
      ["Spaghetti, cooked", 200, 316, 11.0, 62.0, 1.8],
      ["Tomato sauce", 120, 66, 1.7, 9.6, 2.4],
      ["Parmesan", 15, 60, 5.4, 0.6, 4.0]]},
    "stir_fry_beef":   {"desc": "Beef stir fry with noodles", "items": [
      ["Beef strips", 150, 271, 39.0, 0.0, 12.3],
      ["Egg noodles, cooked", 180, 276, 9.4, 54.0, 2.2],
      ["Mixed stir-fry vegetables", 150, 60, 3.0, 9.8, 0.6],
      ["Soy sauce", 15, 8, 1.3, 0.8, 0.0]]},
    "chicken_traybake":{"desc": "Chicken thighs with sweet potato and peppers", "items": [
      ["Chicken thigh, skinless", 180, 306, 44.0, 0.0, 14.0],
      ["Sweet potato, roasted", 200, 180, 3.2, 41.4, 0.2],
      ["Peppers", 120, 31, 1.2, 7.2, 0.4],
      ["Olive oil", 6, 53, 0.0, 0.0, 6.0]]},
    "pizza_night":     {"desc": "Half a margherita and a beer", "items": [
      ["Pizza margherita", 300, 795, 31.5, 90.0, 28.5],
      ["Side salad", 60, 12, 0.8, 1.8, 0.2],
      ["Beer", 330, 139, 1.5, 10.6, 0.0]]},
    "apple_almonds":   {"desc": "Apple and a handful of almonds", "items": [
      ["Apple", 180, 94, 0.5, 25.0, 0.3],
      ["Almonds", 25, 145, 5.3, 5.4, 12.5]]},
    "protein_shake":   {"desc": "Protein shake", "items": [
      ["Whey protein", 30, 120, 24.0, 3.0, 1.5],
      ["Milk, semi-skimmed", 250, 125, 8.8, 12.0, 4.5]]},
    "dark_choc":       {"desc": "Two squares of dark chocolate", "items": [
      ["Dark chocolate, 70%", 25, 145, 1.9, 11.0, 10.4]]}
  },
  "days": [
    {"ago": 9, "log": [["breakfast","07:35","eggs_toast","text"],["lunch","12:45","burrito_bowl","text"],["snack","16:10","apple_almonds","quick"],["dinner","19:20","bolognese","text"]]},
    {"ago": 8, "log": [["breakfast","07:50","yogurt_berries","text"],["lunch","13:05","turkey_sandwich","text"],["snack","16:30","protein_shake","quick"],["dinner","19:40","salmon_potatoes","text"],["snack","21:15","dark_choc","quick"]]},
    {"ago": 7, "log": [["breakfast","08:10","oats_banana","text"],["lunch","12:30","chicken_salad","text"],["snack","15:50","apple_almonds","quick"],["dinner","19:00","stir_fry_beef","text"]]},
    {"ago": 6, "log": [["breakfast","07:30","eggs_toast","text"],["lunch","12:55","leftover_chilli","text"],["snack","16:20","protein_shake","quick"],["dinner","20:05","pizza_night","text"]]},
    {"ago": 5, "log": [["breakfast","07:45","yogurt_berries","text"],["lunch","12:40","burrito_bowl","text"],["snack","16:00","apple_almonds","quick"],["dinner","19:15","salmon_potatoes","text"]]},
    {"ago": 4, "log": [["breakfast","08:00","omelette_feta","text"],["lunch","13:10","turkey_sandwich","text"],["snack","16:40","protein_shake","quick"],["dinner","19:35","bolognese","text"],["snack","21:00","dark_choc","quick"]]},
    {"ago": 3, "log": [["breakfast","07:40","oats_banana","text"],["lunch","12:35","chicken_salad","text"],["snack","15:45","apple_almonds","quick"],["dinner","19:10","stir_fry_beef","text"]]},
    {"ago": 2, "log": [["breakfast","07:25","eggs_toast","text"],["lunch","12:50","burrito_bowl","text"],["snack","16:15","protein_shake","quick"],["dinner","19:25","chicken_traybake","text"]]},
    {"ago": 1, "log": [["breakfast","07:55","yogurt_berries","text"],["lunch","13:00","leftover_chilli","text"],["snack","16:05","dark_choc","quick"],["dinner","19:30","salmon_potatoes","text"]]},
    {"ago": 0, "log": [["breakfast","07:40","eggs_toast","text"],["lunch","12:45","chicken_salad","text"]]}
  ],
  "exercise": [
    {"ago": 8, "at": "18:10", "desc": "Gym — upper body, 45 minutes", "cat": "strength", "min": 45, "kcal": 280},
    {"ago": 5, "at": "07:05", "desc": "5k run before work", "cat": "cardio", "min": 27, "kcal": 335, "km": 5.0},
    {"ago": 2, "at": "18:25", "desc": "Gym — legs, 50 minutes", "cat": "strength", "min": 50, "kcal": 310}
  ],
  "weights": [[30,80.9],[27,80.6],[24,80.2],[21,80.4],[18,79.9],[15,79.6],[12,79.3],[9,79.4],[6,79.0],[3,78.7],[0,78.5]]
}'::jsonb AS p;

-- Entries first, with their ids, so the items and the journal turns can both
-- point at them.
CREATE TEMP TABLE seed_entries ON COMMIT DROP AS
SELECT gen_random_uuid() AS id,
       c.user_id,
       e->>0 AS meal,
       ((c.today - (d->>'ago')::int)::text || ' ' || (e->>1))::timestamp AT TIME ZONE c.tz AS eaten_at,
       c.today - (d->>'ago')::int AS local_date,
       m->>'desc' AS description,
       e->>3 AS source,
       m->'items' AS items,
       (d->>'ago')::int AS ago,
       ord AS slot
  FROM seed_ctx c,
       seed_plan s,
       jsonb_array_elements(s.p->'days') AS d,
       jsonb_array_elements(d->'log') WITH ORDINALITY AS a(e, ord),
       LATERAL (SELECT s.p->'meals'->(a.e->>2) AS m) AS lib;

INSERT INTO food_entries (id, user_id, meal, eaten_at, local_date, description, confidence, source, created_at, updated_at)
SELECT id, user_id, meal, eaten_at, local_date, description, 'medium', source, eaten_at, eaten_at
  FROM seed_entries;

INSERT INTO food_items (entry_id, name, quantity_g, quantity_desc, kcal, protein_g, carbs_g, fat_g, position, canonical, created_at)
SELECT s.id,
       i->>0,
       (i->>1)::numeric,
       '~' || (i->>1) || 'g',
       (i->>2)::numeric,
       (i->>3)::numeric,
       (i->>4)::numeric,
       (i->>5)::numeric,
       (n - 1)::smallint,
       lower(i->>0),
       s.eaten_at
  FROM seed_entries s,
       jsonb_array_elements(s.items) WITH ORDINALITY AS a(i, n);

INSERT INTO exercise_entries (user_id, description, performed_at, local_date, duration_min, kcal_burned, distance_km, category, confidence, source, detail, created_at)
SELECT c.user_id,
       x->>'desc',
       ((c.today - (x->>'ago')::int)::text || ' ' || (x->>'at'))::timestamp AT TIME ZONE c.tz,
       c.today - (x->>'ago')::int,
       (x->>'min')::numeric,
       (x->>'kcal')::numeric,
       (x->>'km')::numeric,
       x->>'cat',
       'medium',
       'text',
       'estimated',
       now()
  FROM seed_ctx c, seed_plan s, jsonb_array_elements(s.p->'exercise') AS x;

INSERT INTO weight_entries (user_id, measured_at, local_date, weight_kg, created_at)
SELECT c.user_id,
       ((c.today - (w->>0)::int)::text || ' 07:15')::timestamp AT TIME ZONE c.tz,
       c.today - (w->>0)::int,
       (w->>1)::numeric,
       now()
  FROM seed_ctx c, seed_plan s, jsonb_array_elements(s.p->'weights') AS w
ON CONFLICT (user_id, local_date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg;


-- The Journal is a conversation, not a table, and it is the first thing the
-- review notes tell the reviewer to open. Entries alone would leave it showing
-- whatever was last said three weeks ago, so the typed meals of the last three
-- days get their turns back: what was typed, and the card the model sent back.
-- `quick` entries get none — a tap is not a sentence.
CREATE TEMP TABLE seed_turns ON COMMIT DROP AS
WITH target AS (
  SELECT kcal FROM targets
   WHERE user_id = (SELECT user_id FROM seed_ctx)
   ORDER BY effective_from DESC LIMIT 1
), totals AS (
  SELECT s.id, s.user_id, s.meal, s.description, s.local_date, s.eaten_at, s.ago, s.source,
         round(sum((i->>2)::numeric))::int AS kcal,
         round(sum((i->>3)::numeric))::int AS protein_g,
         round(sum((i->>4)::numeric))::int AS carbs_g,
         round(sum((i->>5)::numeric))::int AS fat_g,
         jsonb_agg(jsonb_build_object('name', i->>0, 'quantity', '~' || (i->>1) || 'g') ORDER BY n) AS items
    FROM seed_entries s, jsonb_array_elements(s.items) WITH ORDINALITY AS a(i, n)
   GROUP BY s.id, s.user_id, s.meal, s.description, s.local_date, s.eaten_at, s.ago, s.source
), running AS (
  SELECT t.*,
         coalesce(sum(t.kcal) OVER (PARTITION BY t.local_date ORDER BY t.eaten_at
                                    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)::int AS kcal_before,
         (SELECT kcal FROM target) AS target_kcal
    FROM totals t
)
SELECT * FROM running WHERE ago <= 2 AND source = 'text';

INSERT INTO chat_messages (user_id, role, content, created_at)
SELECT user_id, 'user', lower(description), eaten_at FROM seed_turns;

INSERT INTO chat_messages (user_id, role, content, actions, tool_trace, created_at)
SELECT t.user_id,
       'assistant',
       CASE t.meal
         WHEN 'breakfast' THEN format('Logged — %s kcal to start the day, and %sg of protein already.', t.kcal, t.protein_g)
         WHEN 'lunch'     THEN format('%s kcal. That puts you at %s of %s, with dinner still to come.', t.kcal, to_char(t.kcal_before + t.kcal, 'FM9,999'), to_char(t.target_kcal, 'FM9,999'))
         WHEN 'dinner'    THEN format('%s kcal — the day closes at %s, comfortably inside your %s.', t.kcal, to_char(t.kcal_before + t.kcal, 'FM9,999'), to_char(t.target_kcal, 'FM9,999'))
         ELSE                  format('Added — %s kcal.', t.kcal)
       END,
       jsonb_build_array(jsonb_build_object(
         'kind', 'food_logged',
         'entry_id', t.id,
         'summary', format('%s: %s — %s kcal', t.meal, t.description, t.kcal),
         'card', jsonb_build_object(
           'type', 'food',
           'entry_id', t.id,
           'meal', t.meal,
           'description', t.description,
           'confidence', 'medium',
           'kcal', t.kcal,
           'protein_g', t.protein_g,
           'carbs_g', t.carbs_g,
           'fat_g', t.fat_g,
           'items', t.items,
           'day', jsonb_build_object(
             'local_date', t.local_date,
             'kcal_before', t.kcal_before,
             'kcal_after', t.kcal_before + t.kcal,
             'target_kcal', t.target_kcal)))),
       jsonb_build_object('kind', 'text_log', 'model', 'claude-haiku-4-5',
                          'tools', jsonb_build_array('food_logged'),
                          'cost_usd', 0.0312, 'num_turns', 2, 'session_id', null),
       t.eaten_at + interval '3 seconds'
  FROM seed_turns t;


COMMIT;
