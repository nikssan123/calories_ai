import { beforeEach, describe, expect, it } from 'vitest';
import { ACHIEVEMENT_KEYS } from '@ct/shared';
import { query } from '../src/db.ts';
import { evaluateAchievements, listAchievements } from '../src/services/achievements.ts';
import { logHistory, streaksFor } from '../src/services/streaks.ts';
import { buildDaySummary, buildProgress } from '../src/services/summary.ts';
import { addDays, localDateFor } from '../src/time.ts';
import {
  addMeal,
  addWeight,
  addWorkout,
  createUser,
  setUserTargets,
  type TestUser,
} from './helpers/factories.ts';

/**
 * The badges, and the two rules that make them safe to hand out.
 *
 * **They are never revoked.** A badge is a fact about the past, so tidying up an
 * entry from March cannot take one back — which is the other half of the bargain
 * that lets the streak beside it stay strict.
 *
 * **They cannot be earned by not logging.** There is deliberately nothing here
 * for a day under target or a kilo lost, which is `BETS.md` §5 restated for a
 * prize that happens not to be money; the last test in this file is the one that
 * would fail if somebody added one.
 */

/** Thursday 19 March 2026, and the week beginning Monday the 16th. */
const TODAY = '2026-03-19';
const THIS_MONDAY = '2026-03-16';

let user: TestUser;

beforeEach(async () => {
  user = await createUser({ plan: 'free' });
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
});

/** `days` consecutive logged days ending on `endingOn`. */
async function logDays(days: number, endingOn = TODAY) {
  for (let i = 0; i < days; i++) {
    await addMeal(user, { date: addDays(endingOn, -i), kcal: 600 });
  }
}

const evaluate = async (today = TODAY) =>
  evaluateAchievements(user.id, await logHistory(user.id), today);

const keysOf = async () => (await listAchievements(user.id)).map((a) => a.key);

describe('earning', () => {
  it('grants a streak badge once the run is long enough', async () => {
    await logDays(7);
    expect((await evaluate()).map((a) => a.key)).toContain('streak_7');
  });

  it('withholds it one day short', async () => {
    await logDays(6);
    expect(await keysOf()).not.toContain('streak_7');
  });

  it('returns only what this call earned', async () => {
    await logDays(7);
    await evaluate();
    // Nothing new happened between the two passes, so the second has nothing to
    // celebrate — a client that redrew every returned badge would otherwise
    // congratulate somebody on the same week every time they logged a meal.
    expect(await evaluate()).toEqual([]);
  });

  it('writes one row per key however many times it is evaluated', async () => {
    await logDays(7);
    await Promise.all([evaluate(), evaluate(), evaluate()]);
    expect(await keysOf()).toEqual(['streak_7']);
  });

  it('stamps the day in the reader own calendar', async () => {
    await logDays(7);
    const [earned] = await evaluate();
    expect(earned?.local_date).toBe(TODAY);
  });

  /**
   * The other half of the strict-streak bargain. Losing a run at 40 does not
   * un-earn the thirty, so the thresholds read `best` rather than the live run.
   */
  it('grants against the best run ever, not the current one', async () => {
    // Seven days, a gap, then two. The current run is 2 and the best is 7.
    await logDays(7, addDays(TODAY, -5));
    await logDays(2);
    expect((await streaksFor(user.id, TODAY)).logging).toMatchObject({ current: 2, best: 7 });
    expect(await keysOf()).toEqual([]);
    await evaluate();
    expect(await keysOf()).toContain('streak_7');
  });

  it('never revokes one when the history underneath it goes', async () => {
    await logDays(7);
    await evaluate();
    await query('DELETE FROM food_entries WHERE user_id = $1', [user.id]);

    // The derived number is allowed to move. The badge is not.
    expect((await streaksFor(user.id, TODAY)).logging.best).toBe(0);
    expect(await keysOf()).toContain('streak_7');
  });
});

describe('the breadth badges', () => {
  it('reads the source a meal was logged from', async () => {
    await addMeal(user, { date: TODAY, kcal: 500, source: 'photo' });
    await addMeal(user, { date: TODAY, kcal: 200, source: 'barcode' });
    await evaluate();
    expect(await keysOf()).toEqual(expect.arrayContaining(['first_photo', 'first_barcode']));
  });

  it('does not grant them for a meal that was typed', async () => {
    await addMeal(user, { date: TODAY, kcal: 500 });
    await evaluate();
    expect(await keysOf()).not.toContain('first_photo');
  });

  it('grants the first workout and the first weigh-in', async () => {
    await addWorkout(user, TODAY);
    await addWeight(user, TODAY, 80);
    await evaluate();
    expect(await keysOf()).toEqual(expect.arrayContaining(['first_workout', 'first_weigh_in']));
  });
});

