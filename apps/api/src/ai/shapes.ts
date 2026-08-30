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
  /*
   * The same food, spelled the same way every time, so their own portions can
   * accumulate against it.
   *
   * `name` is what they call it and belongs to them — it changes with their
   * language, their mood and whether they typed a plural. This does not. Real
   * logs fragment badly without it: one account has tomato under "домати",
   * "домат" and "tomato", which is ten observations of one portion split into
   * three buckets that each look too thin to trust.
   *
   * English and lowercase not because English is the app's language — it is
   * not, and `name` stays in theirs — but because a key needs one spelling and
   * this is the one the model is most consistent at producing.
   */
  canonical: z
    .string()
    .nullable()
    .default(null)
    .describe(
      'A stable lowercase English key for what this food IS, ignoring language, plural, brand and preparation: "tomato", "chicken breast", "dark chocolate", "greek yoghurt". The same food must get the same key every time, whatever the user called it — "домати", "domati" and "cherry tomatoes" are all "tomato". Null only for something with no sensible key, like a mixed restaurant dish.',
    ),
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

  /*
   * The diet-quality panel. Nullable and defaulted to null on purpose: null is
   * "I do not know", zero is "there is none of this in it", and a model that
   * treats the two as interchangeable produces day totals that look complete
   * and are not. Filling these in badly is worse than leaving them out.
   */
  fiber_g: z
    .number()
    .nullable()
    .default(null)
    .describe(
      'Grams of fiber. Estimate it for whole foods you know — vegetables, fruit, beans, wholegrains, nuts — and for packaged food with a label. Null if you genuinely cannot tell.',
    ),
  sodium_mg: z
    .number()
    .nullable()
    .default(null)
    .describe(
      'Milligrams of sodium. Estimate it for packaged and processed food, restaurant and takeaway meals, cured meat, cheese, bread and anything obviously salted. A plain unsalted whole food is close to zero and that is a real zero, not a null. Null for a home-cooked dish where the seasoning is unknown.',
    ),
  sat_fat_g: z
    .number()
    .nullable()
    .default(null)
    .describe(
      'Grams of saturated fat. Estimate it wherever you estimated fat at all — the split between saturated and unsaturated follows from what the food is. Null only if the fat figure itself was a guess at a dish you could not identify.',
    ),
  sugar_g: z
    .number()
    .nullable()
    .default(null)
    .describe(
      'Grams of total sugars, including what is naturally in fruit and milk. Estimate it for anything sweet, any packaged food, and any fruit. Null when the carbohydrate is plainly all starch and the sugar figure would be noise.',
    ),
};
