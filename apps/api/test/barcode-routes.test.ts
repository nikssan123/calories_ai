import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query } from '../src/db.ts';
import { appFor, createUser, type TestUser } from './helpers/factories.ts';
import { agentCalls } from './helpers/agent-mock.ts';

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

/** A catalogue that answers per code, for a basket of more than one packet. */
function stubCatalogue(byCode: Record<string, unknown>) {
  vi.stubGlobal('fetch', async (url: string) => {
    const code = Object.keys(byCode).find((one) => String(url).includes(one));
    return {
      ok: code !== undefined,
      status: code === undefined ? 404 : 200,
      json: async () => (code === undefined ? {} : byCode[code]),
    };
  });
}

const FLAKES_CODE = '5000112637922';
const FLAKES = {
  status: 1,
  product: {
    code: FLAKES_CODE,
    product_name: 'Corn Flakes',
    brands: 'Kellogg',
    nutriments: {
      'energy-kcal_100g': 378,
      proteins_100g: 7,
      carbohydrates_100g: 84,
      fat_100g: 0.9,
    },
    serving_size: '40 g',
    serving_quantity: 40,
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

async function journal() {
  return query<any>(
    'SELECT role, content, actions FROM chat_messages WHERE user_id = $1 ORDER BY created_at',
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
    expect(response.json().entry).toMatchObject({
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

  it('logs a fraction of a serving as the fraction, not as a decimal', async () => {
    stubOff(SPREAD);
    // Three quarters off the picker's ladder. It arrives as 0.75 and has to
    // read back as ¾ — "0.8 servings" is a portion nobody chose. The weight
    // beside it is written by `formatMass`, which is whole grams: the stored
    // 11.3 is the arithmetic, and 11 g is the portion.
    const response = await post(`/barcode/${CODE}/log`, { servings: 0.75 });

    expect(response.statusCode).toBe(201);
    expect(await entries()).toMatchObject([
      { quantity_g: 11.3, quantity_desc: '¾ serving (11 g) — 15 g' },
    ]);
  });

  it('logs a third without rounding it to something else', async () => {
    stubOff(SPREAD);
    // ⅓ cannot be written down exactly, so it crosses the wire as 0.333…. The
    // entry still has to say ⅓ rather than the decimal it travelled as.
    const response = await post(`/barcode/${CODE}/log`, { servings: 1 / 3 });

    expect(response.statusCode).toBe(201);
    expect(await entries()).toMatchObject([{ quantity_desc: '⅓ serving (5 g) — 15 g' }]);
  });

  it('writes the portion in the units the person reads', async () => {
    // The grams are what is stored and what every macro is computed from; the
    // sentence and the entry's own description are the two places a reader sees
    // the amount, so they are the two places it has to be in ounces.
    const american = await createUser({ email: 'ohio@example.com', units: 'imperial' });
    const session = await appFor(american);
    stubOff(SPREAD);

    const response = await session.app.inject({
      method: 'POST',
      url: `/barcode/${CODE}/log`,
      headers: { cookie: session.cookie },
      payload: { grams: 30 },
    } as never);

    expect(response.statusCode).toBe(201);
    expect(response.json().entry.items[0]).toMatchObject({
      quantity_g: 30,
      quantity_desc: '1.1 oz',
    });
    expect(response.json().message.content).toBe('Scanned — Ferrero Hazelnut spread, 1.1 oz.');
    await session.app.close();
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

  it('writes the scan into the journal, with the card the model would have drawn', async () => {
    stubOff(SPREAD);
    const response = await post(`/barcode/${CODE}/log`, { grams: 30, meal: 'snack' });
    const { entry, message } = response.json();

    // The scanner logs without a turn, so nothing else was ever going to write
    // this down — a meal in the ring and nowhere in the conversation.
    expect(await journal()).toMatchObject([
      { role: 'assistant', content: 'Scanned — Ferrero Hazelnut spread, 30 g.' },
    ]);
    expect(message.actions).toMatchObject([
      {
        kind: 'food_logged',
        entry_id: entry.id,
        card: { type: 'food', entry_id: entry.id, meal: 'snack', kcal: 162 },
      },
    ]);
    // The same card a reopened app would show, rather than one the client
    // has to draw for itself.
    expect(message.actions[0].card.day).toMatchObject({
      local_date: entry.local_date,
      kcal_before: 0,
      kcal_after: 162,
    });
  });

  it('says the portion in the words the user picked, since the card cannot', async () => {
    stubOff(SPREAD);
    await post(`/barcode/${CODE}/log`, { servings: 0.75 });

    // A one-item card lists no items, so without this the amount — the whole
    // point of the portion picker — is nowhere on screen. And it is the
    // fraction that was tapped rather than the decimal it travelled as.
    const [message] = await journal();
    expect(message.content).toContain('¾ serving');
    // The label's own footnote about a serving stays on the entry, where a
    // correction screen can use it. In a sentence it is a second dash.
    expect(message.content).not.toContain('— 15 g');
  });

  it('leaves the journal alone when nothing was logged', async () => {
    stubOff(null, 404);
    await post(`/barcode/${CODE}/log`, { grams: 30 });
    expect(await journal()).toHaveLength(0);
  });

  it('picks the meal from the clock when the caller does not say', async () => {
    stubOff(SPREAD);
    const response = await post(`/barcode/${CODE}/log`, {
      grams: 30,
      eaten_at: '2026-03-16T11:30:00Z',
    });

    // 13:30 in Sofia, which is lunch.
    expect(response.json().entry).toMatchObject({ meal: 'lunch', local_date: '2026-03-16' });
  });
});

/**
 * A basket, which exists because the second packet used to cost a model call.
 *
 * The single-packet route above has always reached the journal without a turn.
 * With nowhere to log two of them together they went out through the composer
 * as a message, and a message is a turn — so the price of scanning changed at
 * the second packet for no reason anybody could see from the shelf.
 */
describe('POST /barcode/log', () => {
  it('logs several packets as one meal, and never calls a model', async () => {
    stubCatalogue({ [CODE]: SPREAD, [FLAKES_CODE]: FLAKES });
    const response = await post('/barcode/log', {
      items: [
        { barcode: CODE, grams: 30 },
        { barcode: FLAKES_CODE, servings: 2 },
      ],
      meal: 'breakfast',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().entry).toMatchObject({
      meal: 'breakfast',
      source: 'barcode',
      // Earned rather than assumed: every figure in this entry came off a
      // printed panel and every amount was chosen by a person.
      confidence: 'high',
      description: 'Ferrero Hazelnut spread, Kellogg Corn Flakes',
    });

    // One entry with an item each, not two entries: a yoghurt and a granola bar
    // scanned together are one snack.
    expect(await entries()).toMatchObject([
      { quantity_g: 30, quantity_desc: '30 g' },
      { quantity_g: 80, quantity_desc: '2 servings (80 g) — 40 g' },
    ]);

    // The whole point. Nothing here is an estimate, so nothing here is a turn.
    expect(agentCalls).toHaveLength(0);
  });

  it('writes the journal message itself, with the card that lists both', async () => {
    stubCatalogue({ [CODE]: SPREAD, [FLAKES_CODE]: FLAKES });
    await post('/barcode/log', {
      items: [
        { barcode: CODE, grams: 30 },
        { barcode: FLAKES_CODE, grams: 40 },
      ],
    });

    const [message] = await journal();
    expect(message.content).toBe('Scanned — Ferrero Hazelnut spread, Kellogg Corn Flakes.');
    // No portion in the sentence for a basket: the card lists the items with
    // their amounts, and repeating them would be saying it twice.
    expect(message.content).not.toContain('30 g');
  });

  it('reads like the single route when the basket holds one packet', async () => {
    stubCatalogue({ [CODE]: SPREAD });
    await post('/barcode/log', { items: [{ barcode: CODE, grams: 30 }] });

    // Here the card *cannot* say it — it lists items only when there is more
    // than one — so the sentence has to, on the feature whose point is amount.
    const [message] = await journal();
    expect(message.content).toBe('Scanned — Ferrero Hazelnut spread, 30 g.');
  });

  it('refuses the whole basket when one packet cannot be looked up', async () => {
    stubCatalogue({ [CODE]: SPREAD });
    const response = await post('/barcode/log', {
      items: [
        { barcode: CODE, grams: 30 },
        { barcode: FLAKES_CODE, grams: 40 },
      ],
    });

    expect(response.statusCode).toBe(404);
    // Logging the rest quietly would put a meal in the journal that is short an
    // item, and its totals would look like a real answer.
    expect(await entries()).toHaveLength(0);
    expect(await journal()).toHaveLength(0);
  });

  it.each([
    { items: [] },
    { items: [{ barcode: CODE }] },
    { items: [{ barcode: CODE, grams: 30, servings: 2 }] },
    { items: Array.from({ length: 9 }, () => ({ barcode: CODE, grams: 30 })) },
  ])('rejects a bad basket %#', async (payload) => {
    stubCatalogue({ [CODE]: SPREAD });
    expect((await post('/barcode/log', payload)).statusCode).toBe(400);
  });
});
