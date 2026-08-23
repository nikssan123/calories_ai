import type { Meal, Recipe, RecipeContext, RecipeOrigin } from '@ct/shared';
import { unitsOf } from '@ct/shared';
import { queryOne } from '../db.ts';
import { mealTemplates } from '../services/history.ts';
import { listNotes } from '../services/notes.ts';
import { listPantry, ageInDays } from '../services/pantry.ts';
import { buildDaySummary } from '../services/summary.ts';
import { limitsFor } from '../services/plans.ts';
import { recordUsage, turnsInLastDay, turnsInLastWeek } from '../services/usage.ts';
import { getUser, getUserContext } from '../services/user.ts';
import { inferMeal, localDateFor } from '../time.ts';
import { MAX_TURNS } from './client.ts';
import { emptyCollector } from './kitchen.ts';
import { createProvider, laneFor, type AgentRequest } from './providers/index.ts';
import {
  RECIPES_PER_RUN,
  RECIPE_SYSTEM_PROMPT,
  recipeTaskPrompt,
  unitsBrief,
  type PlanDay,
} from './prompt.ts';
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
  /** Per-request constraints from the brief. */
  minutes?: number | null;
  portions?: number | null;
  proteinMin?: number | null;
  kcalMax?: number | null;
  /**
   * Ingredients to build around rather than merely allow — what a fridge photo
   * just turned up, typically. The pantry is already in the prompt; this says
   * which of it is the point.
   */
  focus?: string[] | null;
  /**
   * What is being asked for. Absent means the original job: invent from the
   * kitchen. The other two arrive with a seed — a library recipe to rework, or
   * text the user brought — and produce exactly one recipe.
   */
  job?: RecipeJob;
  /** Overrides "now". Tests and backfills use it. */
  now?: Date;
}

export type RecipeJob =
  | { kind: 'suggest'; count?: number }
  | { kind: 'adapt'; slug: string }
  | { kind: 'import'; text: string }
  /**
   * A week of dinners in one run. Here rather than in a function of its own for
   * the reason the other three are: a fourth entry point would be a fourth
   * place for the dietary limits, the budget rules and the ingredient-quantity
   * contract to be forgotten.
   */
  | { kind: 'plan'; days: PlanDay[]; batch: boolean; servings: number };

/**
 * One engine, four ways in.
 *
 * Inventing from the pantry, reworking a library recipe, pricing one the user
 * brought and planning a week are the same run with a different brief: the same
 * tools, the same rules about budget and quantities, the same cacheable system
 * prompt. Only the task turn differs, which is why they are not four functions
 * — four functions would be four places for the dietary limits to be forgotten.
 */
/**
 * Raised when an account has spent its recipe generations for the day.
 *
 * A typed error rather than a boolean return, because every caller has to react
 * to it and none of them can sensibly carry on: the route answers 429, and the
 * journal tool tells the model to say so and answer from the log instead.
 */
export class RecipeBudgetError extends Error {
  constructor(
    readonly allowed: number,
    readonly used: number,
    readonly period: 'day' | 'week' = 'day',
  ) {
    super(
      period === 'week'
        ? `That is all ${allowed} meal ${allowed === 1 ? 'plan' : 'plans'} for this week.`
        : `That is all ${allowed} recipe ${allowed === 1 ? 'suggestion' : 'suggestions'} for today.`,
    );
    this.name = 'RecipeBudgetError';
  }
}

