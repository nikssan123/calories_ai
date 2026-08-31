import { afterEach, describe, expect, it, vi } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { env } from '../src/env.ts';
import {
  deliveryNeedsRetry,
  MAX_DELIVERY_ATTEMPTS,
  recentDeliveries,
  sendEmail,
} from '../src/email/send.ts';
import { EmailDeliveryError, setTransport, type EmailTransport } from '../src/email/transport.ts';
import type { EmailMessage } from '../src/email/templates.ts';
import { createUser } from './helpers/factories.ts';
import { mailbox, resetMailbox } from './helpers/email.ts';

/**
 * The delivery layer, which exists to keep two promises: sending must never be
 * able to fail the thing that caused it, and a message must never go out twice
 * because a job ran twice.
 */

const MESSAGE: EmailMessage = {
  template: 'test_message',
  category: 'account',
  subject: 'A subject',
  html: '<p>Body</p>',
  text: 'Body',
};

afterEach(() => {
  env.email.redirectTo = null;
  resetMailbox();
  vi.restoreAllMocks();
});

async function deliveries() {
  return query<any>('SELECT * FROM email_deliveries ORDER BY created_at');
}

describe('sendEmail', () => {
  it('sends, and records what was sent against the account', async () => {
    const user = await createUser();
    const result = await sendEmail({ to: user.email, userId: user.id, message: MESSAGE });

    expect(result).toMatchObject({ status: 'sent', id: 'test-1' });
    expect(mailbox()).toHaveLength(1);
    expect(mailbox()[0]).toMatchObject({ to: user.email, subject: 'A subject', text: 'Body' });

    const rows = await deliveries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: user.id,
      to_email: user.email,
      template: 'test_message',
      subject: 'A subject',
      status: 'sent',
      provider_id: 'test-1',
      error: null,
    });
  });

  it('records a message to an account that no longer exists', async () => {
    // The last email an account gets is the one saying it was deleted, and the
    // row for it cannot reference a user row that has just gone.
    const result = await sendEmail({ to: 'gone@example.test', userId: null, message: MESSAGE });

    expect(result.status).toBe('sent');
    expect((await deliveries())[0]).toMatchObject({ user_id: null, to_email: 'gone@example.test' });
  });

  it('reports a provider failure instead of throwing it at the caller', async () => {
    const user = await createUser();
    setTransport({
      name: 'broken',
      send: async () => {
        throw new EmailDeliveryError('The from address is not verified', 422);
      },
    });

    // Nobody's signup should 500 because Resend is having an afternoon.
    const result = await sendEmail({
      to: user.email,
      userId: user.id,
      message: MESSAGE,
      logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() } as never,
    });

    expect(result).toMatchObject({ status: 'failed', reason: 'The from address is not verified' });
    expect((await deliveries())[0]).toMatchObject({
      status: 'failed',
      error: 'The from address is not verified',
      provider_id: null,
    });
  });

  it('records a failure that is not an EmailDeliveryError at all', async () => {
    const user = await createUser();
    setTransport({
      name: 'broken',
      send: async () => {
        throw new TypeError('undefined is not a function');
      },
    });

    const result = await sendEmail({ to: user.email, userId: user.id, message: MESSAGE });
    expect(result).toMatchObject({ status: 'failed', reason: 'undefined is not a function' });
  });

  it('truncates a runaway error rather than letting it bloat the row', async () => {
    const user = await createUser();
    setTransport({
      name: 'broken',
      send: async () => {
        throw new Error('x'.repeat(2000));
      },
    });

    await sendEmail({ to: user.email, userId: user.id, message: MESSAGE });
    expect((await deliveries())[0]!.error).toHaveLength(500);
  });

  it('distinguishes "logged" from "sent" when there is no provider', async () => {
    const user = await createUser();
    const logged: EmailTransport = {
      name: 'log',
      send: async () => ({ id: null, status: 'logged' }),
    };
    setTransport(logged);

    const result = await sendEmail({ to: user.email, userId: user.id, message: MESSAGE });
    expect(result.status).toBe('logged');
    expect((await deliveries())[0]!.status).toBe('logged');
  });
});

