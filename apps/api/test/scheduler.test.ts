import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../src/db.ts';
import { MAX_DELIVERY_ATTEMPTS } from '../src/email/send.ts';
import { EmailDeliveryError } from '../src/email/transport.ts';
import { isReviewTime, REVIEW_HOUR, runDueReviews, startScheduler, tick } from '../src/scheduler.ts';
import { listReviews, reviewWeekFor, saveReview } from '../src/services/reviews.ts';
import { localDateFor } from '../src/time.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import { mailbox, resetMailbox } from './helpers/email.ts';
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

  /**
   * And does not even read the account to find that out.
   *
   * `considered: 0` rather than the 1 this asserted while the pass walked every
   * user every hour and asked each one's clock. The question is answered per
   * *timezone* now — there is one query for the zones in play, nobody's Monday
   * is among them on a Tuesday, and no user rows are read at all. What the
   * counter means is unchanged: the accounts this pass had to look at.
   */
  it('does nothing at any other time, and reads nobody to decide it', async () => {
    const result = await runDueReviews(new Date('2026-03-17T06:30:00Z'));
    expect(result).toMatchObject({ considered: 0, generated: [], skipped: 0 });
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

  /**
   * The pass narrows to due timezones before it reads any accounts, and reads
   * a zone by handing it to `Intl` — which throws a `RangeError` on a name it
   * does not carry. `timezone` is stored as the client sent it and validated
   * against nothing, so one account whose browser knows a zone this runtime
   * does not must not be the reason nobody's review is published.
   */
  it('publishes for everyone else when one account has an unreadable timezone', async () => {
    const broken = await createUser({ plan: 'plus' });
    await addMeal(broken, { date: '2026-03-11', kcal: 2000 });
    // Set afterwards, because a fixture cannot log a meal in a zone `Intl`
    // refuses to read either — which is itself the point: this row can only
    // come from a client, and nothing between there and here checks it.
    await query('UPDATE users SET timezone = $1 WHERE id = $2', ['Mars/Olympus_Mons', broken.id]);
    scriptAgent({ text: 'A steady week.' });

    const logger = { info: vi.fn(), error: vi.fn() } as any;
    const result = await runDueReviews(MONDAY_MORNING, logger);

    expect(result.generated).toEqual([user.id]);
    expect(await listReviews(broken.id)).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'Mars/Olympus_Mons' }),
      expect.any(String),
    );
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

  /**
   * The bug this pass had for as long as it has been sending mail.
   *
   * A review is written once and found by every later tick, and finding it used
   * to end the story — which was true of the review and false of the email, the
   * one part of Monday that talks to somebody else's server. A 429, a restart
   * mid-send, and that account's review existed, in an app nobody had been told
   * to open, and was never mentioned again. Invisible at five users; at a
   * thousand it is arithmetic, and every instance is somebody who paid for it.
   */
  it('sends the review email on a later tick when the first attempt failed', async () => {
    const { setTransport } = await import('../src/email/transport.ts');
    setTransport({
      name: 'broken',
      send: async () => {
        throw new EmailDeliveryError('rate limited', 429);
      },
    });
    scriptAgent({ text: 'A steady week.' });

    await runDueReviews(MONDAY_MORNING);
    expect(await listReviews(user.id)).toHaveLength(1);
    expect(mailbox()).toHaveLength(0);

    // Nine o'clock, the provider is itself again, and the review that was
    // already written is not regenerated — it is simply posted.
    resetMailbox();
    const result = await runDueReviews(new Date('2026-03-16T07:30:00Z'));

    expect(result.generated).toEqual([]);
    expect(mailbox()).toHaveLength(1);
    expect(mailbox()[0]).toMatchObject({ to: user.email });
    expect(await listReviews(user.id)).toHaveLength(1);
  });

  /**
   * The other side of that, and the reason the retry is email-only.
   *
   * A push has no idempotency key and no row to key one on, so a second attempt
   * is not a retry — it is a second notification. Re-sending it on every tick of
   * a Monday would be a considerably worse bug than the one above.
   */
  it('does not push again while retrying the email', async () => {
    const { setTransport } = await import('../src/email/transport.ts');
    const pushes = vi.spyOn(await import('../src/push/notify.ts'), 'sendWeeklyReviewPush');
    setTransport({
      name: 'broken',
      send: async () => {
        throw new EmailDeliveryError('rate limited', 429);
      },
    });
    scriptAgent({ text: 'A steady week.' });

    try {
      await runDueReviews(MONDAY_MORNING);
      expect(pushes).toHaveBeenCalledTimes(1);

      for (const hour of ['07:30', '08:30', '09:30']) {
        await runDueReviews(new Date(`2026-03-16T${hour}:00Z`));
      }
      expect(pushes).toHaveBeenCalledTimes(1);
    } finally {
      pushes.mockRestore();
    }
  });

  it('stops retrying the email once it is out of attempts', async () => {
    const { setTransport } = await import('../src/email/transport.ts');
    let attempts = 0;
    setTransport({
      name: 'broken',
      send: async () => {
        attempts += 1;
        throw new EmailDeliveryError('rate limited', 429);
      },
    });
    scriptAgent({ text: 'A steady week.' });

    // Publishing, then every remaining tick of a very long Monday.
    await runDueReviews(MONDAY_MORNING);
    for (let hour = 7; hour < 22; hour += 1) {
      await runDueReviews(new Date(`2026-03-16T${String(hour).padStart(2, '0')}:30:00Z`));
    }

    // Five, not sixteen. A hard bounce must not become an hourly ritual for as
    // long as the pass keeps running.
    expect(attempts).toBe(MAX_DELIVERY_ATTEMPTS);
  });

  it('does not re-send a review email that already went', async () => {
    scriptAgent({ text: 'A steady week.' });
    await runDueReviews(MONDAY_MORNING);
    expect(mailbox()).toHaveLength(1);

    for (const hour of ['07:30', '11:30', '19:30']) {
      await runDueReviews(new Date(`2026-03-16T${hour}:00Z`));
    }
    expect(mailbox()).toHaveLength(1);
  });

  /**
   * The retry retries; it does not originate.
   *
   * `POST /reviews/run` writes a review and deliberately sends no mail — the
   * person is looking at it. So a week with a review and no delivery row is not
   * a failure to recover from, and posting it to them on Monday as though it
   * were news would be a new bug wearing the fix's clothes.
   */
  it('does not email a review the user generated themselves in the app', async () => {
    const week = reviewWeekFor(localDateFor(MONDAY_MORNING, user.ctx));
    await saveReview(
      user.id,
      { week_start: week.start, week_end: week.end, days_logged: 3 } as never,
      'I pressed the button on Sunday.',
      null,
    );

    for (const hour of ['06:30', '09:30', '15:30']) {
      await runDueReviews(new Date(`2026-03-16T${hour}:00Z`));
    }

    expect(mailbox()).toHaveLength(0);
    expect(await listReviews(user.id)).toHaveLength(1);
  });
});

/**
 * The pass runs its accounts in parallel, which is the difference between a
 * Monday-morning email and a Monday-evening one. At forty seconds a review, a
 * thousand accounts serially is eleven hours.
 */
describe('the pass runs accounts in parallel', () => {
  it('has several reviews in flight at once', async () => {
    const others = [];
    for (let i = 0; i < 6; i += 1) {
      const extra = await createUser({ plan: 'plus' });
      await addMeal(extra, { date: '2026-03-11', kcal: 2000 });
      others.push(extra);
    }

    let live = 0;
    let peak = 0;
    scriptAgent(
      ...Array.from({ length: 7 }, () => ({
        text: 'A steady week.',
        act: async () => {
          live += 1;
          peak = Math.max(peak, live);
          await new Promise((resolve) => setTimeout(resolve, 20));
          live -= 1;
        },
      })),
    );

    const result = await runDueReviews(MONDAY_MORNING);

    expect(result.generated).toHaveLength(7);
    expect(peak).toBeGreaterThan(1);
    expect(live).toBe(0);
    // Every account still got exactly one, which is the property the width must
    // never cost: two workers cannot publish the same week.
    for (const account of [user, ...others]) {
      expect(await listReviews(account.id)).toHaveLength(1);
    }
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
