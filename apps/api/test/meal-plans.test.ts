import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../src/db.ts';
import { generateMealPlan, nightsCovered } from '../src/ai/plan.ts';
import {
  cookSlot,
  getMealPlan,
  planWeekFor,
  shoppingListFor,
  updateSlot,
  weekdayFor,
} from '../src/services/mealPlans.ts';
import { addPantryItems } from '../src/services/pantry.ts';
import {
  addExtras,
  deleteExtra,
  MAX_SHOPPING_EXTRAS,
  updateExtra,
} from '../src/services/shopping.ts';
import { addDays } from '../src/time.ts';
import { buildDaySummary } from '../src/services/summary.ts';
import { agentCalls, scriptAgent } from './helpers/agent-mock.ts';
import { createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * The week ahead.
 *
 * The agent is scripted throughout: what is under test is how recipes land on
 * nights, what the shopping list drops, and that cooking a planned night is the
 * same act as cooking anything else — not whether the model picks a good week.
 */

/** Wednesday 18 March 2026. The plan week it belongs to starts on the 16th. */
const NOW = new Date('2026-03-18T10:00:00Z');
const WEEK_START = '2026-03-16';

let user: TestUser;

beforeEach(async () => {
  // Pro, because the plan allowance is not what these tests are about.
  user = await createUser({ plan: 'coach' });
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
});

const ingredient = (name: string, overrides: Record<string, unknown> = {}) => ({
  name,
  quantity_g: 200,
  quantity_desc: '1 pack',
  kcal: 400,
  protein_g: 30,
  carbs_g: 40,
  fat_g: 12,
  fiber_g: 6,
  sodium_mg: 300,
  sat_fat_g: 3,
  sugar_g: 4,
  missing: true,
  ...overrides,
});

function recipeArgs(title: string, overrides: Record<string, unknown> = {}) {
  return {
    title,
    summary: null,
    portions: 1,
    minutes: 30,
    steps: ['Cook it.'],
    ingredients: [ingredient('Chicken breast'), ingredient('Rice')],
    confidence: 'medium',
    ...overrides,
  };
}

/** One plan run, with the scripted model proposing the given recipes in order. */
async function planProposing(
  proposals: Array<Record<string, unknown>>,
  brief: Record<string, unknown> = {},
) {
  const tools = await import('../src/ai/tools.ts');
  const spy = vi.spyOn(tools, 'buildNutritionServer');

  scriptAgent({
    text: 'A week built around the chicken.',
    act: async () => {
      const built = spy.mock.results.at(-1)!.value as ReturnType<typeof tools.buildNutritionServer>;
      const propose = built.tools.find((t) => t.name === 'propose_recipe')!;
      for (const proposal of proposals) await propose.handler(proposal as never, {});
    },
  });

  return generateMealPlan(user.id, { brief: brief as never, now: NOW });
}

describe('planWeekFor', () => {
  it('always starts on the Monday, whatever day it is asked', () => {
    expect(planWeekFor('2026-03-16')).toBe('2026-03-16'); // Monday
    expect(planWeekFor('2026-03-18')).toBe('2026-03-16'); // Wednesday
    // Sunday belongs to the week that just ended, not the one about to start.
    expect(planWeekFor('2026-03-22')).toBe('2026-03-16');
    expect(planWeekFor('2026-03-23')).toBe('2026-03-23'); // the next Monday
  });

  it('names the day', () => {
    expect(weekdayFor('2026-03-16')).toBe('Monday');
    expect(weekdayFor('2026-03-22')).toBe('Sunday');
  });
});

describe('generateMealPlan', () => {
  it('plans only the nights still ahead', async () => {
    const { plan } = await planProposing([
      recipeArgs('Wednesday'),
      recipeArgs('Thursday'),
      recipeArgs('Friday'),
      recipeArgs('Saturday'),
      recipeArgs('Sunday'),
    ]);

    // Asked on Wednesday: Monday and Tuesday are gone and are not planned.
    expect(plan.week_start).toBe(WEEK_START);
    expect(plan.slots.map((s) => s.local_date)).toEqual([
      '2026-03-18',
      '2026-03-19',
      '2026-03-20',
      '2026-03-21',
      '2026-03-22',
    ]);
    expect(plan.slots[0]!.recipe!.title).toBe('Wednesday');
    expect(plan.slots[0]!.weekday).toBe('Wednesday');
  });

  it('aims each night at a dinner rather than at a whole day', async () => {
    await planProposing([recipeArgs('One')]);

    // A full 2,200 kcal target handed over would produce seven enormous dinners.
    const prompt = String(agentCalls.at(-1)!.prompt);
    expect(prompt).toContain('880 kcal');
    expect(prompt).not.toMatch(/aim for roughly 2200 kcal/);
  });

  it('leaves the nights a batch covers empty, and says which they are', async () => {
    // A dish at 4 portions for a household of 2 is tonight and tomorrow.
    const { plan } = await planProposing(
      [recipeArgs('Big traybake', { portions: 4 }), recipeArgs('Thursday'), recipeArgs('Friday')],
      { servings: 2, batch: true },
    );

    expect(plan.slots[0]!.recipe!.title).toBe('Big traybake');
    // Thursday is covered by the traybake, so the next dish lands on Friday.
    expect(plan.slots[1]!.recipe).toBeNull();
    expect(plan.slots[2]!.recipe!.title).toBe('Thursday');
    expect(plan.slots[0]!.covers).toEqual(['2026-03-19']);
  });

  it('tells the model the arithmetic rather than the intent', async () => {
    // The first live run set portions to "the number of nights I meant" and
    // lost a night to it. The multiplication has to be on the page.
    await planProposing([recipeArgs('One')], { servings: 2 });

    const prompt = String(agentCalls.at(-1)!.prompt);
    expect(prompt).toContain('portions = 2 × the number of nights');
    expect(prompt).toContain('Two nights is 4');
  });

  it('reads portions against the household, not against one plate', async () => {
    expect(nightsCovered(4, 2)).toBe(2);
    expect(nightsCovered(4, 1)).toBe(4);
    // A dish that does not quite stretch is still one night, not none.
    expect(nightsCovered(1, 2)).toBe(1);
  });

  it('leaves the tail empty when fewer dishes come back than nights', async () => {
    const { plan } = await planProposing([recipeArgs('The only one')]);
    expect(plan.slots[0]!.recipe).not.toBeNull();
    expect(plan.slots.slice(1).every((s) => s.recipe === null)).toBe(true);
  });

  it('replaces the week rather than accumulating another one', async () => {
    await planProposing([recipeArgs('First go')]);
    await planProposing([recipeArgs('Second go')]);

    const plan = await getMealPlan(user.id, WEEK_START);
    expect(plan!.slots[0]!.recipe!.title).toBe('Second go');
    expect(plan!.slots).toHaveLength(5);

    const plans = await query('SELECT id FROM meal_plans WHERE user_id = $1', [user.id]);
    expect(plans).toHaveLength(1);
  });

  it('records the run as its own kind of cost', async () => {
    await planProposing([recipeArgs('One')]);
    const usage = await query<{ kind: string }>(
      "SELECT kind FROM ai_usage WHERE user_id = $1 AND kind = 'meal_plan'",
      [user.id],
    );
    expect(usage).toHaveLength(1);
  });

  /**
   * Spied on `meterFor` rather than on `limitsFor`, and the difference is not
   * cosmetic: `meterFor` calls `limitsFor` *within its own module*, so a spy on
   * the `limitsFor` export never reaches it and the mock silently does nothing.
   * `requireAllowance` reads `meterFor` across a module boundary, which is
   * where a spy can actually stand.
   */
  it("refuses once the month's allowance is spent", async () => {
    const plans = await import('../src/services/plans.ts');
    const spy = vi.spyOn(plans, 'meterFor');
    spy.mockImplementation((plan, meter) =>
      meter === 'meal_plan' ? { allowed: 1, period: 'month' } : plans.limitsFor(plan).chat,
    );
    try {
      await planProposing([recipeArgs('One')]);
      await expect(planProposing([recipeArgs('Two')])).rejects.toThrow(/meal plan for this month/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('swapping and skipping a night', () => {
  it('clears a night without touching the rest', async () => {
    const { plan } = await planProposing([recipeArgs('Wed'), recipeArgs('Thu')]);

    const updated = await updateSlot(user.id, plan.slots[0]!.id, { recipeId: null });
    expect(updated!.slots[0]!.recipe).toBeNull();
    expect(updated!.slots[1]!.recipe!.title).toBe('Thu');
  });

  it('refuses a night that belongs to somebody else', async () => {
    const { plan } = await planProposing([recipeArgs('Wed')]);
    const stranger = await createUser();
    expect(await updateSlot(stranger.id, plan.slots[0]!.id, { recipeId: null })).toBeNull();
  });
});

describe('cooking a planned night', () => {
  it('logs exactly what the recipe said, and stamps the slot', async () => {
    const { plan } = await planProposing([recipeArgs('Wednesday dinner')]);
    const slot = plan.slots[0]!;

    const entry = await cookSlot(user.id, slot.id, user.ctx, {
      eatenAt: new Date('2026-03-18T19:00:00Z'),
    });

    // Two ingredients at 400 kcal each, one portion of a one-portion recipe.
    expect(entry!.kcal).toBe(800);
    expect(entry!.protein_g).toBe(60);
    expect(entry!.description).toBe('Wednesday dinner');
    // Nothing was re-estimated: the quality panel came through untouched.
    expect(entry!.fiber_g).toBe(12);

    const after = await getMealPlan(user.id, plan.week_start);
    expect(after!.slots[0]!.cooked_at).not.toBeNull();
  });

  it('logs one plate of a batch, not the whole pot', async () => {
    const { plan } = await planProposing(
      [recipeArgs('Big traybake', { portions: 4 })],
      { servings: 2 },
    );

    const entry = await cookSlot(user.id, plan.slots[0]!.id, user.ctx, {
      eatenAt: new Date('2026-03-18T19:00:00Z'),
    });
    // The whole dish is 800 kcal across 4 portions.
    expect(entry!.kcal).toBe(200);
  });

  it('lands in the day the same way any other entry does', async () => {
    const { plan } = await planProposing([recipeArgs('Wednesday dinner')]);
    await cookSlot(user.id, plan.slots[0]!.id, user.ctx, {
      eatenAt: new Date('2026-03-18T19:00:00Z'),
    });

    const day = await buildDaySummary(user.id, '2026-03-18');
    expect(day.consumed.kcal).toBe(800);
    expect(day.food_entries).toHaveLength(1);
  });

  it('has nothing to cook on a night that was skipped', async () => {
    const { plan } = await planProposing([recipeArgs('Wed')]);
    await updateSlot(user.id, plan.slots[0]!.id, { recipeId: null });
    expect(await cookSlot(user.id, plan.slots[0]!.id, user.ctx)).toBeNull();
  });
});

describe('the shopping list', () => {
  it('unions the week and says which nights each thing is for', async () => {
    await planProposing([
      recipeArgs('Wed', { ingredients: [ingredient('Chicken breast'), ingredient('Rice')] }),
      recipeArgs('Thu', { ingredients: [ingredient('Chicken breast'), ingredient('Spinach')] }),
    ]);

    const list = await shoppingListFor(user.id, WEEK_START);
    expect(list!.items.map((i) => i.name)).toEqual(['Chicken breast', 'Rice', 'Spinach']);

    const chicken = list!.items.find((i) => i.name === 'Chicken breast')!;
    // Two nights, so twice the weight.
    expect(chicken.quantity_g).toBe(400);
    expect(chicken.for_dates).toEqual(['2026-03-18', '2026-03-19']);
  });

  it('drops the staples, and names what it dropped', async () => {
    await addPantryItems(user.id, 'coach', [
      { name: 'Olive oil', is_staple: true },
      { name: 'Salt', is_staple: true },
    ]);
    await planProposing([
      recipeArgs('Wed', {
        ingredients: [ingredient('Chicken breast'), ingredient('Olive oil'), ingredient('Salt')],
      }),
    ]);

    const list = await shoppingListFor(user.id, WEEK_START);
    expect(list!.items.map((i) => i.name)).toEqual(['Chicken breast']);
    // Said out loud rather than silently missing — the pantry is a memory, not
    // an inventory, so "you have this" is a claim worth showing.
    expect(list!.have_already).toEqual(['Olive oil', 'Salt']);
  });

  it('keeps a fresh item the recipe still says has to be bought', async () => {
    await addPantryItems(user.id, 'coach', [{ name: 'Spinach' }]);
    await planProposing([
      recipeArgs('Wed', {
        ingredients: [ingredient('Spinach', { missing: true })],
      }),
    ]);

    const list = await shoppingListFor(user.id, WEEK_START);
    expect(list!.items.map((i) => i.name)).toEqual(['Spinach']);
    expect(list!.have_already).toEqual(['Spinach']);
  });

  it('will not add up a weight it does not have on both sides', async () => {
    await planProposing([
      recipeArgs('Wed', { ingredients: [ingredient('Stock', { quantity_g: null })] }),
      recipeArgs('Thu', { ingredients: [ingredient('Stock', { quantity_g: 300 })] }),
    ]);

    const list = await shoppingListFor(user.id, WEEK_START);
    expect(list!.items[0]!.quantity_g).toBeNull();
  });

  it('has nothing to say about a week with no plan and nothing written on it', async () => {
    expect(await shoppingListFor(user.id, '2026-04-06')).toBeNull();
  });
});

/**
 * The written half.
 *
 * What is under test throughout is the seam: that a line somebody typed cannot
 * be moved, dropped or rewritten by anything the plan does, and that the plan's
 * own lines are unaffected by anything typed. The two halves meet in
 * `shoppingListFor` and nowhere else.
 */
describe('lines they wrote themselves', () => {
  it('puts something no recipe could produce on the list', async () => {
    await addExtras(user.id, WEEK_START, [{ name: 'Kitchen roll', quantity_desc: '2 rolls' }]);

    const list = await shoppingListFor(user.id, WEEK_START);
    expect(list!.items).toHaveLength(1);
    expect(list!.items[0]).toMatchObject({
      name: 'Kitchen roll',
      quantity_descs: ['2 rolls'],
      // No weight and no nights: nobody's recipe asked for it, so there is
      // nothing to sum it with and no date it is needed by.
      quantity_g: null,
      for_dates: [],
      bought: false,
    });
    expect(list!.items[0]!.extra_id).not.toBeNull();
  });

  it('is a list of its own on a week nobody has planned', async () => {
    await addExtras(user.id, '2026-04-06', [{ name: 'Bin bags' }]);

    const list = await shoppingListFor(user.id, '2026-04-06');
    expect(list!.items.map((i) => i.name)).toEqual(['Bin bags']);
  });

  it('walks the shop once when the plan already asked for the same thing', async () => {
    await planProposing([
      recipeArgs('Wed', { ingredients: [ingredient('Milk', { quantity_g: 500 })] }),
    ]);
    await addExtras(user.id, WEEK_START, [{ name: 'milk', quantity_desc: 'the big one' }]);

    const list = await shoppingListFor(user.id, WEEK_START);
    expect(list!.items).toHaveLength(1);

    const milk = list!.items[0]!;
    // One row, still carrying the recipe's weight, and still tickable — the
    // written line's handle survives the merge or it could never be taken back.
    expect(milk.name).toBe('Milk');
    expect(milk.quantity_g).toBe(500);
    expect(milk.quantity_descs).toEqual(['1 pack', 'the big one']);
    expect(milk.extra_id).not.toBeNull();
  });

  it('does not drop a written line because the kitchen has one', async () => {
    await addPantryItems(user.id, 'coach', [{ name: 'Olive oil', is_staple: true }]);
    await addExtras(user.id, WEEK_START, [{ name: 'Olive oil' }]);

    const list = await shoppingListFor(user.id, WEEK_START);
    // Dropping an ingredient the kitchen holds is the app inferring something.
    // Dropping a line somebody typed is the app overruling them.
    expect(list!.items.map((i) => i.name)).toEqual(['Olive oil']);
    // And the footer must not then claim it was left off.
    expect(list!.have_already).toEqual([]);
  });

  it('carries an unbought line forward, and leaves a ticked one behind', async () => {
    const [written] = await addExtras(user.id, WEEK_START, [{ name: 'Kitchen roll' }]);
    const next = addDays(WEEK_START, 7);

    // Still needed on Monday, because needing something does not expire.
    expect((await shoppingListFor(user.id, next))!.items.map((i) => i.name)).toEqual([
      'Kitchen roll',
    ]);

    await updateExtra(user.id, written!.id, { bought: true });

    // Ticked off, so it stays visible on the week it was written for — the shop
    // it was ticked during — and follows nobody into the next one.
    const own = await shoppingListFor(user.id, WEEK_START);
    expect(own!.items[0]).toMatchObject({ name: 'Kitchen roll', bought: true });
    expect(await shoppingListFor(user.id, next)).toBeNull();
  });

  it('refreshes a line already waiting rather than writing it twice', async () => {
    await addExtras(user.id, WEEK_START, [{ name: 'Milk', quantity_desc: '2 litres' }]);
    // Bare, and case-shifted: neither should cost the quantity already typed.
    await addExtras(user.id, WEEK_START, [{ name: 'milk' }]);

    const list = await shoppingListFor(user.id, WEEK_START);
    expect(list!.items).toHaveLength(1);
    expect(list!.items[0]!.quantity_descs).toEqual(['2 litres']);
  });

  it('lets a bought line be written again', async () => {
    const [first] = await addExtras(user.id, WEEK_START, [{ name: 'Milk' }]);
    await updateExtra(user.id, first!.id, { bought: true });

    // The partial index is what makes this legal: uniqueness is over the lines
    // still waiting, not over everything ever bought.
    const after = await addExtras(user.id, WEEK_START, [{ name: 'Milk' }]);
    expect(after.filter((e) => !e.bought)).toHaveLength(1);
    expect(after).toHaveLength(2);
  });

  it('puts a line back on the list without colliding with the one already there', async () => {
    const [first] = await addExtras(user.id, WEEK_START, [{ name: 'Milk' }]);
    await updateExtra(user.id, first!.id, { bought: true });
    await addExtras(user.id, WEEK_START, [{ name: 'Milk' }]);

    // Un-ticking the old row would breach the index. There is nothing to
    // reconcile — the waiting row already says what the un-tick asked for — so
    // the ticked one is dropped and that row comes back.
    const back = await updateExtra(user.id, first!.id, { bought: false });
    expect(back!.bought).toBe(false);
    expect(back!.id).not.toBe(first!.id);
    expect((await shoppingListFor(user.id, WEEK_START))!.items).toHaveLength(1);
  });

  it('refuses to write past the ceiling, and says the number', async () => {
    await addExtras(
      user.id,
      WEEK_START,
      Array.from({ length: MAX_SHOPPING_EXTRAS }, (_, i) => ({ name: `Thing ${i}` })),
    );

    await expect(addExtras(user.id, WEEK_START, [{ name: 'One more' }])).rejects.toThrow(
      String(MAX_SHOPPING_EXTRAS),
    );
    // Re-writing a name already waiting is not a new line, so it still works.
    await expect(addExtras(user.id, WEEK_START, [{ name: 'Thing 1' }])).resolves.toBeDefined();
  });

  it('never reaches another account', async () => {
    const stranger = await createUser();
    const [theirs] = await addExtras(stranger.id, WEEK_START, [{ name: 'Wine' }]);

    expect(await updateExtra(user.id, theirs!.id, { bought: true })).toBeNull();
    // Including the read an empty patch degrades to, which would otherwise be
    // the one way to see a line belonging to somebody else.
    expect(await updateExtra(user.id, theirs!.id, {})).toBeNull();
    expect(await deleteExtra(user.id, theirs!.id)).toBe(false);
    expect(await shoppingListFor(stranger.id, WEEK_START)).not.toBeNull();
  });

  it('takes a line off entirely', async () => {
    const [written] = await addExtras(user.id, WEEK_START, [{ name: 'Wine' }]);
    expect(await deleteExtra(user.id, written!.id)).toBe(true);
    expect(await shoppingListFor(user.id, WEEK_START)).toBeNull();
  });

  it('corrects what a line says', async () => {
    const [written] = await addExtras(user.id, WEEK_START, [{ name: 'Wine' }]);
    const fixed = await updateExtra(user.id, written!.id, {
      name: 'Red wine',
      quantity_desc: '2 bottles',
    });
    expect(fixed).toMatchObject({ name: 'Red wine', quantity_desc: '2 bottles' });
    // An empty patch is a read, not a write.
    expect(await updateExtra(user.id, written!.id, {})).toMatchObject({ name: 'Red wine' });
  });

  it('ignores a blank name rather than writing an empty line', async () => {
    expect(await addExtras(user.id, WEEK_START, [{ name: '   ' }])).toEqual([]);
  });
});
