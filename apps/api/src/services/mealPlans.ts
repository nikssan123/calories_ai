import type {
  FoodEntry,
  MealPlan,
  MealPlanBrief,
  MealPlanSlot,
  Recipe,
  ShoppingItem,
  ShoppingList,
} from '@ct/shared';
import { query, queryOne, transaction } from '../db.ts';
import { addDays, type DayContext } from '../time.ts';
import { nightsCovered } from '../ai/plan.ts';
import { cookRecipe, toRecipeRow } from './recipes.ts';
import { listPantry } from './pantry.ts';
import { listExtras } from './shopping.ts';

/**
 * Storing a planned week, and turning it into a shopping list.
 *
 * The plan is a calendar over `recipes` rather than a thing of its own: a slot
 * points at a recipe row and nothing else, so cooking a Tuesday is the same
 * `cookRecipe` call as cooking anything else and nothing is re-estimated on the
 * way. That is the property the whole feature is built to preserve.
 */

/** Seven nights. Dinner only — see the migration for why. */
export const PLAN_DAYS = 7;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The Monday on or before `date`.
 *
 * A plan starts on a Monday whatever day it was asked for, because a shopping
 * list is a weekly errand and a Wednesday-to-Tuesday week is not one anybody
 * shops for. Someone planning on Thursday gets the current week, with the days
 * already gone left empty.
 */
export function planWeekFor(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  // getUTCDay is 0 for Sunday, so Sunday belongs to the week that just ended.
  return addDays(date, -((day + 6) % 7));
}

export function weekdayFor(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

export interface SlotInput {
  local_date: string;
  recipeId: string | null;
  portions: number;
}

/**
 * Writes the week, replacing whatever was there.
 *
 * One transaction and a delete-then-insert rather than a merge: regenerating a
 * plan produces a whole new week, and a merge would have to decide what to do
 * with a Wednesday that no longer exists. The slots are cheap and the recipes
 * they point at survive independently.
 */
export async function saveMealPlan(
  userId: string,
  weekStart: string,
  brief: MealPlanBrief | null,
  slots: SlotInput[],
): Promise<MealPlan> {
  const planId = await transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO meal_plans (user_id, week_start, brief)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, week_start) DO UPDATE
         SET brief = EXCLUDED.brief, created_at = now()
       RETURNING id`,
      [userId, weekStart, brief ? JSON.stringify(brief) : null],
    );
    const id = rows[0]!.id;

    await client.query('DELETE FROM meal_plan_slots WHERE plan_id = $1', [id]);
    for (const slot of slots) {
      await client.query(
        `INSERT INTO meal_plan_slots (plan_id, local_date, recipe_id, portions)
         VALUES ($1,$2,$3,$4)`,
        [id, slot.local_date, slot.recipeId, Math.max(1, Math.round(slot.portions))],
      );
    }
    return id;
  });

  const plan = await getMealPlanById(userId, planId);
  if (!plan) throw new Error('Meal plan vanished immediately after insert');
  return plan;
}

export async function getMealPlan(userId: string, weekStart: string): Promise<MealPlan | null> {
  const row = await queryOne<any>(
    'SELECT * FROM meal_plans WHERE user_id = $1 AND week_start = $2',
    [userId, weekStart],
  );
  return row ? hydrate(row) : null;
}

async function getMealPlanById(userId: string, planId: string): Promise<MealPlan | null> {
  const row = await queryOne<any>('SELECT * FROM meal_plans WHERE id = $1 AND user_id = $2', [
    planId,
    userId,
  ]);
  return row ? hydrate(row) : null;
}

/**
 * The plan with its recipes attached.
 *
 * One query for the slots and one for the recipes rather than a join per slot,
 * and the recipes are read through the same `SELECT *` shape `toRecipe` expects
 * — so a column added to recipes appears here without this file knowing.
 */
async function hydrate(row: any): Promise<MealPlan> {
  const weekStart = String(row.week_start).slice(0, 10);

  const slotRows = await query<any>(
    `SELECT s.*, r.id AS r_id
       FROM meal_plan_slots s
       LEFT JOIN recipes r ON r.id = s.recipe_id
      WHERE s.plan_id = $1
   ORDER BY s.local_date ASC`,
    [row.id],
  );

  const recipeIds = slotRows.map((s) => s.recipe_id).filter((id): id is string => id !== null);
  const recipes = new Map<string, Recipe>();
  if (recipeIds.length > 0) {
    const rows = await query<any>('SELECT * FROM recipes WHERE id = ANY($1::uuid[])', [recipeIds]);
    for (const r of rows) recipes.set(r.id, toRecipeRow(r));
  }

  /*
   * Which other nights a batch cook covers, worked out here rather than stored.
   *
   * A slot cooking four portions for a household of two covers itself and one
   * more night; the nights it covers are the empty slots that follow it. Stored,
   * this would go wrong the moment somebody swapped a night in the middle — the
   * derived version simply recomputes.
   *
   * The household size comes off the plan's own brief, which is why the brief is
   * kept: without it four portions reads as four nights for everybody, and a
   * couple would be told Monday's dinner covers them to Thursday.
   */
  const servings = Math.max(1, (row.brief as MealPlanBrief | null)?.servings ?? 1);
  const slots: MealPlanSlot[] = slotRows.map((s) => ({
    id: s.id,
    local_date: String(s.local_date).slice(0, 10),
    weekday: weekdayFor(String(s.local_date).slice(0, 10)),
    recipe: s.recipe_id ? (recipes.get(s.recipe_id) ?? null) : null,
    portions: Number(s.portions),
    covers: [],
    cooked_at: s.cooked_at ? new Date(s.cooked_at).toISOString() : null,
  }));

  for (const [index, slot] of slots.entries()) {
    if (!slot.recipe) continue;
    const spare = nightsCovered(slot.portions, servings) - 1;
    if (spare < 1) continue;
    slots[index]!.covers = slots
      .slice(index + 1)
      .filter((later) => later.recipe === null)
      .slice(0, spare)
      .map((later) => later.local_date);
  }

  return {
    id: row.id,
    week_start: weekStart,
    brief: row.brief ?? null,
    slots,
    created_at: new Date(row.created_at).toISOString(),
  };
}

export interface SlotPatch {
  /** A different recipe for this night, or null to clear it. */
  recipeId?: string | null;
  portions?: number;
}

/** Swapping or skipping one night. Never touches the rest of the week. */
export async function updateSlot(
  userId: string,
  slotId: string,
  patch: SlotPatch,
): Promise<MealPlan | null> {
  const owner = await queryOne<{ plan_id: string }>(
    `SELECT s.plan_id FROM meal_plan_slots s
       JOIN meal_plans p ON p.id = s.plan_id
      WHERE s.id = $1 AND p.user_id = $2`,
    [slotId, userId],
  );
  if (!owner) return null;

  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.recipeId !== undefined) {
    params.push(patch.recipeId);
    sets.push(`recipe_id = $${params.length}`);
  }
  if (patch.portions !== undefined) {
    params.push(Math.max(1, Math.round(patch.portions)));
    sets.push(`portions = $${params.length}`);
  }
  if (sets.length > 0) {
    params.push(slotId);
    await query(`UPDATE meal_plan_slots SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  }

  return getMealPlanById(userId, owner.plan_id);
}

