import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { query } from '../src/db.ts';
import { getFoodEntry } from '../src/services/log.ts';
import { localDateFor } from '../src/time.ts';
import { addMeal, appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * `POST /entries/food` — the first create path that needs neither a model nor a
 * catalogue, and the one an offline outbox is built on. See OFFLINE.md.
 *
 * Most of this file is about `client_id`, because idempotency is the only part
 * a client cannot work around: a queue that resends after a lost reply will
 * double-log breakfast, and a doubled meal is invisible in a way a missing one
 * is not.
 */

let user: TestUser;
let other: TestUser;
let app: FastifyInstance;
let cookie: string;
let today: string;

beforeEach(async () => {
  user = await createUser();
  other = await createUser();
  ({ app, cookie } = await appFor(user));
  today = localDateFor(new Date(), user.ctx);
});

afterEach(async () => {
  await app.close();
});

const auth = () => ({ headers: { cookie } });

const MEAL = {
  description: 'Chicken and rice',
  items: [
    { name: 'Chicken breast', quantity_g: 200, kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7 },
    { name: 'Rice', quantity_g: 180, kcal: 240, protein_g: 5, carbs_g: 52, fat_g: 1 },
  ],
};

function post(body: Record<string, unknown>): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url: '/entries/food', payload: body, ...auth() });
}

describe('POST /entries/food', () => {
  it('logs a meal nobody estimated', async () => {
    const response = await post({ ...MEAL, meal: 'lunch' });

    expect(response.statusCode).toBe(201);
    const entry = response.json();
    expect(entry).toMatchObject({
      meal: 'lunch',
      description: 'Chicken and rice',
      source: 'manual',
      // Somebody stated these. Every other source is a guess at them.
      confidence: 'high',
      local_date: today,
    });
    expect(entry.kcal).toBe(570);
    expect(entry.protein_g).toBe(67);
    expect(entry.items).toHaveLength(2);
  });

  it('leaves the quality panel null rather than claiming zero', async () => {
    const entry = (await post(MEAL)).json();
    expect(entry.fiber_g).toBeNull();
    expect(entry.sodium_mg).toBeNull();
    expect(entry.items[0].fiber_g).toBeNull();
  });

  it('keeps a quality figure that was actually supplied', async () => {
    const entry = (
      await post({
        description: 'Lentils',
        items: [{ name: 'Lentils', kcal: 230, protein_g: 18, carbs_g: 40, fat_g: 1, fiber_g: 16 }],
      })
    ).json();
    expect(entry.fiber_g).toBe(16);
    expect(entry.sodium_mg).toBeNull();
  });

  it('infers the meal slot from the time when none is given', async () => {
    const at = new Date();
    at.setUTCHours(6, 0, 0, 0);
    const entry = (await post({ ...MEAL, eaten_at: at.toISOString() })).json();
    expect(['breakfast', 'lunch', 'dinner', 'snack']).toContain(entry.meal);
  });

  it('counts a backdated meal toward the day it was eaten', async () => {
    const entry = (
      await post({ ...MEAL, eaten_at: '2026-03-08T13:00:00.000Z', meal: 'lunch' })
    ).json();
    expect(entry.local_date).toBe('2026-03-08');
  });

  it('refuses a meal with no items', async () => {
    expect((await post({ description: 'Nothing', items: [] })).statusCode).toBe(400);
  });

  it('refuses an entry with no description', async () => {
    expect((await post({ description: '', items: MEAL.items })).statusCode).toBe(400);
  });

  it('refuses a time it cannot read', async () => {
    expect((await post({ ...MEAL, eaten_at: 'sometime tuesday' })).statusCode).toBe(400);
  });

  it('is not open to anonymous callers', async () => {
    const response = await app.inject({ method: 'POST', url: '/entries/food', payload: MEAL });
    expect(response.statusCode).toBe(401);
  });
});

