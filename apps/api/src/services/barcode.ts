import { type BarcodeProduct, type BarcodeSource, type FoodEntry, type Meal, formatServings } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { env } from '../env.ts';
import { createFoodEntry } from './log.ts';
import { type DayContext, inferMeal } from '../time.ts';

/**
 * Turning the number under the stripes into nutrition.
 *
 * All of the provider knowledge lives here, so that the route, the agent tool
 * and the tests see one per-100g shape and none of them ever learns which
 * catalogue answered. That seam is what makes "OFF only, or OFF and FDC?" a
 * configuration question rather than a rewrite.
 *
 * Nothing in this file logs anything. A lookup says what the food is; how much
 * of it somebody ate is a separate decision made somewhere else, by a person.
 */

/** Open Food Facts: crowd-sourced, ODbL, excellent in the EU. */
const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
/** USDA FoodData Central: the American branded shelf, and nothing else. */
const FDC_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

/**
 * A printed label does not change, so a hit is good for a season. Re-fetching
 * one is a round trip to confirm a number that was already right.
 */
export const HIT_TTL_DAYS = 90;

/**
 * A miss expires inside a week, and the asymmetry is the whole reason both
 * lifetimes are named. Open Food Facts gains products daily — the own-brand
 * nobody had catalogued in March is catalogued by May — so a miss remembered
 * as firmly as a hit is a scan that stays broken long after the data arrived.
 */
export const MISS_TTL_DAYS = 7;

/**
 * Above this, per 100g, the row is wrong rather than unusual.
 *
 * Pure fat is about 900 kcal/100g and nothing edible beats it. Crowd-sourced
 * rows routinely carry a per-serving figure in a per-100g field or a stray
 * factor of ten, and those land far above this line — which makes one bound
 * cheaper than trying to reconcile a panel that contradicts itself.
 */
const MAX_KCAL_100G = 950;

export class InvalidBarcodeError extends Error {
  constructor(message = 'That does not look like a barcode') {
    super(message);
    this.name = 'InvalidBarcodeError';
  }
}

/** Upstream could not be asked. Deliberately not the same as "not found". */
export class BarcodeUnavailableError extends Error {
  constructor(message = 'Could not reach the food catalogue') {
    super(message);
    this.name = 'BarcodeUnavailableError';
  }
}

// ---- The number itself -------------------------------------------------------

/**
 * The GS1 mod-10 check digit, over every digit but the last.
 *
 * Weights alternate 3 and 1 from the right, which is what catches the
 * transposition a smudged scan most often produces.
 */
function checkDigit(digits: string): number {
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * One physical product, one cache key.
 *
 * A UPC-A off an American packet arrives as 12 digits and is the same GTIN as
 * the 13-digit form with a leading zero, so it pads; a 14-digit case code with
 * a leading zero narrows the same way. EAN-8 stays eight digits, because a
 * short code is its own number space rather than a truncated GTIN-13, and
 * padding it would ask the catalogues for a product that does not exist.
 *
 * The check digit is verified here, before anything reaches the network. A
 * mis-scan is then a free local rejection rather than a round trip that comes
 * back empty and looks exactly like an uncatalogued product.
 */
export function normaliseBarcode(raw: string): string {
  const digits = raw.trim().replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) throw new InvalidBarcodeError();

  let code = digits;
  if (code.length === 14 && code.startsWith('0')) code = code.slice(1);
  if (code.length === 12) code = `0${code}`;
  if (code.length !== 8 && code.length !== 13 && code.length !== 14) throw new InvalidBarcodeError();

  const body = code.slice(0, -1);
  if (checkDigit(body) !== Number(code.at(-1))) {
    throw new InvalidBarcodeError('That barcode did not scan cleanly — try again');
  }
  return code;
}

// ---- The lookup --------------------------------------------------------------

interface CacheRow {
  barcode: string;
  found: boolean;
  brand: string | null;
  name: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  serving_g: number | null;
  serving_desc: string | null;
  source: BarcodeSource;
  source_url: string | null;
  fetched_at: Date;
}

/**
 * Cache, then Open Food Facts, then FDC when a key is configured.
 *
 * Returns null for "nobody has catalogued this", which is an ordinary outcome
 * in a real supermarket and the one the miss path exists for. It throws only
 * when the catalogues could not be *asked* — a distinction worth keeping,
 * because a negative row written from a network blip would remember an outage
 * for a week.
 */
