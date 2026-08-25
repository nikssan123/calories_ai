import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRange,
  inferMeal,
  localDateFor,
  localPartsFor,
  resolveWhen,
  weekdayFor,
} from '../src/time.ts';

/**
 * The day-boundary maths. Everything downstream — every total, every target,
 * every "yesterday" — is wrong in a way nobody notices if this is wrong, which
 * is exactly why it is the most-tested file in the project.
 */

const SOFIA = { timezone: 'Europe/Sofia', dayStartHour: 4 };

describe('localDateFor', () => {
  it('maps an ordinary afternoon to its own calendar date', () => {
    expect(localDateFor(new Date('2026-03-10T14:00:00Z'), SOFIA)).toBe('2026-03-10');
  });

  it('counts a 1am snack toward the evening it belongs to', () => {
    // 01:30 Sofia on the 11th is still the 10th's night out.
    expect(localDateFor(new Date('2026-03-10T23:30:00Z'), SOFIA)).toBe('2026-03-10');
  });

  it('rolls over at the configured hour, not at midnight', () => {
    // 03:59 local -> previous day; 04:01 local -> the new one.
    expect(localDateFor(new Date('2026-03-11T01:59:00Z'), SOFIA)).toBe('2026-03-10');
    expect(localDateFor(new Date('2026-03-11T02:01:00Z'), SOFIA)).toBe('2026-03-11');
  });

  it('honours a day_start_hour of 0 as plain local midnight', () => {
    const ctx = { timezone: 'Europe/Sofia', dayStartHour: 0 };
    expect(localDateFor(new Date('2026-03-10T22:30:00Z'), ctx)).toBe('2026-03-11');
  });

  it('uses the local calendar, not UTC', () => {
    // 21:00 in Los Angeles is already tomorrow in UTC.
    const la = { timezone: 'America/Los_Angeles', dayStartHour: 4 };
    expect(localDateFor(new Date('2026-06-02T04:00:00Z'), la)).toBe('2026-06-01');
  });

  it('survives the spring-forward gap', () => {
    // Europe/Sofia jumps 03:00 -> 04:00 on 2026-03-29. The hour that does not
    // exist locally must still resolve to a real date.
    const ctx = { timezone: 'Europe/Sofia', dayStartHour: 4 };
    expect(localDateFor(new Date('2026-03-29T00:30:00Z'), ctx)).toBe('2026-03-28');
    expect(localDateFor(new Date('2026-03-29T02:30:00Z'), ctx)).toBe('2026-03-29');
  });

  it('survives the autumn fall-back, where a local hour happens twice', () => {
    const ctx = { timezone: 'Europe/Sofia', dayStartHour: 4 };
    expect(localDateFor(new Date('2026-10-25T00:30:00Z'), ctx)).toBe('2026-10-24');
    expect(localDateFor(new Date('2026-10-25T03:30:00Z'), ctx)).toBe('2026-10-25');
  });
});

describe('localPartsFor', () => {
  it('returns zero-padded local wall clock and weekday', () => {
    expect(localPartsFor(new Date('2026-03-10T06:05:00Z'), 'Europe/Sofia')).toEqual({
      date: '2026-03-10',
      time: '08:05',
      weekday: 'Tuesday',
    });
  });

  it('renders midnight as 00, not 24', () => {
    expect(localPartsFor(new Date('2026-03-09T22:00:00Z'), 'Europe/Sofia').time).toBe('00:00');
  });
});

describe('weekdayFor', () => {
  it('is an ordinary afternoon’s own weekday', () => {
    // 2026-03-10 is a Tuesday.
    expect(weekdayFor(new Date('2026-03-10T14:00:00Z'), SOFIA)).toBe(2);
  });

  it('names the day where they are rather than where the server is', () => {
    const la = { timezone: 'America/Los_Angeles', dayStartHour: 4 };
    // 04:00 UTC on Tuesday the 2nd is still 21:00 on Monday in Los Angeles.
    expect(weekdayFor(new Date('2026-06-02T04:00:00Z'), la)).toBe(1);
  });

  it('counts a 1am session toward the day it is logged against', () => {
    // 01:30 Sofia on Wednesday the 11th, which the 04:00 rollover puts back on
    // Tuesday — and Tuesday is the day whose plan it should be read against.
    expect(weekdayFor(new Date('2026-03-10T23:30:00Z'), SOFIA)).toBe(2);
  });
});

