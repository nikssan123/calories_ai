import type { FoodEntry, Meal, MealTemplate } from '@ct/shared';
import { query } from '../db.ts';
import { addDays, type DayContext, inferMeal, localDateFor } from '../time.ts';
import { createFoodEntry, getFoodEntry, listFoodEntries } from './log.ts';

/**
 * Repeat-a-meal.
 *
 * `search_food_history` already makes "my usual breakfast" work in conversation.
 * This is the same idea for the screen: most people eat the same eight things,
 * and re-logging one should not require describing it again.
 *
 * Templates are collapsed by description rather than listed by entry, because
 * the useful list is "the things you eat", not "the last twenty things you ate".
 */

export interface TemplateOptions {
  query?: string | null;
  meal?: Meal | null;
  daysBack?: number;
  limit?: number;
}

export async function mealTemplates(
  userId: string,
  ctx: DayContext,
  options: TemplateOptions = {},
  today = localDateFor(new Date(), ctx),
): Promise<MealTemplate[]> {
  const from = addDays(today, -(options.daysBack ?? 90));
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);

  // One entry per distinct description — the most recent — carrying how many
  // times that description has been logged in the window.
  const rows = await query<{ id: string; times: string }>(
    `WITH ranked AS (
       SELECT e.id,
              count(*)      OVER (PARTITION BY lower(e.description)) AS times,
              row_number()  OVER (PARTITION BY lower(e.description)
                                  ORDER BY e.eaten_at DESC)          AS rn,
              max(e.eaten_at) OVER (PARTITION BY lower(e.description)) AS last_eaten
         FROM food_entries e
        WHERE e.user_id = $1
          AND e.local_date >= $2
          AND ($3::text IS NULL OR e.meal = $3)
          AND ($4::text IS NULL OR e.description ILIKE '%' || $4 || '%'
               OR EXISTS (SELECT 1 FROM food_items fi
                           WHERE fi.entry_id = e.id AND fi.name ILIKE '%' || $4 || '%'))
     )
     SELECT id, times FROM ranked
      WHERE rn = 1
   ORDER BY times DESC, last_eaten DESC
      LIMIT $5`,
    [userId, from, options.meal ?? null, options.query ?? null, limit],
  );

  const timesById = new Map(rows.map((r) => [r.id, Number(r.times)]));
  const entries = await listFoodEntries(userId, { entryIds: rows.map((r) => r.id) });
  const byId = new Map(entries.map((e) => [e.id, e]));

  // Re-impose the ranking: listFoodEntries orders by time, not by frequency.
  return rows
    .map((r) => byId.get(r.id))
    .filter((e): e is FoodEntry => e !== undefined)
    .map((entry) => ({
      entry_id: entry.id,
      description: entry.description,
      meal: entry.meal,
      times: timesById.get(entry.id) ?? 1,
      last_eaten: entry.eaten_at,
      kcal: Math.round(entry.kcal),
      protein_g: Math.round(entry.protein_g),
      carbs_g: Math.round(entry.carbs_g),
      fat_g: Math.round(entry.fat_g),
      items: entry.items.map((i) => ({
        name: i.name,
        quantity_g: i.quantity_g,
        quantity_desc: i.quantity_desc,
        kcal: Math.round(i.kcal),
      })),
    }));
}

export interface RepeatOptions {
  meal?: Meal;
  eatenAt?: Date;
}

/**
 * Clones a past entry to now. The copy is a new entry with its own items — not
 * a reference — so correcting it later ("a bit less rice this time") touches
 * only today, exactly as if the agent had logged it.
 */
export async function repeatFoodEntry(
  userId: string,
  entryId: string,
  ctx: DayContext,
  options: RepeatOptions = {},
): Promise<FoodEntry | null> {
  const source = await getFoodEntry(userId, entryId);
  if (!source) return null;

  const eatenAt = options.eatenAt ?? new Date();
  return createFoodEntry({
    userId,
    meal: options.meal ?? inferMeal(eatenAt, ctx.timezone),
    eatenAt,
    description: source.description,
    note: source.note,
    // The estimate was made once and is being reused verbatim, so it is no more
    // certain than it was the first time — and no less.
    confidence: source.confidence,
    source: 'quick',
    // Deliberately not the original photo: this is a different meal that
    // happens to match, and the picture is of the earlier one.
    photoId: null,
    items: source.items.map((i) => ({
      name: i.name,
      quantity_g: i.quantity_g,
      quantity_desc: i.quantity_desc,
      kcal: i.kcal,
      protein_g: i.protein_g,
      carbs_g: i.carbs_g,
      fat_g: i.fat_g,
    })),
    ctx,
  });
}