describe('idempotency', () => {
  it('sends once for a key, and refuses every attempt after', async () => {
    const user = await createUser();
    const send = () =>
      sendEmail({
        to: user.email,
        userId: user.id,
        message: MESSAGE,
        idempotencyKey: `weekly_review:${user.id}:2026-08-10`,
      });

    expect((await send()).status).toBe('sent');
    expect(await send()).toMatchObject({ status: 'skipped', reason: 'already sent' });
    expect(await send()).toMatchObject({ status: 'skipped', reason: 'already sent' });

    expect(mailbox()).toHaveLength(1);
    expect(await deliveries()).toHaveLength(1);
  });

  it('sends once even when two ticks overlap', async () => {
    const user = await createUser();
    const send = () =>
      sendEmail({
        to: user.email,
        userId: user.id,
        message: MESSAGE,
        idempotencyKey: 'racing',
      });

    const results = await Promise.all([send(), send(), send()]);

    expect(results.filter((r) => r.status === 'sent')).toHaveLength(1);
    expect(mailbox()).toHaveLength(1);
  });

  it('does not collapse different keys', async () => {
    const user = await createUser();
    for (const week of ['2026-08-03', '2026-08-10']) {
      await sendEmail({
        to: user.email,
        userId: user.id,
        message: MESSAGE,
        idempotencyKey: `weekly_review:${user.id}:${week}`,
      });
    }
    expect(mailbox()).toHaveLength(2);
  });

  it('lets unkeyed messages repeat, because most of them should', async () => {
    const user = await createUser();
    await sendEmail({ to: user.email, userId: user.id, message: MESSAGE });
    await sendEmail({ to: user.email, userId: user.id, message: MESSAGE });

    // Two sign-ins from two new devices are two emails.
    expect(mailbox()).toHaveLength(2);
  });

  it('claims the key before sending, so a crash mid-send cannot duplicate', async () => {
    const user = await createUser();
    setTransport({
      name: 'crashes',
      send: async () => {
        // A row must already exist at this point, or a retry after a crash here
        // would find the key unclaimed and send a second copy.
        const row = await queryOne<{ status: string }>(
          'SELECT status FROM email_deliveries WHERE idempotency_key = $1',
          ['claimed-first'],
        );
        expect(row?.status).toBe('pending');
        throw new Error('process died');
      },
    });

    await sendEmail({
      to: user.email,
      userId: user.id,
      message: MESSAGE,
      idempotencyKey: 'claimed-first',
    });
  });
});

/**
 * The other half of the key, and the half that was missing.
 *
 * A claim is taken before the request, so a send that failed left the key held
 * by a message that never went — and every later attempt was answered "already
 * sent". Silent, permanent, and at its worst on the Monday review, which goes
 * out to everybody at once over a rate-limited provider: a handful of failures
 * is not a possibility at that volume, it is arithmetic.
 */
describe('retrying a delivery that failed', () => {
  /** A transport that fails the first `n` sends and then works. */
  function flaky(failures: number): EmailTransport {
    let seen = 0;
    return {
      name: 'flaky',
      async send() {
        seen += 1;
        if (seen <= failures) throw new EmailDeliveryError('rate limited', 429);
        return { id: `re_${seen}`, status: 'sent' as const };
      },
    };
  }

  it('claims the key again after a failure, and sends on the retry', async () => {
    const user = await createUser();
    setTransport(flaky(1));
    const send = () =>
      sendEmail({ to: user.email, userId: user.id, message: MESSAGE, idempotencyKey: 'owed' });

    expect(await send()).toMatchObject({ status: 'failed', reason: 'rate limited' });
    expect(await send()).toMatchObject({ status: 'sent', id: 're_2' });

    // One row throughout — the claim was re-taken, not duplicated — and it
    // counts both attempts.
    const rows = await deliveries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'sent', attempts: 2, error: null });
  });

  it('still refuses to send a second copy of one that succeeded', async () => {
    const user = await createUser();
    const send = () =>
      sendEmail({ to: user.email, userId: user.id, message: MESSAGE, idempotencyKey: 'done' });

    expect((await send()).status).toBe('sent');
    expect(await send()).toMatchObject({ status: 'skipped', reason: 'already sent' });
    expect(mailbox()).toHaveLength(1);
  });

  it('gives up rather than retrying an address that will never take mail', async () => {
    const user = await createUser();
    setTransport(flaky(Infinity));
    const send = () =>
      sendEmail({ to: user.email, userId: user.id, message: MESSAGE, idempotencyKey: 'hopeless' });

    const statuses: string[] = [];
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS + 3; i += 1) statuses.push((await send()).status);

    // Five real attempts, then the claim stops being re-granted. Without the
    // bound a hard bounce becomes an hourly ritual for as long as the pass runs.
    expect(statuses.filter((s) => s === 'failed')).toHaveLength(MAX_DELIVERY_ATTEMPTS);
    expect(statuses.filter((s) => s === 'skipped')).toHaveLength(3);
    expect((await deliveries())[0]).toMatchObject({
      status: 'failed',
      attempts: MAX_DELIVERY_ATTEMPTS,
    });
  });

  /**
   * The row nobody came back to settle: a process killed between the claim and
   * the update. It looks exactly like a send in flight, so the only thing that
   * tells them apart is how long it has looked that way.
   */
  it('recovers a claim abandoned by a process that died mid-send', async () => {
    const user = await createUser();
    setTransport({
      name: 'vanishes',
      send: async () => {
        throw new Error('process died');
      },
    });
    await sendEmail({ to: user.email, userId: user.id, message: MESSAGE, idempotencyKey: 'stuck' });
    await query(
      `UPDATE email_deliveries SET status = 'pending', error = NULL WHERE idempotency_key = $1`,
      ['stuck'],
    );

    // Still in flight as far as anyone can tell, so it is left alone.
    expect(await deliveryNeedsRetry('stuck')).toBe(false);

    await query(
      `UPDATE email_deliveries SET last_attempt_at = now() - interval '1 hour'
        WHERE idempotency_key = $1`,
      ['stuck'],
    );

    expect(await deliveryNeedsRetry('stuck')).toBe(true);
    resetMailbox();
    expect(
      (await sendEmail({ to: user.email, userId: user.id, message: MESSAGE, idempotencyKey: 'stuck' }))
        .status,
    ).toBe('sent');
    expect(mailbox()).toHaveLength(1);
  });
});

