import { beforeEach, describe, expect, it } from 'vitest';
import { cookRecipe, saveRecipe, totalNutrition } from '../src/services/recipes.ts';
import { buildDaySummary, buildProgress, dailyTotals } from '../src/services/summary.ts';
import { qualityTargetsFor } from '../src/services/targets.ts';
import { addMeal, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * Diet quality: four figures the app can only report honestly if it never
 * confuses "not estimated" with "none of it".
 *
 * Almost every test here is really the same test from a different angle —
 * a null must survive being summed, divided, scaled and logged.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2000 });
});

describe('qualityTargetsFor', () => {
  it('scales fiber with energy and calls it a floor', () => {
    const targets = qualityTargetsFor(2000);
    expect(targets.fiber_g).toEqual({ value: 28, direction: 'floor' });
    expect(qualityTargetsFor(3000).fiber_g.value).toBe(42);
  });

  it('makes the other three ceilings, and keeps sodium off the calorie scale', () => {
    const small = qualityTargetsFor(1400);
    const large = qualityTargetsFor(3000);

    for (const key of ['sodium_mg', 'sat_fat_g', 'sugar_g'] as const) {
      expect(small[key].direction).toBe('ceiling');
    }
    // Salt intake does not scale with appetite, and scaling it would hand the
    // largest allowance to whoever is eating the most processed food.
    expect(small.sodium_mg.value).toBe(2300);
    expect(large.sodium_mg.value).toBe(2300);

    expect(large.sat_fat_g.value).toBeGreaterThan(small.sat_fat_g.value);
    expect(large.sugar_g.value).toBeGreaterThan(small.sugar_g.value);
  });
});

describe('a day where only some of the food carries the figures', () => {
  it('sums what it has and says how much of the day that is', async () => {
    // 600 measured kcal, 400 not. Both are real food; only one was priced for
    // fiber, which is exactly what a log looks like after this feature ships
    // on top of months of history.
    await addMeal(user, {
      date: '2026-03-10',
      meal: 'breakfast',
      kcal: 600,
      fiber_g: 9,
      sodium_mg: 400,
      sat_fat_g: 4,
      sugar_g: 12,
    });
    await addMeal(user, { date: '2026-03-10', meal: 'dinner', kcal: 400 });

    const day = await buildDaySummary(user.id, '2026-03-10');

    // The sum is of what was measured — not padded with zeros for the rest.
    expect(day.quality.fiber_g).toBe(9);
    expect(day.quality.sodium_mg).toBe(400);
    expect(day.quality.coverage).toBe(0.6);

    // And the targets ride along, so nothing downstream recomputes them.
    expect(day.quality.targets.fiber_g.value).toBe(28);
  });

  it('reports nulls rather than zeros when nothing was ever estimated', async () => {
    await addMeal(user, { date: '2026-03-11', kcal: 700 });

    const day = await buildDaySummary(user.id, '2026-03-11');
    expect(day.quality).toMatchObject({
      fiber_g: null,
      sodium_mg: null,
      sat_fat_g: null,
      sugar_g: null,
      coverage: 0,
    });
  });

  it('calls an empty day fully covered, because there is nothing to miss', async () => {
    const day = await buildDaySummary(user.id, '2026-03-12');
    expect(day.quality.coverage).toBe(1);
    expect(day.quality.fiber_g).toBeNull();
  });

  it('carries the same distinction onto the entry itself', async () => {
    // Explicit hours: entries come back ordered by eaten_at, and two meals at
    // the fixture's default midday would tie and swap between runs.
    await addMeal(user, { date: '2026-03-13', kcal: 300, fiber_g: 5, hour: 12 });
    await addMeal(user, { date: '2026-03-13', kcal: 300, meal: 'dinner', hour: 19 });

    const day = await buildDaySummary(user.id, '2026-03-13');
    const [measured, unmeasured] = day.food_entries;
    expect(measured!.fiber_g).toBe(5);
    expect(unmeasured!.fiber_g).toBeNull();
    expect(measured!.items[0]!.fiber_g).toBe(5);
    expect(unmeasured!.items[0]!.fiber_g).toBeNull();
  });
});

