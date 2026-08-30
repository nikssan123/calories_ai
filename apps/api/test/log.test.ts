import { beforeEach, describe, expect, it } from 'vitest';
import {
  createExerciseEntry,
  createFoodEntry,
  deleteExerciseEntry,
  deleteFoodEntry,
  getFoodEntry,
  latestWeight,
  listExerciseEntries,
  listFoodEntries,
  listWeights,
  logWeight,
  updateFoodEntry,
} from '../src/services/log.ts';
import { insertMessage, listMessages } from '../src/services/chat.ts';
import { addMeal, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The write path. Every invariant that keeps the log honest lives here rather
 * than in the routes or the tools, so this is where it gets tested.
 */

let user: TestUser;
let other: TestUser;

beforeEach(async () => {
  user = await createUser();
  other = await createUser();
});

const ITEMS = [
  { name: 'Chicken', quantity_g: 200, quantity_desc: '~200g', kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7.2 },
  { name: 'Rice', quantity_g: 180, quantity_desc: null, kcal: 234, protein_g: 4.9, carbs_g: 50.4, fat_g: 0.5 },
];

describe('createFoodEntry', () => {
  it('totals the entry from its items', async () => {
    const entry = await createFoodEntry({
      userId: user.id,
      meal: 'lunch',
      eatenAt: new Date('2026-03-10T11:00:00Z'),
      description: 'Chicken and rice',
      confidence: 'medium',
      source: 'text',
      items: ITEMS,
      ctx: user.ctx,
    });

    expect(entry.kcal).toBeCloseTo(564, 5);
    expect(entry.protein_g).toBeCloseTo(66.9, 5);
    expect(entry.items).toHaveLength(2);
  });

  /*
   * The invariant `services/energy.ts` exists for, tested through the log
   * rather than through the pure function, because the point of putting it in
   * this module is that no caller can write around it.
   */
  it('raises an item whose calories its own macros rule out', async () => {
    const entry = await createFoodEntry({
      userId: user.id,
      meal: 'dinner',
      eatenAt: new Date('2026-03-10T18:00:00Z'),
      description: 'Creamy pasta',
      confidence: 'medium',
      source: 'text',
      // 25g of fat and 40g of carbohydrate is 433 kcal before anything else,
      // so 300 is not a low estimate — it is an impossible one.
      items: [
        { name: 'Creamy pasta', quantity_g: 350, quantity_desc: null, kcal: 300, protein_g: 12, carbs_g: 40, fat_g: 25 },
      ],
      ctx: user.ctx,
    });

    expect(entry.items[0]!.kcal).toBeCloseTo(433, 5);
    expect(entry.kcal).toBeCloseTo(433, 5);
  });

  it('leaves calories above the floor alone — macros bound energy from below only', async () => {
    const entry = await createFoodEntry({
      userId: user.id,
      meal: 'dinner',
      eatenAt: new Date('2026-03-10T18:00:00Z'),
      description: 'Gin and tonic',
      confidence: 'medium',
      source: 'text',
      // Alcohol is 7 kcal/g and lives in none of the four fields.
      items: [
        { name: 'Gin and tonic', quantity_g: 250, quantity_desc: null, kcal: 170, protein_g: 0, carbs_g: 16, fat_g: 0 },
      ],
      ctx: user.ctx,
    });

    expect(entry.kcal).toBeCloseTo(170, 5);
  });

  it('scales macros that weigh more than the food holding them', async () => {
    const entry = await createFoodEntry({
      userId: user.id,
      meal: 'snack',
      eatenAt: new Date('2026-03-10T16:00:00Z'),
      description: 'Beer sticks',
      confidence: 'medium',
      source: 'text',
      // Straight out of the production log: 70g of food carrying 73g of macros,
      // which the calorie floor waves through — it is only 16% under — while
      // the item remains something that cannot exist.
      items: [
        { name: 'Beer sticks', quantity_g: 70, quantity_desc: null, kcal: 280, protein_g: 10, carbs_g: 55, fat_g: 8 },
      ],
      ctx: user.ctx,
    });

    const item = entry.items[0]!;
    expect(item.protein_g + item.carbs_g + item.fat_g).toBeLessThanOrEqual(70.1);
  });

  it('caps calories at what that weight of food can carry', async () => {
    const entry = await createFoodEntry({
      userId: user.id,
      meal: 'snack',
      eatenAt: new Date('2026-03-10T16:00:00Z'),
      description: 'Walnuts',
      confidence: 'medium',
      source: 'text',
      // A decimal point in the wrong place. Nothing edible is denser than pure
      // fat, so 40g cannot be 2,600 kcal however the number got there — and an
      // over-count is the direction this app is measurably wrong in.
      items: [
        { name: 'Walnuts', quantity_g: 40, quantity_desc: null, kcal: 2600, protein_g: 6, carbs_g: 3, fat_g: 26 },
      ],
      ctx: user.ctx,
    });

    expect(entry.kcal).toBeCloseTo(364, 5);
  });

  it('preserves item order', async () => {
    const entry = await createFoodEntry({
      userId: user.id,
      meal: 'lunch',
      eatenAt: new Date('2026-03-10T11:00:00Z'),
      description: 'Ordered',
      confidence: 'medium',
      source: 'text',
      items: [...ITEMS].reverse(),
      ctx: user.ctx,
    });
    expect(entry.items.map((i) => i.name)).toEqual(['Rice', 'Chicken']);
  });

  it('stamps local_date from the eaten-at instant and the day boundary', async () => {
    // 01:30 Sofia belongs to the previous day at day_start_hour 4.
    const entry = await createFoodEntry({
      userId: user.id,
      meal: 'snack',
      eatenAt: new Date('2026-03-10T23:30:00Z'),
      description: 'Late snack',
      confidence: 'low',
      source: 'text',
      items: [{ name: 'Crisps', quantity_g: 50, quantity_desc: null, kcal: 260, protein_g: 3, carbs_g: 26, fat_g: 16 }],
      ctx: user.ctx,
    });
    expect(entry.local_date).toBe('2026-03-10');
  });

  it('accepts an entry with no items and totals it as zero', async () => {
    const entry = await createFoodEntry({
      userId: user.id,
      meal: 'snack',
      eatenAt: new Date('2026-03-10T11:00:00Z'),
      description: 'Black coffee',
      note: 'no calories worth logging',
      confidence: 'high',
      source: 'text',
      items: [],
      ctx: user.ctx,
    });
    expect(entry.items).toEqual([]);
    expect(entry.kcal).toBe(0);
    expect(entry.note).toBe('no calories worth logging');
  });
});

describe('listFoodEntries', () => {
  beforeEach(async () => {
    await addMeal(user, { date: '2026-03-08', kcal: 500, description: 'Older' });
    await addMeal(user, { date: '2026-03-10', kcal: 600, description: 'Newer' });
    await addMeal(other, { date: '2026-03-10', kcal: 900, description: 'Someone else' });
  });

  it('scopes to the user', async () => {
    const entries = await listFoodEntries(user.id);
    expect(entries.map((e) => e.description)).toEqual(['Older', 'Newer']);
  });

  it('filters to a single local date', async () => {
    const entries = await listFoodEntries(user.id, { localDate: '2026-03-10' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.description).toBe('Newer');
  });

  it('filters to a range', async () => {
    expect(await listFoodEntries(user.id, { from: '2026-03-09', to: '2026-03-11' })).toHaveLength(1);
    expect(await listFoodEntries(user.id, { from: '2026-03-01', to: '2026-03-31' })).toHaveLength(2);
  });

  it('honours a limit', async () => {
    expect(await listFoodEntries(user.id, { limit: 1 })).toHaveLength(1);
  });

  it('fetches a batch of ids in one round trip, and short-circuits an empty batch', async () => {
    const all = await listFoodEntries(user.id);
    const ids = all.map((e) => e.id);
    expect(await listFoodEntries(user.id, { entryIds: ids })).toHaveLength(2);
    expect(await listFoodEntries(user.id, { entryIds: [] })).toEqual([]);
  });
});

describe('getFoodEntry', () => {
  it('returns null for another user’s entry', async () => {
    const entry = await addMeal(other, { date: '2026-03-10', kcal: 500 });
    expect(await getFoodEntry(user.id, entry.id)).toBeNull();
    expect(await getFoodEntry(other.id, entry.id)).not.toBeNull();
  });
});

describe('updateFoodEntry', () => {
  it('holds the same floor a fresh entry is held to', async () => {
    const entry = await createFoodEntry({
      userId: user.id,
      meal: 'lunch',
      eatenAt: new Date('2026-03-10T11:00:00Z'),
      description: 'Chicken and rice',
      confidence: 'medium',
      source: 'text',
      items: ITEMS,
      ctx: user.ctx,
    });

    const updated = await updateFoodEntry(user.id, entry.id, {
      items: [
        { name: 'Peanut butter', quantity_g: 40, quantity_desc: null, kcal: 90, protein_g: 8, carbs_g: 7, fat_g: 25 },
      ],
      ctx: user.ctx,
    });

    expect(updated!.kcal).toBeCloseTo(285, 5);
  });

  it('replaces the item list wholesale rather than appending', async () => {
    const entry = await addMeal(user, { date: '2026-03-10', kcal: 500 });
    const updated = await updateFoodEntry(user.id, entry.id, {
      items: [{ name: 'More rice', quantity_g: 300, quantity_desc: null, kcal: 400, protein_g: 8, carbs_g: 88, fat_g: 1 }],
      ctx: user.ctx,
    });
    expect(updated!.items).toHaveLength(1);
    expect(updated!.kcal).toBe(400);
  });

  it('updates description, meal and confidence independently', async () => {
    const entry = await addMeal(user, { date: '2026-03-10', kcal: 500, meal: 'lunch' });
    const updated = await updateFoodEntry(user.id, entry.id, {
      description: 'Corrected',
      meal: 'dinner',
      confidence: 'high',
      note: 'weighed it',
      ctx: user.ctx,
    });
    expect(updated).toMatchObject({
      description: 'Corrected',
      meal: 'dinner',
      confidence: 'high',
      note: 'weighed it',
    });
    // Untouched fields survive.
    expect(updated!.kcal).toBe(500);
  });

  it('recomputes local_date when the time moves across the boundary', async () => {
    const entry = await addMeal(user, { date: '2026-03-10', kcal: 500 });
    const updated = await updateFoodEntry(user.id, entry.id, {
      eatenAt: new Date('2026-03-11T23:30:00Z'),
      ctx: user.ctx,
    });
    expect(updated!.local_date).toBe('2026-03-11');
  });

  it('returns null for an unknown or foreign entry', async () => {
    const foreign = await addMeal(other, { date: '2026-03-10', kcal: 500 });
    expect(await updateFoodEntry(user.id, foreign.id, { ctx: user.ctx })).toBeNull();
  });

  it('leaves items alone when none are supplied', async () => {
    const entry = await addMeal(user, { date: '2026-03-10', kcal: 500 });
    const updated = await updateFoodEntry(user.id, entry.id, {
      description: 'Renamed',
      ctx: user.ctx,
    });
    expect(updated!.items).toHaveLength(1);
  });
});

describe('deleteFoodEntry', () => {
  it('deletes the entry and reports whether it did', async () => {
    const entry = await addMeal(user, { date: '2026-03-10', kcal: 500 });
    expect(await deleteFoodEntry(user.id, entry.id)).toBe(true);
    expect(await deleteFoodEntry(user.id, entry.id)).toBe(false);
  });

  it('will not delete another user’s entry', async () => {
    const foreign = await addMeal(other, { date: '2026-03-10', kcal: 500 });
    expect(await deleteFoodEntry(user.id, foreign.id)).toBe(false);
    expect(await getFoodEntry(other.id, foreign.id)).not.toBeNull();
  });

  /*
   * Deleting a meal is not a turn — it happens on the day screen — so the card
   * that logged it would otherwise sit in the journal counting food nobody ate.
   * Marked here rather than in the route, because the tools delete too.
   */
  it('strikes the journal card the entry was drawn on', async () => {
    const entry = await addMeal(user, { date: '2026-03-10', kcal: 500 });
    await insertMessage(user.id, 'assistant', 'Logged.', null, null, [
      { kind: 'food_logged', entry_id: entry.id, summary: 'Logged', card: null },
    ]);

    await deleteFoodEntry(user.id, entry.id);

    const [read] = await listMessages(user.id);
    expect(read!.actions[0]!.removed).toBe(true);
  });

  it('leaves the conversation alone when there was nothing to delete', async () => {
    const foreign = await addMeal(other, { date: '2026-03-10', kcal: 500 });
    await insertMessage(other.id, 'assistant', 'Logged.', null, null, [
      { kind: 'food_logged', entry_id: foreign.id, summary: 'Logged', card: null },
    ]);

    expect(await deleteFoodEntry(user.id, foreign.id)).toBe(false);

    const [read] = await listMessages(other.id);
    expect(read!.actions[0]!.removed).toBeUndefined();
  });
});

describe('exercise entries', () => {
  const base = {
    description: '5km run',
    performedAt: new Date('2026-03-10T16:00:00Z'),
    durationMin: 28,
    kcalBurned: 310,
    confidence: 'low' as const,
    source: 'text' as const,
  };

  it('records and lists an activity', async () => {
    await createExerciseEntry({ userId: user.id, ...base, ctx: user.ctx });
    const entries = await listExerciseEntries(user.id, { localDate: '2026-03-10' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ description: '5km run', kcal_burned: 310, duration_min: 28 });
  });

  it('accepts a null duration', async () => {
    const entry = await createExerciseEntry({
      userId: user.id,
      ...base,
      durationMin: null,
      ctx: user.ctx,
    });
    expect(entry.duration_min).toBeNull();
  });

  it('filters by range and by user', async () => {
    await createExerciseEntry({ userId: user.id, ...base, ctx: user.ctx });
    await createExerciseEntry({ userId: other.id, ...base, ctx: other.ctx });
    expect(await listExerciseEntries(user.id, { from: '2026-03-01', to: '2026-03-31' })).toHaveLength(1);
    expect(await listExerciseEntries(user.id, { from: '2026-04-01' })).toHaveLength(0);
    expect(await listExerciseEntries(user.id, { to: '2026-01-01' })).toHaveLength(0);
  });

  it('deletes only its owner’s entry', async () => {
    const mine = await createExerciseEntry({ userId: user.id, ...base, ctx: user.ctx });
    expect(await deleteExerciseEntry(other.id, mine.id)).toBe(false);
    expect(await deleteExerciseEntry(user.id, mine.id)).toBe(true);
  });

  it('strikes the journal card the session was drawn on', async () => {
    const mine = await createExerciseEntry({ userId: user.id, ...base, ctx: user.ctx });
    await insertMessage(user.id, 'assistant', 'Nice run.', null, null, [
      { kind: 'exercise_logged', entry_id: mine.id, summary: '5km run', card: null },
    ]);

    await deleteExerciseEntry(user.id, mine.id);

    const [read] = await listMessages(user.id);
    expect(read!.actions[0]!.removed).toBe(true);
  });
});

describe('weight entries', () => {
  it('keeps one weigh-in per day, last write winning', async () => {
    await logWeight(user.id, 84.2, new Date('2026-03-10T07:00:00Z'), user.ctx);
    await logWeight(user.id, 83.9, new Date('2026-03-10T08:00:00Z'), user.ctx);

    const weights = await listWeights(user.id);
    expect(weights).toHaveLength(1);
    expect(weights[0]!.weight_kg).toBe(83.9);
  });

  it('returns the most recent by local date', async () => {
    await logWeight(user.id, 85, new Date('2026-03-08T07:00:00Z'), user.ctx);
    await logWeight(user.id, 84, new Date('2026-03-10T07:00:00Z'), user.ctx);
    expect((await latestWeight(user.id))!.weight_kg).toBe(84);
  });

  it('returns null when nothing has been weighed', async () => {
    expect(await latestWeight(user.id)).toBeNull();
  });

  it('filters a window and applies a limit', async () => {
    for (const [date, kg] of [['2026-03-08', 85], ['2026-03-09', 84.5], ['2026-03-10', 84]] as const) {
      await logWeight(user.id, kg, new Date(`${date}T07:00:00Z`), user.ctx);
    }
    expect(await listWeights(user.id, { from: '2026-03-09' })).toHaveLength(2);
    expect(await listWeights(user.id, { to: '2026-03-09' })).toHaveLength(2);
    expect(await listWeights(user.id, { limit: 1 })).toHaveLength(1);
  });
});
