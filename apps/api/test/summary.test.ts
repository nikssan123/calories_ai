import { beforeEach, describe, expect, it } from 'vitest';
import { buildDaySummary, buildProgress, currentLocalDate, dailyTotals } from '../src/services/summary.ts';
import { createExerciseEntry } from '../src/services/log.ts';
import { FALLBACK_TARGETS } from '../src/services/targets.ts';
import { addMeal, addWeight, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

describe('buildDaySummary', () => {
  it('reports an empty day against the fallback targets', async () => {
    const day = await buildDaySummary(user.id, '2026-03-10');
    expect(day).toMatchObject({
      local_date: '2026-03-10',
      consumed: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      burned_kcal: 0,
      net_kcal: 0,
      targets: FALLBACK_TARGETS,
      food_entries: [],
      exercise_entries: [],
      weight: null,
    });
  });

  it('totals food across entries and rounds for display', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 620.4, protein_g: 42.6, meal: 'lunch' });
    await addMeal(user, { date: '2026-03-10', kcal: 410.2, protein_g: 20.1, meal: 'dinner' });

    const day = await buildDaySummary(user.id, '2026-03-10');
    expect(day.consumed.kcal).toBe(1031);
    expect(day.consumed.protein_g).toBe(63);
    expect(day.food_entries).toHaveLength(2);
  });

  it('keeps exercise separate from food rather than netting it off', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 2000 });
    await createExerciseEntry({
      userId: user.id,
      description: '5km run',
      performedAt: new Date('2026-03-10T16:00:00Z'),
      durationMin: 28,
      kcalBurned: 300,
      confidence: 'low',
      source: 'text',
      ctx: user.ctx,
    });

    const day = await buildDaySummary(user.id, '2026-03-10');
    expect(day.consumed.kcal).toBe(2000);
    expect(day.burned_kcal).toBe(300);
    expect(day.net_kcal).toBe(1700);
  });

  it('includes the day’s weigh-in', async () => {
    await addWeight(user, '2026-03-10', 84.3);
    const day = await buildDaySummary(user.id, '2026-03-10');
    expect(day.weight).toMatchObject({ weight_kg: 84.3, local_date: '2026-03-10' });
  });

  it('uses the target that was in force on that day, not today’s', async () => {
    await setUserTargets(user, '2026-03-01', { kcal: 2100 });
    await setUserTargets(user, '2026-03-12', { kcal: 2400 });

    expect((await buildDaySummary(user.id, '2026-03-10')).targets.kcal).toBe(2100);
    expect((await buildDaySummary(user.id, '2026-03-13')).targets.kcal).toBe(2400);
  });
});