export async function lookupBarcode(raw: string): Promise<BarcodeProduct | null> {
  const code = normaliseBarcode(raw);

  const cached = await queryOne<CacheRow>('SELECT * FROM barcode_products WHERE barcode = $1', [
    code,
  ]);
  if (cached && !isStale(cached)) return cached.found ? toProduct(cached) : null;

  const product = await ask(code);
  await remember(code, product);
  return product;
}

/**
 * Open Food Facts, then FDC.
 *
 * An OFF outage is held rather than thrown, so that a deployment with a key
 * configured still answers from the other catalogue instead of failing because
 * the first one it happened to try was down. It is only rethrown when FDC has
 * nothing to say either — and specifically when FDC did not *answer*, since a
 * genuine "not in FDC" after an OFF outage is still not a confirmed miss and
 * must not be written down as one.
 */
async function ask(code: string): Promise<BarcodeProduct | null> {
  let outage: BarcodeUnavailableError | null = null;
  try {
    const found = await fromOpenFoodFacts(code);
    if (found) return found;
  } catch (error) {
    if (!(error instanceof BarcodeUnavailableError)) throw error;
    outage = error;
  }

  const fallback = await fromFoodDataCentral(code);
  if (fallback) return fallback;
  if (outage) throw outage;
  return null;
}

function isStale(row: CacheRow): boolean {
  const days = (Date.now() - row.fetched_at.getTime()) / 86_400_000;
  return days > (row.found ? HIT_TTL_DAYS : MISS_TTL_DAYS);
}

/**
 * Writes the answer down, hit or miss.
 *
 * `fetched_at` is reset on conflict so a re-fetch restarts the clock rather
 * than leaving a refreshed row instantly stale again.
 */
async function remember(code: string, product: BarcodeProduct | null): Promise<void> {
  await query(
    `INSERT INTO barcode_products
       (barcode, found, brand, name, kcal_100g, protein_100g, carbs_100g, fat_100g,
        serving_g, serving_desc, source, source_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (barcode) DO UPDATE SET
       found = EXCLUDED.found, brand = EXCLUDED.brand, name = EXCLUDED.name,
       kcal_100g = EXCLUDED.kcal_100g, protein_100g = EXCLUDED.protein_100g,
       carbs_100g = EXCLUDED.carbs_100g, fat_100g = EXCLUDED.fat_100g,
       serving_g = EXCLUDED.serving_g, serving_desc = EXCLUDED.serving_desc,
       source = EXCLUDED.source, source_url = EXCLUDED.source_url,
       fetched_at = now()`,
    [
      code,
      product !== null,
      product?.brand ?? null,
      product?.name ?? null,
      product?.kcal_100g ?? null,
      product?.protein_100g ?? null,
      product?.carbs_100g ?? null,
      product?.fat_100g ?? null,
      product?.serving_g ?? null,
      product?.serving_desc ?? null,
      // A miss has to name a source too, since the column is NOT NULL. It says
      // which catalogue was asked and came back empty, which is the honest
      // reading of a negative row.
      product?.source ?? (env.barcode.fdcApiKey ? 'fdc' : 'off'),
      product?.source_url ?? null,
    ],
  );
}

function toProduct(row: CacheRow): BarcodeProduct {
  return {
    barcode: row.barcode,
    brand: row.brand,
    name: row.name ?? '',
    kcal_100g: row.kcal_100g ?? 0,
    protein_100g: row.protein_100g ?? 0,
    carbs_100g: row.carbs_100g ?? 0,
    fat_100g: row.fat_100g ?? 0,
    serving_g: row.serving_g,
    serving_desc: row.serving_desc,
    source: row.source,
    source_url: row.source_url,
  };
}

/** Removes rows nobody will read again. Both clocks, one statement. */
export async function sweepBarcodeCache(): Promise<number> {
  const gone = await query<{ barcode: string }>(
    `DELETE FROM barcode_products
      WHERE fetched_at < now() - make_interval(days => CASE WHEN found THEN $1::int ELSE $2::int END)
      RETURNING barcode`,
    [HIT_TTL_DAYS, MISS_TTL_DAYS],
  );
  return gone.length;
}

// ---- Open Food Facts ---------------------------------------------------------

/**
 * Asks for the fields we use and no others. The full document is tens of
 * kilobytes of ingredient analysis and image URLs for four numbers.
 */
