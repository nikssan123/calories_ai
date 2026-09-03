import { afterEach, describe, expect, it, vi } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { env } from '../src/env.ts';
import {
  BarcodeUnavailableError,
  HIT_TTL_DAYS,
  InvalidBarcodeError,
  lookupBarcode,
  MISS_TTL_DAYS,
  normaliseBarcode,
  sweepBarcodeCache,
} from '../src/services/barcode.ts';

/**
 * The lookup, with the network replaced by recorded payloads.
 *
 * `fetch` is stubbed rather than the catalogues mocked out, because the wire
 * shape is the only thing this service actually depends on — an OFF row with
 * kilojoules and no kcal is the case that breaks it, and that is a fact about
 * their JSON rather than about our code.
 */

/** A real Nutella GTIN-13; the numbers below are invented. */
const CODE = '3017620422003';
/** UPC-A, twelve digits, as an American scanner hands it over. */
const UPC = '028400090865';

afterEach(async () => {
  vi.unstubAllGlobals();
  env.barcode.fdcApiKey = null;
});

interface StubbedCall {
  url: string;
  headers: Record<string, string>;
}

type Reply = { status?: number; body?: unknown; throws?: string };

/** Queues one reply per expected round trip, in order. */
function stubFetch(...replies: Reply[]) {
  const calls: StubbedCall[] = [];
  const queue = [...replies];

  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    const reply = queue.shift();
    if (!reply) throw new Error(`Unexpected fetch: ${url}`);
    if (reply.throws) throw new Error(reply.throws);
    return {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      json: async () => reply.body,
    } as Response;
  });

  return calls;
}

/** An OFF v2 envelope carrying whatever the case is about. */
function offProduct(nutriments: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    status: 1,
    product: {
      code: CODE,
      product_name: 'Hazelnut spread',
      brands: 'Ferrero,Nutella',
      nutriments: { proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, ...nutriments },
      serving_size: '15 g',
      serving_quantity: 15,
      ...extra,
    },
  };
}

async function cacheRow(barcode = CODE) {
  return queryOne<any>('SELECT * FROM barcode_products WHERE barcode = $1', [barcode]);
}

describe('normaliseBarcode', () => {
  it('pads a UPC-A to GTIN-13 so one product is one cache key', () => {
    expect(normaliseBarcode(UPC)).toBe(`0${UPC}`);
  });

  it('keeps an EAN-8 at eight digits', () => {
    // 96385074 is a valid EAN-8. Padding it would ask the catalogues for a
    // thirteen-digit product that was never assigned.
    expect(normaliseBarcode('96385074')).toBe('96385074');
  });

  it('narrows a 14-digit case code that is only a padded GTIN-13', () => {
    expect(normaliseBarcode(`0${CODE}`)).toBe(CODE);
  });

  it('tolerates the spacing a hand-typed code arrives with', () => {
    expect(normaliseBarcode(' 3017620 422003 ')).toBe(CODE);
  });

  it('expands a UPC-E into the UPC-A nobody would find it under', () => {
    // 04963406 is the compressed form of 049000006346. Read as an EAN-8 it
    // fails its check digit and the scan is called a mis-scan; read as itself
    // it is a can of Coca-Cola.
    expect(normaliseBarcode('04963406')).toBe('0049000006346');
  });

  it('leaves a valid EAN-8 alone rather than reading it as a UPC-E', () => {
    // 01234565 checks out as an EAN-8, so it is one. The in-store codes a
    // supermarket prints live in this space and must not be expanded.
    expect(normaliseBarcode('01234565')).toBe('01234565');
  });

  it('rejects a wrong check digit', () => {
    expect(() => normaliseBarcode('3017620422004')).toThrow(InvalidBarcodeError);
    // Eight digits that are neither a GTIN-8 nor a UPC-E are still a mis-scan.
    expect(() => normaliseBarcode('04963407')).toThrow(InvalidBarcodeError);
  });

  it('rejects anything that is not digits, and any length nobody prints', () => {
    expect(() => normaliseBarcode('30176204220ab')).toThrow(InvalidBarcodeError);
    expect(() => normaliseBarcode('301762')).toThrow(InvalidBarcodeError);
  });
});

