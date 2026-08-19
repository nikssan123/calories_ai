import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isReviewTime, REVIEW_HOUR, runDueReviews, startScheduler, tick } from '../src/scheduler.ts';
import { listReviews, reviewWeekFor, saveReview } from '../src/services/reviews.ts';
import { localDateFor } from '../src/time.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import { addMeal, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The weekly job. There is no cron: the API ticks hourly and asks each user's
 * own clock whether their week has turned over, so a restart cannot miss a
 * review and every timezone is served by one process.
 */

/** 08:30 on Monday 16 March 2026, in Sofia (UTC+2). */
const MONDAY_MORNING = new Date('2026-03-16T06:30:00Z');

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  // Something in the week under review, or the account is treated as dormant.
  await addMeal(user, { date: '2026-03-11', kcal: 2100 });
});

describe('isReviewTime', () => {
  it('is true during the publishing hour in the user’s own timezone', () => {
    expect(isReviewTime(MONDAY_MORNING, 'Europe/Sofia')).toBe(true);
  });

  it('is false at the same instant elsewhere', () => {
    // 06:30 UTC on Monday is 23:30 Sunday in Los Angeles.
    expect(isReviewTime(MONDAY_MORNING, 'America/Los_Angeles')).toBe(false);
  });

  it('is false on other days, and before the hour on the day itself', () => {
    expect(isReviewTime(new Date('2026-03-17T06:30:00Z'), 'Europe/Sofia')).toBe(false);
    // 05:30 UTC is 07:30 in Sofia — an hour early.
    expect(isReviewTime(new Date('2026-03-16T05:30:00Z'), 'Europe/Sofia')).toBe(false);
  });

  /**
   * A window, not an instant. The review is written once and found thereafter,
   * so a later tick is a no-op — but a process that was down at 08:00 must still
   * catch up rather than skipping the week in silence.
   */
  it('stays true for the rest of the day, so a restart can catch up', () => {
    expect(isReviewTime(new Date('2026-03-16T12:30:00Z'), 'Europe/Sofia')).toBe(true);
    expect(isReviewTime(new Date('2026-03-16T21:30:00Z'), 'Europe/Sofia')).toBe(true);
  });

  it('opens exactly at the configured local hour', () => {
    const hours = Array.from({ length: 24 }, (_, h) =>
      isReviewTime(new Date(`2026-03-16T${String(h).padStart(2, '0')}:15:00Z`), 'Europe/Sofia'),
    );
    expect(hours.indexOf(true)).toBe(REVIEW_HOUR - 2); // Sofia is UTC+2 in March
  });
});

describe('runDueReviews', () => {
  it('publishes for a user whose Monday morning it is', async () => {
    scriptAgent({ text: 'A steady week.' });

    const result = await runDueReviews(MONDAY_MORNING);

    expect(result.generated).toEqual([user.id]);
    expect(result.failed).toEqual([]);
    expect((await listReviews(user.id))[0]!.content).toBe('A steady week.');
  });

  it('does nothing at any other time', async () => {
    const result = await runDueReviews(new Date('2026-03-17T06:30:00Z'));
    expect(result).toMatchObject({ considered: 1, generated: [], skipped: 1 });
  });

  it('catches up later the same day after a restart, but only once', async () => {
    scriptAgent({ text: 'Caught up.' });
    // 14:30 Sofia — hours after the publishing hour the process slept through.
    expect((await runDueReviews(new Date('2026-03-16T12:30:00Z'))).generated).toEqual([user.id]);

    scriptAgent({ text: 'Should never be written.' });
    expect((await runDueReviews(new Date('2026-03-16T13:30:00Z'))).generated).toEqual([]);
    expect(await listReviews(user.id)).toHaveLength(1);
  });

  it('never writes a second review for the same week', async () => {
    const week = reviewWeekFor(localDateFor(MONDAY_MORNING, user.ctx));
    await saveReview(
      user.id,
      { week_start: week.start, week_end: week.end, days_logged: 0 } as never,
      'Already done.',
      null,
    );

    const result = await runDueReviews(MONDAY_MORNING);
    expect(result.generated).toEqual([]);
    expect(await listReviews(user.id)).toHaveLength(1);
  });

  it('skips an account that logged nothing that week', async () => {
    const dormant = await createUser();
    scriptAgent({ text: 'A steady week.' });

    const result = await runDueReviews(MONDAY_MORNING);
    expect(result.generated).toEqual([user.id]);
    expect(await listReviews(dormant.id)).toEqual([]);
  });

  it('ignores accounts that have not finished setup', async () => {
    const half = await createUser({ is_setup_complete: false });
    await addMeal(half, { date: '2026-03-11', kcal: 2000 });
    scriptAgent({ text: 'A steady week.' });

    const result = await runDueReviews(MONDAY_MORNING);
    expect(result.considered).toBe(1);
    expect(await listReviews(half.id)).toEqual([]);
  });

  it('keeps going when one account fails, and reports it', async () => {
    const second = await createUser();
    await addMeal(second, { date: '2026-03-11', kcal: 2000 });

    scriptAgent({ throws: 'model unavailable' }, { text: 'The other one worked.' });

    const logger = { info: vi.fn(), error: vi.fn() } as any;
    const result = await runDueReviews(MONDAY_MORNING, logger);

    expect(result.generated).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.error).toBe('model unavailable');
    expect(logger.error).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it('does nothing at all without agent credentials', async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { hasSubscriptionAuth } = await import('../src/ai/client.ts');
    const spy = vi.spyOn(await import('../src/ai/client.ts'), 'hasSubscriptionAuth');
    spy.mockReturnValue(false);
    void hasSubscriptionAuth;

    try {
      expect(await runDueReviews(MONDAY_MORNING)).toEqual({
        considered: 0,
        generated: [],
        skipped: 0,
        failed: [],
      });
    } finally {
      spy.mockRestore();
      process.env.ANTHROPIC_API_KEY = key;
    }
  });

  it('serves each timezone at its own Monday morning', async () => {
    const la = await createUser({ timezone: 'America/Los_Angeles' });
    await addMeal(la, { date: '2026-03-11', kcal: 2000 });

    scriptAgent({ text: 'Sofia.' });
    await runDueReviews(MONDAY_MORNING);
    // 06:30 UTC Monday is still 23:30 Sunday in Los Angeles.
    expect(await listReviews(la.id)).toEqual([]);

    // 08:30 in Los Angeles is 15:30 UTC.
    scriptAgent({ text: 'Los Angeles.' });
    await runDueReviews(new Date('2026-03-16T15:30:00Z'));
    expect((await listReviews(la.id))[0]!.content).toBe('Los Angeles.');
  });
});

describe('startScheduler', () => {
  it('ticks hourly and stops when told to', async () => {
    vi.useFakeTimers();
    // A Tuesday: the tick fires, finds nothing due, and writes nothing.
    vi.setSystemTime(new Date('2026-03-17T06:30:00Z'));
    const stop = startScheduler();
    try {
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
    expect(await listReviews(user.id)).toEqual([]);
  });

  it('does not let a failed pass become an unhandled rejection', async () => {
    const logger = { info: vi.fn(), error: vi.fn() } as any;
    const spy = vi
      .spyOn(await import('../src/services/user.ts'), 'listActiveUsers')
      .mockRejectedValue(new Error('database gone'));

    try {
      // Fire and forget: `tick` must swallow the rejection into the log.
      tick(logger);
      await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
    } finally {
      spy.mockRestore();
    }
  });
});
