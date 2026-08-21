import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { seedLibrary } from '../src/seed-library.ts';
import { addPantryItems, listPantry } from '../src/services/pantry.ts';
import { limitsFor } from '../src/services/plans.ts';
import { listRecipes } from '../src/services/recipes.ts';
import { agentCalls, scriptAgent } from './helpers/agent-mock.ts';
import { appFor, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * The kitchen's HTTP surface: what it accepts, what it refuses, and — mostly —
 * that one account can never reach another's.
 */

let user: TestUser;
let app: FastifyInstance;
let cookie: string;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
  ({ app, cookie } = await appFor(user));
});

afterEach(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } });
const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) } as never);

describe('the pantry', () => {
  it('adds and lists', async () => {
    const created = await send('POST', '/pantry', { items: [{ name: 'Chicken' }] });
    expect(created.statusCode).toBe(201);

    const listed = await get('/pantry');
    expect(listed.json().items.map((i: { name: string }) => i.name)).toEqual(['Chicken']);
  });

  it('rejects an empty batch rather than doing nothing quietly', async () => {
    expect((await send('POST', '/pantry', { items: [] })).statusCode).toBe(400);
  });

  /**
   * A full kitchen is a 409, not a 500: the request was well formed and the
   * caller can fix it by removing something, which the message says.
   */
  it('answers a full kitchen with a conflict and the limit', async () => {
    const limit = limitsFor('free').pantryItems;
    await addPantryItems(
      user.id,
      'free',
      Array.from({ length: limit }, (_, i) => ({ name: `Thing ${i}` })),
    );

    const response = await send('POST', '/pantry', { items: [{ name: 'One more' }] });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ limit });
  });

  it('404s on someone else’s item rather than touching it', async () => {
    const other = await createUser();
    const [item] = await addPantryItems(other.id, 'free', [{ name: 'Butter' }]);

    expect((await send('PATCH', `/pantry/${item!.id}`, { name: 'Mine' })).statusCode).toBe(404);
    expect((await send('DELETE', `/pantry/${item!.id}`)).statusCode).toBe(404);
    expect(await listPantry(other.id)).toHaveLength(1);
  });

  it('deletes with no content', async () => {
    const [item] = await addPantryItems(user.id, 'free', [{ name: 'Kale' }]);
    expect((await send('DELETE', `/pantry/${item!.id}`)).statusCode).toBe(204);
    expect(await listPantry(user.id)).toEqual([]);
  });

  it('needs a photo to scan', async () => {
    expect((await send('POST', '/pantry/scan', {})).statusCode).toBe(400);
  });
});

