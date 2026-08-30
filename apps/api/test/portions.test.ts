import { beforeEach, describe, expect, it } from 'vitest';
import { createFoodEntry, type FoodItemInput } from '../src/services/log.ts';
import { usualPortions } from '../src/services/portions.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

/**
 * What the log knows about a person's portions.
 *
 * Every case here is about one of two questions: is this food theirs often
 * enough to speak for them, and is the number robust to the one night that was
 * not typical.
 */

let user: TestUser;
let other: TestUser;

const TODAY = '2026-03-20';

beforeEach(async () => {
  user = await createUser();
  other = await createUser();
});

/** One meal on a given day, from a bare list of name/grams/kcal triples. */
async function log(
  who: TestUser,
  date: string,
  items: [name: string, grams: number | null, kcal: number, canonical?: string | null][],
  options: { source?: 'text' | 'manual' | 'barcode' } = {},
) {
  const built: FoodItemInput[] = items.map(([name, grams, kcal, canonical]) => ({
    name,
    canonical: canonical ?? null,
    quantity_g: grams,
    quantity_desc: null,
    kcal,
    // Kept well under the Atwater floor for the kcal above and light enough to
    // fit inside the grams, so nothing here is rewritten on the way in and the
    // medians are the numbers this test wrote.
    protein_g: 1,
    carbs_g: 1,
    fat_g: 1,
  }));
  return createFoodEntry({
    userId: who.id,
    meal: 'dinner',
    eatenAt: new Date(`${date}T12:00:00Z`),
    description: 'Dinner',
    confidence: 'medium',
    source: options.source ?? 'text',
    items: built,
    ctx: who.ctx,
  });
}

/**
 * The same meal, but with the weight settled by the person rather than guessed.
 *
 * `source: 'manual'` is the cheapest of the three ways an observation earns
 * that — the other two are a scanned packet and an entry somebody came back and
 * corrected, which `updateFoodEntry` marks by rewriting the item rows.
 */
const logConfirmed = (
  who: TestUser,
  date: string,
  items: [name: string, grams: number | null, kcal: number, canonical?: string | null][],
) => log(who, date, items, { source: 'manual' });