describe('currentLocalDate', () => {
  it('answers with today in the user’s own frame', async () => {
    const date = await currentLocalDate(user.ctx);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('dailyTotals', () => {
  it('groups by local date within the window', async () => {
    await addMeal(user, { date: '2026-03-09', kcal: 500 });
    await addMeal(user, { date: '2026-03-10', kcal: 600 });
    await addMeal(user, { date: '2026-03-10', kcal: 400 });
    await addMeal(user, { date: '2026-03-20', kcal: 999 });

    const totals = await dailyTotals(user.id, '2026-03-08', '2026-03-11');
    expect(totals.map((t) => [t.local_date, Number(t.kcal)])).toEqual([
      ['2026-03-09', 500],
      ['2026-03-10', 1000],
    ]);
  });
});

describe('buildProgress', () => {
  it('returns nulls rather than zeroes for an account with no history', async () => {
    const progress = await buildProgress(user.id, user.ctx, 30);
    expect(progress.calories.average_kcal).toBeNull();
    expect(progress.protein.average_g).toBeNull();
    expect(progress.weight.current_kg).toBeNull();
    expect(progress.weight.change_7d_kg).toBeNull();
    expect(progress.protein.days_logged).toBe(0);
    expect(progress.exercise.sessions).toBe(0);
    expect(progress.exercise.total_kcal).toBe(0);
    // A rest day is a real zero, so the burn series is filled rather than null.
    expect(progress.exercise.series).toHaveLength(30);
    expect(progress.exercise.series.every((p) => p.value === 0)).toBe(true);
    // Food is the opposite: no log is missing data, not a zero-calorie day.
    expect(progress.calories.series.every((p) => p.value === null)).toBe(true);
    expect(progress.protein.series.every((p) => p.value === null)).toBe(true);
  });

  it('averages only the days that were logged', async () => {
    const today = await currentLocalDate(user.ctx);
    await addMeal(user, { date: today, kcal: 2000, protein_g: 150 });

    const progress = await buildProgress(user.id, user.ctx, 30);
    // One logged day at 2,000 — the other 29 are missing data, not zeroes.
    expect(progress.calories.average_kcal).toBe(2000);
    expect(progress.protein.days_logged).toBe(1);
  });

  it('counts days that reached the protein target', async () => {
    const today = await currentLocalDate(user.ctx);
    await setUserTargets(user, today, { protein_g: 100 });
    await addMeal(user, { date: today, kcal: 1500, protein_g: 120 });

    const progress = await buildProgress(user.id, user.ctx, 30);
    expect(progress.protein.days_target_hit).toBe(1);
  });

  it('emits one series point per day in the window', async () => {
    const progress = await buildProgress(user.id, user.ctx, 7);
    expect(progress.calories.series).toHaveLength(7);
    expect(progress.weight.series).toHaveLength(7);
    expect(progress.calories.series.every((p) => p.value === null)).toBe(true);
  });

  it('tracks weight change against the target weight', async () => {
    const today = await currentLocalDate(user.ctx);
    const dayBefore = (n: number) =>
      new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

    for (let i = 13; i >= 0; i--) await addWeight(user, dayBefore(i), 85 - (13 - i) * 0.1);

    const progress = await buildProgress(user.id, user.ctx, 30);
    expect(progress.weight.current_kg).toBeCloseTo(83.7, 5);
    expect(progress.weight.change_since_start_kg).toBeCloseTo(-1.3, 5);
    expect(progress.weight.change_7d_kg).toBeLessThan(0);
    // The fixture user targets 78 kg.
    expect(progress.weight.to_target_kg).toBeCloseTo(5.7, 5);
  });

  it('rolls the weight mean over calendar days, reaching behind the window', async () => {
    const today = await currentLocalDate(user.ctx);
    const dayBefore = (n: number) =>
      new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

    // Two readings either side of a 7-day window's left edge. The first point
    // drawn is day 6, and its mean has to include day 8 — which is off the
    // chart but well inside the week behind it.
    await addWeight(user, dayBefore(8), 90);
    await addWeight(user, dayBefore(6), 88);

    const progress = await buildProgress(user.id, user.ctx, 7);
    const first = progress.weight.series[0]!;
    expect(first.local_date).toBe(dayBefore(6));
    expect(first.value).toBeCloseTo(88, 5);
    expect(first.average).toBeCloseTo(89, 5);
  });

  it('lets the weight trend fall on a day the reading rose', async () => {
    const today = await currentLocalDate(user.ctx);
    const dayBefore = (n: number) =>
      new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

    /*
     * The shape that reads as a broken chart and is not one: 89 ages out of the
     * seven-day window on the very morning 88.3 replaces 87.8 as the newest
     * reading, so the mean drops while the scale went up. Both numbers are
     * right, which is why the chart's readout carries the day's own value
     * alongside the line's.
     */
    await addWeight(user, dayBefore(9), 89);
    await addWeight(user, dayBefore(5), 87.8);
    await addWeight(user, dayBefore(2), 88.3);

    const progress = await buildProgress(user.id, user.ctx, 30);
    const byDate = new Map(progress.weight.series.map((p) => [p.local_date, p]));
    const before = byDate.get(dayBefore(3))!;
    const rise = byDate.get(dayBefore(2))!;

    expect(before.value).toBeNull();
    expect(before.average).toBeCloseTo(88.4, 5);
    expect(rise.value).toBeCloseTo(88.3, 5);
    expect(rise.average).toBeCloseTo(88.05, 5);
    expect(rise.average!).toBeLessThan(before.average!);
    // The headline is the reading, not the trend, so the two disagree on screen.
    expect(progress.weight.current_kg).toBeCloseTo(88.3, 5);
  });

  it('sums exercise across the window', async () => {
    const today = await currentLocalDate(user.ctx);
    await createExerciseEntry({
      userId: user.id,
      description: 'run',
      performedAt: new Date(`${today}T12:00:00Z`),
      durationMin: 30,
      kcalBurned: 250,
      confidence: 'low',
      source: 'text',
      ctx: user.ctx,
    });
    const progress = await buildProgress(user.id, user.ctx, 30);
    expect(progress.exercise.sessions).toBe(1);
    expect(progress.exercise.total_kcal).toBe(250);
    expect(progress.exercise.series.at(-1)).toEqual({
      local_date: today,
      value: 250,
      average: expect.any(Number),
    });
  });
});