/**
 * Cooking a planned night.
 *
 * `cookRecipe` unchanged, which is the point: the macros were settled when the
 * recipe was written and the plan adds nothing to re-estimate. All this does
 * beyond that is stamp the slot, so the week reads back as what happened.
 */
export async function cookSlot(
  userId: string,
  slotId: string,
  ctx: DayContext,
  options: { portions?: number; eatenAt?: Date } = {},
): Promise<FoodEntry | null> {
  const slot = await queryOne<{ recipe_id: string | null; portions: number }>(
    `SELECT s.recipe_id, s.portions FROM meal_plan_slots s
       JOIN meal_plans p ON p.id = s.plan_id
      WHERE s.id = $1 AND p.user_id = $2`,
    [slotId, userId],
  );
  if (!slot?.recipe_id) return null;

  /*
   * One portion by default, not the slot's.
   *
   * `portions` on a slot is how many the cook makes — four, for a batch — and
   * logging four portions as eaten in one sitting is exactly the wrong reading
   * of a batch. What gets logged is what was put on a plate.
   */
  const entry = await cookRecipe(userId, slot.recipe_id, {
    portions: options.portions ?? 1,
    eatenAt: options.eatenAt,
    ctx,
  });
  if (!entry) return null;

  await query('UPDATE meal_plan_slots SET cooked_at = now() WHERE id = $1', [slotId]);
  return entry;
}

// ---- The shopping list -----------------------------------------------------

/**
 * The union of the week's ingredients, minus what the kitchen already holds,
 * plus whatever they wrote on it themselves.
 *
 * The ingredient half is derived on every read and never stored. A stored list
 * is wrong the moment a slot is swapped, and a shopping list wrong in one line
 * is not trusted in any line — which makes it worse than no list, because it
 * still has to be checked against the recipes it came from.
 *
 * The written half is stored, because nothing derives kitchen roll. The two
 * meet here and nowhere else: `shopping_extras` never learns about the plan and
 * the plan never learns about it, so a swapped Tuesday still rewrites exactly
 * its own ingredients. What a client gets is one list; what either half can do
 * to the other is nothing.
 */