describe('the window queries', () => {
  it('gives dailyTotals the same coverage figure the day summary computes', async () => {
    await addMeal(user, { date: '2026-03-10', meal: 'breakfast', kcal: 600, fiber_g: 9 });
    await addMeal(user, { date: '2026-03-10', meal: 'dinner', kcal: 400 });
    await addMeal(user, { date: '2026-03-11', kcal: 500, fiber_g: 12 });

    const totals = await dailyTotals(user.id, '2026-03-10', '2026-03-11');
    expect(totals[0]).toMatchObject({ local_date: '2026-03-10', fiber_g: 9 });
    expect(Number(totals[0]!.coverage)).toBeCloseTo(0.6, 5);
    expect(Number(totals[1]!.coverage)).toBe(1);
  });

  it('calls a day of food with nothing estimated zero, not fully covered', async () => {
    // A FILTER matching no rows sums to NULL, and a NULL that falls through to
    // the "no food logged" default reports the emptiest possible panel as a
    // complete one — which is how a whole month of pre-migration history
    // reported itself as fully measured.
    await addMeal(user, { date: '2026-04-01', kcal: 800 });

    const [total] = await dailyTotals(user.id, '2026-04-01', '2026-04-01');
    expect(Number(total!.coverage)).toBe(0);
    expect(total!.fiber_g).toBeNull();
  });

  it('averages progress over the measured days only', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await addMeal(user, { date: today, kcal: 600, fiber_g: 15 });
    // An unmeasured day would drag a mean of two down to 7.5 and invent a
    // shortfall out of missing data.
    await addMeal(user, { date: today, meal: 'dinner', kcal: 600 });

    const progress = await buildProgress(user.id, user.ctx, 7);
    expect(progress.quality.average.fiber_g).toBe(15);
    expect(progress.quality.days_measured).toBe(1);
    expect(progress.quality.coverage).toBe(0.5);
  });
});

describe('recipes', () => {
  const ingredient = (overrides: Record<string, unknown> = {}) => ({
    name: 'Lentils',
    quantity_g: 200,
    quantity_desc: '1 cup',
    kcal: 700,
    protein_g: 50,
    carbs_g: 120,
    fat_g: 2,
    fiber_g: 30,
    sodium_mg: 20,
    sat_fat_g: 0.4,
    sugar_g: 4,
    missing: false,
    ...overrides,
  });

  it('refuses to total a panel one ingredient is missing', () => {
    const complete = totalNutrition([ingredient(), ingredient()]);
    expect(complete.fiber_g).toBe(60);

    // Half a dish's fiber printed as the dish's fiber is worse than no figure:
    // the card gives no hint that anything is missing.
    const partial = totalNutrition([ingredient(), ingredient({ fiber_g: null })]);
    expect(partial.fiber_g).toBeNull();
    expect(partial.sodium_mg).toBe(40);
    expect(partial.kcal).toBe(1400);
  });

  it('carries the four fields into the entry when the recipe is cooked', async () => {
    const recipe = await saveRecipe({
      userId: user.id,
      title: 'Lentil stew',
      summary: null,
      portions: 2,
      minutes: 30,
      steps: ['Simmer.'],
      ingredients: [ingredient()],
      confidence: 'medium',
      generatedFor: null,
    });

    // Per portion: half of one 30g-fiber ingredient across two servings.
    expect(recipe.fiber_g).toBe(15);

    const entry = await cookRecipe(user.id, recipe.id, { portions: 1, ctx: user.ctx });
    expect(entry!.fiber_g).toBe(15);
    expect(entry!.sodium_mg).toBe(10);
    expect(entry!.items[0]!.sugar_g).toBe(2);
    // Nothing was re-estimated on the way: the macros scale by the same share.
    expect(entry!.kcal).toBe(350);
  });

  it('leaves the panel null on a recipe whose ingredients never had one', async () => {
    const recipe = await saveRecipe({
      userId: user.id,
      title: 'Mystery bake',
      summary: null,
      portions: 1,
      minutes: 20,
      steps: ['Bake.'],
      ingredients: [ingredient({ fiber_g: null, sodium_mg: null, sat_fat_g: null, sugar_g: null })],
      confidence: 'low',
      generatedFor: null,
    });
    expect(recipe.fiber_g).toBeNull();

    const entry = await cookRecipe(user.id, recipe.id, { ctx: user.ctx });
    expect(entry!.fiber_g).toBeNull();
    expect(entry!.items[0]!.fiber_g).toBeNull();
  });
});