describe('lookupBarcode', () => {
  it('never reaches the network for a barcode that did not scan cleanly', async () => {
    const calls = stubFetch();
    await expect(lookupBarcode('3017620422004')).rejects.toThrow(InvalidBarcodeError);
    expect(calls).toHaveLength(0);
    // And nothing was written down: a mis-scan is not a fact about the product.
    expect(await cacheRow('3017620422004')).toBeNull();
  });

  it('reads Open Food Facts into a per-100g product and caches it', async () => {
    const calls = stubFetch({ body: offProduct({ 'energy-kcal_100g': 539 }) });

    const product = await lookupBarcode(CODE);

    expect(product).toMatchObject({
      barcode: CODE,
      brand: 'Ferrero',
      name: 'Hazelnut spread',
      kcal_100g: 539,
      protein_100g: 6.3,
      serving_g: 15,
      serving_desc: '15 g',
      source: 'off',
      source_url: `https://world.openfoodfacts.org/product/${CODE}`,
    });
    // Identified, because their policy asks for it and throttles what is not.
    expect(calls[0]!.headers['User-Agent']).toContain('DaySoFar');
    expect(await cacheRow()).toMatchObject({ found: true, kcal_100g: 539 });
  });

  it('does not refetch a cached hit', async () => {
    const calls = stubFetch({ body: offProduct({ 'energy-kcal_100g': 539 }) });

    await lookupBarcode(CODE);
    const again = await lookupBarcode(CODE);

    expect(calls).toHaveLength(1);
    expect(again).toMatchObject({ name: 'Hazelnut spread', kcal_100g: 539 });
  });

  it('answers a cached hit for the unpadded form of the same code', async () => {
    const calls = stubFetch({ body: offProduct({ 'energy-kcal_100g': 539 }) });

    await lookupBarcode(CODE);
    await lookupBarcode(`0${CODE}`);

    expect(calls).toHaveLength(1);
  });

  it('converts a kJ-only row, which is most of the EU shelf', async () => {
    stubFetch({ body: offProduct({ 'energy-kj_100g': 2252 }) });

    const product = await lookupBarcode(CODE);

    expect(product!.kcal_100g).toBeCloseTo(538.2, 1);
  });

  it('reads bare energy_100g against the unit beside it', async () => {
    stubFetch({ body: offProduct({ energy_100g: 539, energy_unit: 'kcal' }) });

    // Dividing this one again would report a chocolate spread as celery.
    expect((await lookupBarcode(CODE))!.kcal_100g).toBe(539);
  });

  it('asks for a name in every language a European shelf uses', async () => {
    const calls = stubFetch({ body: offProduct({ 'energy-kcal_100g': 539 }) });

    await lookupBarcode(CODE);

    // Without this, OFF resolves `product_name` against English alone and a
    // packet catalogued in one language comes back nameless — which this file
    // reads as uncatalogued, and the phone reports as "nobody has catalogued
    // that one yet" while holding the product's own nutrition panel.
    expect(calls[0]!.url).toContain('lc=en,bg,de,es,fr');
  });

  it('falls back to the brand when nobody wrote a name down', async () => {
    stubFetch({
      body: offProduct({ 'energy-kcal_100g': 373 }, { product_name: '', brands: 'Lidl' }),
    });

    // A thin name, and better than telling someone their cereal is
    // uncatalogued while quoting its calories back at them.
    expect(await lookupBarcode(CODE)).toMatchObject({ name: 'Lidl', brand: 'Lidl', kcal_100g: 373 });
  });

  it('treats a row with neither a name nor a brand as a miss', async () => {
    stubFetch({
      body: offProduct({ 'energy-kcal_100g': 373 }, { product_name: '', brands: '' }),
    });

    expect(await lookupBarcode(CODE)).toBeNull();
  });

  it('treats a row with a name and no macros as a miss', async () => {
    stubFetch({ body: { status: 1, product: { code: CODE, product_name: 'Something', nutriments: {} } } });

    expect(await lookupBarcode(CODE)).toBeNull();
    // A miss, not a zero-calorie food. The zero would look like a number.
    expect(await cacheRow()).toMatchObject({ found: false, kcal_100g: null });
  });

  it('treats an implausible energy figure as a miss', async () => {
    stubFetch({ body: offProduct({ 'energy-kcal_100g': 5390 }) });

    expect(await lookupBarcode(CODE)).toBeNull();
  });

  it('drops a serving size the contributor left empty', async () => {
    stubFetch({
      body: offProduct({ 'energy-kcal_100g': 539 }, { serving_quantity: '', serving_size: '' }),
    });

    const product = await lookupBarcode(CODE);
    expect(product).toMatchObject({ serving_g: null, serving_desc: null });
  });

  it('remembers that nobody has catalogued it', async () => {
    const calls = stubFetch({ status: 404 });

    expect(await lookupBarcode(CODE)).toBeNull();
    expect(await lookupBarcode(CODE)).toBeNull();

    expect(calls).toHaveLength(1);
    expect(await cacheRow()).toMatchObject({ found: false });
  });

  it('expires a miss on its own shorter clock', async () => {
    const calls = stubFetch({ status: 404 }, { body: offProduct({ 'energy-kcal_100g': 539 }) });

    await lookupBarcode(CODE);
    await backdate(CODE, MISS_TTL_DAYS + 1);

    // The own-brand nobody had catalogued in March is catalogued by May.
    expect(await lookupBarcode(CODE)).toMatchObject({ name: 'Hazelnut spread' });
    expect(calls).toHaveLength(2);
  });

  it('keeps a hit for far longer than a miss', async () => {
    const calls = stubFetch({ body: offProduct({ 'energy-kcal_100g': 539 }) });

    await lookupBarcode(CODE);
    await backdate(CODE, MISS_TTL_DAYS + 1);

    expect(await lookupBarcode(CODE)).toMatchObject({ name: 'Hazelnut spread' });
    expect(calls).toHaveLength(1);
  });

  it('never writes an outage down as a missing product', async () => {
    const calls = stubFetch({ throws: 'socket hang up' }, { body: offProduct({ 'energy-kcal_100g': 539 }) });

    await expect(lookupBarcode(CODE)).rejects.toThrow(BarcodeUnavailableError);
    expect(await cacheRow()).toBeNull();

    // So the next scan asks again rather than repeating a week-old blip.
    expect(await lookupBarcode(CODE)).toMatchObject({ name: 'Hazelnut spread' });
    expect(calls).toHaveLength(2);
  });

  it('does not cache a catalogue that answered with a 500', async () => {
    stubFetch({ status: 500 });
    await expect(lookupBarcode(CODE)).rejects.toThrow(BarcodeUnavailableError);
    expect(await cacheRow()).toBeNull();
  });
});