export async function suggestRecipes(
  userId: string,
  options: SuggestOptions = {},
): Promise<{ recipes: Recipe[]; message: string }> {
  const { userId: id, ...ctx } = await getUserContext(userId);
  const now = options.now ?? new Date();
  const today = localDateFor(now, ctx);

  const job: RecipeJob = options.job ?? { kind: 'suggest' };

  const [day, pantry, usual, notes, profile] = await Promise.all([
    buildDaySummary(id, today),
    listPantry(id),
    mealTemplates(id, ctx, { limit: 8 }, today),
    listNotes(id),
    getUser(id),
  ]);

  /*
   * An adaptation needs the recipe it is adapting, and it has to exist before a
   * single token is spent — a run that discovers halfway through that there is
   * nothing to rework has already cost the money.
   */
  const seed = job.kind === 'adapt' ? await librarySeed(job.slug) : null;
  if (job.kind === 'adapt' && !seed) throw new Error('No such recipe in the library.');

  /*
   * One budget, checked here rather than at the routes.
   *
   * There are five ways to start a recipe run — suggest, adapt, import, plan,
   * and the journal's tool — and @fastify/rate-limit keeps a separate bucket per
   * route config, so a per-route ceiling of one a day quietly meant four. The
   * ledger is the only place that sees all of them, and it counts what was
   * actually spent rather than what was asked for, which is the number that
   * matters.
   *
   * A plan is counted apart, weekly, against its own allowance: it costs
   * several times a single-recipe run, so charging it to the daily recipe budget
   * would mean one plan eats a free account's whole day of cooking — and
   * recording it as a `recipe` would hide the most expensive thing in the
   * product inside the second most expensive.
   */
  const limits = limitsFor(profile.plan);
  const allowed = job.kind === 'plan' ? limits.mealPlansPerWeek : limits.recipeRunsPerDay;
  const used =
    job.kind === 'plan'
      ? await turnsInLastWeek(id, 'meal_plan')
      : await turnsInLastDay(id, 'recipe');
  if (used >= allowed) throw new RecipeBudgetError(allowed, used, job.kind === 'plan' ? 'week' : 'day');

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

  // A planned week is invented from the kitchen exactly as a suggestion is —
  // same job, seven times over — so it carries the same claim about its numbers.
  const origin: RecipeOrigin =
    job.kind === 'adapt' ? 'adapted' : job.kind === 'import' ? 'imported' : 'invented';
  const kitchen = emptyCollector(
    generatedFor,
    origin,
    job.kind === 'adapt' ? job.slug : null,
  );
  const toolContext: ToolContext = {
    userId: id,
    ctx,
    now,
    photoId: null,
    actions: [],
    kitchen,
    units: unitsOf(profile),
  };

  const provider = createProvider(toolContext, laneFor(profile.email));
  const authError = provider.checkAuth();
  if (authError) throw new Error(authError);

  const { tools, toolNames } = buildNutritionServer(toolContext, { toolset: 'kitchen' });

  const request: AgentRequest = {
    kind: job.kind === 'plan' ? 'meal_plan' : 'recipe',
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
      rules: { diet: profile.diet, avoids: profile.avoids },
      units: unitsBrief(profile),
      constraints: {
        minutes: options.minutes ?? null,
        portions: options.portions ?? null,
        proteinMin: options.proteinMin ?? null,
        kcalMax: options.kcalMax ?? null,
        focus: options.focus ?? null,
      },
      job:
        job.kind === 'adapt'
          ? { kind: 'adapt', recipe: seed! }
          : job.kind === 'import'
            ? { kind: 'import', text: job.text }
            : job.kind === 'plan'
              ? { kind: 'plan', days: job.days, batch: job.batch, servings: job.servings }
              : { kind: 'suggest', count: job.count ?? RECIPES_PER_RUN },
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
  await recordUsage({ userId: id, kind: job.kind === 'plan' ? 'meal_plan' : 'recipe', outcome });
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

/** The library recipe an adaptation starts from, rendered for the prompt. */
async function librarySeed(slug: string): Promise<string | null> {
  const row = await queryOne<any>(
    `SELECT title, summary, portions, serving_size, ingredients, steps,
            kcal, protein_g, carbs_g, fat_g
       FROM library_recipes WHERE slug = $1`,
    [slug],
  );
  if (!row) return null;

  const ingredients = (row.ingredients as Array<{ text: string; note: string | null }>)
    .map((i) => `- ${i.text}${i.note ? ` (${i.note})` : ''}`)
    .join('\n');
  const steps = (row.steps as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n');

  return `**${row.title}** — makes ${row.portions}, one serving is ${row.serving_size ?? 'a portion'}
Published nutrition per serving: ${Math.round(Number(row.kcal))} kcal, ${Math.round(Number(row.protein_g))}g protein, ${Math.round(Number(row.carbs_g))}g carbs, ${Math.round(Number(row.fat_g))}g fat.
${row.summary ? `\n${row.summary}\n` : ''}
Ingredients:
${ingredients}

Method:
${steps}`;
}