describe('usualPortions', () => {
  it('returns nothing for an account with no history', async () => {
    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([]);
  });

  it('ignores a food the model guessed at twice — that is not a habit, it is an echo', async () => {
    // The failure this whole weighting exists to stop. Two model estimates are
    // not evidence about the person; handing them back as "their usual" is the
    // app quoting itself.
    await log(user, '2026-03-18', [['Rice', 180, 234]]);
    await log(user, '2026-03-19', [['Rice', 200, 260]]);

    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([]);
  });

  it('reports the median weight and density once a food repeats three times', async () => {
    await log(user, '2026-03-17', [['Rice', 180, 234]]);
    await log(user, '2026-03-18', [['Rice', 200, 260]]);
    await log(user, '2026-03-19', [['Rice', 190, 247]]);

    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([
      { name: 'Rice', grams: 190, kcal_100g: 130, times: 3, confirmed: false },
    ]);
  });

  it('takes one weight they set themselves over any number of guesses', async () => {
    await logConfirmed(user, '2026-03-19', [['Rice', 180, 234]]);

    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([
      { name: 'Rice', grams: 180, kcal_100g: 130, times: 1, confirmed: true },
    ]);
  });

  it('says which portions they set, because the model should defer to those differently', async () => {
    await logConfirmed(user, '2026-03-18', [['Rice', 180, 234]]);
    await log(user, '2026-03-17', [['Broccoli', 100, 34]]);
    await log(user, '2026-03-18', [['Broccoli', 110, 37]]);
    await log(user, '2026-03-19', [['Broccoli', 120, 41]]);

    const byName = Object.fromEntries(
      (await usualPortions(user.id, user.ctx, {}, TODAY)).map((p) => [p.name, p.confirmed]),
    );
    expect(byName).toEqual({ Rice: true, Broccoli: false });
  });

  it('lets a weight they set outvote the guesses around it', async () => {
    // Two estimates at 300g and one correction at 180g. Counted flat the median
    // is 300 — the model's own reading, carried by repetition alone. Weighted,
    // the number they actually settled is three observations and wins.
    await log(user, '2026-03-16', [['Rice', 300, 390]]);
    await log(user, '2026-03-17', [['Rice', 300, 390]]);
    await logConfirmed(user, '2026-03-18', [['Rice', 180, 234]]);

    const [rice] = await usualPortions(user.id, user.ctx, {}, TODAY);
    expect(rice!.grams).toBe(180);
  });

  it('does not let one correction erase everything else they have logged', async () => {
    // The other side of the same weighting, and the reason it is a weight
    // rather than an override: three estimates against one correction is an
    // even split, and the median lands between them. A person who fixes one
    // dinner has not told the app the other three never happened.
    await log(user, '2026-03-15', [['Rice', 300, 390]]);
    await log(user, '2026-03-16', [['Rice', 300, 390]]);
    await log(user, '2026-03-17', [['Rice', 300, 390]]);
    await logConfirmed(user, '2026-03-18', [['Rice', 180, 234]]);

    const [rice] = await usualPortions(user.id, user.ctx, {}, TODAY);
    expect(rice!.grams).toBe(240);
  });

  it('is unmoved by the one night that was not typical', async () => {
    await log(user, '2026-03-15', [['Rice', 180, 234]]);
    await log(user, '2026-03-16', [['Rice', 190, 247]]);
    await log(user, '2026-03-17', [['Rice', 185, 240]]);
    // A holiday dinner, or a typo. A mean would report ~330g as their usual.
    await log(user, '2026-03-18', [['Rice', 900, 1170]]);

    const [rice] = await usualPortions(user.id, user.ctx, {}, TODAY);
    expect(rice!.grams).toBe(188);
  });

  it('treats spelling and spacing as spelling, not as two foods', async () => {
    await log(user, '2026-03-17', [['Greek  yoghurt', 150, 90]]);
    await log(user, '2026-03-18', [['greek yoghurt ', 170, 102]]);
    await log(user, '2026-03-19', [['GREEK YOGHURT', 160, 96]]);

    const portions = await usualPortions(user.id, user.ctx, {}, TODAY);
    expect(portions).toHaveLength(1);
    expect(portions[0]!.times).toBe(3);
  });

  /*
   * The name is what the model reads, and it has to survive the trip.
   *
   * This is a regression test with a specific shape: the tidying regex is
   * written inside a template literal, where `\s` is not an escape JavaScript
   * knows and collapses to a bare `s` — so the pattern reaches Postgres as
   * `s+` and replaces every run of the letter with a space. Every fixture in
   * the original suite happened to be free of a lowercase s, so the whole thing
   * passed while 26% of production food names arrived at the model as
   * "chicken brea t".
   */
  it('shows the food under the name they used, letters and all', async () => {
    await logConfirmed(user, '2026-03-19', [['Chicken  breast', 200, 330]]);

    const [chicken] = await usualPortions(user.id, user.ctx, {}, TODAY);
    expect(chicken!.name).toBe('Chicken breast');
  });

  it('uses the most recent spelling, which is the one they will recognise', async () => {
    await log(user, '2026-03-17', [['Greek yoghurt', 150, 90]]);
    await log(user, '2026-03-18', [['greek yoghurt', 170, 102]]);
    await log(user, '2026-03-19', [['GREEK yoghurt', 160, 96]]);

    expect((await usualPortions(user.id, user.ctx, {}, TODAY))[0]!.name).toBe('GREEK yoghurt');
  });

  /*
   * Cross-language and cross-spelling merging, which on real accounts is the
   * difference between having a portion for a food and not. One production
   * account logs tomato as "домати", "домат" and "tomato": ten observations of
   * one portion, split three ways, none of them reaching the threshold.
   */
  describe('the canonical key', () => {
    it('collects one food logged under several names', async () => {
      await log(user, '2026-03-17', [['домати', 90, 18, 'tomato']]);
      await log(user, '2026-03-18', [['домат', 100, 20, 'tomato']]);
      await log(user, '2026-03-19', [['Tomato', 110, 22, 'tomato']]);

      const portions = await usualPortions(user.id, user.ctx, {}, TODAY);
      expect(portions).toHaveLength(1);
      expect(portions[0]).toMatchObject({ name: 'Tomato', grams: 100, times: 3 });
    });

    it('pulls in the history logged before anybody said what the food was', async () => {
      // The whole reason the lexicon exists. Without it the column would only
      // start helping ninety days from now, once the unkeyed history aged out.
      await log(user, '2026-03-15', [['домати', 90, 18]]);
      await log(user, '2026-03-16', [['домати', 100, 20]]);
      await log(user, '2026-03-17', [['домати', 110, 22, 'tomato']]);
      await log(user, '2026-03-18', [['tomato', 120, 24, 'tomato']]);

      const portions = await usualPortions(user.id, user.ctx, {}, TODAY);
      expect(portions).toHaveLength(1);
      expect(portions[0]!.times).toBe(4);
    });

    it('keeps two genuinely different foods apart', async () => {
      await logConfirmed(user, '2026-03-17', [['Chicken breast', 200, 330, 'chicken breast']]);
      await logConfirmed(user, '2026-03-18', [['Chicken thigh', 150, 320, 'chicken thigh']]);

      const portions = await usualPortions(user.id, user.ctx, {}, TODAY);
      expect(portions.map((p) => p.name).sort()).toEqual(['Chicken breast', 'Chicken thigh']);
    });

    it('is not fooled by the case or spacing somebody typed it in', async () => {
      await log(user, '2026-03-17', [['домати', 90, 18, ' Tomato ']]);
      await log(user, '2026-03-18', [['tomato', 100, 20, 'tomato']]);
      await log(user, '2026-03-19', [['Tomatoes', 110, 22, 'TOMATO']]);

      expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toHaveLength(1);
    });
  });

  it('skips items logged without a weight rather than counting them as zero', async () => {
    await log(user, '2026-03-17', [['Black coffee', null, 2]]);
    await log(user, '2026-03-18', [['Black coffee', null, 2]]);
    await log(user, '2026-03-19', [['Black coffee', null, 2]]);

    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([]);
  });

  /*
   * The cap binds on real accounts — one production user has fourteen foods
   * qualifying for twelve slots — so what fills it is a real decision. Ordering
   * by frequency spends slots on the ketchup; ordering by the calories the food
   * actually accounts for spends them where a 36% portion error becomes a
   * number somebody's deficit depends on.
   */
  it('spends its slots on the foods that carry the calories', async () => {
    for (const date of ['2026-03-14', '2026-03-15', '2026-03-16', '2026-03-17', '2026-03-18']) {
      await log(user, date, [['Ketchup', 20, 20]]);
    }
    await log(user, '2026-03-17', [['Rice', 180, 234]]);
    await log(user, '2026-03-18', [['Rice', 190, 247]]);
    await log(user, '2026-03-19', [['Rice', 200, 260]]);

    const portions = await usualPortions(user.id, user.ctx, {}, TODAY);
    expect(portions.map((p) => p.name)).toEqual(['Rice', 'Ketchup']);
    expect(await usualPortions(user.id, user.ctx, { limit: 1 }, TODAY)).toHaveLength(1);
  });

  it('forgets what they stopped eating', async () => {
    await logConfirmed(user, '2025-11-01', [['Rice', 180, 234]]);

    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([]);
    expect(await usualPortions(user.id, user.ctx, { daysBack: 400 }, TODAY)).toHaveLength(1);
  });

  it('never reads another account', async () => {
    await logConfirmed(other, '2026-03-19', [['Rice', 180, 234]]);

    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([]);
    expect(await usualPortions(other.id, other.ctx, {}, TODAY)).toHaveLength(1);
  });

  it('will not be talked below the evidence it needs', async () => {
    await log(user, '2026-03-19', [['Rice', 180, 234]]);
    expect(await usualPortions(user.id, user.ctx, { minEvidence: 1 }, TODAY)).toEqual([]);
  });
});
