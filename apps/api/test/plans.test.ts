import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query } from '../src/db.ts';
import { limitsFor, meterFor } from '../src/services/plans.ts';
import { accountGate, getUser } from '../src/services/user.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import { appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The entitlement seam.
 *
 * There is no billing behind it yet, which is the point: what is under test is
 * that a plan reaches the decision before money is spent.
 *
 * This file used to assert that `free` still meant what it meant before plans
 * existed — "a seam that quietly tightened the free tier on the day it shipped
 * would be a change nobody agreed to." That guarantee was retired deliberately
 * when `OFFLINE.md` landed: manual entry, repeat and barcode now log without a
 * model, so the free tier's AI allowance could shrink without taking the food
 * diary with it. What replaces it below is the property that actually has to
 * hold now — that free keeps an unmetered way to log, and that every meter is
 * refused with 402 rather than 429.
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
   * The free tier's AI is a lifetime grant, not a monthly one.
   *
   * This is the load-bearing decision in the whole table and it is worth an
   * assertion of its own: a monthly grant is a recurring bill for accounts that
   * have already decided not to pay, and at a measured $0.066 a turn it is the
   * difference between a one-off acquisition cost and an annuity paid to people
   * who never convert.
   */
  it('grants free AI once rather than monthly', () => {
    expect(meterFor('free', 'chat')).toEqual({ allowed: 20, period: 'ever' });
    expect(meterFor('free', 'photo')).toEqual({ allowed: 1, period: 'ever' });
  });

  /** The kitchen is a tier, not an allowance, below `coach`. */
  it('locks the kitchen outside coach', () => {
    for (const plan of ['free', 'plus'] as const) {
      expect(meterFor(plan, 'recipe').allowed, plan).toBeNull();
      expect(meterFor(plan, 'meal_plan').allowed, plan).toBeNull();
      expect(meterFor(plan, 'pantry_scan').allowed, plan).toBeNull();
    }
    expect(meterFor('coach', 'recipe').allowed).toBeGreaterThan(0);
    expect(meterFor('coach', 'meal_plan').allowed).toBeGreaterThan(0);
  });

  /**
   * Everything a user can *spend*, that is.
   *
   * `nudgesPerWeek` is the odd one out and the exception is deliberate: it caps
   * what the app may send someone unasked rather than what they may ask for.
   * Being messaged more often is not a thing anybody would pay for, so the two
   * plans hold the same line and this test says which rule it is checking.
   */
  it('gives a paid account more of every ceiling they can spend against', () => {
    const free = limitsFor('free');
    const plus = limitsFor('plus');
    const numeric = (['chatTurnsPerHour', 'reviewsPerDay'] as const);

    for (const key of numeric) {
      expect(plus[key], key).toBeGreaterThanOrEqual(free[key]);
    }
    // The meters are the ones that are actually sold, and a paid month has to
    // beat a free lifetime outright — otherwise the tier is not a tier.
    expect(meterFor('plus', 'chat').allowed!).toBeGreaterThan(0);
    expect(meterFor('plus', 'photo').allowed!).toBeGreaterThan(
      meterFor('free', 'photo').allowed!,
    );
  });

  /**
   * The odd one out, and the exception is deliberate: `nudgesPerWeek` caps what
   * the app may send someone unasked rather than what they may ask for. Being
   * messaged more often is not a thing anybody would pay for.
   *
   * Free is now zero rather than one — a *model-written* nudge is $0.025 and a
   * dormant free account can collect them forever. Free accounts get a
   * templated push instead, which costs nothing and is sent elsewhere.
   */
  it('does not let a paid account be nudged more often', () => {
    expect(limitsFor('coach').nudgesPerWeek).toBe(limitsFor('plus').nudgesPerWeek);
    expect(limitsFor('free').nudgesPerWeek).toBe(0);
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
    await setPlan(user.id, 'plus');
    expect(await accountGate(user.id)).toEqual({ disabled: false, verified: true, plan: 'plus' });
  });

  /** Granted by paying, never by the client claiming it. */
  it('refuses to let a profile update set it', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { cookie },
      payload: { plan: 'coach', display_name: 'Nik' },
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

  /**
   * 402, not 429, and this is the assertion that matters most to the client.
   *
   * A locked feature and a throttled one are different screens — a paywall
   * against a retry — and answering both with 429 is how an entitlement ends up
   * looking like a bug. The fridge scanner is the clearest case: on `free` it
   * is not slow, it is not included.
   */
  it('refuses a locked kitchen with a paywall rather than a throttle', async () => {
    const response = await scan();
    expect(response.statusCode).toBe(402);
    expect(response.json().allowance).toMatchObject({ meter: 'pantry_scan', allowed: null });
  });

  /**
   * The whole seam in one assertion: the plan is resolved by the session hook,
   * so the right ceiling is already on the request by the time anything spends.
   */
  it('lets a coach account scan', async () => {
    await setPlan(user.id, 'coach');
    expect((await scan()).statusCode).toBe(200);
  });

  it('stops a coach account at its monthly ceiling', async () => {
    await setPlan(user.id, 'coach');
    const { recordUsage } = await import('../src/services/usage.ts');
    const limit = meterFor('coach', 'pantry_scan').allowed!;

    for (let i = 0; i < limit; i++) {
      await recordUsage({
        userId: user.id,
        kind: 'pantry_scan',
        provider: 'anthropic-api',
        outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 0.058, model: 'claude-sonnet-5' } as never,
      });
    }

    const response = await scan();
    expect(response.statusCode).toBe(402);
    expect(response.json().allowance).toMatchObject({ used: limit, period: 'month' });
  });

  /** One account's spending must never eat into another's. */
  it('counts each account separately', async () => {
    await setPlan(user.id, 'coach');
    const { recordUsage } = await import('../src/services/usage.ts');
    for (let i = 0; i < meterFor('coach', 'pantry_scan').allowed!; i++) {
      await recordUsage({
        userId: user.id,
        kind: 'pantry_scan',
        provider: 'anthropic-api',
        outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 0.058, model: 'claude-sonnet-5' } as never,
      });
    }
    expect((await scan()).statusCode).toBe(402);

    const other = await createUser();
    await setPlan(other.id, 'coach');
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
    await setPlan(user.id, 'coach');
    const limit = meterFor('coach', 'recipe').allowed!;
    for (let i = 0; i < limit; i++) {
      await recordUsage({
        userId: user.id,
        kind: 'recipe',
        provider: 'anthropic-api',
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
      expect(response.statusCode, url).toBe(402);
    }
  });

  it('caps recipe runs too', async () => {
    const tools = await import('../src/ai/tools.ts');
    const spy = vi.spyOn(tools, 'buildNutritionServer');
    const limit = meterFor('coach', 'recipe').allowed!;

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

/**
 * The journal's own meter, which is the one that decides the business.
 *
 * These run through `/chat` rather than against `allowanceFor` directly,
 * because the property under test is that the refusal happens in `prepareTurn`
 * — before a photo is claimed, presigned or decoded, and before a token is
 * spent. An entitlement checked after the money is gone is not an entitlement.
 */
describe('the journal meter', () => {
  const chat = (payload: Record<string, unknown> = { text: 'Two eggs' }) => {
    scriptAgent({ text: 'Logged.' });
    return app.inject({ method: 'POST', url: '/chat', headers: { cookie }, payload });
  };

  async function spend(kind: 'text_log' | 'photo_log', n: number) {
    const { recordUsage } = await import('../src/services/usage.ts');
    for (let i = 0; i < n; i++) {
      await recordUsage({
        userId: user.id,
        kind,
        provider: 'anthropic-api',
        outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 0.066, model: 'claude-sonnet-5' } as never,
      });
    }
  }

  it('lets a fresh free account log', async () => {
    expect((await chat()).statusCode).toBe(200);
  });

  /**
   * The free grant does not come back, so the sentence must not promise that it
   * will — and it has to name the thing that still works, because after
   * `OFFLINE.md` there genuinely is one.
   */
  it('refuses a spent free account with 402 and points at the free path', async () => {
    await spend('text_log', meterFor('free', 'chat').allowed!);

    const response = await chat();
    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: expect.stringContaining('Typing a meal in is still unlimited'),
      allowance: { meter: 'chat', period: 'ever', resets_at: null },
    });
  });

  /** Setup turns come out of the same grant, or onboarding drains it unseen. */
  it('counts onboarding against the same chat meter', async () => {
    await spend('text_log', meterFor('free', 'chat').allowed! - 1);
    const { recordUsage } = await import('../src/services/usage.ts');
    await recordUsage({
      userId: user.id,
      kind: 'setup',
      provider: 'anthropic-api',
      outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 0.05, model: 'claude-opus-5' } as never,
    });

    expect((await chat()).statusCode).toBe(402);
  });

  /**
   * A photo is metered apart from a message because it costs six times as much.
   * A free account that has spent no messages still gets exactly one scan.
   */
  it('meters photos apart from messages', async () => {
    await spend('photo_log', 1);

    const photo = await chat({ text: 'What is this?', photo_base64: 'iVBORw0KGgo=' });
    expect(photo.statusCode).toBe(402);
    expect(photo.json().allowance).toMatchObject({ meter: 'photo', allowed: 1, used: 1 });

    // ...and the message meter is untouched by it.
    expect((await chat()).statusCode).toBe(200);
  });

  it('gives a paid account a month rather than a lifetime', async () => {
    await setPlan(user.id, 'plus');
    await spend('text_log', meterFor('plus', 'chat').allowed!);

    const response = await chat();
    expect(response.statusCode).toBe(402);
    expect(response.json().allowance).toMatchObject({ period: 'month' });
    // A rolling window, so it says when one comes back rather than naming a date
    // on a calendar the user would have to keep.
    expect(response.json().allowance.resets_at).toEqual(expect.any(String));
  });
});
