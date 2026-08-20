import { afterEach, describe, expect, it, vi } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { env } from '../src/env.ts';
import { recentDeliveries, sendEmail } from '../src/email/send.ts';
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
