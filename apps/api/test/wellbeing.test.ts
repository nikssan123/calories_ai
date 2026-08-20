import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkWellbeing,
  MAX_SAFE_LOSS_FRACTION,
  MIN_DAYS_FOR_INTAKE_CHECK,
} from '../src/services/wellbeing.ts';
import { addMeal, addWeight, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The two things the app notices about a person rather than about their data.
 *
 * The interesting cases are all the negative ones: a check that fires too
 * easily is worse than no check at all, because the thing it makes the app do
 * is tell somebody they are not eating enough when they simply had a quiet
 * week of logging.
 */

const TODAY = '2026-03-15';
/** The window ends yesterday, so this is the last day that counts. */
const WINDOW_END = '2026-03-14';

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

function daysBack(from: string, n: number): string {
  return new Date(Date.parse(`${from}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

async function logWeek(kcalPerDay: number, days = 7) {
  for (let i = 0; i < days; i++) {
    await addMeal(user, { date: daysBack(WINDOW_END, i), kcal: kcalPerDay });
  }
}

describe('intake below the floor', () => {
  it('fires on a week spent well under it', async () => {
    await logWeek(900);

    const wellbeing = await checkWellbeing(user.id, user.ctx, TODAY);
    expect(wellbeing.intake_below_floor).toBe(true);
    expect(wellbeing.mean_intake_kcal).toBe(900);
    expect(wellbeing.days_logged).toBe(7);
  });

  it('stays quiet on an ordinary week', async () => {
    await logWeek(2000);
    expect((await checkWellbeing(user.id, user.ctx, TODAY)).intake_below_floor).toBe(false);
  });

  it('stays quiet when there is barely any logging to read', async () => {
    // Three very low days is a person who logged three times, not a person who
    // ate three times. Reading the gaps as zeros would fire this at almost
    // everybody who uses the app casually.
    await logWeek(400, MIN_DAYS_FOR_INTAKE_CHECK - 1);

    const wellbeing = await checkWellbeing(user.id, user.ctx, TODAY);
    expect(wellbeing.intake_below_floor).toBe(false);
    expect(wellbeing.mean_intake_kcal).toBeNull();
    expect(wellbeing.days_logged).toBe(MIN_DAYS_FOR_INTAKE_CHECK - 1);
  });

  it('ignores today, which is always a partial day', async () => {
    await logWeek(2000);
    // One logged breakfast on the current day must not drag the week's mean
    // under the floor every single morning.
    await addMeal(user, { date: TODAY, kcal: 200 });

    expect((await checkWellbeing(user.id, user.ctx, TODAY)).intake_below_floor).toBe(false);
  });

  it('weighs a vaguely logged day the same as a carefully logged one', async () => {
    // Unlike the TDEE estimate, which damps low-confidence days on purpose.
    // Someone whose logging is rough is not someone to worry about less.
    for (let i = 0; i < 7; i++) {
      await addMeal(user, { date: daysBack(WINDOW_END, i), kcal: 900, confidence: 'low' });
    }
    expect((await checkWellbeing(user.id, user.ctx, TODAY)).intake_below_floor).toBe(true);
  });
});

describe('losing too fast', () => {
  async function weighIn(startKg: number, kgPerWeek: number, days = 14) {
    for (let i = 0; i < days; i++) {
      const date = daysBack(WINDOW_END, i);
      await addWeight(user, date, round2(startKg + (kgPerWeek / 7) * (days - 1 - i)));
    }
  }

  it('fires past roughly one percent of bodyweight a week', async () => {
    await logWeek(2000);
    // 1.5 kg a week off 80 kg is nearly 2%.
    await weighIn(80, -1.5);

    const wellbeing = await checkWellbeing(user.id, user.ctx, TODAY);
    expect(wellbeing.losing_too_fast).toBe(true);
    expect(wellbeing.loss_pct_per_week).toBeLessThan(-MAX_SAFE_LOSS_FRACTION * 100);
  });

  it('leaves a steady, sensible rate alone', async () => {
    await logWeek(2000);
    // Half a kilo off 80 kg is 0.6% — the ordinary case.
    await weighIn(80, -0.5);
    expect((await checkWellbeing(user.id, user.ctx, TODAY)).losing_too_fast).toBe(false);
  });

  it('scales with the person rather than using a flat kilo figure', async () => {
    // The same 1 kg a week: unremarkable at 130 kg, over the line at 55.
    await logWeek(2000);
    await weighIn(130, -1);
    expect((await checkWellbeing(user.id, user.ctx, TODAY)).losing_too_fast).toBe(false);

    const small = await createUser();
    for (let i = 0; i < 7; i++) {
      await addMeal(small, { date: daysBack(WINDOW_END, i), kcal: 2000 });
    }
    for (let i = 0; i < 14; i++) {
      await addWeight(small, daysBack(WINDOW_END, i), round2(55 + (-1 / 7) * (13 - i)));
    }
    expect((await checkWellbeing(small.id, small.ctx, TODAY)).losing_too_fast).toBe(true);
  });

  it('says nothing without enough weigh-ins to read a slope', async () => {
    await logWeek(2000);
    await addWeight(user, WINDOW_END, 78);
    await addWeight(user, daysBack(WINDOW_END, 7), 82);

    const wellbeing = await checkWellbeing(user.id, user.ctx, TODAY);
    expect(wellbeing.losing_too_fast).toBe(false);
    expect(wellbeing.loss_pct_per_week).toBeNull();
  });

  it('does not read a gain as a loss', async () => {
    await logWeek(2000);
    await weighIn(80, 1.5);

    const wellbeing = await checkWellbeing(user.id, user.ctx, TODAY);
    expect(wellbeing.losing_too_fast).toBe(false);
    expect(wellbeing.loss_pct_per_week!).toBeGreaterThan(0);
  });
});

describe('an account with nothing in it', () => {
  it('reports nothing rather than everything', async () => {
    expect(await checkWellbeing(user.id, user.ctx, TODAY)).toMatchObject({
      intake_below_floor: false,
      losing_too_fast: false,
      mean_intake_kcal: null,
      days_logged: 0,
      loss_pct_per_week: null,
    });
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
