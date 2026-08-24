import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildFullReviewStats,
  buildReviewStats,
  latestReview,
  listReviews,
  reviewCard,
  reviewForWeek,
  reviewWeekFor,
  saveReview,
} from '../src/services/reviews.ts';
import { createExerciseEntry } from '../src/services/log.ts';
import {
  addMeal,
  addWeight,
  createUser,
  setUserTargets,
  type TestUser,
} from './helpers/factories.ts';

/**
 * The deterministic half of a weekly review. If these numbers are wrong the
 * model will faithfully repeat them, which is worse than saying nothing.
 */

const MONDAY = '2026-03-16'; // the day a review is generated
const WEEK = { start: '2026-03-09', end: '2026-03-15' };

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2000, protein_g: 150 });
});

describe('reviewWeekFor', () => {
  it('covers the seven days ending yesterday', () => {
    expect(reviewWeekFor(MONDAY)).toEqual(WEEK);
  });

  it('lines up on Monday–Sunday when run on a Monday', () => {
    const { start, end } = reviewWeekFor('2026-03-16');
    expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${end}T00:00:00Z`).getUTCDay()).toBe(0);
  });
});

describe('buildReviewStats', () => {
  it('reports an empty week without pretending it was a zero-calorie one', async () => {
    const stats = await buildReviewStats(user.id, WEEK);
    expect(stats).toMatchObject({
      week_start: WEEK.start,
      week_end: WEEK.end,
      days_logged: 0,
      mean_kcal: null,
      mean_protein_g: null,
      days_on_target: 0,
      weight_change_kg: null,
      exercise_sessions: 0,
      top_foods: [],
      highest_day: null,
      lowest_day: null,
    });
  });

  it('averages only the logged days', async () => {
    await addMeal(user, { date: '2026-03-09', kcal: 1800, protein_g: 140 });
    await addMeal(user, { date: '2026-03-11', kcal: 2200, protein_g: 160 });

    const stats = await buildReviewStats(user.id, WEEK);
    expect(stats.days_logged).toBe(2);
    expect(stats.mean_kcal).toBe(2000);
    expect(stats.mean_protein_g).toBe(150);
  });

  it('counts days inside a 10% band as on target', async () => {
    await addMeal(user, { date: '2026-03-09', kcal: 2000 }); // exact
    await addMeal(user, { date: '2026-03-10', kcal: 2150 }); // within 10%
    await addMeal(user, { date: '2026-03-11', kcal: 2600 }); // over

    const stats = await buildReviewStats(user.id, WEEK);
    expect(stats.days_on_target).toBe(2);
  });

  it('counts days that reached the protein target', async () => {
    await addMeal(user, { date: '2026-03-09', kcal: 1800, protein_g: 160 });
    await addMeal(user, { date: '2026-03-10', kcal: 1800, protein_g: 100 });
    expect((await buildReviewStats(user.id, WEEK)).days_protein_hit).toBe(1);
  });

  it('carries every logged day, in order, and only the logged ones', async () => {
    await addMeal(user, { date: '2026-03-11', kcal: 2200, protein_g: 160 });
    await addMeal(user, { date: '2026-03-09', kcal: 1800, protein_g: 140 });

    // The gaps are the point: the strip in the email and the card in the
    // journal are both drawn by walking the seven dates and finding nothing
    // for the days nobody logged, so an empty day must not arrive as a zero.
    expect((await buildReviewStats(user.id, WEEK)).days).toEqual([
      { local_date: '2026-03-09', kcal: 1800, protein_g: 140 },
      { local_date: '2026-03-11', kcal: 2200, protein_g: 160 },
    ]);
  });

  it('picks out the highest and lowest days', async () => {
    await addMeal(user, { date: '2026-03-09', kcal: 1500 });
    await addMeal(user, { date: '2026-03-14', kcal: 3100 });

    const stats = await buildReviewStats(user.id, WEEK);
    expect(stats.highest_day).toEqual({ local_date: '2026-03-14', kcal: 3100 });
    expect(stats.lowest_day).toEqual({ local_date: '2026-03-09', kcal: 1500 });
  });

  it('compares against the week before', async () => {
    await addMeal(user, { date: '2026-03-03', kcal: 2400 });
    await addMeal(user, { date: '2026-03-05', kcal: 2400 });
    await addMeal(user, { date: '2026-03-10', kcal: 1900 });

    const stats = await buildReviewStats(user.id, WEEK);
    expect(stats.previous_mean_kcal).toBe(2400);
    expect(stats.previous_days_logged).toBe(2);
  });

  it('measures weight from the first and last weigh-in inside the week', async () => {
    await addWeight(user, '2026-03-02', 90); // before the week — must not count
    await addWeight(user, '2026-03-09', 85);
    await addWeight(user, '2026-03-15', 84.4);

    const stats = await buildReviewStats(user.id, WEEK);
    expect(stats.weight_start_kg).toBe(85);
    expect(stats.weight_end_kg).toBe(84.4);
    expect(stats.weight_change_kg).toBeCloseTo(-0.6, 5);
  });

  it('lists repeated foods, ignoring one-offs and case', async () => {
    await addMeal(user, { date: '2026-03-09', kcal: 500, description: 'Porridge' });
    await addMeal(user, { date: '2026-03-10', kcal: 500, description: 'porridge' });
    await addMeal(user, { date: '2026-03-11', kcal: 900, description: 'Steak' });

    const stats = await buildReviewStats(user.id, WEEK);
    expect(stats.top_foods).toEqual([{ name: expect.stringMatching(/porridge/i), times: 2, kcal: 1000 }]);
  });

  it('sums the week’s exercise', async () => {
    await createExerciseEntry({
      userId: user.id,
      description: '5km run',
      performedAt: new Date('2026-03-10T16:00:00Z'),
      durationMin: 28,
      kcalBurned: 310,
      confidence: 'low',
      source: 'text',
      ctx: user.ctx,
    });
    const stats = await buildReviewStats(user.id, WEEK);
    expect(stats).toMatchObject({ exercise_sessions: 1, exercise_kcal: 310 });
  });

  it('carries the adaptive proposal through untouched', async () => {
    const stats = await buildReviewStats(user.id, WEEK, {
      eligible: false,
      blocked_by: 'custom_targets',
      estimate: null,
      current: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, is_custom: true, source: 'manual' },
      proposed: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, is_custom: true, source: 'manual' },
      delta_kcal: 0,
      explanation: 'left alone',
    });
    expect(stats.adaptive!.blocked_by).toBe('custom_targets');
  });
});

describe('buildFullReviewStats', () => {
  it('bundles the week with an adaptive proposal', async () => {
    const { week, stats } = await buildFullReviewStats(user.id, user.ctx, MONDAY);
    expect(week).toEqual(WEEK);
    expect(stats.adaptive).not.toBeNull();
    expect(stats.adaptive!.eligible).toBe(false);
  });
});

describe('persistence', () => {
  const stats = (weekStart: string) => ({
    week_start: weekStart,
    week_end: '2026-03-15',
    days_logged: 5,
    mean_kcal: 2100,
    mean_protein_g: 150,
    target_kcal: 2000,
    target_protein_g: 150,
    days_on_target: 3,
    days_protein_hit: 4,
    days: [],
    previous_mean_kcal: null,
    previous_days_logged: 0,
    weight_start_kg: null,
    weight_end_kg: null,
    weight_change_kg: null,
    exercise_sessions: 0,
    exercise_kcal: 0,
    top_foods: [],
    highest_day: null,
    lowest_day: null,
    adaptive: null,
  });

  it('round-trips a review, JSON stats and all', async () => {
    const saved = await saveReview(user.id, stats(WEEK.start), 'A solid week.', null);
    expect(saved.content).toBe('A solid week.');
    expect(saved.stats.mean_kcal).toBe(2100);

    expect((await reviewForWeek(user.id, WEEK.start))!.id).toBe(saved.id);
    expect(await reviewForWeek(user.id, '2026-01-01')).toBeNull();
  });

  it('replaces rather than duplicating when a week is regenerated', async () => {
    await saveReview(user.id, stats(WEEK.start), 'First take.', null);
    const second = await saveReview(user.id, stats(WEEK.start), 'Second take.', null);

    expect(await listReviews(user.id)).toHaveLength(1);
    expect(second.content).toBe('Second take.');
  });

  it('lists newest first and finds the latest', async () => {
    await saveReview(user.id, stats('2026-03-02'), 'Older.', null);
    await saveReview(user.id, stats('2026-03-09'), 'Newer.', null);

    expect((await listReviews(user.id)).map((r) => r.content)).toEqual(['Newer.', 'Older.']);
    expect((await latestReview(user.id))!.content).toBe('Newer.');
  });

  it('returns null when there is no review yet', async () => {
    expect(await latestReview(user.id)).toBeNull();
  });

  it('honours a limit and caps it at a year', async () => {
    await saveReview(user.id, stats('2026-03-02'), 'A', null);
    await saveReview(user.id, stats('2026-03-09'), 'B', null);
    expect(await listReviews(user.id, 1)).toHaveLength(1);
    expect(await listReviews(user.id, 999)).toHaveLength(2);
  });

  it('never returns another account’s reviews', async () => {
    const other = await createUser();
    await saveReview(other.id, stats(WEEK.start), 'Theirs.', null);
    expect(await listReviews(user.id)).toEqual([]);
  });
});

describe('reviewCard', () => {
  it('projects the stats the journal draws, and drops the rest', async () => {
    await addMeal(user, { date: '2026-03-09', kcal: 1800, protein_g: 140 });
    const stats = await buildReviewStats(user.id, WEEK);

    expect(reviewCard(stats)).toMatchObject({
      type: 'review',
      week_start: WEEK.start,
      week_end: WEEK.end,
      days_logged: 1,
      target_kcal: 2000,
      days: [{ local_date: '2026-03-09', kcal: 1800 }],
      target_change: null,
    });
  });

  it('shows a target change only when the pass actually made one', async () => {
    const stats = await buildReviewStats(user.id, WEEK);
    const proposal = {
      blocked_by: null,
      estimate: null,
      current: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 66, is_custom: false, source: 'calculated' as const },
      proposed: { kcal: 2120, protein_g: 150, carbs_g: 215, fat_g: 70, is_custom: false, source: 'adaptive' as const },
      delta_kcal: 120,
      explanation: 'Six weeks of data put maintenance higher than we assumed.',
    };

    // A blocked proposal is a *reason a target did not move*. Drawing it as an
    // arrow between two numbers would announce a change that never happened.
    expect(reviewCard({ ...stats, adaptive: { ...proposal, eligible: false } })).toMatchObject({
      target_change: null,
    });

    expect(reviewCard({ ...stats, adaptive: { ...proposal, eligible: true } })).toMatchObject({
      target_change: {
        from_kcal: 2000,
        to_kcal: 2120,
        explanation: 'Six weeks of data put maintenance higher than we assumed.',
      },
    });
  });
});
