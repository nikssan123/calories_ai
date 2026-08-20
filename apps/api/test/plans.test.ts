import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query } from '../src/db.ts';
import { limitsFor } from '../src/services/plans.ts';
import { accountGate, getUser } from '../src/services/user.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import { appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The entitlement seam.
 *
 * There is no billing behind it yet, which is the point: what is under test is
 * that a plan reaches the rate limiter before a handler runs, and that `free`
 * still means what it meant before plans existed. A seam that quietly tightened
 * the free tier on the day it shipped would be a change nobody agreed to.
 */

let user: TestUser;
let app: FastifyInstance;
let cookie: string;

beforeEach(async () => {
  user = await createUser();
  ({ app, cookie } = await appFor(user));
});

afterEach(async () => {
  await app.close();
});

const setPlan = (id: string, plan: string) =>
  query('UPDATE users SET plan = $1 WHERE id = $2', [plan, id]);

describe('limitsFor', () => {
  /**
   * The two numbers that were hardcoded in routes/index.ts before this existed.
   * If either changes, it should be because someone decided to change it.
   */
  it('leaves the free tier exactly where it was', () => {
    expect(limitsFor('free').chatTurnsPerHour).toBe(40);
    expect(limitsFor('free').reviewsPerDay).toBe(5);
  });

  it('gives a paid account more of everything', () => {
    const free = limitsFor('free');
    const pro = limitsFor('pro');
    for (const key of Object.keys(free) as Array<keyof typeof free>) {
      expect(pro[key]).toBeGreaterThan(free[key]);
    }
  });

  /**
   * This runs inside the rate limiter. A column that somehow holds something
   * unexpected should cost that account a low ceiling, not a 500 on every
   * request it makes.
   */
  it('falls back to the strictest plan rather than throwing', () => {
    expect(limitsFor('enterprise' as never)).toEqual(limitsFor('free'));
  });
});

describe('resolving the plan', () => {
  it('starts every account on free', async () => {
    expect((await getUser(user.id)).plan).toBe('free');
    expect((await accountGate(user.id)).plan).toBe('free');
  });

  it('reads the plan in the same query as the rest of the gate', async () => {
    await setPlan(user.id, 'pro');
    expect(await accountGate(user.id)).toEqual({ disabled: false, verified: true, plan: 'pro' });
  });

  /** Granted by paying, never by the client claiming it. */
  it('refuses to let a profile update set it', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { cookie },
      payload: { plan: 'pro', display_name: 'Nik' },
    });

    expect(response.statusCode).toBe(200);
    const profile = await getUser(user.id);
    expect(profile.plan).toBe('free');
    expect(profile.display_name).toBe('Nik');
  });
});

describe('per-plan ceilings', () => {
  async function scan(target = app, as = cookie) {
    scriptAgent({ text: 'Nothing much in there.' });
    return target.inject({
      method: 'POST',
      url: '/pantry/scan',
      headers: { cookie: as },
      payload: { photo_base64: 'iVBORw0KGgo=' },
    });
  }

  it('stops a free account at its daily scan limit', async () => {
    const limit = limitsFor('free').fridgeScansPerDay;
    const codes: number[] = [];
    for (let i = 0; i < limit + 1; i++) codes.push((await scan()).statusCode);

    expect(codes.slice(0, limit).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  /**
   * The whole seam in one assertion: the plan is resolved by the session hook,
   * so the limiter already has the right ceiling by the time it decides — no
   * handler has run, and nothing had to be passed down to it.
   */
  it('lets a paid account past the free ceiling', async () => {
    await setPlan(user.id, 'pro');
    const freeLimit = limitsFor('free').fridgeScansPerDay;

    const codes: number[] = [];
    for (let i = 0; i < freeLimit + 1; i++) codes.push((await scan()).statusCode);

    expect(codes.every((c) => c === 200)).toBe(true);
  });

  it('reports the ceiling that actually applied', async () => {
    await setPlan(user.id, 'pro');
    const response = await scan();
    expect(String(response.headers['x-ratelimit-limit'])).toBe(
      String(limitsFor('pro').fridgeScansPerDay),
    );
  });

  /** One account's spending must never eat into another's. */
  it('counts each account separately', async () => {
    for (let i = 0; i < limitsFor('free').fridgeScansPerDay + 1; i++) await scan();

    const other = await createUser();
    const { app: otherApp, cookie: otherCookie } = await appFor(other);
    try {
      expect((await scan(otherApp, otherCookie)).statusCode).toBe(200);
    } finally {
      await otherApp.close();
    }
  });

  /**
   * One budget across every door into the kitchen. Per-route buckets meant a
   * free account got its daily allowance once for /recipes/suggest, again for
   * an adaptation, again for an import, and again through the journal.
   */
  it('spends one recipe budget across suggest, adapt and import', async () => {
    const { recordUsage } = await import('../src/services/usage.ts');
    const { seedLibrary } = await import('../src/seed-library.ts');
    // A real slug: the adapt route validates the recipe exists before it looks
    // at the budget, so a made-up one would 404 and prove nothing.
    await seedLibrary([
      {
        slug: 'baked-trout',
        title: 'Baked Trout',
        summary: null,
        category: 'Main dish',
        portions: 4,
        serving_size: '1 fillet',
        ingredients: [{ text: '4 trout fillets', note: null }],
        steps: ['Bake it.'],
        keywords: ['trout'],
        kcal: 192,
        protein_g: 25.6,
        carbs_g: 4,
        fat_g: 8,
        food_groups: [],
        image_path: '/recipes/baked-trout.jpg',
        source: 'USDA MyPlate Kitchen',
        source_url: 'https://example.test/baked-trout',
        rating: 4,
        rating_count: 10,
      },
    ]);
    const limit = limitsFor('free').recipeRunsPerDay;
    for (let i = 0; i < limit; i++) {
      await recordUsage({
        userId: user.id,
        kind: 'recipe',
        outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 0.2, model: 'claude-opus-5' } as never,
      });
    }

    for (const [url, payload] of [
      ['/recipes/suggest', {}],
      ['/library/baked-trout/adapt', {}],
      ['/recipes/import', { text: 'A recipe long enough to pass validation, with steps.' }],
    ] as const) {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { cookie },
        payload,
      });
      expect(response.statusCode, url).toBe(429);
    }
  });

  it('caps recipe runs too', async () => {
    const tools = await import('../src/ai/tools.ts');
    const spy = vi.spyOn(tools, 'buildNutritionServer');
    const limit = limitsFor('free').recipeRunsPerDay;

    const codes: number[] = [];
    for (let i = 0; i < limit + 1; i++) {
      scriptAgent({
        text: 'Here you go.',
        act: async () => {
          const built = spy.mock.results.at(-1)!
            .value as ReturnType<typeof tools.buildNutritionServer>;
          await built.tools
            .find((t) => t.name === 'propose_recipe')!
            .handler(
              {
                title: 'Eggs',
                summary: null,
                portions: 1,
                minutes: 5,
                steps: ['Fry them.'],
                ingredients: [
                  {
                    name: 'Eggs',
                    quantity_g: 100,
                    quantity_desc: '2',
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
      const response = await app.inject({
        method: 'POST',
        url: '/recipes/suggest',
        headers: { cookie },
        payload: {},
      });
      codes.push(response.statusCode);
    }

    expect(codes.at(-1)).toBe(429);
  });
});
