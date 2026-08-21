import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query } from '../src/db.ts';
import { appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The two routes a scan goes through, and the seam between them.
 *
 * The lookup and the log are separate requests on purpose, and most of what is
 * asserted here is that they stay separate: reading a packet must never write
 * an entry, and writing one must never be able to invent the amount.
 */

const CODE = '3017620422003';

let user: TestUser;
let app: FastifyInstance;
let cookie: string;

beforeEach(async () => {
  user = await createUser();
  ({ app, cookie } = await appFor(user));
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, headers: { cookie }, payload } as never);

/** One canned Open Food Facts reply, then nothing. Numbers are invented. */
function stubOff(body: unknown, status = 200) {
  vi.stubGlobal('fetch', async () => ({
    ok: status < 400,
    status,
    json: async () => body,
  }));
}

const SPREAD = {
  status: 1,
  product: {
    code: CODE,
    product_name: 'Hazelnut spread',
    brands: 'Ferrero',
    nutriments: {
      'energy-kcal_100g': 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
    },
    serving_size: '15 g',
    serving_quantity: 15,
  },
};

async function entries() {
  return query<any>(
    `SELECT e.description, e.source, e.confidence, e.note, i.quantity_g, i.quantity_desc, i.kcal
       FROM food_entries e JOIN food_items i ON i.entry_id = e.id
      WHERE e.user_id = $1`,
    [user.id],
  );
}

describe('GET /barcode/:code', () => {
  it('answers with the packet, per 100g', async () => {
    stubOff(SPREAD);
    const response = await get(`/barcode/${CODE}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      barcode: CODE,
      brand: 'Ferrero',
      name: 'Hazelnut spread',
      kcal_100g: 539,
      serving_g: 15,
      source: 'off',
    });
  });

  it('writes nothing at all', async () => {
    stubOff(SPREAD);
    await get(`/barcode/${CODE}`);
    // A lookup is a fact about a product, not a claim about a person.
    expect(await entries()).toHaveLength(0);
  });

  it('404s on the own-brand nobody has catalogued', async () => {
    stubOff(null, 404);
    const response = await get(`/barcode/${CODE}`);

    expect(response.statusCode).toBe(404);
    // The client turns this into "snap the label instead", which is the whole
    // reason the miss is an ordinary reply rather than an error.
    expect(response.json().error).toContain('catalogued');
  });

  it('400s a code that did not scan cleanly, without asking anyone', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      throw new Error('should not be reached');
    });

    expect((await get('/barcode/3017620422004')).statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('502s an outage rather than calling it a missing product', async () => {
    stubOff(null, 503);
    const response = await get(`/barcode/${CODE}`);

    // Saying 404 here would send someone hunting for a product that is there.
    expect(response.statusCode).toBe(502);
  });

  it('is closed to anyone not signed in', async () => {
    const response = await app.inject({ method: 'GET', url: `/barcode/${CODE}` });
    expect(response.statusCode).toBe(401);
  });
});

describe('POST /barcode/:code/log', () => {
  it('logs grams, priced off the label', async () => {
    stubOff(SPREAD);
    const response = await post(`/barcode/${CODE}/log`, { grams: 30, meal: 'snack' });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      meal: 'snack',
      source: 'barcode',
      confidence: 'high',
      description: 'Ferrero Hazelnut spread',
      kcal: 161.7,
    });
    expect(await entries()).toMatchObject([
      { quantity_g: 30, quantity_desc: '30 g', note: 'Data from Open Food Facts' },
    ]);
  });

  it('logs servings, and says so in the words the user picked', async () => {
    stubOff(SPREAD);
    const response = await post(`/barcode/${CODE}/log`, { servings: 2 });

    expect(response.statusCode).toBe(201);
    expect(await entries()).toMatchObject([
      { quantity_g: 30, quantity_desc: '2 servings (30 g) — 15 g' },
    ]);
  });

  it('refuses servings against a label that never named one', async () => {
    stubOff({ ...SPREAD, product: { ...SPREAD.product, serving_quantity: null, serving_size: '' } });
    const response = await post(`/barcode/${CODE}/log`, { servings: 2 });

    // Two of an unknown quantity is not a portion, and guessing one is exactly
    // the failure this whole feature is arranged to avoid.
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('grams');
    expect(await entries()).toHaveLength(0);
  });

  it('refuses a portion said two ways at once, or not at all', async () => {
    stubOff(SPREAD);
    expect((await post(`/barcode/${CODE}/log`, { grams: 30, servings: 2 })).statusCode).toBe(400);
    expect((await post(`/barcode/${CODE}/log`, {})).statusCode).toBe(400);
  });

  it('cannot log something nobody has catalogued', async () => {
    stubOff(null, 404);
    expect((await post(`/barcode/${CODE}/log`, { grams: 30 })).statusCode).toBe(404);
    expect(await entries()).toHaveLength(0);
  });

  it('picks the meal from the clock when the caller does not say', async () => {
    stubOff(SPREAD);
    const response = await post(`/barcode/${CODE}/log`, {
      grams: 30,
      eaten_at: '2026-03-16T11:30:00Z',
    });

    // 13:30 in Sofia, which is lunch.
    expect(response.json()).toMatchObject({ meal: 'lunch', local_date: '2026-03-16' });
  });
});
