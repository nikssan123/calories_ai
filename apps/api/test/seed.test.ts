import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../src/db.ts';
import { clearUserData, DEFAULT_SEED_DAYS, main, seedHistory } from '../src/seed.ts';
import { insertMessage } from '../src/services/chat.ts';
import { listFoodEntries, listWeights } from '../src/services/log.ts';
import { addMeal, countRows, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The demo-data generator. It is also the fixture behind the adaptive tests, so
 * it is worth knowing it produces the shape it claims to.
 */

const NOW = new Date('2026-03-15T12:00:00Z');
/** Deterministic jitter, so a seeded window is reproducible. */
const fixedRandom = () => 0.5;

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

describe('seedHistory', () => {
  it('writes a day’s meals and a weigh-in for every day', async () => {
    await seedHistory(user.id, user.ctx, { days: 3, now: NOW, random: fixedRandom });

    // Four meals a day: breakfast, lunch, dinner, snack.
    expect(await countRows('food_entries', user.id)).toBe(12);
    expect(await listWeights(user.id)).toHaveLength(3);
  });

  it('ends yesterday, never today', async () => {
    await seedHistory(user.id, user.ctx, { days: 3, now: NOW, random: fixedRandom });
    const dates = (await listFoodEntries(user.id)).map((e) => e.local_date);
    expect(new Set(dates)).toEqual(new Set(['2026-03-12', '2026-03-13', '2026-03-14']));
  });

  it('trends the weight downward across the window', async () => {
    await seedHistory(user.id, user.ctx, {
      days: 10,
      now: NOW,
      random: fixedRandom,
      startWeightKg: 90,
    });
    const weights = await listWeights(user.id);
    expect(weights[0]!.weight_kg).toBeGreaterThan(weights.at(-1)!.weight_kg);
    expect(weights[0]!.weight_kg).toBeCloseTo(90, 0);
  });

  it('logs exercise on roughly half the days', async () => {
    await seedHistory(user.id, user.ctx, { days: 10, now: NOW, random: fixedRandom });
    expect(await countRows('exercise_entries', user.id)).toBe(5);
  });

  it('varies confidence so the day-weighting has something to bite on', async () => {
    await seedHistory(user.id, user.ctx, { days: 2, now: NOW, random: fixedRandom });
    const confidences = new Set((await listFoodEntries(user.id)).map((e) => e.confidence));
    expect(confidences).toEqual(new Set(['high', 'medium', 'low']));
  });

  it('defaults to three weeks', async () => {
    expect(DEFAULT_SEED_DAYS).toBe(21);
  });
});

describe('clearUserData', () => {
  it('removes the log but leaves the account', async () => {
    await seedHistory(user.id, user.ctx, { days: 2, now: NOW, random: fixedRandom });
    await insertMessage(user.id, 'user', 'hello');

    await clearUserData(user.id);

    expect(await countRows('food_entries', user.id)).toBe(0);
    expect(await countRows('exercise_entries', user.id)).toBe(0);
    expect(await countRows('weight_entries', user.id)).toBe(0);
    expect(await countRows('chat_messages', user.id)).toBe(0);
    // Items cascade from their entries.
    expect(await query('SELECT * FROM food_items')).toEqual([]);
    expect(await query('SELECT id FROM users WHERE id = $1', [user.id])).toHaveLength(1);
  });
});

describe('the CLI', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('refuses to overwrite existing data without --reset', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 500 });
    await main(['node', 'seed.ts', `--email=${user.email}`]);
    expect(await countRows('food_entries', user.id)).toBe(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--reset'));
  });

  it('seeds the named account', async () => {
    await main(['node', 'seed.ts', `--email=${user.email}`]);
    expect(await countRows('food_entries', user.id)).toBe(DEFAULT_SEED_DAYS * 4);
  });

  it('replaces existing data when asked to reset', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 500, description: 'Old' });
    await main(['node', 'seed.ts', `--email=${user.email}`, '--reset']);

    const descriptions = (await listFoodEntries(user.id, { limit: 999 })).map((e) => e.description);
    expect(descriptions).not.toContain('Old');
    expect(await countRows('food_entries', user.id)).toBe(DEFAULT_SEED_DAYS * 4);
  });

  it('seeds the only account when no email is given', async () => {
    await query('DELETE FROM users WHERE id <> $1', [user.id]);
    await main(['node', 'seed.ts']);
    expect(await countRows('food_entries', user.id)).toBeGreaterThan(0);
  });

  it('complains when the named account does not exist', async () => {
    await expect(main(['node', 'seed.ts', '--email=nobody@example.com'])).rejects.toThrow(
      /nobody@example.com/,
    );
  });

  it('complains when there are no accounts at all', async () => {
    await query('DELETE FROM users');
    await expect(main(['node', 'seed.ts'])).rejects.toThrow(/No users yet/);
  });
});
