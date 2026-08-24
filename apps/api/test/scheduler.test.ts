import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isReviewTime, REVIEW_HOUR, runDueReviews, startScheduler, tick } from '../src/scheduler.ts';
import { listReviews, reviewWeekFor, saveReview } from '../src/services/reviews.ts';
import { localDateFor } from '../src/time.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import { mailbox } from './helpers/email.ts';
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
  /*
   * On a plan that carries a review, because that is what these tests are
   * about — the timing. Both scheduled passes are entitlements now (`plans.ts`
   * puts `reviewsPerDay` and `nudgesPerWeek` at zero on free), so a default
   * `free` fixture would make every case below pass for the wrong reason: the
   * clock would be right and nothing would publish. The entitlement itself is
   * covered separately at the foot of `runDueReviews`.
   */
  user = await createUser({ plan: 'plus' });
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

  /**
   * The entitlement, on the one path that can spend it unasked.
   *
   * `POST /reviews/run` has answered 402 to a free account since the meters
   * landed, and that made this look covered — but the route is the door
   * somebody knocks on, and this pass knocks on its own every Monday for every
   * active account. Free accounts were refused the button and posted the
   * review anyway, at roughly $0.15 a week each, against a tier whose whole
   * design is a steady state of zero.
   */
  it('skips an account whose plan does not include a review', async () => {
    const free = await createUser({ plan: 'free', timezone: 'Europe/Sofia' });
    await addMeal(free, { date: '2026-03-11', kcal: 2100 });
    scriptAgent({ text: 'A steady week.' });

    const result = await runDueReviews(MONDAY_MORNING);

    expect(result.generated).toEqual([user.id]);
    expect(await listReviews(free.id)).toEqual([]);
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
    const second = await createUser({ plan: 'plus' });
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
    const la = await createUser({ timezone: 'America/Los_Angeles', plan: 'plus' });
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

/**
 * The review lands in the inbox as well as in the app. It is the one
 * notification the product sends because it wants to rather than because
 * something happened to the account, so the guards around it matter more than
 * the sending does.
 */
describe('the weekly review email', () => {
  it('goes out with the review it announces', async () => {
    scriptAgent({ text: 'A steady week.' });
    await runDueReviews(MONDAY_MORNING);

    expect(mailbox()).toHaveLength(1);
    expect(mailbox()[0]).toMatchObject({ to: user.email, subject: 'Your week: 9–15 March' });
    expect(mailbox()[0]!.text).toContain('A steady week.');
  });

  it('is sent once, however many times the tick runs that day', async () => {
    scriptAgent({ text: 'A steady week.' });
    await runDueReviews(MONDAY_MORNING);
    await runDueReviews(new Date('2026-03-16T09:30:00Z'));
    await runDueReviews(new Date('2026-03-16T13:30:00Z'));

    // The second tick finds the review already written and stops before the
    // send; the key in `email_deliveries` is what makes that belt-and-braces.
    expect(mailbox()).toHaveLength(1);
  });

  it('is not sent to an account that turned it off', async () => {
    const quiet = await createUser({ notify_weekly_review: false, plan: 'plus' });
    await addMeal(quiet, { date: '2026-03-11', kcal: 2000 });
    scriptAgent({ text: 'One.' }, { text: 'Two.' });

    const result = await runDueReviews(MONDAY_MORNING);

    // Still written — the screen is not a subscription.
    expect(result.generated).toHaveLength(2);
    expect(await listReviews(quiet.id)).toHaveLength(1);
    expect(mailbox().map((message) => message.to)).toEqual([user.email]);
  });

  it('does not fail the review when the provider does', async () => {
    const { setTransport } = await import('../src/email/transport.ts');
    setTransport({
      name: 'broken',
      send: async () => {
        throw new Error('provider on fire');
      },
    });
    scriptAgent({ text: 'A steady week.' });

    const result = await runDueReviews(MONDAY_MORNING);

    expect(result.generated).toEqual([user.id]);
    expect(result.failed).toEqual([]);
    expect(await listReviews(user.id)).toHaveLength(1);
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
