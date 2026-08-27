import { describe, expect, it } from 'vitest';
import {
  addDays,
  streakFrom,
  TRAINING_WEEK_DAYS,
  trainingWeekOf,
  weekStartFor,
  weekStreakFrom,
} from '@ct/shared';

/**
 * The arithmetic behind both streaks, tested where it lives — in `shared`, with
 * no database and no clock.
 *
 * Two things are worth proving here and they are the two the notification path
 * never had to think about. One is the in-progress period: a run is at its most
 * fragile in the hours before anybody has logged anything, and that is exactly
 * when a screen is asked to draw it. `alerts.ts` sidesteps the whole question by
 * only ever running at 20:00.
 *
 * The other is that neither streak can be gamed by how granularly somebody
 * logs. Three entries on one Tuesday are one active day, not three.
 */

/** Thursday 19 March 2026. Its week begins Monday the 16th. */
const TODAY = '2026-03-19';
const THIS_MONDAY = '2026-03-16';

/** `count` consecutive dates ending on `endingOn`, newest first. */
function daysEnding(count: number, endingOn = TODAY): string[] {
  return Array.from({ length: count }, (_, i) => addDays(endingOn, -i));
}

/** `TRAINING_WEEK_DAYS` active days inside the week beginning `monday`. */
function qualifyingWeek(monday: string): string[] {
  return Array.from({ length: TRAINING_WEEK_DAYS }, (_, i) => addDays(monday, i));
}

describe('weekStartFor', () => {
  it('leaves a Monday alone', () => {
    expect(weekStartFor(THIS_MONDAY)).toBe(THIS_MONDAY);
  });

  it('walks a Sunday back to the Monday six days earlier', () => {
    // The one every off-by-one lands on: a Sunday session belongs to the week
    // that is ending, not the one about to begin.
    expect(weekStartFor('2026-03-22')).toBe(THIS_MONDAY);
  });

  it('crosses a month boundary', () => {
    expect(weekStartFor('2026-04-01')).toBe('2026-03-30');
  });
});

describe('the logging streak', () => {
  it('counts a run that reaches today', () => {
    expect(streakFrom(daysEnding(7), TODAY)).toMatchObject({
      current: 7,
      best: 7,
      start: addDays(TODAY, -6),
      state: 'alive',
    });
  });

  /**
   * The whole reason `at_risk` exists. Nobody has logged anything yet today, and
   * a strict run "ending today" is zero — so a streak with sixteen hours left to
   * live would draw as no streak at all.
   */
  it('keeps a run that ended yesterday, and marks it at risk', () => {
    expect(streakFrom(daysEnding(7, addDays(TODAY, -1)), TODAY)).toMatchObject({
      current: 7,
      state: 'at_risk',
    });
  });

  it('prefers alive over at risk once today is logged', () => {
    // Both lookups hit the same run on an evening that has been logged, and
    // reporting it at risk would ask somebody to do what they have just done.
    expect(streakFrom(daysEnding(2), TODAY).state).toBe('alive');
  });

  it('does not resurrect a run that ended the day before yesterday', () => {
    const stale = streakFrom(daysEnding(9, addDays(TODAY, -2)), TODAY);
    expect(stale).toMatchObject({ current: 0, state: 'none', start: null });
    // History, though — and the badge earned inside it was never revoked.
    expect(stale.best).toBe(9);
  });

  it('reports the longest run ever as best, not the current one', () => {
    const dates = [...daysEnding(3), ...daysEnding(20, addDays(TODAY, -10))];
    expect(streakFrom(dates, TODAY)).toMatchObject({ current: 3, best: 20 });
  });

  it('is indifferent to order and to duplicates', () => {
    const messy = [...daysEnding(5)].reverse().flatMap((d) => [d, d, d]);
    expect(streakFrom(messy, TODAY)).toMatchObject({ current: 5, best: 5 });
  });

  /**
   * A meal can be logged against a time hint, and nothing stops one landing in
   * the future. Counted, a single mistyped date would invent a run and leave a
   * `best` that never comes back down.
   */
  it('ignores dates past today', () => {
    const dates = [...daysEnding(3), addDays(TODAY, 1), addDays(TODAY, 2)];
    expect(streakFrom(dates, TODAY)).toMatchObject({ current: 3, best: 3 });
  });

  it('says nothing about an empty log', () => {
    expect(streakFrom([], TODAY)).toMatchObject({
      current: 0,
      best: 0,
      start: null,
      state: 'none',
    });
  });
});

