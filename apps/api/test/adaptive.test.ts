import { beforeEach, describe, expect, it } from 'vitest';
import {
  ADAPTIVE_WINDOW_DAYS,
  applyAdaptiveTargets,
  dailyIntake,
  estimateTdee,
  KCAL_PER_KG,
  linearSlope,
  MAX_STEP_KCAL,
  proposeTargets,
  weightedMean,
} from '../src/services/adaptive.ts';
import { targetsForDate } from '../src/services/targets.ts';
import {
  addMeal,
  addWeight,
  createUser,
  seedAdaptiveWindow,
  setUserTargets,
  type TestUser,
} from './helpers/factories.ts';

/**
 * Adaptive targets. The arithmetic is simple; the guardrails are the feature.
 * A tracker that moves someone's calorie target on a fortnight of water weight
 * is worse than one that never moves it at all.
 */

const TODAY = '2026-03-15';
const WINDOW_END = '2026-03-14'; // the window ends yesterday

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

describe('linearSlope', () => {
  it('recovers the slope of a straight line', () => {
    expect(linearSlope([{ x: 0, y: 10 }, { x: 1, y: 12 }, { x: 2, y: 14 }])).toBeCloseTo(2, 10);
  });

  it('returns a negative slope for a falling series', () => {
    expect(linearSlope([{ x: 0, y: 85 }, { x: 7, y: 84.5 }])).toBeCloseTo(-0.5 / 7, 10);
  });

  it('is unmoved by a single outlier in a long series', () => {
    const clean = Array.from({ length: 14 }, (_, x) => ({ x, y: 85 - 0.07 * x }));
    const noisy = clean.map((p, i) => (i === 6 ? { ...p, y: p.y + 1.5 } : p));
    expect(linearSlope(noisy)!).toBeCloseTo(linearSlope(clean)!, 1);
  });

  it('returns null when there is nothing to fit', () => {
    expect(linearSlope([])).toBeNull();
    expect(linearSlope([{ x: 1, y: 1 }])).toBeNull();
    // Every point on the same day: no run, so no rise over it.
    expect(linearSlope([{ x: 3, y: 1 }, { x: 3, y: 2 }])).toBeNull();
  });
});

describe('weightedMean', () => {
  it('weights each value', () => {
    expect(weightedMean([{ value: 100, weight: 3 }, { value: 200, weight: 1 }])).toBe(125);
  });

  it('returns null when every weight is zero', () => {
    expect(weightedMean([{ value: 100, weight: 0 }])).toBeNull();
    expect(weightedMean([])).toBeNull();
  });
});

describe('dailyIntake', () => {
  it('sums a day and gives full weight to confident logging', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 600, confidence: 'high' });
    await addMeal(user, { date: '2026-03-10', kcal: 400, confidence: 'high' });

    const [day] = await dailyIntake(user.id, '2026-03-10', '2026-03-10');
    expect(day).toMatchObject({ local_date: '2026-03-10', kcal: 1000, weight: 1 });
  });

  it('discounts a day built from vague estimates', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 1000, confidence: 'low' });
    const [day] = await dailyIntake(user.id, '2026-03-10', '2026-03-10');
    expect(day!.weight).toBeCloseTo(0.5, 5);
  });

  it('blends the weight across mixed-confidence entries', async () => {
    // 1000 high + 1000 low -> (1000*1 + 1000*0.5) / 2000
    await addMeal(user, { date: '2026-03-10', kcal: 1000, confidence: 'high' });
    await addMeal(user, { date: '2026-03-10', kcal: 1000, confidence: 'low' });
    const [day] = await dailyIntake(user.id, '2026-03-10', '2026-03-10');
    expect(day!.weight).toBeCloseTo(0.75, 5);
  });

  it('omits days with nothing logged rather than calling them zero-calorie', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 500 });
    const days = await dailyIntake(user.id, '2026-03-08', '2026-03-12');
    expect(days.map((d) => d.local_date)).toEqual(['2026-03-10']);
  });
});

