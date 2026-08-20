import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type {
  Confidence,
  PantryFind,
  Recipe,
  RecipeContext,
  RecipeOrigin,
} from '@ct/shared';
import { saveRecipe } from '../services/recipes.ts';
import { itemShape } from './shapes.ts';

/**
 * The kitchen's tools: propose a recipe, and say what is in a fridge photo.
 *
 * They live apart from the nutrition tools in `tools.ts` because they are a
 * different job on the same data — nothing here logs food, and nothing in there
 * knows what a recipe is. `buildNutritionServer` swaps between the two sets on
 * `ServerOptions.toolset`, so a run gets one or the other and never both: a
 * recipe agent holding `log_food` would eventually log food.
 */

/**
 * Collected during a kitchen run and read by the caller afterwards. The shape
 * mirrors `ToolContext.actions` — the tools have nowhere to return to, so what
 * they produce is gathered on the context.
 */
export interface KitchenCollector {
  /** Recipes written this run, in the order they were proposed. */
  recipes: Recipe[];
  /** What a scan says it saw. Deliberately not written to the pantry. */
  found: PantryFind[];
  /** One line about the photo, including what could not be made out. */
  note: string | null;
  /** The budget the recipes are being written against; stamped onto each. */
  generatedFor: RecipeContext | null;
  /**
   * Where this run's recipes came from, stamped on at insert.
   *
   * Set by the caller rather than passed as a tool argument, so the model has
   * no say in it: origin is a claim about how much to trust the numbers, and
   * only the server knows which job it asked for.
   */
  origin: RecipeOrigin;
  adaptedFrom: string | null;
}

export function emptyCollector(
  generatedFor: RecipeContext | null = null,
  origin: RecipeOrigin = 'invented',
  adaptedFrom: string | null = null,
): KitchenCollector {
  return { recipes: [], found: [], note: null, generatedFor, origin, adaptedFrom };
}

const ok = (payload: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
});
const confidenceField = z
  .enum(['high', 'medium', 'low'])
  .describe(
    'high = a dish you know well with ordinary ingredients; medium = a normal estimate; low = an unusual dish or a portion you are unsure of.',
  );

/**
 * An ingredient, priced. Built on the same `itemShape` a logged food item uses,
 * because that is exactly what it becomes: cooking a recipe hands this array
 * straight to `createFoodEntry` with nothing re-estimated on the way.
 */
const ingredientShape = {
  ...itemShape,
  // The three fields whose meaning changes when the item is an ingredient
  // rather than something already eaten. Everything else — the macro fields —
  // is shared verbatim, which is what keeps the two from drifting apart.
  quantity_g: z
    .number()
    .nullable()
    .default(null)
    .describe('Weight in grams for the whole recipe, not per portion. Null for things not sensibly weighed, like a pinch of salt.'),
  quantity_desc: z
    .string()
    .nullable()
    .default(null)
    .describe('The amount in plain words — "2 medium onions", "a splash", "1 tin".'),
  missing: z
    .boolean()
    .default(false)
    .describe('True if this is not in their kitchen and they would have to buy it.'),
};

export interface KitchenToolContext {
  userId: string;
  kitchen: KitchenCollector;
}

export function buildKitchenTools(tc: KitchenToolContext) {
  const proposeRecipe = tool(
    'propose_recipe',
    'Put forward one thing they could cook. Call it once per idea — three ideas is three calls. Every ingredient needs its own quantity and macros for the whole recipe (not per portion), because this list is what gets logged if they cook it, and nothing downstream re-estimates it.',
    {
      title: z.string().describe('What the dish is, in a few words. "Chicken and rice traybake".'),
      summary: z
        .string()
        .nullable()
        .default(null)
        .describe('One line on why this one, right now — what it uses up, or how it fits what is left of their day.'),
      portions: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe('How many servings the ingredient quantities make. 1 unless they asked to cook ahead.'),
      minutes: z.number().int().nullable().default(null).describe('Rough total time, start to plate.'),
      steps: z
        .array(z.string())
        .min(1)
        .describe('The method, one short instruction per step. Written for someone cooking, not reading — no ingredient list repeated back at them.'),
      ingredients: z.array(z.object(ingredientShape)).min(1),
      confidence: confidenceField,
    },
    async (args) => {
      const recipe = await saveRecipe({
        userId: tc.userId,
        title: args.title,
        summary: args.summary,
        portions: args.portions,
        minutes: args.minutes,
        steps: args.steps,
        ingredients: args.ingredients.map((i) => ({
          name: i.name,
          quantity_g: i.quantity_g,
          quantity_desc: i.quantity_desc,
          kcal: i.kcal,
          protein_g: i.protein_g,
          carbs_g: i.carbs_g,
          fat_g: i.fat_g,
          missing: i.missing,
        })),
        confidence: args.confidence as Confidence,
        generatedFor: tc.kitchen.generatedFor,
        origin: tc.kitchen.origin,
        adaptedFrom: tc.kitchen.adaptedFrom,
      });

      tc.kitchen.recipes.push(recipe);

      // Echoed back from the saved row rather than the arguments, because the
      // two differ in the number that matters: the per-portion macros are
      // derived from the ingredients here, so this is the model's chance to
      // notice a recipe that came out at twice the budget it was aiming for.
      return ok({
        recipe_id: recipe.id,
        title: recipe.title,
        portions: recipe.portions,
        per_portion: {
          kcal: Math.round(recipe.kcal),
          protein_g: Math.round(recipe.protein_g),
          carbs_g: Math.round(recipe.carbs_g),
          fat_g: Math.round(recipe.fat_g),
        },
        missing: recipe.ingredients.filter((i) => i.missing).map((i) => i.name),
      });
    },
    { alwaysLoad: true },
  );

  const notePantryItems = tool(
    'note_pantry_items',
    'Report what you can see in the photo. List one entry per distinct ingredient you can identify. Do not guess at things hidden behind other things — a shelf you cannot see is not an empty shelf.',
    {
      items: z
        .array(
          z.object({
            name: z.string().describe('The ingredient, as someone would write it on a list.'),
            quantity_desc: z
              .string()
              .nullable()
              .default(null)
              .describe('Roughly how much, if you can tell — "half a bag", "2 peppers". Null if you cannot.'),
            confidence: z
              .enum(['high', 'medium', 'low'])
              .describe('high = plainly identifiable; medium = probably; low = a guess from a shape or a colour.'),
          }),
        )
        .describe('Everything you can identify. An empty list is a valid answer for a photo of an empty fridge.'),
      note: z
        .string()
        .nullable()
        .default(null)
        .describe('One line for the user about what you could and could not make out — the jars at the back, a label turned away.'),
    },
    async (args) => {
      tc.kitchen.found = args.items.map((i) => ({
        name: i.name,
        quantity_desc: i.quantity_desc,
        confidence: i.confidence as Confidence,
      }));
      tc.kitchen.note = args.note;

      // Nothing is written to the pantry here, and saying so keeps the model
      // from reporting the job as done: the user confirms this list first. A
      // photo shows the front row of one shelf, and the gap between "the model
      // read this" and "they have this" is the reason the tool only proposes.
      return ok({ noted: tc.kitchen.found.length, saved: false });
    },
    { alwaysLoad: true },
  );

  const tools = [proposeRecipe, notePantryItems];
  return { tools, byName: new Map(tools.map((t) => [t.name, t])) };
}
