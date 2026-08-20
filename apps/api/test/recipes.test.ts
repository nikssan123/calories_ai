import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryOne } from '../src/db.ts';
import { suggestRecipes } from '../src/ai/recipes.ts';
import { cookRecipe, getRecipe, listRecipes, setRecipeSaved } from '../src/services/recipes.ts';
import { addPantryItems } from '../src/services/pantry.ts';
import { buildDaySummary } from '../src/services/summary.ts';
import { agentCalls, scriptAgent, systemPromptOf } from './helpers/agent-mock.ts';
import { addDays, localDateFor } from '../src/time.ts';
import { addMeal, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * Suggesting something to cook, and cooking it.
 *
 * The agent is scripted throughout — what is under test is what the tools write
 * and what the prompt is told, not whether the model picks a good dinner.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
});

const CHICKEN = {
  name: 'Chicken breast',
  quantity_g: 300,
  quantity_desc: '2 breasts',
  kcal: 500,
  protein_g: 94,
  carbs_g: 0,
  fat_g: 11,
  missing: false,
};

const RICE = {
  name: 'Rice',
  quantity_g: 200,
  quantity_desc: '1 cup dry',
  kcal: 700,
  protein_g: 14,
  carbs_g: 154,
  fat_g: 1.4,
  missing: false,
};

function recipeArgs(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Chicken and rice',
    summary: 'Uses up the chicken.',
    portions: 1,
    minutes: 25,
    steps: ['Cook the rice.', 'Fry the chicken.', 'Combine.'],
    ingredients: [CHICKEN, RICE],
    confidence: 'medium',
    ...overrides,
  };
}

/** Runs one suggestion turn, with the scripted model calling `propose_recipe`. */
async function suggestProposing(...proposals: Array<Record<string, unknown>>) {
  const tools = await import('../src/ai/tools.ts');
  const spy = vi.spyOn(tools, 'buildNutritionServer');

  scriptAgent({
    text: 'Three ideas, all built around the chicken.',
    act: async () => {
      const built = spy.mock.results.at(-1)!.value as ReturnType<typeof tools.buildNutritionServer>;
      const propose = built.tools.find((t) => t.name === 'propose_recipe')!;
      for (const proposal of proposals) await propose.handler(proposal as never, {});
    },
  });

  return suggestRecipes(user.id);
}

describe('propose_recipe', () => {
  it('saves each proposal and hands them back in order', async () => {
    const { recipes, message } = await suggestProposing(
      recipeArgs({ title: 'Chicken and rice' }),
      recipeArgs({ title: 'Chicken salad' }),
    );

    expect(recipes.map((r) => r.title)).toEqual(['Chicken and rice', 'Chicken salad']);
    expect(message).toBe('Three ideas, all built around the chicken.');
    expect(await listRecipes(user.id)).toHaveLength(2);
  });

  /**
   * Macros are derived from the ingredients rather than taken as a separate
   * figure. Asking for both invites them to disagree, and when they do there is
   * no way to tell which half is wrong — while the ingredients are the half that
   * has to be right anyway, because they are what gets logged.
   */
  it('computes the per-portion macros from the ingredients', async () => {
    const { recipes } = await suggestProposing(recipeArgs({ portions: 4 }));

    // 1200 kcal and 108g protein across the whole dish, over four portions.
    expect(recipes[0]).toMatchObject({ portions: 4, kcal: 300, protein_g: 27 });
  });

  it('stamps each recipe with the budget it was written against', async () => {
    await addMeal(user, { date: today(), kcal: 700, protein_g: 40 });
    const { recipes } = await suggestProposing(recipeArgs());

    expect(recipes[0]!.generated_for).toMatchObject({
      kcal_remaining: 1500,
      protein_remaining: 120,
    });
  });

  it('reports which ingredients would have to be bought', async () => {
    const { recipes } = await suggestProposing(
      recipeArgs({ ingredients: [CHICKEN, { ...RICE, name: 'Saffron', missing: true }] }),
    );
    expect(recipes[0]!.ingredients.filter((i) => i.missing).map((i) => i.name)).toEqual(['Saffron']);
  });

  /** A run that produced no recipe is a failure, however pleasantly it replied. */
  it('fails rather than returning an empty list of ideas', async () => {
    scriptAgent({ text: 'There is not much in there.' });
    await expect(suggestRecipes(user.id)).rejects.toThrow('There is not much in there.');
  });
});