describe('FoodData Central', () => {
  const FDC_FOOD = {
    fdcId: 1234,
    description: 'Corn flakes',
    brandOwner: 'Kellogg',
    gtinUpc: UPC,
    servingSize: 30,
    servingSizeUnit: 'g',
    householdServingFullText: '1 cup',
    foodNutrients: [
      { nutrientNumber: '208', value: 357 },
      { nutrientNumber: '203', value: 7.1 },
      { nutrientNumber: '205', value: 84 },
      { nutrientNumber: '204', value: 1.2 },
    ],
  };

  it('is not consulted at all without a key', async () => {
    const calls = stubFetch({ status: 404 });
    expect(await lookupBarcode(UPC)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('answers the American shelf when Open Food Facts cannot', async () => {
    env.barcode.fdcApiKey = 'test-key';
    const calls = stubFetch({ status: 404 }, { body: { foods: [FDC_FOOD] } });

    const product = await lookupBarcode(UPC);

    expect(product).toMatchObject({
      barcode: `0${UPC}`,
      name: 'Corn flakes',
      brand: 'Kellogg',
      kcal_100g: 357,
      serving_g: 30,
      serving_desc: '1 cup',
      source: 'fdc',
    });
    expect(calls[1]!.url).toContain('api_key=test-key');
  });

  it('asks for every form of the GTIN, because FDC matches only the stored one', async () => {
    env.barcode.fdcApiKey = 'test-key';
    const calls = stubFetch({ status: 404 }, { body: { foods: [FDC_FOOD] } });

    await lookupBarcode(UPC);

    // Verified against the live API: Cheerios is stored as the 14-digit
    // 00016000275287 and matches nothing shorter, a bag of tortilla chips as
    // the 12-digit 743209235513 and matches nothing longer. Asking for one form
    // finds about half the shelf, so all three go in one query — the search
    // reads space-separated terms as alternatives.
    const terms = new URL(calls[1]!.url).searchParams.get('query')!.split(' ');
    expect(terms).toEqual(
      expect.arrayContaining(['00028400090865', '0028400090865', '28400090865']),
    );
  });

  it('does not repeat a term when every form of the code is the same string', async () => {
    env.barcode.fdcApiKey = 'test-key';
    // A 14-digit code with no leading zero: padding and stripping both no-op.
    const calls = stubFetch({ status: 404 }, { body: { foods: [] } });

    await lookupBarcode('10693392005820');

    expect(new URL(calls[1]!.url).searchParams.get('query')).toBe('10693392005820');
  });

  it('still matches the product back when FDC answers with a shorter GTIN', async () => {
    env.barcode.fdcApiKey = 'test-key';
    // Padding the question does not mean the answer comes back padded: FDC
    // stores these both ways, which is why the check is on the number.
    stubFetch({ status: 404 }, { body: { foods: [{ ...FDC_FOOD, gtinUpc: '28400090865' }] } });

    expect(await lookupBarcode(UPC)).toMatchObject({ name: 'Corn flakes', source: 'fdc' });
  });

  it('refuses a search hit that is a different product', async () => {
    env.barcode.fdcApiKey = 'test-key';
    stubFetch({ status: 404 }, { body: { foods: [{ ...FDC_FOOD, gtinUpc: '012345678905' }] } });

    // It is a search endpoint, so the first row back is not necessarily the
    // packet in someone's hand.
    expect(await lookupBarcode(UPC)).toBeNull();
  });

  it('ignores a serving measured in something that is not grams', async () => {
    env.barcode.fdcApiKey = 'test-key';
    stubFetch(
      { status: 404 },
      { body: { foods: [{ ...FDC_FOOD, servingSize: 1.5, servingSizeUnit: 'cup' }] } },
    );

    // A cup cannot be multiplied against a per-100g figure.
    expect((await lookupBarcode(UPC))!.serving_g).toBeNull();
  });

  it('covers for an Open Food Facts outage rather than failing with it', async () => {
    env.barcode.fdcApiKey = 'test-key';
    stubFetch({ throws: 'socket hang up' }, { body: { foods: [FDC_FOOD] } });

    expect(await lookupBarcode(UPC)).toMatchObject({ name: 'Corn flakes', source: 'fdc' });
  });

  it('still refuses to record a miss when only the outage answered', async () => {
    env.barcode.fdcApiKey = 'test-key';
    stubFetch({ throws: 'socket hang up' }, { body: { foods: [] } });

    await expect(lookupBarcode(UPC)).rejects.toThrow(BarcodeUnavailableError);
    expect(await cacheRow(`0${UPC}`)).toBeNull();
  });
});

describe('sweepBarcodeCache', () => {
  it('drops what has expired and keeps what has not', async () => {
    stubFetch({ body: offProduct({ 'energy-kcal_100g': 539 }) }, { status: 404 });
    await lookupBarcode(CODE);
    await lookupBarcode(UPC);

    // Old enough to have lost a miss, nowhere near old enough to lose a hit.
    await backdate(CODE, MISS_TTL_DAYS + 1);
    await backdate(`0${UPC}`, MISS_TTL_DAYS + 1);

    expect(await sweepBarcodeCache()).toBe(1);
    expect(await cacheRow(CODE)).not.toBeNull();
    expect(await cacheRow(`0${UPC}`)).toBeNull();

    await backdate(CODE, HIT_TTL_DAYS + 1);
    expect(await sweepBarcodeCache()).toBe(1);
  });
});

/** Ages a cached row, which is cheaper than moving the clock. */
async function backdate(barcode: string, days: number): Promise<void> {
  await query(
    `UPDATE barcode_products SET fetched_at = now() - ($2 * INTERVAL '1 day') WHERE barcode = $1`,
    [barcode, days],
  );
}