const OFF_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'brands',
  'nutriments',
  'serving_size',
  'serving_quantity',
].join(',');

async function fromOpenFoodFacts(code: string): Promise<BarcodeProduct | null> {
  const url = `${OFF_URL}/${code}.json?fields=${OFF_FIELDS}`;
  const body = await fetchJson(url, { 'User-Agent': env.barcode.userAgent });
  // v2 answers a missing product with a 404 and an envelope, both of which
  // `fetchJson` reduces to null. Either way there is nothing here.
  if (!body) return null;

  const product = body.product;
  if (body.status === 0 || !product) return null;

  const n = product.nutriments ?? {};
  const kcal = offEnergy(n);
  const macros = {
    protein_100g: number(n.proteins_100g),
    carbs_100g: number(n.carbohydrates_100g),
    fat_100g: number(n.fat_100g),
  };
  const name = text(product.product_name) ?? text(product.product_name_en);
  if (!name) return null;
  if (!usable(kcal, macros)) return null;

  return {
    barcode: code,
    // `brands` is a comma-separated list on OFF and the first entry is the one
    // on the front of the packet.
    brand: text(product.brands)?.split(',')[0]?.trim() ?? null,
    name,
    kcal_100g: round(kcal!),
    protein_100g: round(macros.protein_100g!),
    carbs_100g: round(macros.carbs_100g!),
    fat_100g: round(macros.fat_100g!),
    serving_g: servingGrams(product.serving_quantity),
    serving_desc: text(product.serving_size),
    source: 'off',
    source_url: `https://world.openfoodfacts.org/product/${code}`,
  };
}

/**
 * Energy per 100g, in kcal.
 *
 * `energy-kcal_100g` is frequently absent on rows entered from an EU label,
 * which prints kilojoules first and sometimes only. Converting is the whole
 * job, and the ordering matters: an explicit kJ field is unambiguous, while
 * bare `energy_100g` has to be read together with the unit beside it, because
 * on some rows it is already kcal and dividing again would report a chocolate
 * bar as a stick of celery.
 */
function offEnergy(n: Record<string, unknown>): number | null {
  const kcal = number(n['energy-kcal_100g']);
  if (kcal !== null) return kcal;

  const kj = number(n['energy-kj_100g']);
  if (kj !== null) return kj / 4.184;

  const energy = number(n.energy_100g);
  if (energy === null) return null;
  return String(n.energy_unit ?? 'kJ').toLowerCase() === 'kcal' ? energy : energy / 4.184;
}

/**
 * The serving size in grams, when the label gave one.
 *
 * OFF stores this as a string about as often as a number, and stores an empty
 * one when the contributor left the field alone. A drink labelled in
 * millilitres comes through here too: 100ml of milk is not 100g, but the error
 * is a few percent and the alternative is refusing every liquid a shopper
 * scans.
 */
function servingGrams(raw: unknown): number | null {
  const grams = number(raw);
  if (grams === null || grams <= 0 || grams > 2000) return null;
  return round(grams);
}

// ---- USDA FoodData Central ---------------------------------------------------

/** The four nutrient numbers, as FDC identifies them on every branded food. */
const FDC_NUTRIENTS = { kcal: '208', protein: '203', fat: '204', carbs: '205' };

/**
 * The American branded shelf.
 *
 * Only consulted when OFF came back empty and a key is configured, which is
 * the right order for a European userbase and costs nothing to reverse: FDC is
 * a search endpoint rather than a lookup, so it is both slower and looser than
 * asking OFF for one code.
 */