describe('the recipe prompt', () => {
  it('carries what is left of the day', async () => {
    await addMeal(user, { date: today(), kcal: 1200, protein_g: 60 });
    await suggestProposing(recipeArgs());

    const prompt = String(agentCalls.at(-1)!.prompt);
    expect(prompt).toContain('1000 kcal and 100g protein');
  });

  /**
   * Someone already over their target is the case this most has to get right: a
   * negative budget reads as an instruction to suggest negative food.
   */
  it('floors a blown budget at zero rather than going negative', async () => {
    await addMeal(user, { date: today(), kcal: 3000, protein_g: 200 });
    await suggestProposing(recipeArgs());

    const prompt = String(agentCalls.at(-1)!.prompt);
    // Scoped to the budget line: the prompt at large is full of hyphens — bullet
    // dashes, em-dashes, and the ISO date itself.
    const budgetLine = /\n(.*kcal and .*protein.*)\n/.exec(prompt)![1]!;
    expect(budgetLine).toBe('0 kcal and 0g protein.');
    expect(budgetLine).not.toMatch(/-/);
    expect(prompt).toContain('small budget');
  });

  it('carries the kitchen, with staples apart from the rest and ages on both', async () => {
    await addPantryItems(user.id, 'free', [
      { name: 'Olive oil', is_staple: true },
      { name: 'Chicken breast', quantity_desc: '2 breasts' },
    ]);
    await suggestProposing(recipeArgs());

    const prompt = String(agentCalls.at(-1)!.prompt);
    expect(prompt).toContain('Staples (assume present): Olive oil');
    expect(prompt).toContain('Chicken breast (2 breasts) — seen today');
  });

  it('carries what they usually eat', async () => {
    await addMeal(user, { date: daysAgo(2), description: 'Porridge and berries', kcal: 400 });
    await addMeal(user, { date: daysAgo(5), description: 'Porridge and berries', kcal: 400 });
    await suggestProposing(recipeArgs());

    expect(String(agentCalls.at(-1)!.prompt)).toContain('Porridge and berries (2×');
  });

  it('runs on the recipe prompt with only the kitchen tools', async () => {
    await suggestProposing(recipeArgs());

    const call = agentCalls.at(-1)!;
    expect(systemPromptOf(call)).toContain('recipe website cannot');
    expect(call.options.allowedTools).not.toContain('mcp__nutrition__log_food');
    expect(call.options.allowedTools).toContain('mcp__nutrition__propose_recipe');
  });

  it('records the turn against its own kind', async () => {
    await suggestProposing(recipeArgs());
    const row = await queryOne<{ kind: string }>('SELECT kind FROM ai_usage WHERE user_id = $1', [
      user.id,
    ]);
    expect(row!.kind).toBe('recipe');
  });
});

describe('cookRecipe', () => {
  it('logs the recipe as a food entry with its ingredients intact', async () => {
    const { recipes } = await suggestProposing(recipeArgs());
    const entry = await cookRecipe(user.id, recipes[0]!.id, { ctx: user.ctx });

    expect(entry).toMatchObject({
      description: 'Chicken and rice',
      confidence: 'medium',
      source: 'quick',
    });
    expect(entry!.items.map((i) => i.name)).toEqual(['Chicken breast', 'Rice']);
    expect(Math.round(entry!.kcal)).toBe(1200);
  });

  it('moves the day', async () => {
    const { recipes } = await suggestProposing(recipeArgs());
    await cookRecipe(user.id, recipes[0]!.id, { ctx: user.ctx });

    const day = await buildDaySummary(user.id, today());
    expect(day.consumed.kcal).toBe(1200);
  });

  /**
   * Eating some of what you cooked is the ordinary case for anything batched,
   * so the share is taken against the recipe's own portion count rather than
   * assuming the pot was the plate.
   */
  it('scales to the portions actually eaten', async () => {
    const { recipes } = await suggestProposing(recipeArgs({ portions: 4 }));
    const entry = await cookRecipe(user.id, recipes[0]!.id, { portions: 1, ctx: user.ctx });

    expect(Math.round(entry!.kcal)).toBe(300);
    // The written amount describes the whole dish and would be a lie about a
    // quarter of it, so it goes rather than being scaled into nonsense.
    expect(entry!.items[0]!.quantity_desc).toBeNull();
    expect(entry!.items[0]!.quantity_g).toBe(75);
  });

  /** The stepper offers halves, so the ingredient scaling has to take one. */
  it('handles half a portion', async () => {
    const { recipes } = await suggestProposing(recipeArgs({ portions: 2 }));
    const entry = await cookRecipe(user.id, recipes[0]!.id, { portions: 0.5, ctx: user.ctx });

    // 1200 kcal for the dish, over two portions, half of one eaten.
    expect(Math.round(entry!.kcal)).toBe(300);
    expect(entry!.items[0]!.quantity_g).toBe(75);
  });

  it('keeps the written amounts when the whole thing is eaten', async () => {
    const { recipes } = await suggestProposing(recipeArgs());
    const entry = await cookRecipe(user.id, recipes[0]!.id, { ctx: user.ctx });
    expect(entry!.items[0]!.quantity_desc).toBe('2 breasts');
  });

  /** Cooking something twice is ordinary; the entries are the record of it. */
  it('logs twice when cooked twice', async () => {
    const { recipes } = await suggestProposing(recipeArgs());
    await cookRecipe(user.id, recipes[0]!.id, { ctx: user.ctx });
    await cookRecipe(user.id, recipes[0]!.id, { ctx: user.ctx });

    const day = await buildDaySummary(user.id, today());
    expect(day.food_entries).toHaveLength(2);
    expect(day.consumed.kcal).toBe(2400);
  });

  it('stamps the recipe as cooked', async () => {
    const { recipes } = await suggestProposing(recipeArgs());
    await cookRecipe(user.id, recipes[0]!.id, { ctx: user.ctx });
    expect((await getRecipe(user.id, recipes[0]!.id))!.cooked_at).not.toBeNull();
  });

  it('will not cook another account’s recipe', async () => {
    const { recipes } = await suggestProposing(recipeArgs());
    const other = await createUser();
    expect(await cookRecipe(other.id, recipes[0]!.id, { ctx: other.ctx })).toBeNull();
  });
});

describe('saving', () => {
  it('keeps a recipe and lists it apart from the rest', async () => {
    const { recipes } = await suggestProposing(recipeArgs({ title: 'Keep me' }), recipeArgs());
    await setRecipeSaved(user.id, recipes[0]!.id, true);

    const saved = await listRecipes(user.id, { savedOnly: true });
    expect(saved.map((r) => r.title)).toEqual(['Keep me']);
    expect(await listRecipes(user.id)).toHaveLength(2);
  });
});

function today(): string {
  return localDateFor(new Date(), user.ctx);
}

function daysAgo(n: number): string {
  return addDays(today(), -n);
}
