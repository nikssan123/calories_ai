import { z } from 'zod';

/**
 * Tool argument shapes shared by more than one toolset.
 *
 * This module exists to break a cycle rather than to be a home for odds and
 * ends: `tools.ts` builds the kitchen's tools when asked for them, and the
 * kitchen describes an ingredient with the same fields a logged food item uses.
 * Importing that shape back out of `tools.ts` would make the two modules
 * require each other at load time, and the shape is evaluated at module scope —
 * so whichever loaded second would read it as undefined.
 */

/**
 * One priced food item.
 *
 * The journal uses it for something eaten and the kitchen for an ingredient,
 * which is not a coincidence to be tidied away: an ingredient list *is* a food
 * entry waiting to be written, and sharing the shape is what lets a recipe be
 * logged without anything being translated or re-estimated on the way.
 */
export const itemShape = {
  name: z.string().describe('The food, as the user would say it. "Chicken breast", not "Poultry, broilers".'),
  quantity_g: z
    .number()
    .nullable()
    .default(null)
    .describe('Estimated weight in grams. Null for things not sensibly weighed, like a black coffee.'),
  quantity_desc: z
    .string()
    .nullable()
    .default(null)
    .describe('The assumption in plain words — "1 medium banana", "2 slices", "a large handful".'),
  kcal: z.number().describe('Estimated calories for this item at this quantity.'),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
};