describe('the training streak', () => {
  it('counts a week that has already cleared the bar', () => {
    expect(weekStreakFrom(qualifyingWeek(THIS_MONDAY), TODAY)).toMatchObject({
      current: 1,
      state: 'alive',
      start: THIS_MONDAY,
    });
  });

  it('holds last week open while this one is still short', () => {
    // Monday morning, nothing trained yet. The run is intact until Sunday.
    const lastWeek = qualifyingWeek(addDays(THIS_MONDAY, -7));
    expect(weekStreakFrom(lastWeek, TODAY)).toMatchObject({ current: 1, state: 'at_risk' });
  });

  it('runs across consecutive qualifying weeks', () => {
    const weeks = [0, -7, -14, -21].flatMap((offset) =>
      qualifyingWeek(addDays(THIS_MONDAY, offset)),
    );
    expect(weekStreakFrom(weeks, TODAY)).toMatchObject({
      current: 4,
      best: 4,
      start: addDays(THIS_MONDAY, -21),
      state: 'alive',
    });
  });

  it('breaks on a week that fell one day short', () => {
    const weeks = [
      ...qualifyingWeek(THIS_MONDAY),
      // Two active days a fortnight ago: below the bar, so the run starts over.
      ...qualifyingWeek(addDays(THIS_MONDAY, -7)).slice(0, TRAINING_WEEK_DAYS - 1),
      ...qualifyingWeek(addDays(THIS_MONDAY, -14)),
    ];
    expect(weekStreakFrom(weeks, TODAY)).toMatchObject({ current: 1, best: 1 });
  });

  /**
   * `Progress.exercise.sessions` is `entries.length`, so bench, squat and
   * deadlift logged separately are three sessions from one visit to the gym.
   * The streak is about turning up, and turning up is a day.
   */
  it('counts active days, not entries', () => {
    const oneBusyMonday = [THIS_MONDAY, THIS_MONDAY, THIS_MONDAY, THIS_MONDAY];
    expect(weekStreakFrom(oneBusyMonday, TODAY)).toMatchObject({ current: 0, state: 'none' });
  });

  it('takes a rest day without noticing', () => {
    // Monday, Wednesday, Thursday — a rest day in the middle, and the whole
    // reason this counts weeks rather than days. Friday is left out because it
    // has not happened yet: `TODAY` is the Thursday.
    const withARestDay = [0, 2, 3].map((offset) => addDays(THIS_MONDAY, offset));
    expect(weekStreakFrom(withARestDay, TODAY).state).toBe('alive');
  });

  it('says nothing when nothing has been trained', () => {
    expect(weekStreakFrom([], TODAY)).toMatchObject({ current: 0, best: 0, state: 'none' });
  });
});

/**
 * A weekly streak has a visibility problem a daily one does not: "3 weeks" says
 * nothing about whether *this* week is on course, and a number that resolves
 * only on Sunday is one nobody can act on while there is still time to act.
 */
describe('the training week in progress', () => {
  it('reports the days trained so far and the bar they are against', () => {
    const so_far = [THIS_MONDAY, addDays(THIS_MONDAY, 2)];
    expect(trainingWeekOf(so_far, TODAY)).toEqual({
      week_start: THIS_MONDAY,
      days: so_far,
      needed: TRAINING_WEEK_DAYS,
    });
  });

  it('leaves out days belonging to an earlier week', () => {
    const lastWeekToo = [addDays(THIS_MONDAY, -3), THIS_MONDAY];
    expect(trainingWeekOf(lastWeekToo, TODAY).days).toEqual([THIS_MONDAY]);
  });

  it('is the week so far, never the week somebody hopes to have', () => {
    // Saturday is in this week and has not happened yet. Counting it would draw
    // a bar as cleared on a Thursday on the strength of an intention.
    const withSaturday = [THIS_MONDAY, addDays(THIS_MONDAY, 5)];
    expect(trainingWeekOf(withSaturday, TODAY).days).toEqual([THIS_MONDAY]);
  });

  it('is empty on a Monday morning, and says which Monday', () => {
    expect(trainingWeekOf([], THIS_MONDAY)).toEqual({
      week_start: THIS_MONDAY,
      days: [],
      needed: TRAINING_WEEK_DAYS,
    });
  });

  it('agrees with the streak about what clears the bar', () => {
    const week = [0, 1, 2].map((offset) => addDays(THIS_MONDAY, offset));
    expect(trainingWeekOf(week, TODAY).days).toHaveLength(TRAINING_WEEK_DAYS);
    expect(weekStreakFrom(week, TODAY).state).toBe('alive');
  });
});
