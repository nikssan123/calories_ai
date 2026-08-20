import type { Meal, Recipe, RecipeContext } from '@ct/shared';
import { mealTemplates } from '../services/history.ts';
import { listNotes } from '../services/notes.ts';
import { listPantry, ageInDays } from '../services/pantry.ts';
import { buildDaySummary } from '../services/summary.ts';
import { recordUsage } from '../services/usage.ts';
import { getUserContext } from '../services/user.ts';
import { inferMeal, localDateFor } from '../time.ts';
import { MAX_TURNS } from './client.ts';
import { emptyCollector } from './kitchen.ts';
import { createProvider, type AgentRequest } from './providers/index.ts';
import { RECIPE_SYSTEM_PROMPT, recipeTaskPrompt } from './prompt.ts';
import { buildNutritionServer } from './tools.ts';
import type { ToolContext } from './tools.ts';

/**
 * "What can I cook?" — answered from the kitchen, the day, and the log.
 *
 * Shaped like the weekly review rather than like a journal turn: one run, no
 * session to resume, no conversation to pollute, and everything the agent needs
 * handed to it in the user turn instead of fetched through tools. The
 * difference from the review is only what comes back — prose there, rows here.
 */

export interface SuggestOptions {
  /** Null infers from the clock, the same way a log without a meal does. */
  meal?: Meal | null;
  /** Anything the user typed to steer it: "something quick", "no oven". */
  wants?: string | null;
  /** Overrides "now". Tests and backfills use it. */
  now?: Date;
}

export async function suggestRecipes(
  userId: string,
  options: SuggestOptions = {},
): Promise<{ recipes: Recipe[]; message: string }> {
  const { userId: id, ...ctx } = await getUserContext(userId);
  const now = options.now ?? new Date();
  const today = localDateFor(now, ctx);

  const [day, pantry, usual, notes] = await Promise.all([
    buildDaySummary(id, today),
    listPantry(id),
    mealTemplates(id, ctx, { limit: 8 }, today),
    listNotes(id),
  ]);

  /*
   * What is left, floored at zero.
   *
   * Someone who is already over their target is the case this most has to get
   * right: a negative budget handed to the model reads as an instruction to
   * suggest negative food, and the honest answer — "there is nothing left
   * today, here is the lightest thing you could make" — is what a zero
   * produces. The prompt has a branch for a small number and this lands in it.
   */
  const generatedFor: RecipeContext = {
    local_date: today,
    kcal_remaining: Math.max(0, Math.round(day.targets.kcal - day.consumed.kcal)),
    protein_remaining: Math.max(0, Math.round(day.targets.protein_g - day.consumed.protein_g)),
  };

  const kitchen = emptyCollector(generatedFor);
  const toolContext: ToolContext = { userId: id, ctx, now, photoId: null, actions: [], kitchen };

  const provider = createProvider(toolContext);
  const authError = provider.checkAuth();
  if (authError) throw new Error(authError);

  const { tools, toolNames } = buildNutritionServer(toolContext, { toolset: 'kitchen' });

  const request: AgentRequest = {
    kind: 'recipe',
    // Wholly stable: the pantry and the day's numbers ride in the user turn, so
    // there is nothing volatile to keep out of the cache — the same shape the
    // review has, and the reason both leave the dynamic half empty.
    staticSystemPrompt: RECIPE_SYSTEM_PROMPT,
    dynamicSystemPrompt: '',
    text: recipeTaskPrompt({
      budget: generatedFor,
      staples: pantry.filter((i) => i.is_staple).map((i) => i.name),
      fresh: pantry
        .filter((i) => !i.is_staple)
        .map((i) => ({
          name: i.name,
          quantity_desc: i.quantity_desc,
          days_ago: ageInDays(i, now),
        })),
      usual: usual.map((m) => ({
        description: m.description,
        times: m.times,
        kcal: m.kcal,
        protein_g: m.protein_g,
      })),
      notes: notes.map((n) => n.note),
      meal: options.meal ?? inferMeal(now, ctx.timezone),
      wants: options.wants ?? null,
    }),
    photo: null,
    tools,
    toolNames,
    // A self-contained question with no thread behind it.
    history: [],
    // Not read-only in the sense the review is: this run writes recipes. It
    // simply has no access to the nutrition tools at all, which is the stronger
    // guarantee — there is no log tool to misuse rather than one it is asked
    // not to.
    readOnly: false,
    toolset: 'kitchen',
    maxTurns: MAX_TURNS,
  };

  const outcome = await provider.run(request, null);
  // Before the error check, exactly as the journal does it: a run that spent
  // tokens on two good recipes and then timed out is precisely the kind of cost
  // that must not go unrecorded.
  await recordUsage({ userId: id, kind: 'recipe', outcome });
  if (outcome.error) throw new Error(outcome.error);

  /*
   * A run that produced nothing is a failure, even when the model replied
   * pleasantly. There is no fallback to write here the way the review has one:
   * a review can always state the week's arithmetic, but there is no honest
   * recipe to invent from an empty kitchen, and an empty card list with a
   * cheerful sentence over it is the worst version of this screen.
   */
  if (kitchen.recipes.length === 0) {
    throw new Error(
      outcome.text?.trim() ||
        "I couldn't put anything together from that. Try adding a few more things to your kitchen.",
    );
  }

  return { recipes: kitchen.recipes, message: outcome.text?.trim() || '' };
}
