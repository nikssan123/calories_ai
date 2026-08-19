import { beforeEach, describe, expect, it } from 'vitest';
import { mealTemplates, repeatFoodEntry } from '../src/services/history.ts';
import { getFoodEntry } from '../src/services/log.ts';
import { addMeal, createUser, type TestUser } from './helpers/factories.ts';

/**
 * Repeat-a-meal. The list is "the things you eat", not "the last things you
 * ate" — collapsing by description is the whole point, so most of these are
 * about that collapse behaving.
 */

const TODAY = '2026-03-15';

let user: TestUser;
let other: TestUser;

beforeEach(async () => {
  user = await createUser();
  other = await createUser();
});

describe('mealTemplates', () => {
  it('collapses repeats and counts them', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 500, description: 'Porridge', meal: 'breakfast' });
    await addMeal(user, { date: '2026-03-12', kcal: 520, description: 'Porridge', meal: 'breakfast' });
    await addMeal(user, { date: '2026-03-13', kcal: 700, description: 'Curry', meal: 'dinner' });

    const templates = await mealTemplates(user.id, user.ctx, {}, TODAY);
    expect(templates).toHaveLength(2);
    expect(templates[0]).toMatchObject({ description: 'Porridge', times: 2, meal: 'breakfast' });
    expect(templates[1]).toMatchObject({ description: 'Curry', times: 1 });
  });

  it('carries the most recent version’s numbers, not the first', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 500, description: 'Porridge' });
    await addMeal(user, { date: '2026-03-12', kcal: 800, description: 'Porridge' });

    const [template] = await mealTemplates(user.id, user.ctx, {}, TODAY);
    expect(template!.kcal).toBe(800);
    expect(template!.items[0]!.name).toBe('Porridge');
  });

  it('ignores case when deciding what counts as the same meal', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 500, description: 'porridge' });
    await addMeal(user, { date: '2026-03-12', kcal: 500, description: 'Porridge' });
    expect(await mealTemplates(user.id, user.ctx, {}, TODAY)).toHaveLength(1);
  });

  it('ranks by frequency, then by recency', async () => {
    await addMeal(user, { date: '2026-03-01', kcal: 400, description: 'Twice' });
    await addMeal(user, { date: '2026-03-02', kcal: 400, description: 'Twice' });
    await addMeal(user, { date: '2026-03-14', kcal: 400, description: 'Once, recent' });

    const templates = await mealTemplates(user.id, user.ctx, {}, TODAY);
    expect(templates.map((t) => t.description)).toEqual(['Twice', 'Once, recent']);
  });

  it('filters by meal slot', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 500, description: 'Porridge', meal: 'breakfast' });
    await addMeal(user, { date: '2026-03-10', kcal: 700, description: 'Curry', meal: 'dinner' });

    const templates = await mealTemplates(user.id, user.ctx, { meal: 'dinner' }, TODAY);
    expect(templates.map((t) => t.description)).toEqual(['Curry']);
  });

  it('matches a query against the description or an item name', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 500, description: 'Chicken salad' });
    await addMeal(user, { date: '2026-03-11', kcal: 700, description: 'Curry' });

    expect(await mealTemplates(user.id, user.ctx, { query: 'chick' }, TODAY)).toHaveLength(1);
    expect(await mealTemplates(user.id, user.ctx, { query: 'zzz' }, TODAY)).toHaveLength(0);
  });

  it('respects the window and the limit', async () => {
    await addMeal(user, { date: '2025-11-01', kcal: 500, description: 'Ancient' });
    await addMeal(user, { date: '2026-03-10', kcal: 500, description: 'Recent' });

    expect((await mealTemplates(user.id, user.ctx, { daysBack: 30 }, TODAY)).map((t) => t.description))
      .toEqual(['Recent']);
    expect(await mealTemplates(user.id, user.ctx, { limit: 1 }, TODAY)).toHaveLength(1);
  });

  it('never shows another account’s meals', async () => {
    await addMeal(other, { date: '2026-03-10', kcal: 500, description: 'Theirs' });
    expect(await mealTemplates(user.id, user.ctx, {}, TODAY)).toEqual([]);
  });
});

describe('repeatFoodEntry', () => {
  it('clones the items to a new independent entry', async () => {
    const source = await addMeal(user, { date: '2026-03-10', kcal: 620, description: 'Porridge' });
    const eatenAt = new Date('2026-03-15T07:30:00Z');

    const copy = await repeatFoodEntry(user.id, source.id, user.ctx, { eatenAt });

    expect(copy!.id).not.toBe(source.id);
    expect(copy!.description).toBe('Porridge');
    expect(copy!.kcal).toBe(620);
    expect(copy!.local_date).toBe('2026-03-15');
    // Independent rows: the originals are untouched by the copy existing.
    expect(copy!.items[0]!.id).not.toBe(source.items[0]!.id);
    expect((await getFoodEntry(user.id, source.id))!.kcal).toBe(620);
  });

  it('marks the copy as a quick log', async () => {
    const source = await addMeal(user, { date: '2026-03-10', kcal: 620 });
    const copy = await repeatFoodEntry(user.id, source.id, user.ctx);
    expect(copy!.source).toBe('quick');
  });

  it('carries the original confidence, since the estimate is the same one', async () => {
    const source = await addMeal(user, { date: '2026-03-10', kcal: 620, confidence: 'low' });
    const copy = await repeatFoodEntry(user.id, source.id, user.ctx);
    expect(copy!.confidence).toBe('low');
  });

  it('does not carry the original photo, which is of a different plate', async () => {
    const source = await addMeal(user, { date: '2026-03-10', kcal: 620 });
    const copy = await repeatFoodEntry(user.id, source.id, user.ctx);
    expect(copy!.photo_id).toBeNull();
  });

  it('infers the meal slot from the time unless told otherwise', async () => {
    const source = await addMeal(user, { date: '2026-03-10', kcal: 620, meal: 'dinner' });

    // 07:30 Sofia is breakfast, whatever the original was.
    const inferred = await repeatFoodEntry(user.id, source.id, user.ctx, {
      eatenAt: new Date('2026-03-15T05:30:00Z'),
    });
    expect(inferred!.meal).toBe('breakfast');

    const explicit = await repeatFoodEntry(user.id, source.id, user.ctx, {
      meal: 'snack',
      eatenAt: new Date('2026-03-15T05:30:00Z'),
    });
    expect(explicit!.meal).toBe('snack');
  });

  it('defaults to now when no time is given', async () => {
    const source = await addMeal(user, { date: '2026-03-10', kcal: 620 });
    const copy = await repeatFoodEntry(user.id, source.id, user.ctx);
    expect(Date.parse(copy!.eaten_at)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('returns null for an unknown or foreign entry', async () => {
    const foreign = await addMeal(other, { date: '2026-03-10', kcal: 620 });
    expect(await repeatFoodEntry(user.id, foreign.id, user.ctx)).toBeNull();
    expect(
      await repeatFoodEntry(user.id, '00000000-0000-0000-0000-000000000000', user.ctx),
    ).toBeNull();
  });
});