async function fromFoodDataCentral(code: string): Promise<BarcodeProduct | null> {
  const key = env.barcode.fdcApiKey;
  if (!key) return null;

  // FDC matches the GTIN as it happens to be stored, and it is stored in
  // whichever form the brand submitted — Cheerios under the 14-digit
  // 00016000275287, a bag of tortilla chips under the 12-digit 743209235513.
  // A search for either one's *other* form returns zero hits rather than an
  // error, so a single form finds about half the shelf and reports the rest as
  // uncatalogued. `normaliseBarcode` settles on one form by design, which makes
  // that this function's problem to undo.
  //
  // So ask for every form of the same number at once: space-separated terms are
  // alternatives to FDC's search, which keeps this to one round trip. Widening
  // the question cannot widen the answer — `sameGtin` below still takes only a
  // row whose number is this number.
  const url = `${FDC_URL}?query=${encodeURIComponent(gtinForms(code))}&dataType=Branded&pageSize=10&api_key=${encodeURIComponent(key)}`;
  const body = await fetchJson(url, {});
  if (!body) return null;

  // A search, so the first hit is not necessarily *this* product. Match the
  // GTIN back, or a scan of one cereal box could return a different one.
  const foods: any[] = body.foods ?? [];
  const food = foods.find((f) => sameGtin(f?.gtinUpc, code));
  if (!food) return null;

  const nutrients = new Map<string, number>();
  for (const entry of food.foodNutrients ?? []) {
    const value = number(entry?.value);
    if (entry?.nutrientNumber && value !== null) nutrients.set(String(entry.nutrientNumber), value);
  }

  const kcal = nutrients.get(FDC_NUTRIENTS.kcal) ?? null;
  const macros = {
    protein_100g: nutrients.get(FDC_NUTRIENTS.protein) ?? null,
    carbs_100g: nutrients.get(FDC_NUTRIENTS.carbs) ?? null,
    fat_100g: nutrients.get(FDC_NUTRIENTS.fat) ?? null,
  };
  const name = text(food.description);
  if (!name || !usable(kcal, macros)) return null;

  // FDC gives a serving size with its own unit, and only grams are meaningful
  // here — a serving measured in cups cannot be multiplied against per-100g.
  const unit = String(food.servingSizeUnit ?? '').toLowerCase();
  const serving = unit === 'g' || unit === 'ml' ? servingGrams(food.servingSize) : null;

  return {
    barcode: code,
    brand: text(food.brandOwner) ?? text(food.brandName),
    name,
    kcal_100g: round(kcal!),
    protein_100g: round(macros.protein_100g!),
    carbs_100g: round(macros.carbs_100g!),
    fat_100g: round(macros.fat_100g!),
    serving_g: serving,
    serving_desc: text(food.householdServingFullText),
    source: 'fdc',
    source_url: food.fdcId ? `https://fdc.nal.usda.gov/food-details/${food.fdcId}` : null,
  };
}

/**
 * The same number written every way FDC might be holding it: padded to 14, as
 * `normaliseBarcode` left it, and stripped of leading zeros.
 *
 * Deduplicated, because for a 14-digit code that does not begin with a zero all
 * three are the same string and repeating a term buys nothing.
 */
function gtinForms(code: string): string {
  return [...new Set([code.padStart(14, '0'), code, code.replace(/^0+/, '') || code])].join(' ');
}

/** FDC stores GTINs unpadded about as often as padded. Compare as numbers. */
function sameGtin(raw: unknown, code: string): boolean {
  const gtin = String(raw ?? '').replace(/\D/g, '');
  return gtin !== '' && gtin.replace(/^0+/, '') === code.replace(/^0+/, '');
}

// ---- Shared plumbing ---------------------------------------------------------

/**
 * A row is usable only with all four figures on it.
 *
 * This is the strictest thing in the file and it is strict on purpose. A
 * crowd-sourced row carrying a name and nothing else is common, and logging it
 * as a zero-calorie food is far worse than finding nothing at all: a miss sends
 * the user to photograph the panel, which works, while a zero silently
 * subtracts a meal from the day's total and looks like a number.
 *
 * The mandatory EU panel prints all four, so a row missing one is a row someone
 * half-filled in rather than a product that genuinely lacks the figure.
 */
function usable(kcal: number | null, macros: Record<string, number | null>): boolean {
  if (kcal === null || kcal < 0 || kcal > MAX_KCAL_100G) return false;
  return Object.values(macros).every((v) => v !== null && v >= 0 && v <= 100);
}

function number(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function text(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value === '' ? null : value;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * One round trip, with the failure modes already sorted.
 *
 * A 404 is null — the catalogue answered, and the answer is "no". Anything else
 * that goes wrong throws, so that a timeout or a 502 never gets written down as
 * a product nobody has catalogued.
 */
async function fetchJson(url: string, headers: Record<string, string>): Promise<any | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(6000),
    });
  } catch (error) {
    throw new BarcodeUnavailableError((error as Error).message);
  }

  if (response.status === 404) return null;
  if (!response.ok) throw new BarcodeUnavailableError(`Catalogue replied ${response.status}`);

  try {
    return await response.json();
  } catch {
    throw new BarcodeUnavailableError('Catalogue sent something that was not JSON');
  }
}

