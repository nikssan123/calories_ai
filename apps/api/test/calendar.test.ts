import { beforeEach, describe, expect, it } from 'vitest';
import { buildCalendar, buildExerciseSummary } from '../src/services/calendar.ts';
import { createExerciseEntry } from '../src/services/log.ts';
import { currentLocalDate } from '../src/services/summary.ts';
import { addDays } from '../src/time.ts';
import {
  addMeal,
  addWeight,
  createUser,
  setUserTargets,
  type TestUser,
} from './helpers/factories.ts';

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

async function addSession(
  date: string,
  spec: { kcal: number; distanceKm?: number | null; durationMin?: number | null } ,
) {
  return createExerciseEntry({
    userId: user.id,
    description: `session on ${date}`,
    performedAt: new Date(`${date}T12:00:00Z`),
    durationMin: spec.durationMin ?? null,
    distanceKm: spec.distanceKm ?? null,
    kcalBurned: spec.kcal,
    confidence: 'low',
    source: 'text',
    ctx: user.ctx,
  });
}

describe('buildCalendar', () => {
  it('returns one cell per day in the range, logged or not', async () => {
    const calendar = await buildCalendar(user.id, '2026-03-01', '2026-03-31');
    expect(calendar).toMatchObject({ from: '2026-03-01', to: '2026-03-31' });
    expect(calendar.days).toHaveLength(31);
    expect(calendar.days[0]!.local_date).toBe('2026-03-01');
    expect(calendar.days.at(-1)!.local_date).toBe('2026-03-31');
  });

  it('distinguishes a day at zero from a day nobody logged', async () => {
    // An entry with no items totals zero, which is not the same as no entry.
    await addMeal(user, { date: '2026-03-10', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

    const { days } = await buildCalendar(user.id, '2026-03-09', '2026-03-10');
    const [untouched, zeroed] = days;
    expect(untouched).toMatchObject({ kcal: 0, logged: false });
    expect(zeroed).toMatchObject({ kcal: 0, logged: true });
  });

  it('sums food, burn and weight onto the right day', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 700, protein_g: 50 });
    await addMeal(user, { date: '2026-03-10', kcal: 500, protein_g: 30 });
    await addSession('2026-03-10', { kcal: 200 });
    await addSession('2026-03-10', { kcal: 130 });
    await addWeight(user, '2026-03-10', 81.4);

    const { days } = await buildCalendar(user.id, '2026-03-10', '2026-03-10');
    expect(days[0]).toMatchObject({
      kcal: 1200,
      protein_g: 80,
      burned_kcal: 330,
      weight_kg: 81.4,
      logged: true,
    });
  });

  /**
   * The reason target travels per day rather than being read once: an adaptive
   * change would otherwise repaint every earlier day against a number that did
   * not exist yet.
   */
  it('colours each day against the target that was in force that day', async () => {
    await setUserTargets(user, '2026-03-01', { kcal: 2400 });
    await setUserTargets(user, '2026-03-15', { kcal: 2000 });

    const { days } = await buildCalendar(user.id, '2026-03-10', '2026-03-20');
    const byDate = new Map(days.map((d) => [d.local_date, d.target_kcal]));
    expect(byDate.get('2026-03-14')).toBe(2400);
    expect(byDate.get('2026-03-15')).toBe(2000);
    expect(byDate.get('2026-03-20')).toBe(2000);
  });

  it('reports zero rather than guessing for days before any target existed', async () => {
    await setUserTargets(user, '2026-03-15', { kcal: 2000 });
    const { days } = await buildCalendar(user.id, '2026-03-10', '2026-03-10');
    expect(days[0]!.target_kcal).toBe(0);
  });

  it('never reaches into another account', async () => {
    const other = await createUser();
    await addMeal(other, { date: '2026-03-10', kcal: 2000 });
    await addSession('2026-03-10', { kcal: 300 });

    const mine = await buildCalendar(user.id, '2026-03-10', '2026-03-10');
    expect(mine.days[0]).toMatchObject({ kcal: 0, burned_kcal: 300, logged: false });

    const theirs = await buildCalendar(other.id, '2026-03-10', '2026-03-10');
    expect(theirs.days[0]).toMatchObject({ kcal: 2000, burned_kcal: 0, logged: true });
  });
});

describe('buildExerciseSummary', () => {
  it('returns an empty window without inventing zeroes for the totals', async () => {
    const summary = await buildExerciseSummary(user.id, user.ctx, 30);
    expect(summary).toMatchObject({
      days: 30,
      sessions: 0,
      total_kcal: 0,
      active_days: 0,
      // Nothing covered ground, so distance is absent rather than "0 km".
      total_distance_km: null,
      total_duration_min: null,
      entries: [],
    });
    expect(summary.series).toHaveLength(30);
    expect(summary.series.every((point) => point.value === 0)).toBe(true);
  });

  it('totals sessions, burn, distance and duration across the window', async () => {
    const today = await currentLocalDate(user.ctx);
    await addSession(today, { kcal: 300, distanceKm: 5, durationMin: 28 });
    await addSession(addDays(today, -2), { kcal: 250, distanceKm: 4.2, durationMin: 25 });
    // A weights session: burn but no distance, so it must not drag the total to 0.
    await addSession(addDays(today, -3), { kcal: 180, durationMin: 45 });

    const summary = await buildExerciseSummary(user.id, user.ctx, 30);
    expect(summary.sessions).toBe(3);
    expect(summary.total_kcal).toBe(730);
    expect(summary.total_distance_km).toBe(9.2);
    expect(summary.total_duration_min).toBe(98);
    expect(summary.active_days).toBe(3);
  });

  it('counts two sessions on one day as one active day', async () => {
    const today = await currentLocalDate(user.ctx);
    await addSession(today, { kcal: 100 });
    await addSession(today, { kcal: 150 });

    const summary = await buildExerciseSummary(user.id, user.ctx, 30);
    expect(summary.sessions).toBe(2);
    expect(summary.active_days).toBe(1);
    expect(summary.series.at(-1)!.value).toBe(250);
  });

  it('lists the newest session first', async () => {
    const today = await currentLocalDate(user.ctx);
    await addSession(addDays(today, -5), { kcal: 100 });
    await addSession(today, { kcal: 200 });

    const summary = await buildExerciseSummary(user.id, user.ctx, 30);
    expect(summary.entries.map((e) => e.kcal_burned)).toEqual([200, 100]);
  });

  it('excludes sessions older than the window', async () => {
    const today = await currentLocalDate(user.ctx);
    await addSession(addDays(today, -40), { kcal: 500 });

    const summary = await buildExerciseSummary(user.id, user.ctx, 30);
    expect(summary.sessions).toBe(0);
    expect(summary.total_kcal).toBe(0);
  });
});
