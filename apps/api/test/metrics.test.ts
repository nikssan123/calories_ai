import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  DEVICE_SOURCE,
  recentStepAverage,
  recordSteps,
  stepsForDay,
  stepsSummary,
} from '../src/services/metrics.ts';
import { buildDaySummary } from '../src/services/summary.ts';
import { query } from '../src/db.ts';
import { addMeal, anonymousApp, appFor, createUser, type TestUser } from './helpers/factories.ts';

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

const day = (local_date: string, steps: number) => ({
  local_date,
  steps,
  source: DEVICE_SOURCE,
});

describe('recordSteps', () => {
  it('writes a day and reads it back', async () => {
    await recordSteps(user.id, [day('2026-03-10', 8432)]);
    expect(await stepsForDay(user.id, '2026-03-10')).toBe(8432);
  });

  it('is idempotent — the same window sent twice lands in one row', async () => {
    const window = [day('2026-03-10', 8432), day('2026-03-11', 5100)];
    await recordSteps(user.id, window);
    await recordSteps(user.id, window);

    const rows = await query('SELECT * FROM daily_metrics WHERE user_id = $1', [user.id]);
    expect(rows).toHaveLength(2);
  });

  it('takes the higher figure when a day is re-sent', async () => {
    // The normal path: today's count is still climbing, so the same date
    // arrives repeatedly with a bigger number each time.
    await recordSteps(user.id, [day('2026-03-10', 3000)]);
    await recordSteps(user.id, [day('2026-03-10', 7400)]);
    expect(await stepsForDay(user.id, '2026-03-10')).toBe(7400);
  });

  it('refuses to let a lower figure undo a day', async () => {
    // An Android reboot resets the step sensor and a restore can truncate iOS's
    // history. Neither is a correction, and a pedometer has no way to report a
    // count that is too high — so the max is the only reading worth keeping.
    await recordSteps(user.id, [day('2026-03-10', 7400)]);
    await recordSteps(user.id, [day('2026-03-10', 120)]);
    expect(await stepsForDay(user.id, '2026-03-10')).toBe(7400);
  });

  it('keeps two sources for one day apart, and reports the larger', async () => {
    // A phone in a pocket and a watch on a wrist both saw the same walk.
    // Summing them would double the day; the higher one saw more of it.
    await recordSteps(user.id, [
      { local_date: '2026-03-10', steps: 6000, source: 'device' },
      { local_date: '2026-03-10', steps: 9000, source: 'watch' },
    ]);

    const rows = await query('SELECT * FROM daily_metrics WHERE user_id = $1', [user.id]);
    expect(rows).toHaveLength(2);
    expect(await stepsForDay(user.id, '2026-03-10')).toBe(9000);
  });

  it('says nothing about a day nobody reported', async () => {
    // Null, never zero. Nobody has walked exactly none; a zero here would be a
    // claim about the person rather than about their phone.
    expect(await stepsForDay(user.id, '2026-03-10')).toBeNull();
  });

  it('folds a day repeated inside one payload instead of failing on it', async () => {
    // Postgres refuses an upsert that touches the same row twice in one
    // statement, and a payload is a list from a phone rather than a set. The
    // higher count wins, the same way it would across two requests.
    await recordSteps(user.id, [day('2026-03-10', 3000), day('2026-03-10', 7400)]);
    expect(await stepsForDay(user.id, '2026-03-10')).toBe(7400);
    expect(await query('SELECT * FROM daily_metrics WHERE user_id = $1', [user.id])).toHaveLength(1);
  });

  it('does nothing at all with an empty window', async () => {
    await recordSteps(user.id, []);
    expect(await query('SELECT * FROM daily_metrics WHERE user_id = $1', [user.id])).toHaveLength(0);
  });
});

describe('stepsSummary', () => {
  beforeEach(async () => {
    await recordSteps(user.id, [
      day('2026-03-08', 4000),
      day('2026-03-09', 6000),
      day('2026-03-10', 800),
    ]);
  });

  it('returns the window oldest first', async () => {
    const { days } = await stepsSummary(user.id, '2026-03-10', 7);
    expect(days.map((d) => d.local_date)).toEqual(['2026-03-08', '2026-03-09', '2026-03-10']);
  });

  it('leaves today out of the average, because today is half a day', async () => {
    // 4,000 and 6,000 settle at 5,000. Folding in a morning's 800 would make
    // the average depend on what time the app happened to be opened.
    const { average } = await stepsSummary(user.id, '2026-03-10', 7);
    expect(average).toBe(5000);
  });

  it('skips days with no reading rather than counting them as zero', async () => {
    // A phone left on a desk did not walk nought steps; it did not report.
    const { days, average } = await stepsSummary(user.id, '2026-03-10', 30);
    expect(days).toHaveLength(3);
    expect(average).toBe(5000);
  });

  it('has no average at all when only today was reported', async () => {
    const fresh = await createUser();
    await recordSteps(fresh.id, [day('2026-03-10', 800)]);
    expect((await stepsSummary(fresh.id, '2026-03-10', 7)).average).toBeNull();
  });
});

