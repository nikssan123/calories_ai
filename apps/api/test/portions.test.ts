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
  items: [name: string, grams: number | null, kcal: number][],
) {
  const built: FoodItemInput[] = items.map(([name, grams, kcal]) => ({
    name,
    quantity_g: grams,
    quantity_desc: null,
    kcal,
    // Kept well under the Atwater floor for the kcal above, so nothing here is
    // rewritten on the way in and the medians are the numbers this test wrote.
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
    source: 'text',
    items: built,
    ctx: who.ctx,
  });
}

describe('usualPortions', () => {
  it('returns nothing for an account with no history', async () => {
    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([]);
  });

  it('ignores a food logged only once — one estimate is not a habit', async () => {
    await log(user, '2026-03-19', [['Rice', 180, 234]]);
    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([]);
  });

  it('reports the median weight and density once a food repeats', async () => {
    await log(user, '2026-03-17', [['Rice', 180, 234]]);
    await log(user, '2026-03-18', [['Rice', 200, 260]]);
    await log(user, '2026-03-19', [['Rice', 190, 247]]);

    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([
      { name: 'Rice', grams: 190, kcal_100g: 130, times: 3 },
    ]);
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

    const portions = await usualPortions(user.id, user.ctx, {}, TODAY);
    expect(portions).toHaveLength(1);
    expect(portions[0]!.times).toBe(2);
    // The most recent spelling is the one they will recognise in a list.
    expect(portions[0]!.name).toBe('greek yoghurt');
  });

  it('skips items logged without a weight rather than counting them as zero', async () => {
    await log(user, '2026-03-18', [['Black coffee', null, 2]]);
    await log(user, '2026-03-19', [['Black coffee', null, 2]]);

    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([]);
  });

  it('orders by how often they eat it, and caps the list', async () => {
    for (const date of ['2026-03-14', '2026-03-15', '2026-03-16', '2026-03-17']) {
      await log(user, date, [['Rice', 180, 234]]);
    }
    await log(user, '2026-03-18', [['Broccoli', 100, 34]]);
    await log(user, '2026-03-19', [['Broccoli', 120, 41]]);

    const portions = await usualPortions(user.id, user.ctx, {}, TODAY);
    expect(portions.map((p) => p.name)).toEqual(['Rice', 'Broccoli']);
    expect(await usualPortions(user.id, user.ctx, { limit: 1 }, TODAY)).toHaveLength(1);
  });

  it('forgets what they stopped eating', async () => {
    await log(user, '2025-11-01', [['Rice', 180, 234]]);
    await log(user, '2025-11-02', [['Rice', 200, 260]]);

    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([]);
    expect(await usualPortions(user.id, user.ctx, { daysBack: 400 }, TODAY)).toHaveLength(1);
  });

  it('never reads another account', async () => {
    await log(other, '2026-03-18', [['Rice', 180, 234]]);
    await log(other, '2026-03-19', [['Rice', 200, 260]]);

    expect(await usualPortions(user.id, user.ctx, {}, TODAY)).toEqual([]);
    expect(await usualPortions(other.id, other.ctx, {}, TODAY)).toHaveLength(1);
  });

  it('will not be talked below two logs', async () => {
    await log(user, '2026-03-19', [['Rice', 180, 234]]);
    expect(await usualPortions(user.id, user.ctx, { minTimes: 1 }, TODAY)).toEqual([]);
  });
});