describe('client_id', () => {
  const KEY = '11111111-2222-4333-8444-555555555555';

  it('logs one meal however many times the same key arrives', async () => {
    const first = await post({ ...MEAL, client_id: KEY });
    const second = await post({ ...MEAL, client_id: KEY });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().id).toBe(first.json().id);

    const rows = await query<{ count: string }>(
      'SELECT count(*) FROM food_entries WHERE user_id = $1',
      [user.id],
    );
    expect(Number(rows[0]!.count)).toBe(1);
  });

  it('does not duplicate the items either', async () => {
    await post({ ...MEAL, client_id: KEY });
    const entry = (await post({ ...MEAL, client_id: KEY })).json();
    expect(entry.items).toHaveLength(2);
    expect(entry.kcal).toBe(570);
  });

  it('ignores what the retry says and keeps the meal as first sent', async () => {
    const first = (await post({ ...MEAL, client_id: KEY })).json();
    // A retry is the same meal arriving again, not a correction to it — that is
    // what PATCH is for, and treating it as an update would let a stale queued
    // copy overwrite a correction the user has since made.
    const retry = (
      await post({
        description: 'Something else entirely',
        items: [{ name: 'Toast', kcal: 90, protein_g: 3, carbs_g: 17, fat_g: 1 }],
        client_id: KEY,
      })
    ).json();
    expect(retry.id).toBe(first.id);
    expect(retry.description).toBe('Chicken and rice');
    expect(retry.kcal).toBe(570);
  });

  it('scopes the key to its own account', async () => {
    const mine = (await post({ ...MEAL, client_id: KEY })).json();

    const { app: theirApp, cookie: theirCookie } = await appFor(other);
    const theirs = await theirApp.inject({
      method: 'POST',
      url: '/entries/food',
      payload: { ...MEAL, client_id: KEY },
      headers: { cookie: theirCookie },
    });
    await theirApp.close();

    expect(theirs.statusCode).toBe(201);
    expect(theirs.json().id).not.toBe(mine.id);
  });

  it('lets separate meals through when no key is given', async () => {
    await post(MEAL);
    await post(MEAL);
    const rows = await query<{ count: string }>(
      'SELECT count(*) FROM food_entries WHERE user_id = $1',
      [user.id],
    );
    expect(Number(rows[0]!.count)).toBe(2);
  });

  it('refuses to resurrect a meal the user deleted while the retry was in flight', async () => {
    const entry = (await post({ ...MEAL, client_id: KEY })).json();
    await app.inject({ method: 'DELETE', url: `/entries/food/${entry.id}`, ...auth() });

    const retry = await post({ ...MEAL, client_id: KEY });
    // 409, so the outbox drops the intent. A 5xx would have it back off and try
    // again forever against a key it can never spend.
    expect(retry.statusCode).toBe(409);
    expect(await getFoodEntry(user.id, entry.id)).toBeNull();
  });

  it('refuses a key that is not a uuid', async () => {
    expect((await post({ ...MEAL, client_id: 'breakfast-1' })).statusCode).toBe(400);
  });
});

describe('POST /entries/food/:id/repeat with a client_id', () => {
  const KEY = '99999999-8888-4777-a666-555555555555';

  it('clones once however many times the key arrives', async () => {
    const source = await addMeal(user, { date: '2026-03-10', kcal: 500, description: 'Porridge' });

    const first = await app.inject({
      method: 'POST',
      url: `/entries/food/${source.id}/repeat`,
      payload: { client_id: KEY },
      ...auth(),
    });
    const second = await app.inject({
      method: 'POST',
      url: `/entries/food/${source.id}/repeat`,
      payload: { client_id: KEY },
      ...auth(),
    });

    expect(first.statusCode).toBe(201);
    expect(second.json().id).toBe(first.json().id);

    const rows = await query<{ count: string }>(
      "SELECT count(*) FROM food_entries WHERE user_id = $1 AND source = 'quick'",
      [user.id],
    );
    expect(Number(rows[0]!.count)).toBe(1);
  });

  it('still repeats freely when no key is given', async () => {
    const source = await addMeal(user, { date: '2026-03-10', kcal: 500, description: 'Porridge' });
    await app.inject({ method: 'POST', url: `/entries/food/${source.id}/repeat`, ...auth() });
    await app.inject({ method: 'POST', url: `/entries/food/${source.id}/repeat`, ...auth() });

    const rows = await query<{ count: string }>(
      "SELECT count(*) FROM food_entries WHERE user_id = $1 AND source = 'quick'",
      [user.id],
    );
    expect(Number(rows[0]!.count)).toBe(2);
  });
});