describe('recipes', () => {
  /** Drives one suggestion through the route, with the model scripted. */
  async function suggest(body: Record<string, unknown> = {}) {
    const tools = await import('../src/ai/tools.ts');
    const spy = vi.spyOn(tools, 'buildNutritionServer');

    scriptAgent({
      text: 'One idea.',
      act: async () => {
        const built = spy.mock.results.at(-1)!.value as ReturnType<typeof tools.buildNutritionServer>;
        await built.tools.find((t) => t.name === 'propose_recipe')!.handler(
          {
            title: 'Omelette',
            summary: 'Uses the eggs.',
            portions: 1,
            minutes: 10,
            steps: ['Beat the eggs.', 'Fry.'],
            ingredients: [
              {
                name: 'Eggs',
                quantity_g: 100,
                quantity_desc: '2 eggs',
                kcal: 150,
                protein_g: 12,
                carbs_g: 1,
                fat_g: 11,
                missing: false,
              },
            ],
            confidence: 'medium',
          } as never,
          {},
        );
      },
    });

    return send('POST', '/recipes/suggest', body);
  }

  it('answers with the recipes and the model’s line about them', async () => {
    const response = await suggest();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: 'One idea.',
      recipes: [{ title: 'Omelette', kcal: 150 }],
    });
  });

  it('lists what has been generated, and saved ones apart', async () => {
  /*
   * The brief is mapped field by field in `brief()`, which is one list that has
   * to be kept in step with the schema — exactly the place a new field gets
   * forgotten, and the failure is silent: the run still succeeds, just without
   * the constraint that was the whole reason for the request.
   */
  it('passes the scanned ingredients through to the run', async () => {
    await suggest({ focus: ['spinach', 'feta'] });
    expect(String(agentCalls.at(-1)!.prompt)).toContain('Build the dish around spinach and feta');
  });

  /**
   * The number the screen needs before the button is pressed.
   *
   * A ceiling only discoverable by hitting it is indistinguishable from a
   * broken button, so both the list and the run carry what is left. The run
   * carries it because it is the request that spends the last one — waiting for
   * the next page load to find that out is the same dead click, one step later.
   */
  it('says what is left of the recipe budget, on the list and on the run', async () => {
    const before = (await get('/recipes')).json().allowance;
    expect(before).toMatchObject({ allowed: limitsFor('free').recipeRunsPerDay, used: 0 });
    expect(before.resets_at).toBeNull();

    const spent = (await suggest()).json().allowance;
    expect(spent.used).toBe(1);
    // Spent, so it has to say when it comes back rather than merely that it is gone.
    expect(spent.resets_at).toEqual(expect.any(String));
    expect(new Date(spent.resets_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('lists what has been generated, and saved ones apart', async () => {
    await suggest();
    const [recipe] = await listRecipes(user.id);

    expect((await get('/recipes')).json().recipes).toHaveLength(1);
    expect((await get('/recipes?saved=true')).json().recipes).toHaveLength(0);

    await send('PATCH', `/recipes/${recipe!.id}`, { saved: true });
    expect((await get('/recipes?saved=true')).json().recipes).toHaveLength(1);
  });

  /**
   * The loop this whole feature exists to close: the entry comes back from the
   * cook call itself, so the client updates the day without a second request.
   */
  it('logs a recipe and answers with the entry', async () => {
    await suggest();
    const [recipe] = await listRecipes(user.id);

    const response = await send('POST', `/recipes/${recipe!.id}/cook`, {});
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      description: 'Omelette',
      source: 'quick',
      items: [{ name: 'Eggs', quantity_desc: '2 eggs' }],
    });

    const day = await get('/day');
    expect(day.json().consumed.kcal).toBe(150);
  });

  it('404s on someone else’s recipe', async () => {
    await suggest();
    const [recipe] = await listRecipes(user.id);

    const other = await createUser();
    const { app: otherApp, cookie: otherCookie } = await appFor(other);
    try {
      for (const url of [`/recipes/${recipe!.id}`, `/recipes/${recipe!.id}/cook`]) {
        const response = await otherApp.inject({
          method: url.endsWith('cook') ? 'POST' : 'GET',
          url,
          headers: { cookie: otherCookie },
          ...(url.endsWith('cook') ? { payload: {} } : {}),
        } as never);
        expect(response.statusCode).toBe(404);
      }
    } finally {
      await otherApp.close();
    }
  });
});

describe('the starter library', () => {
  beforeEach(async () => {
    await seedLibrary([
      {
        slug: 'baked-trout',
        title: 'Baked Trout',
        summary: 'A quick fish supper.',
        category: 'Main dish',
        portions: 4,
        serving_size: '1 fillet',
        ingredients: [{ text: '4 trout fillets', note: null }],
        steps: ['Bake it.'],
        keywords: ['trout fillet', 'lime juice'],
        kcal: 192,
        protein_g: 25.6,
        carbs_g: 4,
        fat_g: 8,
        food_groups: ['protein-foods'],
        image_path: '/recipes/baked-trout.jpg',
        source: 'USDA MyPlate Kitchen',
        source_url: 'https://example.test/baked-trout',
        rating: 4.2,
        rating_count: 120,
      },
    ]);
  });

  it('lists recipes with their photo and provenance', async () => {
    const response = await get('/library');
    expect(response.statusCode).toBe(200);
    expect(response.json().recipes[0]).toMatchObject({
      slug: 'baked-trout',
      kcal: 192,
      image_path: '/recipes/baked-trout.jpg',
      source: 'USDA MyPlate Kitchen',
      source_url: 'https://example.test/baked-trout',
      saved: false,
    });
  });

  /** The line the card leads with, and the only one a recipe site cannot print. */
  it('says which of your own ingredients it would use', async () => {
    await addPantryItems(user.id, 'free', [{ name: 'Trout fillets' }]);
    const recipe = (await get('/library')).json().recipes[0];
    expect(recipe.have).toEqual(['Trout fillets']);
    expect(recipe.missing).toBe(1);
  });

  it('saves and unsaves', async () => {
    expect((await send('PATCH', '/library/baked-trout', { saved: true })).statusCode).toBe(204);
    expect((await get('/library?saved=true')).json().recipes).toHaveLength(1);

    await send('PATCH', '/library/baked-trout', { saved: false });
    expect((await get('/library?saved=true')).json().recipes).toHaveLength(0);
  });

  it('logs one as eaten and answers with the entry', async () => {
    const response = await send('POST', '/library/baked-trout/cook', {});
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ description: 'Baked Trout', source: 'quick' });
    expect((await get('/day')).json().consumed.kcal).toBe(192);
  });

  it('404s on a recipe that is not in the library', async () => {
    expect((await get('/library/nope')).statusCode).toBe(404);
    expect((await send('POST', '/library/nope/cook', {})).statusCode).toBe(404);
    expect((await send('PATCH', '/library/nope', { saved: true })).statusCode).toBe(404);
  });
});

describe('signed out', () => {
  it('refuses every kitchen route without a session', async () => {
    for (const [method, url] of [
      ['GET', '/pantry'],
      ['POST', '/pantry'],
      ['POST', '/pantry/scan'],
      ['POST', '/recipes/suggest'],
      ['GET', '/recipes'],
      ['GET', '/library'],
    ] as const) {
      const response = await app.inject({ method, url, payload: {} } as never);
      expect(response.statusCode).toBe(401);
    }
  });
});
