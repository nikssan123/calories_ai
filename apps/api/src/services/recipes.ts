import type {
  Confidence,
  DietQuality,
  FoodEntry,
  Meal,
  Recipe,
  RecipeContext,
  RecipeIngredient,
  RecipeOrigin,
} from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { createFoodEntry } from './log.ts';
import { type DayContext, inferMeal } from '../time.ts';

/**
 * Storing and spending recipes.
 *
 * A recipe is an artifact rather than a record: it is generated, read, maybe
 * cooked, and never corrected in place the way a food entry is. That is why the
 * steps and the ingredients are JSONB — they are read whole, and a wrong recipe
 * is regenerated rather than edited.
 */

export interface SaveRecipeInput {
  userId: string;
  title: string;
  summary: string | null;
  portions: number;
  minutes: number | null;
  steps: string[];
  ingredients: RecipeIngredient[];
  confidence: Confidence;
  generatedFor: RecipeContext | null;
  /** Invented from the pantry, reworked from the library, or brought by the user. */
  origin?: RecipeOrigin;
  /** The library slug an adaptation started from. */
  adaptedFrom?: string | null;
}

/**
 * Macros are stored per portion, computed here from the ingredients rather than
 * taken from the model as a separate figure.
 *
 * Asking for the totals alongside the items invites them to disagree, and when
 * they do there is no way to tell which half is wrong — while the ingredient
 * list is the half that has to be right anyway, because it is what gets logged
 * when someone cooks this. One source, derived twice, cannot drift.
 */
