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
import { estimateTdee } from '../src/services/adaptive.ts';
import { activityFromSteps, measuredActivityLevel, predictTdee } from '../src/services/targets.ts';
import { query } from '../src/db.ts';
import {
  addMeal,
  anonymousApp,
  appFor,
  createUser,
  seedAdaptiveWindow,
  type TestUser,
} from './helpers/factories.ts';

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

describe('steps in the target arithmetic', () => {
  /**
   * The payoff, and the reason the feed exists. `predictTdee` is BMR times a
   * multiplier spanning 1.2 to 1.9 — over a thousand kcal of spread for a
   * typical body — chosen by a dropdown answered once and never revisited.
   */
  describe('activityFromSteps', () => {
    it('reads the Tudor-Locke bands', () => {
      expect(activityFromSteps(0)).toBe('sedentary');
      expect(activityFromSteps(4_999)).toBe('sedentary');
      expect(activityFromSteps(5_000)).toBe('light');
      expect(activityFromSteps(7_500)).toBe('moderate');
      expect(activityFromSteps(10_000)).toBe('active');
      expect(activityFromSteps(12_500)).toBe('very_active');
      expect(activityFromSteps(30_000)).toBe('very_active');
    });
  });

  describe('measuredActivityLevel', () => {
    it('leaves the declared level alone when nothing was counted', () => {
      expect(measuredActivityLevel('moderate', null)).toBe('moderate');
      // Null declared and null steps is still the formula's own default.
      expect(measuredActivityLevel(null, null)).toBe('moderate');
    });

    it('raises the level as far as the walking proves', () => {
      // There is no way to walk 14,000 steps and not have spent the energy, so
      // the measurement simply wins over the dropdown.
      expect(measuredActivityLevel('sedentary', 14_000)).toBe('very_active');
      expect(measuredActivityLevel('light', 10_400)).toBe('active');
    });

    it('lowers it by one notch and no further', () => {
      // A declared "very active" at 2,000 steps might be somebody who
      // over-claimed, and might be a cyclist. Those are not distinguishable
      // from a pedometer, and the cost of guessing wrong is a target hundreds
      // of calories under what they burn.
      expect(measuredActivityLevel('very_active', 2_000)).toBe('active');
      expect(measuredActivityLevel('moderate', 1_000)).toBe('light');
    });

    it('cannot fall off the bottom of the scale', () => {
      expect(measuredActivityLevel('sedentary', 200)).toBe('sedentary');
    });

    it('agrees with a declaration the steps confirm', () => {
      expect(measuredActivityLevel('moderate', 8_200)).toBe('moderate');
    });
  });

  describe('predictTdee', () => {
    const body = {
      sex: 'male' as const,
      birth_date: '1996-01-01',
      height_cm: 180,
      weight_kg: 85,
      goal: 'lose' as const,
    };

    it('is unchanged for everybody whose phone is not counting', () => {
      // The property that makes this safe to ship without a flag: absent a step
      // average, the arithmetic is exactly what it was.
      expect(predictTdee({ ...body, activity_level: 'moderate' })).toBe(
        predictTdee({ ...body, activity_level: 'moderate', measured_steps: null }),
      );
    });

    it('moves maintenance by hundreds of kcal when the walking disagrees', () => {
      const declared = predictTdee({ ...body, activity_level: 'moderate' })!;
      const walked = predictTdee({ ...body, activity_level: 'moderate', measured_steps: 13_000 })!;
      // 1.55 → 1.9 on a BMR near 1,830.
      expect(Math.round(walked - declared)).toBeGreaterThan(500);
    });

    it('never lets a step count become a calorie of its own', () => {
      // The multiplier is the only thing steps touch. Two people at the same
      // measured level predict identically however far apart their counts are.
      const active = predictTdee({ ...body, activity_level: 'moderate', measured_steps: 13_000 });
      const veryActive = predictTdee({ ...body, activity_level: 'moderate', measured_steps: 40_000 });
      expect(active).toBe(veryActive);
    });
  });

  describe('the adaptive estimate', () => {
    it('carries the level it predicted at, and the count behind it', async () => {
      await seedAdaptiveWindow(user, { endDate: '2026-03-14' });
      await recordSteps(
        user.id,
        ['09', '10', '11', '12', '13'].map((d) => day(`2026-03-${d}`, 13_000)),
      );

      const { estimate } = await estimateTdee(user.id, user.ctx, 14, '2026-03-15');
      expect(estimate?.activity_level).toBe('very_active');
      expect(estimate?.measured_steps).toBe(13000);
    });

    it('predicts against the declaration when there are no steps', async () => {
      await seedAdaptiveWindow(user, { endDate: '2026-03-14' });
      const { estimate } = await estimateTdee(user.id, user.ctx, 14, '2026-03-15');
      // The factory declares 'moderate'.
      expect(estimate?.activity_level).toBe('moderate');
      expect(estimate?.measured_steps).toBeNull();
    });

    it('leaves the observed side of the balance untouched', async () => {
      // The observation is intake against what the scale did about it, and it
      // already contains every step taken. Steps may move the *prediction* and
      // nothing else — otherwise the same walking is counted twice.
      await seedAdaptiveWindow(user, { endDate: '2026-03-14' });
      const before = await estimateTdee(user.id, user.ctx, 14, '2026-03-15');

      await recordSteps(
        user.id,
        ['09', '10', '11', '12', '13'].map((d) => day(`2026-03-${d}`, 18_000)),
      );
      const after = await estimateTdee(user.id, user.ctx, 14, '2026-03-15');

      expect(after.estimate?.observed_tdee_kcal).toBe(before.estimate?.observed_tdee_kcal);
      expect(after.estimate?.mean_intake_kcal).toBe(before.estimate?.mean_intake_kcal);
      expect(after.estimate?.predicted_tdee_kcal).not.toBe(before.estimate?.predicted_tdee_kcal);
    });
  });
});
