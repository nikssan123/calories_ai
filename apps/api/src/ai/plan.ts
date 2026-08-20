import type { MealPlan, MealPlanBrief } from '@ct/shared';
import { PLAN_DAYS, planWeekFor, saveMealPlan, weekdayFor } from '../services/mealPlans.ts';
import { targetsForDate } from '../services/targets.ts';
import { getUserContext } from '../services/user.ts';
import { addDays, localDateFor } from '../time.ts';
import { suggestRecipes } from './recipes.ts';
import type { PlanDay } from './prompt.ts';

/**
 * Generating a week of dinners.
 *
 * Thin on purpose: the run itself is `suggestRecipes` with a `plan` job, and
 * everything here is about the two things that are not the model's business —
 * what each night's dinner has to fit, and how the recipes that come back are
 * laid onto the calendar.
 */

/**
 * The share of a day's calories a dinner is aimed at.
 *
 * Someone's dinner is not their day. Handing the model a full daily target
 * would produce seven 2,200 kcal dinners, and handing it what is left of
 * *today* would be worse — that number is about this afternoon and says nothing
 * about next Thursday. 40% is the ordinary share once breakfast and lunch have
 * had theirs, and it is the number a plan can be honest about a week ahead.
 */
const DINNER_SHARE = 0.4;

export interface PlanOptions {
  brief?: MealPlanBrief;
  /** Overrides "now". Tests and backfills use it. */
  now?: Date;
}

export async function generateMealPlan(
  userId: string,
  options: PlanOptions = {},
): Promise<{ plan: MealPlan; message: string }> {
  const { userId: id, ...ctx } = await getUserContext(userId);
  const now = options.now ?? new Date();
  const today = localDateFor(now, ctx);
  const weekStart = planWeekFor(today);
  const brief = options.brief ?? {};

  /*
   * Only the nights that are still ahead.
   *
   * Planning on a Thursday should produce Thursday through Sunday, not a full
   * week with three nights already gone. Tonight counts — somebody planning at
   * four in the afternoon is planning dinner.
   */
  const dates = Array.from({ length: PLAN_DAYS }, (_, i) => addDays(weekStart, i)).filter(
    (date) => date >= today,
  );

  const days: PlanDay[] = await Promise.all(
    dates.map(async (local_date) => {
      const targets = await targetsForDate(id, local_date);
      return {
        local_date,
        weekday: weekdayFor(local_date),
        kcal_target: Math.round((targets.kcal * DINNER_SHARE) / 10) * 10,
        protein_target: Math.round(targets.protein_g * DINNER_SHARE),
      };
    }),
  );

  const servings = brief.servings ?? 1;
  // Batching is on unless they said otherwise: it is the reason to plan a week
  // rather than seven evenings, and 011 added `recipes.portions` for it.
  const batch = brief.batch ?? true;

  const { recipes, message } = await suggestRecipes(id, {
    meal: 'dinner',
    wants: brief.wants ?? null,
    minutes: brief.minutes ?? null,
    job: { kind: 'plan', days, batch, servings },
    now,
  });

  /*
   * Recipes onto nights, walking both lists at once.
   *
   * Not a straight index map, because a batch cook consumes more than one
   * night: a dish made at four portions for a household of two is Monday's
   * dinner and Tuesday's, and the model was told to skip Tuesday rather than
   * propose for it. Advancing the day cursor by the nights each dish covers is
   * what makes those two agree — an index map would put the next dish on
   * Tuesday and quietly produce a week with eight dinners in seven nights.
   *
   * Fewer recipes than nights simply leaves the tail empty, which is a legible
   * answer rather than an error.
   */
  const slots = days.map((day) => ({
    local_date: day.local_date,
    recipeId: null as string | null,
    portions: 1,
  }));

  let night = 0;
  for (const recipe of recipes) {
    if (night >= slots.length) break;
    slots[night]!.recipeId = recipe.id;
    slots[night]!.portions = recipe.portions;
    night += nightsCovered(recipe.portions, servings);
  }

  const plan = await saveMealPlan(id, weekStart, brief, slots);
  return { plan, message };
}

/**
 * How many nights one cook feeds, given how many the household is.
 *
 * At least one, always: a recipe that came back at fewer portions than there
 * are people is a dish that does not quite stretch, not a night that does not
 * happen.
 */
export function nightsCovered(portions: number, servings: number): number {
  return Math.max(1, Math.round(portions / Math.max(1, servings)));
}