describe('recentStepAverage', () => {
  it('is null until there are enough settled days to mean anything', async () => {
    await recordSteps(user.id, [day('2026-03-08', 4000), day('2026-03-09', 6000)]);
    expect(await recentStepAverage(user.id, '2026-03-10')).toBeNull();
  });

  it('averages the settled days once there are four', async () => {
    await recordSteps(user.id, [
      day('2026-03-06', 4000),
      day('2026-03-07', 4000),
      day('2026-03-08', 6000),
      day('2026-03-09', 6000),
      day('2026-03-10', 100),
    ]);
    expect(await recentStepAverage(user.id, '2026-03-10')).toBe(5000);
  });
});

describe('the day summary', () => {
  it('carries the step count', async () => {
    await recordSteps(user.id, [day('2026-03-10', 8432)]);
    const summary = await buildDaySummary(user.id, '2026-03-10');
    expect(summary.steps).toBe(8432);
  });

  it('reports null steps on a day the phone said nothing about', async () => {
    const summary = await buildDaySummary(user.id, '2026-03-10');
    expect(summary.steps).toBeNull();
  });

  /**
   * The one that matters. INTEGRATIONS.md's rule — device data may inform the
   * target, never be subtracted from intake — has exactly one machine-checkable
   * consequence, and this is it. If somebody ever wires steps into a burn, this
   * is the test that should stop them.
   */
  it('never lets steps reach burned or net calories', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 1800, protein_g: 100, carbs_g: 180, fat_g: 60 });
    await recordSteps(user.id, [day('2026-03-10', 20000)]);

    const summary = await buildDaySummary(user.id, '2026-03-10');
    expect(summary.steps).toBe(20000);
    expect(summary.burned_kcal).toBe(0);
    expect(summary.net_kcal).toBe(summary.consumed.kcal);
  });
});

describe('the routes', () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    ({ app, cookie } = await appFor(user));
  });

  afterEach(async () => {
    await app.close();
  });

  const auth = (extra: Record<string, unknown> = {}) => ({ headers: { cookie }, ...extra });

  it('takes a window and answers 204', async () => {
    const response = await app.inject(
      auth({
        method: 'PUT',
        url: '/metrics/steps',
        payload: { days: [day('2026-03-10', 8432), day('2026-03-11', 5100)] },
      }),
    );
    expect(response.statusCode).toBe(204);
    expect(await stepsForDay(user.id, '2026-03-10')).toBe(8432);
  });

  it('rejects a negative count rather than storing one', async () => {
    const response = await app.inject(
      auth({ method: 'PUT', url: '/metrics/steps', payload: { days: [day('2026-03-10', -5)] } }),
    );
    expect(response.statusCode).toBe(400);
  });

  it('refuses a window longer than a client could honestly have read', async () => {
    const days = Array.from({ length: 40 }, (_, i) => day(`2026-03-${String(i + 1).padStart(2, '0')}`, 100));
    const response = await app.inject(
      auth({ method: 'PUT', url: '/metrics/steps', payload: { days } }),
    );
    expect(response.statusCode).toBe(400);
  });

  it('needs a session', async () => {
    const anon = await anonymousApp();
    const response = await anon.inject({
      method: 'PUT',
      url: '/metrics/steps',
      payload: { days: [day('2026-03-10', 8432)] },
    });
    expect(response.statusCode).toBe(401);
    await anon.close();
  });

  it('keeps one account out of another', async () => {
    const other = await createUser();
    await recordSteps(other.id, [day('2026-03-10', 9999)]);

    const response = await app.inject(auth({ method: 'GET', url: '/metrics/steps?days=30' }));
    expect(response.statusCode).toBe(200);
    expect(response.json().days).toEqual([]);
  });

  it('hands back the window it was given', async () => {
    await app.inject(
      auth({
        method: 'PUT',
        url: '/metrics/steps',
        payload: { days: [day('2026-03-10', 8432)] },
      }),
    );
    const response = await app.inject(auth({ method: 'GET', url: '/metrics/steps?days=365' }));
    expect(response.json().days).toMatchObject([{ local_date: '2026-03-10', steps: 8432 }]);
  });
});