describe('estimateTdee', () => {
  it('solves maintenance from intake and the weight trend', async () => {
    // 2,200 kcal a day while losing 0.5 kg/week => burning 2,200 + 550.
    await seedAdaptiveWindow(user, {
      endDate: WINDOW_END,
      kcalPerDay: 2200,
      startWeightKg: 85,
      kgPerWeek: -0.5,
    });

    const { estimate } = await estimateTdee(user.id, user.ctx, ADAPTIVE_WINDOW_DAYS, TODAY);
    expect(estimate).toMatchObject({
      mean_intake_kcal: 2200,
      weight_change_kg_per_week: -0.5,
      days_logged: 14,
      weigh_ins: 14,
      quality: 1,
    });
    // Seeded weights are rounded to two decimals, so the fit lands within a
    // kcal or two of the exact 2,200 + 550.
    expect(estimate!.observed_tdee_kcal).toBeCloseTo(2200 + (0.5 / 7) * KCAL_PER_KG, -1);
  });

  /**
   * Regression: the window used to run up to and including today. Today is a
   * partial day nearly every time the pass runs, so its half-logged total
   * dragged the mean down and pushed the target lower every single week.
   */
  it('ignores today, which is always half-logged', async () => {
    await seedAdaptiveWindow(user, {
      endDate: WINDOW_END,
      kcalPerDay: 2200,
      startWeightKg: 85,
      kgPerWeek: -0.5,
    });
    const before = await estimateTdee(user.id, user.ctx, ADAPTIVE_WINDOW_DAYS, TODAY);

    // One breakfast logged so far today.
    await addMeal(user, { date: TODAY, kcal: 320, confidence: 'high' });
    const after = await estimateTdee(user.id, user.ctx, ADAPTIVE_WINDOW_DAYS, TODAY);

    expect(after.estimate).toEqual(before.estimate);
  });

  it('reads a gain as a surplus over maintenance', async () => {
    await seedAdaptiveWindow(user, {
      endDate: WINDOW_END,
      kcalPerDay: 3000,
      startWeightKg: 80,
      kgPerWeek: 0.25,
    });
    const { estimate } = await estimateTdee(user.id, user.ctx, ADAPTIVE_WINDOW_DAYS, TODAY);
    expect(estimate!.observed_tdee_kcal).toBeLessThan(3000);
  });

  it('lowers quality when the logging was uncertain', async () => {
    await seedAdaptiveWindow(user, { endDate: WINDOW_END, confidence: 'low' });
    const { estimate } = await estimateTdee(user.id, user.ctx, ADAPTIVE_WINDOW_DAYS, TODAY);
    expect(estimate!.quality).toBeCloseTo(0.5, 5);
  });

  it('refuses a window with too few logged days', async () => {
    for (let i = 0; i < 5; i++) {
      await addMeal(user, { date: `2026-03-0${i + 1}`, kcal: 2000 });
    }
    const result = await estimateTdee(user.id, user.ctx, ADAPTIVE_WINDOW_DAYS, TODAY);
    expect(result).toEqual({ estimate: null, blocked_by: 'not_enough_logged_days' });
  });

  it('refuses a window with too few weigh-ins', async () => {
    await seedAdaptiveWindow(user, { endDate: WINDOW_END });
    // Plenty of food logged, but the scale was only read three times — and the
    // scale is half of the energy-balance equation.
    const { query } = await import('../src/db.ts');
    await query('DELETE FROM weight_entries WHERE user_id = $1', [user.id]);
    for (const [date, kg] of [['2026-03-01', 85], ['2026-03-07', 84.6], ['2026-03-14', 84.1]] as const) {
      await addWeight(user, date, kg);
    }

    const result = await estimateTdee(user.id, user.ctx, ADAPTIVE_WINDOW_DAYS, TODAY);
    expect(result).toEqual({ estimate: null, blocked_by: 'not_enough_weigh_ins' });
  });

  it('refuses weigh-ins bunched into a few days', async () => {
    for (let i = 0; i < 14; i++) {
      const date = new Date(Date.parse(`${WINDOW_END}T00:00:00Z`) - i * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await addMeal(user, { date, kcal: 2200 });
    }
    // Four readings, but all inside three days.
    for (const [date, kg] of [
      ['2026-03-12', 85],
      ['2026-03-13', 84.9],
      ['2026-03-14', 84.8],
    ] as const) {
      await addWeight(user, date, kg);
    }
    await addWeight(user, '2026-03-11', 85.1);

    const result = await estimateTdee(user.id, user.ctx, ADAPTIVE_WINDOW_DAYS, TODAY);
    expect(result.blocked_by).toBe('weigh_in_span_too_short');
  });
});

describe('proposeTargets', () => {
  it('moves the target toward what the data implies', async () => {
    await seedAdaptiveWindow(user, {
      endDate: WINDOW_END,
      kcalPerDay: 2200,
      startWeightKg: 85,
      kgPerWeek: -0.5,
    });
    await setUserTargets(user, '2026-03-01', { kcal: 2080 });

    const proposal = await proposeTargets(user.id, user.ctx, TODAY);

    // Maintenance ~2,750 and a loss goal (-20%) means the target should rise
    // from 2,080 to 2,200 — they had been eating under their own deficit.
    expect(proposal.eligible).toBe(true);
    expect(proposal.proposed.kcal).toBe(2200);
    expect(proposal.delta_kcal).toBe(120);
    expect(proposal.proposed.source).toBe('adaptive');
    expect(proposal.explanation).toMatch(/2200/);
  });

  it('recomputes macros so the new target still adds up', async () => {
    await seedAdaptiveWindow(user, { endDate: WINDOW_END, kcalPerDay: 2200, kgPerWeek: -0.5 });
    await setUserTargets(user, '2026-03-01', { kcal: 2080 });

    const { proposed } = await proposeTargets(user.id, user.ctx, TODAY);
    const energy = proposed.protein_g * 4 + proposed.carbs_g * 4 + proposed.fat_g * 9;
    expect(energy).toBeCloseTo(proposed.kcal, -2);
  });

  it('never moves further than one step, however wrong the target is', async () => {
    await seedAdaptiveWindow(user, {
      endDate: WINDOW_END,
      kcalPerDay: 2600,
      startWeightKg: 85,
      kgPerWeek: -0.1,
    });
    await setUserTargets(user, '2026-03-01', { kcal: 1500 });

    const proposal = await proposeTargets(user.id, user.ctx, TODAY);
    expect(Math.abs(proposal.delta_kcal)).toBeLessThanOrEqual(MAX_STEP_KCAL);
  });

  it('leaves a target the user set by hand alone', async () => {
    await seedAdaptiveWindow(user, { endDate: WINDOW_END });
    await setUserTargets(user, '2026-03-01', { kcal: 2000, is_custom: true, source: 'manual' });

    const proposal = await proposeTargets(user.id, user.ctx, TODAY);
    expect(proposal).toMatchObject({ eligible: false, blocked_by: 'custom_targets' });
    expect(proposal.proposed).toEqual(proposal.current);
  });

  it('disbelieves an estimate far from the formula', async () => {
    // Four kilos "lost" in a fortnight on 2,200 kcal implies ~4,400 maintenance.
    await seedAdaptiveWindow(user, {
      endDate: WINDOW_END,
      kcalPerDay: 2200,
      startWeightKg: 85,
      kgPerWeek: -2,
    });
    await setUserTargets(user, '2026-03-01', { kcal: 2200 });

    const proposal = await proposeTargets(user.id, user.ctx, TODAY);
    expect(proposal).toMatchObject({ eligible: false, blocked_by: 'estimate_out_of_range' });
    expect(proposal.estimate).not.toBeNull();
    expect(proposal.delta_kcal).toBe(0);
  });

  it('does nothing when the target already matches the data', async () => {
    await seedAdaptiveWindow(user, {
      endDate: WINDOW_END,
      kcalPerDay: 2200,
      startWeightKg: 85,
      kgPerWeek: -0.5,
    });
    // 2,750 maintenance less a 20% deficit is 2,200 — already correct.
    await setUserTargets(user, '2026-03-01', { kcal: 2200 });

    const proposal = await proposeTargets(user.id, user.ctx, TODAY);
    expect(proposal).toMatchObject({ eligible: false, blocked_by: 'change_too_small' });
  });

  it('reports the blocker in words when there is not enough data', async () => {
    const proposal = await proposeTargets(user.id, user.ctx, TODAY);
    expect(proposal.eligible).toBe(false);
    expect(proposal.blocked_by).toBe('not_enough_logged_days');
    expect(proposal.explanation).toMatch(/logged days/);
    expect(proposal.estimate).toBeNull();
  });

  it('respects the maintenance goal by targeting maintenance itself', async () => {
    const maintainer = await createUser({ goal: 'maintain' });
    await seedAdaptiveWindow(maintainer, {
      endDate: WINDOW_END,
      kcalPerDay: 2700,
      startWeightKg: 85,
      kgPerWeek: 0,
    });
    await setUserTargets(maintainer, '2026-03-01', { kcal: 2400 });

    const proposal = await proposeTargets(maintainer.id, maintainer.ctx, TODAY);
    expect(proposal.eligible).toBe(true);
    // Weight is flat on 2,700, so maintenance is 2,700 and the target climbs.
    expect(proposal.delta_kcal).toBeGreaterThan(0);
  });
});

describe('defaults', () => {
  /**
   * Every entry point takes `today` so tests can pin it. The default has to be
   * the user's own today, not the server's — which is the whole reason
   * `localDateFor` exists.
   */
  it('fall back to the user’s own today when no date is given', async () => {
    const { localDateFor, addDays } = await import('../src/time.ts');
    const today = localDateFor(new Date(), user.ctx);

    await seedAdaptiveWindow(user, {
      // The window ends yesterday, so that is where the fixture ends too.
      endDate: addDays(today, -1),
      kcalPerDay: 2200,
      startWeightKg: 85,
      kgPerWeek: -0.5,
    });
    await setUserTargets(user, '2020-01-01', { kcal: 2080 });

    const { estimate } = await estimateTdee(user.id, user.ctx);
    expect(estimate!.days_logged).toBe(14);

    const proposal = await proposeTargets(user.id, user.ctx);
    expect(proposal.eligible).toBe(true);

    const { applied } = await applyAdaptiveTargets(user.id, user.ctx);
    expect(applied).toBe(true);
    expect((await targetsForDate(user.id, today)).source).toBe('adaptive');
  });
});

describe('the floor guard', () => {
  /**
   * The one guardrail that is about the person rather than the data.
   *
   * Left alone, the adaptive pass reads a very low intake as a very low
   * maintenance and lowers the target to match — every week, in the same
   * direction. This is the thing that stops it.
   */

  /** Eating well under the floor, losing hard, and the estimate is believable. */
  const underEating = {
    endDate: WINDOW_END,
    kcalPerDay: 1100,
    startWeightKg: 85,
    kgPerWeek: -1.4,
  };

  it('will not lower a target for someone already under the floor', async () => {
    await seedAdaptiveWindow(user, underEating);
    // ~2,640 maintenance less a 500 deficit is 2,140, so the pass would
    // ordinarily step this down by its full 200.
    await setUserTargets(user, '2026-03-01', { kcal: 2400 });

    const proposal = await proposeTargets(user.id, user.ctx, TODAY);
    expect(proposal).toMatchObject({ eligible: false, blocked_by: 'intake_below_floor' });
    expect(proposal.delta_kcal).toBe(0);
    expect(proposal.proposed).toEqual(proposal.current);
    // And says something a person can act on, not a status code.
    expect(proposal.explanation).toMatch(/dietitian|doctor/i);
  });

  it('writes nothing for that user', async () => {
    await seedAdaptiveWindow(user, underEating);
    await setUserTargets(user, '2026-03-01', { kcal: 2400 });

    const { applied } = await applyAdaptiveTargets(user.id, user.ctx, TODAY);
    expect(applied).toBe(false);
    expect((await targetsForDate(user.id, TODAY)).kcal).toBe(2400);
  });

  it('still lets the target move up', async () => {
    /*
     * The asymmetry is the whole point. Someone under-eating against a target
     * that is itself too low needs the target raised, and blocking the pass
     * outright would leave them pinned to the floor forever.
     */
    await seedAdaptiveWindow(user, { ...underEating, kcalPerDay: 1150, kgPerWeek: -1.5 });
    await setUserTargets(user, '2026-03-01', { kcal: 1200 });

    const proposal = await proposeTargets(user.id, user.ctx, TODAY);
    expect(proposal.eligible).toBe(true);
    expect(proposal.delta_kcal).toBeGreaterThan(0);
  });

  it('outranks a complaint about the data', async () => {
    /*
     * A very low intake is exactly what makes an observed maintenance land
     * outside the sanity band, so the band would otherwise swallow this case
     * and hand the one person who needed a different message a note about
     * estimate quality.
     */
    await seedAdaptiveWindow(user, {
      endDate: WINDOW_END,
      kcalPerDay: 1000,
      startWeightKg: 60,
      kgPerWeek: -0.4,
    });
    await setUserTargets(user, '2026-03-01', { kcal: 1600 });

    const proposal = await proposeTargets(user.id, user.ctx, TODAY);
    expect(proposal.blocked_by).toBe('intake_below_floor');
    expect((await targetsForDate(user.id, TODAY)).kcal).toBe(1600);
  });

  it('leaves an ordinary intake alone', async () => {
    await seedAdaptiveWindow(user, {
      endDate: WINDOW_END,
      kcalPerDay: 2200,
      startWeightKg: 85,
      kgPerWeek: -0.5,
    });
    await setUserTargets(user, '2026-03-01', { kcal: 2600 });

    const proposal = await proposeTargets(user.id, user.ctx, TODAY);
    expect(proposal.eligible).toBe(true);
    expect(proposal.blocked_by).toBeNull();
  });
});

describe('applyAdaptiveTargets', () => {
  it('writes the new target and dates it today', async () => {
    await seedAdaptiveWindow(user, { endDate: WINDOW_END, kcalPerDay: 2200, kgPerWeek: -0.5 });
    await setUserTargets(user, '2026-03-01', { kcal: 2080 });

    const { applied, proposal } = await applyAdaptiveTargets(user.id, user.ctx, TODAY);
    expect(applied).toBe(true);

    const stored = await targetsForDate(user.id, TODAY);
    expect(stored.kcal).toBe(proposal.proposed.kcal);
    expect(stored.source).toBe('adaptive');
    // Yesterday's target is untouched — history stays honest.
    expect((await targetsForDate(user.id, '2026-03-14')).kcal).toBe(2080);
  });

  it('writes nothing when the proposal is not eligible', async () => {
    await setUserTargets(user, '2026-03-01', { kcal: 2200 });
    const { applied } = await applyAdaptiveTargets(user.id, user.ctx, TODAY);
    expect(applied).toBe(false);
    expect((await targetsForDate(user.id, TODAY)).kcal).toBe(2200);
  });
});