export async function saveRecipe(input: SaveRecipeInput): Promise<Recipe> {
  const portions = Math.max(1, Math.round(input.portions));
  const perPortion = dividePortions(totalNutrition(input.ingredients), portions);

  const row = await queryOne<any>(
    `INSERT INTO recipes
       (user_id, title, summary, portions, minutes, steps, ingredients,
        kcal, protein_g, carbs_g, fat_g,
        fiber_g, sodium_mg, sat_fat_g, sugar_g, confidence, generated_for,
        origin, adapted_from)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      input.userId,
      input.title,
      input.summary,
      portions,
      input.minutes,
      JSON.stringify(input.steps),
      JSON.stringify(input.ingredients),
      perPortion.kcal,
      perPortion.protein_g,
      perPortion.carbs_g,
      perPortion.fat_g,
      perPortion.fiber_g,
      perPortion.sodium_mg,
      perPortion.sat_fat_g,
      perPortion.sugar_g,
      input.confidence,
      input.generatedFor ? JSON.stringify(input.generatedFor) : null,
      input.origin ?? 'invented',
      input.adaptedFrom ?? null,
    ],
  );
  return toRecipe(row);
}

export interface ListRecipeOptions {
  limit?: number;
  savedOnly?: boolean;
}

export async function listRecipes(
  userId: string,
  options: ListRecipeOptions = {},
): Promise<Recipe[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const rows = await query<any>(
    `SELECT * FROM recipes
      WHERE user_id = $1
        AND ($2::boolean IS NOT TRUE OR saved)
   ORDER BY created_at DESC
      LIMIT $3`,
    [userId, options.savedOnly ?? false, limit],
  );
  return rows.map(toRecipe);
}

export async function getRecipe(userId: string, recipeId: string): Promise<Recipe | null> {
  const row = await queryOne<any>('SELECT * FROM recipes WHERE id = $1 AND user_id = $2', [
    recipeId,
    userId,
  ]);
  return row ? toRecipe(row) : null;
}

export async function setRecipeSaved(
  userId: string,
  recipeId: string,
  saved: boolean,
): Promise<Recipe | null> {
  const row = await queryOne<any>(
    'UPDATE recipes SET saved = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [saved, recipeId, userId],
  );
  return row ? toRecipe(row) : null;
}

export interface CookOptions {
  portions?: number;
  meal?: Meal;
  eatenAt?: Date;
  ctx: DayContext;
}

/**
 * Logging a recipe as eaten.
 *
 * This is the best entry the product can produce, and the reason the whole
 * feature closes back into the journal: nothing is described, nothing is
 * estimated a second time, and the macros were settled when the recipe was
 * written. Confidence carries over unchanged — reusing an estimate makes it no
 * more certain than it was, and no less.
 *
 * `source: 'quick'` rather than a new enum member: from the log's point of view
 * this is the same act as repeating a past meal — an entry created from
 * something already priced, without the agent seeing it.
 */
export async function cookRecipe(
  userId: string,
  recipeId: string,
  options: CookOptions,
): Promise<FoodEntry | null> {
  const recipe = await getRecipe(userId, recipeId);
  if (!recipe) return null;

  const eatenAt = options.eatenAt ?? new Date();
  // The stored ingredients make the whole dish; the card's macros are one
  // portion of it. Someone eating half of what they cooked is the ordinary
  // case, so scale from the recipe's own portion count rather than assuming
  // the pot was the plate.
  const share = (options.portions ?? 1) / recipe.portions;

  const entry = await createFoodEntry({
    userId,
    meal: options.meal ?? inferMeal(eatenAt, options.ctx.timezone),
    eatenAt,
    description: recipe.title,
    note: recipe.summary,
    confidence: recipe.confidence,
    source: 'quick',
    photoId: null,
    items: recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity_g: ingredient.quantity_g === null ? null : round1(ingredient.quantity_g * share),
      // Left as written when the whole thing is being eaten; dropped when it is
      // not, because "1 medium onion" is a lie about a third of an onion and a
      // wrong description is worse than none beside a correct weight.
      quantity_desc: share === 1 ? ingredient.quantity_desc : null,
      kcal: round1(ingredient.kcal * share),
      protein_g: round1(ingredient.protein_g * share),
      carbs_g: round1(ingredient.carbs_g * share),
      fat_g: round1(ingredient.fat_g * share),
      // Scaled where present, left null where it never was — the whole reason
      // the ingredient list and a food item are the same shape is that this
      // hand-off invents nothing, and inventing a zero here would be inventing.
      ...scaleQuality(ingredient, share),
    })),
    ctx: options.ctx,
  });

  // Stamped, not linked. Cooking the same recipe twice is ordinary, and the
  // entries are the record of that — this only says "you have made this".
  await query('UPDATE recipes SET cooked_at = now() WHERE id = $1', [recipeId]);
  return entry;
}

/**
 * The macros always add up; the quality panel adds up only where it was
 * estimated.
 *
 * A recipe whose ingredients were priced before these fields existed — or whose
 * writer honestly could not judge the sodium in one of them — sums to null
 * rather than to the total of the ingredients that did carry a figure. Half a
 * dish's fiber printed as the dish's fiber is worse than no figure at all,
 * because the card gives no hint that anything is missing.
 */
export function totalNutrition(ingredients: RecipeIngredient[]) {
  const macros = ingredients.reduce(
    (sum, i) => ({
      kcal: sum.kcal + i.kcal,
      protein_g: sum.protein_g + i.protein_g,
      carbs_g: sum.carbs_g + i.carbs_g,
      fat_g: sum.fat_g + i.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  const total = (field: keyof DietQuality): number | null => {
    if (ingredients.length === 0) return null;
    if (ingredients.some((i) => i[field] === null || i[field] === undefined)) return null;
    return ingredients.reduce((sum, i) => sum + (i[field] as number), 0);
  };

  return {
    ...macros,
    fiber_g: total('fiber_g'),
    sodium_mg: total('sodium_mg'),
    sat_fat_g: total('sat_fat_g'),
    sugar_g: total('sugar_g'),
  };
}

export function dividePortions(total: ReturnType<typeof totalNutrition>, portions: number) {
  const share = (value: number | null) => (value === null ? null : round1(value / portions));
  return {
    kcal: round1(total.kcal / portions),
    protein_g: round1(total.protein_g / portions),
    carbs_g: round1(total.carbs_g / portions),
    fat_g: round1(total.fat_g / portions),
    fiber_g: share(total.fiber_g),
    sodium_mg: share(total.sodium_mg),
    sat_fat_g: share(total.sat_fat_g),
    sugar_g: share(total.sugar_g),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function scaleQuality(source: DietQuality, share: number): DietQuality {
  const scale = (value: number | null | undefined) =>
    value === null || value === undefined ? null : round1(value * share);
  return {
    fiber_g: scale(source.fiber_g),
    sodium_mg: scale(source.sodium_mg),
    sat_fat_g: scale(source.sat_fat_g),
    sugar_g: scale(source.sugar_g),
  };
}

/**
 * A `recipes` row as a `Recipe`. Exported under a name that says it is the row
 * mapper, so the meal planner can read recipes in bulk without duplicating the
 * column handling — the nullable quality panel above all, where `Number(null)`
 * would silently turn "not estimated" into zero.
 */
export function toRecipeRow(row: any): Recipe {
  return toRecipe(row);
}

function toRecipe(row: any): Recipe {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    portions: Number(row.portions),
    minutes: row.minutes === null ? null : Number(row.minutes),
    steps: row.steps ?? [],
    ingredients: row.ingredients ?? [],
    kcal: Number(row.kcal),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
    fiber_g: nullableNumber(row.fiber_g),
    sodium_mg: nullableNumber(row.sodium_mg),
    sat_fat_g: nullableNumber(row.sat_fat_g),
    sugar_g: nullableNumber(row.sugar_g),
    confidence: row.confidence,
    generated_for: row.generated_for,
    origin: row.origin,
    adapted_from: row.adapted_from,
    saved: row.saved,
    cooked_at: row.cooked_at ? new Date(row.cooked_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
  };
}

const nullableNumber = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);