describe('deliveryNeedsRetry', () => {
  /**
   * False, not true, and the distinction is the whole reason this is not simply
   * "is it unsent?". No row means no attempt was ever made — which for the
   * scheduler is a review somebody generated with the button in the app, where
   * `POST /reviews/run` deliberately sends no mail because they are already
   * reading it. True here would post it to them the following Monday as news.
   */
  it('is false for a key nothing has ever claimed, so it retries rather than originates', async () => {
    expect(await deliveryNeedsRetry('never-heard-of-it')).toBe(false);
  });

  it('is false once the message has gone', async () => {
    const user = await createUser();
    await sendEmail({ to: user.email, userId: user.id, message: MESSAGE, idempotencyKey: 'gone' });
    expect(await deliveryNeedsRetry('gone')).toBe(false);
  });

  it('is true after a failure, and false again once it is out of attempts', async () => {
    const user = await createUser();
    setTransport({
      name: 'broken',
      send: async () => {
        throw new EmailDeliveryError('nope', 500);
      },
    });

    await sendEmail({ to: user.email, userId: user.id, message: MESSAGE, idempotencyKey: 'owed2' });
    expect(await deliveryNeedsRetry('owed2')).toBe(true);

    await query('UPDATE email_deliveries SET attempts = $1 WHERE idempotency_key = $2', [
      MAX_DELIVERY_ATTEMPTS,
      'owed2',
    ]);
    expect(await deliveryNeedsRetry('owed2')).toBe(false);
  });
});

describe('EMAIL_REDIRECT_TO', () => {
  it('sends everything to one address, saying who it was for', async () => {
    const user = await createUser();
    env.email.redirectTo = 'me@example.test';

    const result = await sendEmail({ to: user.email, userId: user.id, message: MESSAGE });

    expect(result.status).toBe('sent');
    expect(mailbox()[0]).toMatchObject({
      to: 'me@example.test',
      subject: `[to: ${user.email}] A subject`,
    });
    // The log says where it actually went, not where it was addressed.
    expect((await deliveries())[0]).toMatchObject({ to_email: 'me@example.test' });
  });

  it('leaves the subject alone when the redirect is the real recipient', async () => {
    const user = await createUser();
    env.email.redirectTo = user.email;

    await sendEmail({ to: user.email, userId: user.id, message: MESSAGE });
    expect(mailbox()[0]!.subject).toBe('A subject');
  });
});

describe('recentDeliveries', () => {
  it('lists what an account was sent, newest first', async () => {
    const user = await createUser();
    await sendEmail({ to: user.email, userId: user.id, message: MESSAGE });
    await sendEmail({
      to: user.email,
      userId: user.id,
      message: { ...MESSAGE, template: 'second', subject: 'Later' },
    });

    const rows = await recentDeliveries(user.id);
    expect(rows.map((row) => row.template)).toEqual(['second', 'test_message']);
    expect(rows[0]).toMatchObject({ subject: 'Later', status: 'sent', error: null });
    expect(rows[0]!.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('shows nothing from another account', async () => {
    const mine = await createUser();
    const theirs = await createUser();
    await sendEmail({ to: theirs.email, userId: theirs.id, message: MESSAGE });

    expect(await recentDeliveries(mine.id)).toEqual([]);
  });

  it('honours the limit', async () => {
    const user = await createUser();
    for (let i = 0; i < 4; i++) {
      await sendEmail({ to: user.email, userId: user.id, message: MESSAGE });
    }
    expect(await recentDeliveries(user.id, 2)).toHaveLength(2);
  });
});