describe('the training ladder', () => {
  /** A qualifying week — three active days — beginning `monday`. */
  async function trainWeek(monday: string) {
    for (const offset of [0, 1, 2]) await addWorkout(user, addDays(monday, offset));
  }

  it('grants four weeks for four consecutive qualifying weeks', async () => {
    for (const offset of [0, -7, -14, -21]) await trainWeek(addDays(THIS_MONDAY, offset));
    await evaluate();
    expect(await keysOf()).toContain('exercise_weeks_4');
  });

  it('does not grant it when a week fell one session short', async () => {
    for (const offset of [0, -14, -21]) await trainWeek(addDays(THIS_MONDAY, offset));
    // A fortnight ago: two active days, which is below the bar.
    for (const offset of [0, 1]) await addWorkout(user, addDays(addDays(THIS_MONDAY, -7), offset));
    await evaluate();
    expect(await keysOf()).not.toContain('exercise_weeks_4');
  });

  /**
   * Rest days are where the adaptation happens. A ladder that punished one would
   * be the calorie-ceiling badge in a tracksuit — see STREAKS.md §5.
   */
  it('is indifferent to rest days inside the week', async () => {
    // Monday, Wednesday, Thursday for four weeks running.
    for (const week of [0, -7, -14, -21]) {
      for (const day of [0, 2, 3]) await addWorkout(user, addDays(addDays(THIS_MONDAY, week), day));
    }
    await evaluate();
    expect(await keysOf()).toContain('exercise_weeks_4');
  });
});

describe('on the wire', () => {
  it('rides along with the day summary for today, and earns as it goes', async () => {
    await logDays(7);
    const day = await buildDaySummary(user.id, TODAY, TODAY);

    expect(day.streak).toMatchObject({ current: 7, best: 7, state: 'alive' });
    expect(await keysOf()).toContain('streak_7');
  });

  it('leaves the streak off a day that is not today', async () => {
    await logDays(7);
    // A History cell in March should not pay for a scan to answer a question
    // nobody asked of it.
    expect((await buildDaySummary(user.id, addDays(TODAY, -3))).streak).toBeNull();
  });

  it('carries both streaks and the earned set on progress', async () => {
    // Anchored on the real clock, not on `TODAY`: `buildProgress` resolves the
    // reader's date itself, so a fixture dated March would read as a run that
    // ended months ago rather than one still going.
    const now = localDateFor(new Date(), user.ctx);
    await logDays(3, now);
    await addWorkout(user, now);
    const progress = await buildProgress(user.id, user.ctx, 30);

    expect(progress.streaks.logging.current).toBeGreaterThan(0);
    expect(progress.streaks.training).toMatchObject({ current: 0, state: 'none' });
    expect(progress.achievements.map((a) => a.key)).toContain('first_workout');
  });

  /**
   * The streak is a claim about a whole history, and the window buttons on
   * Progress are 14/30/90. Capping it at whichever was selected would be a
   * number the tab bar had quietly invented.
   */
  it('does not cut the streak down to the selected window', async () => {
    await logDays(40, localDateFor(new Date(), user.ctx));
    const fortnight = await buildProgress(user.id, user.ctx, 14);
    expect(fortnight.streaks.logging.current).toBe(40);
  });
});

describe('what a badge is allowed to be about', () => {
  /**
   * The guard on §1. Every key is earned by *having logged*; none is earned by
   * what was logged. If a `days_under_target` or a `weight_lost` key ever turns
   * up, this is the test that should stop it.
   */
  it('has no key keyed on a calorie ceiling or on the scale', () => {
    const forbidden = /target|under|deficit|weight_lost|perfect|kcal|calorie|lost/i;
    expect(ACHIEVEMENT_KEYS.filter((key) => forbidden.test(key))).toEqual([]);
  });

  it('earns nothing at all from a day spent under target', async () => {
    // A single, virtuous, well-under-target day. It is worth exactly nothing,
    // because eating less is not the behaviour this rewards.
    await addMeal(user, { date: TODAY, kcal: 900 });
    await evaluate();
    expect(await keysOf()).toEqual([]);
  });
});