// ---- Turning a product into a meal -------------------------------------------

/**
 * How much of it was eaten, in grams.
 *
 * The two ways of saying it stay apart all the way down to here, and the
 * conversion happens exactly once. Servings against a label that never named
 * one is refused rather than guessed: "2 servings" of an unknown quantity is
 * not a portion, and a picker that offered the option at all was already wrong.
 */
export function portionGrams(
  product: BarcodeProduct,
  portion: { grams?: number; servings?: number },
): number {
  if (portion.grams !== undefined) return portion.grams;
  if (portion.servings === undefined) throw new InvalidPortionError('Say how much of it you ate');
  if (product.serving_g === null) {
    throw new InvalidPortionError('That label does not give a serving size — say it in grams');
  }
  return round(portion.servings * product.serving_g);
}

export class InvalidPortionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPortionError';
  }
}

export interface ScanLogOptions {
  grams?: number;
  servings?: number;
  meal?: Meal;
  eatenAt?: Date;
  ctx: DayContext;
}

/**
 * The second half of a scan, and the half that is not about barcodes at all.
 *
 * A lookup is a fact about a product; this is a claim about a person, and the
 * two are kept apart right up to this call because folding them together is
 * how a scanner logs a whole jar of peanut butter as one snack. Nothing here
 * reaches the network, and nothing calls a model — the numbers were printed on
 * the packet and the amount was chosen by the user, so there is nothing left
 * to estimate.
 *
 * `confidence: 'high'`, which nothing else in the log gets by default. It is
 * earned: every other entry is a model reading a sentence or a photograph,
 * while this one is a manufacturer's own panel multiplied by a number somebody
 * typed. If it is wrong, it is wrong about the portion, not the food.
 */
export async function logScannedProduct(
  userId: string,
  product: BarcodeProduct,
  options: ScanLogOptions,
): Promise<FoodEntry> {
  const grams = portionGrams(product, options);
  const eatenAt = options.eatenAt ?? new Date();
  const share = grams / 100;

  return createFoodEntry({
    userId,
    meal: options.meal ?? inferMeal(eatenAt, options.ctx.timezone),
    eatenAt,
    description: describe(product),
    // Where the numbers came from, in the entry itself. ODbL asks for
    // attribution wherever the data is shown, and an entry read back in six
    // months is still showing it.
    note: product.source === 'off' ? 'Data from Open Food Facts' : 'Data from USDA FoodData Central',
    confidence: 'high',
    source: 'barcode',
    photoId: null,
    items: [
      {
        name: describe(product),
        quantity_g: grams,
        quantity_desc: portionDescription(product, grams, options.servings),
        kcal: round(product.kcal_100g * share),
        protein_g: round(product.protein_100g * share),
        carbs_g: round(product.carbs_100g * share),
        fat_g: round(product.fat_100g * share),
        // The diet-quality panel is deliberately left null rather than zeroed.
        // The cache carries energy and three macros and nothing else, so
        // nobody has estimated the fiber in this — which is exactly what null
        // means and exactly what a zero would deny.
      },
    ],
    ctx: options.ctx,
  });
}

/** "Ferrero Hazelnut spread", without saying Ferrero twice. */
function describe(product: BarcodeProduct): string {
  const { brand, name } = product;
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name;
  return `${brand} ${name}`;
}

/**
 * What the user actually picked, in their own terms.
 *
 * Someone who chose two servings should read "2 servings (30 g)" back rather
 * than a bare weight they never typed — the grams are the arithmetic and the
 * servings are the decision, and a correction screen is easier to use when it
 * shows the decision.
 *
 * Which is why the fractions are written as fractions. Someone who tapped ¾ and
 * reads "0.8 servings" back has been shown the arithmetic after all, and a
 * rounder one than they picked.
 */
function portionDescription(
  product: BarcodeProduct,
  grams: number,
  servings: number | undefined,
): string {
  if (servings === undefined) return `${round(grams)} g`;
  const label = product.serving_desc ? ` — ${product.serving_desc}` : '';
  // Singular for anything up to one, because "¾ servings" is not English.
  const plural = servings <= 1 ? 'serving' : 'servings';
  return `${formatServings(servings)} ${plural} (${round(grams)} g)${label}`;
}