describe('addDays and dateRange', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles a leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('crosses a year boundary in both directions', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('returns an inclusive range', () => {
    expect(dateRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('returns a single day when start equals end, and nothing when reversed', () => {
    expect(dateRange('2026-01-30', '2026-01-30')).toEqual(['2026-01-30']);
    expect(dateRange('2026-01-30', '2026-01-29')).toEqual([]);
  });
});

describe('resolveWhen', () => {
  const now = new Date('2026-03-10T14:00:00Z'); // 16:00 in Sofia

  it('returns now when there is no hint', () => {
    expect(resolveWhen(undefined, now, SOFIA)).toBe(now);
  });

  it('passes an ISO timestamp straight through', () => {
    expect(resolveWhen('2026-03-09T08:30:00Z', now, SOFIA).toISOString()).toBe(
      '2026-03-09T08:30:00.000Z',
    );
  });

  it('reads an explicit meridiem time', () => {
    // 8pm Sofia is 18:00 UTC in March.
    expect(resolveWhen('8pm', now, SOFIA).toISOString()).toBe('2026-03-10T18:00:00.000Z');
  });

  it('treats 12am as midnight and 12pm as noon', () => {
    expect(localPartsFor(resolveWhen('12am', now, SOFIA), SOFIA.timezone).time).toBe('00:00');
    expect(localPartsFor(resolveWhen('12pm', now, SOFIA), SOFIA.timezone).time).toBe('12:00');
  });

  it('shifts a day back for "yesterday"', () => {
    expect(resolveWhen('yesterday', now, SOFIA).toISOString()).toBe('2026-03-09T14:00:00.000Z');
  });

  it('combines a day offset with a named hour', () => {
    const at = resolveWhen('yesterday 8pm', now, SOFIA);
    expect(localPartsFor(at, SOFIA.timezone)).toMatchObject({ date: '2026-03-09', time: '20:00' });
  });

  it.each([
    ['this morning', '08:00'],
    ['breakfast', '08:00'],
    ['lunch', '13:00'],
    ['midday', '13:00'],
    ['this afternoon', '16:00'],
    ['dinner', '19:00'],
    ['tonight', '19:00'],
    ['late night', '23:00'],
  ])('maps %s to %s local', (hint, expected) => {
    expect(localPartsFor(resolveWhen(hint, now, SOFIA), SOFIA.timezone).time).toBe(expected);
  });

  it('reads a bare date as that day in the user timezone, not UTC midnight', () => {
    // The regression: `new Date('2026-03-09')` is UTC midnight, which the 04:00
    // day start then drags back onto the 8th. A bare date names a day, and the
    // day it names must survive the round trip.
    expect(localDateFor(resolveWhen('2026-03-09', now, SOFIA), SOFIA)).toBe('2026-03-09');
  });

  it.each(['2026-01-15', '2026-06-15', '2026-03-29', '2026-10-25'])(
    'round-trips the bare date %s through the day boundary',
    (date) => {
      expect(localDateFor(resolveWhen(date, now, SOFIA), SOFIA)).toBe(date);
    },
  );

  it('reads a zoneless timestamp in the user timezone, not the server one', () => {
    // 08:00 for a user in Los Angeles is 15:00 UTC, whatever TZ the container runs.
    const la = { timezone: 'America/Los_Angeles', dayStartHour: 4 };
    const at = resolveWhen('2026-03-09T08:00:00', now, la);
    expect(localPartsFor(at, la.timezone)).toMatchObject({ date: '2026-03-09', time: '08:00' });
  });

  it('keeps an early-hours timestamp on the previous logging day', () => {
    // 02:00 local is before the 04:00 rollover, so it belongs to the 8th.
    expect(localDateFor(resolveWhen('2026-03-09T02:00:00', now, SOFIA), SOFIA)).toBe('2026-03-08');
  });

  it('does not reinterpret a timestamp that carries its own offset', () => {
    expect(resolveWhen('2026-03-09T08:30:00+05:00', now, SOFIA).toISOString()).toBe(
      '2026-03-09T03:30:00.000Z',
    );
  });

  it('leaves a date embedded in prose to the language parser', () => {
    // Previously any string *containing* a date shape took the ISO branch.
    const at = resolveWhen('after the gym on 2026-03-09', now, SOFIA);
    expect(at.getTime()).toBe(now.getTime());
  });

  it('falls back to now for a hint it cannot parse', () => {
    expect(resolveWhen('sometime after the gym', now, SOFIA).getTime()).toBe(now.getTime());
  });

  it('ignores a date-shaped string that is not a real date', () => {
    // Matches the YYYY-MM-DD shape but is not a date. It must not throw, and it
    // must not roll over into some arbitrary far-future day either.
    const at = resolveWhen('9999-99-99', now, SOFIA);
    expect(Number.isNaN(at.getTime())).toBe(false);
    expect(at.getTime()).toBe(now.getTime());
  });
});

describe('inferMeal', () => {
  const at = (hourLocal: number) =>
    new Date(Date.UTC(2026, 2, 10, hourLocal - 2)); // Sofia is UTC+2 in March

  it.each([
    [5, 'breakfast'],
    [8, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [14, 'lunch'],
    [15, 'snack'],
    [16, 'snack'],
    [17, 'dinner'],
    [21, 'dinner'],
    [22, 'snack'],
    [3, 'snack'],
  ])('treats %i:00 as %s', (hour, expected) => {
    expect(inferMeal(at(hour), 'Europe/Sofia')).toBe(expected);
  });
});