export async function shoppingListFor(
  userId: string,
  weekStart: string,
): Promise<ShoppingList | null> {
  const [plan, extras] = await Promise.all([
    getMealPlan(userId, weekStart),
    listExtras(userId, weekStart),
  ]);
  // Null means there is nothing here at all, which is no longer the same thing
  // as having nothing planned: a list can be one written line and no week.
  if (!plan && extras.length === 0) return null;

  const pantry = await listPantry(userId);
  /*
   * Staples come off the list outright; fresh items come off too, but they are
   * named in `have_already` so the omission is visible.
   *
   * The pantry is a memory rather than an inventory — nothing is decremented
   * when a recipe is cooked, by design — so "you already have this" is a claim
   * about what they told us, not about what is in the fridge. Saying which
   * items were dropped is what keeps that honest.
   */
  const held = new Map(pantry.map((item) => [item.name.toLowerCase(), item]));

  const byName = new Map<string, ShoppingItem>();
  const haveAlready = new Set<string>();

  for (const slot of plan?.slots ?? []) {
    if (!slot.recipe) continue;
    for (const ingredient of slot.recipe.ingredients) {
      const key = ingredient.name.trim().toLowerCase();
      if (!key) continue;

      const inPantry = held.get(key);
      if (inPantry) {
        haveAlready.add(ingredient.name);
        // A staple is genuinely settled; a fresh item recorded a fortnight ago
        // is a maybe, and the recipe writer already flagged it as missing or
        // not. Trust that flag over the pantry's age.
        if (inPantry.is_staple || !ingredient.missing) continue;
      }

      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, {
          name: ingredient.name,
          quantity_g: ingredient.quantity_g,
          quantity_descs: ingredient.quantity_desc ? [ingredient.quantity_desc] : [],
          for_dates: [slot.local_date],
          missing: ingredient.missing,
          extra_id: null,
          bought: false,
        });
        continue;
      }

      // Weights add up; descriptions do not — "1 tin" plus "a splash" is not a
      // quantity, so both are kept and the reader does the judging.
      existing.quantity_g =
        existing.quantity_g === null || ingredient.quantity_g === null
          ? null
          : Math.round((existing.quantity_g + ingredient.quantity_g) * 10) / 10;
      if (ingredient.quantity_desc && !existing.quantity_descs.includes(ingredient.quantity_desc)) {
        existing.quantity_descs.push(ingredient.quantity_desc);
      }
      if (!existing.for_dates.includes(slot.local_date)) existing.for_dates.push(slot.local_date);
      existing.missing = existing.missing || ingredient.missing;
    }
  }

  /*
   * The written lines, folded in last.
   *
   * Deliberately not filtered against the pantry the way an ingredient is.
   * Dropping an ingredient because the kitchen holds it is the app inferring
   * something; a line somebody typed is the person stating it, and an app that
   * quietly deletes what you wrote because it thinks you already have some is
   * an app you stop writing on.
   *
   * A name that is on both sides becomes one row rather than two — the point of
   * a list is to be walked once — and that row keeps the written line's handle,
   * so it can still be ticked off. Its quantities sit side by side unsummed,
   * which is the same thing the derived half already does with "1 tin" and "a
   * splash": two ways of saying an amount do not add up.
   */
  const written = new Set(extras.map((extra) => extra.name.trim().toLowerCase()));
  for (const extra of extras) {
    const key = extra.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      if (extra.quantity_desc && !existing.quantity_descs.includes(extra.quantity_desc)) {
        existing.quantity_descs.push(extra.quantity_desc);
      }
      existing.extra_id = extra.id;
      existing.bought = extra.bought;
      continue;
    }

    byName.set(key, {
      name: extra.name,
      // No weight, and no nights: nobody's recipe asked for this, so there is
      // no date it is needed by and nothing to sum it with.
      quantity_g: null,
      quantity_descs: extra.quantity_desc ? [extra.quantity_desc] : [],
      for_dates: [],
      missing: true,
      extra_id: extra.id,
      bought: extra.bought,
    });
  }

  return {
    week_start: weekStart,
    // Alphabetical: a shopping list is read while walking, and the one useful
    // order — by aisle — is a fact about a shop nobody here knows.
    items: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    // Anything written by hand is dropped from here, whatever the kitchen says.
    // It is on the list; saying underneath that it was left off is the list
    // contradicting itself in the one place people look to check it.
    have_already: [...haveAlready]
      .filter((name) => !written.has(name.trim().toLowerCase()))
      .sort((a, b) => a.localeCompare(b)),
  };
}
