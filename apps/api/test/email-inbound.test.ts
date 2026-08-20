import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query, queryOne } from '../src/db.ts';
import { env } from '../src/env.ts';
import { parseAddress, verifyWebhookSignature } from '../src/email/inbound.ts';
import { listSupportEmails, setHandled, unhandledCount } from '../src/services/support.ts';
import { anonymousApp, createUser } from './helpers/factories.ts';

/**
 * The receiving half.
 *
 * `POST /email/inbound` is public and writable, which makes it the most exposed
 * surface in the product: the signature is the only thing between the support
 * inbox and anyone who finds the URL. Most of what follows is about that.
 */

const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';

let app: FastifyInstance;

beforeEach(async () => {
  app = await anonymousApp();
  // Forced null under test so a real secret cannot make the suite accept a live
  // webhook; each case opts in with the fixture above.
  env.email.webhookSecret = SECRET;
  env.email.apiKey = 'test-key';
});

afterEach(async () => {
  await app.close();
  env.email.webhookSecret = null;
  env.email.apiKey = null;
  vi.restoreAllMocks();
});

function sign(body: string, at = Date.now(), id = 'msg_2abc'): Record<string, string> {
  const timestamp = String(Math.floor(at / 1000));
  const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
    'content-type': 'application/json',
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'email.received',
    created_at: '2026-08-20T09:15:00.000Z',
    data: {
      email_id: 'inb_123',
      from: '"Nik Lyutov" <nik@example.test>',
      to: ['support@daysofar.com'],
      subject: 'I cannot sign in',
      attachments: [],
      ...overrides,
    },
  });
}

/** Stands in for the second round trip that fetches the body. */
function stubBody(body: { text?: string | null; html?: string | null }, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response);
}

describe('verifyWebhookSignature', () => {
  const body = '{"hello":"world"}';

  it('accepts what Resend signed', () => {
    const headers = sign(body);
    expect(
      verifyWebhookSignature({
        id: headers['svix-id'],
        timestamp: headers['svix-timestamp'],
        signature: headers['svix-signature'],
        body,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it('rejects a body altered by so much as a character', () => {
    const headers = sign(body);
    expect(
      verifyWebhookSignature({
        id: headers['svix-id'],
        timestamp: headers['svix-timestamp'],
        signature: headers['svix-signature'],
        body: '{"hello":"world "}',
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    const headers = sign(body);
    expect(
      verifyWebhookSignature({
        id: headers['svix-id'],
        timestamp: headers['svix-timestamp'],
        signature: headers['svix-signature'],
        body,
        secret: 'whsec_bm90LXRoZS1yaWdodC1zZWNyZXQ=',
      }),
    ).toBe(false);
  });

  it('rejects a replay from outside the tolerance window', () => {
    const old = Date.now() - 10 * 60 * 1000;
    const headers = sign(body, old);
    const check = (now: number) =>
      verifyWebhookSignature({
        id: headers['svix-id'],
        timestamp: headers['svix-timestamp'],
        signature: headers['svix-signature'],
        body,
        secret: SECRET,
        now,
      });

    // A valid signature is valid forever; only the timestamp bounds the replay.
    expect(check(old)).toBe(true);
    expect(check(Date.now())).toBe(false);
  });

  it('rejects a timestamp from the future as readily as a stale one', () => {
    const ahead = Date.now() + 10 * 60 * 1000;
    const headers = sign(body, ahead);
    expect(
      verifyWebhookSignature({
        id: headers['svix-id'],
        timestamp: headers['svix-timestamp'],
        signature: headers['svix-signature'],
        body,
        secret: SECRET,
        now: Date.now(),
      }),
    ).toBe(false);
  });

  it('accepts any one of several signatures, which is how a secret rotates', () => {
    const headers = sign(body);
    const both = `v1,c29tZXRoaW5nRWxzZUVudGlyZWx5PT0= ${headers['svix-signature']}`;

    expect(
      verifyWebhookSignature({
        id: headers['svix-id'],
        timestamp: headers['svix-timestamp'],
        signature: both,
        body,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it('ignores versions it does not know rather than failing on them', () => {
    const headers = sign(body);
    expect(
      verifyWebhookSignature({
        id: headers['svix-id'],
        timestamp: headers['svix-timestamp'],
        signature: `v2,bm90aGluZw== ${headers['svix-signature']}`,
        body,
        secret: SECRET,
      }),
    ).toBe(true);
    // …but a v2 alone is not a pass.
    expect(
      verifyWebhookSignature({
        id: headers['svix-id'],
        timestamp: headers['svix-timestamp'],
        signature: 'v2,bm90aGluZw==',
        body,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it('refuses anything missing, malformed, or unsigned', () => {
    const base = { body, secret: SECRET };
    const headers = sign(body);

    expect(verifyWebhookSignature({ ...base, id: undefined, timestamp: '1', signature: 'v1,x' })).toBe(false);
    expect(verifyWebhookSignature({ ...base, id: 'a', timestamp: undefined, signature: 'v1,x' })).toBe(false);
    expect(verifyWebhookSignature({ ...base, id: 'a', timestamp: '1', signature: undefined })).toBe(false);
    expect(verifyWebhookSignature({ ...base, id: 'a', timestamp: 'not-a-number', signature: 'v1,x' })).toBe(false);
    // An empty secret must never verify — that is the unconfigured case.
    expect(
      verifyWebhookSignature({
        id: headers['svix-id'],
        timestamp: headers['svix-timestamp'],
        signature: headers['svix-signature'],
        body,
        secret: '',
      }),
    ).toBe(false);
  });
});

describe('parseAddress', () => {
  it('splits a display name from the address that matters', () => {
    expect(parseAddress('"Nik Lyutov" <nik@example.test>')).toEqual({
      email: 'nik@example.test',
      name: 'Nik Lyutov',
    });
    expect(parseAddress('Nik <NIK@Example.TEST>')).toEqual({
      email: 'nik@example.test',
      name: 'Nik',
    });
  });

  it('handles a bare address', () => {
    expect(parseAddress('  nik@example.test ')).toEqual({ email: 'nik@example.test', name: null });
  });

  it('keeps a name that is itself an address as a name, not the address', () => {
    // Exactly what a phisher writes; the angle brackets hold the fact.
    expect(parseAddress('"support@daysofar.com" <attacker@evil.test>')).toEqual({
      email: 'attacker@evil.test',
      name: 'support@daysofar.com',
    });
  });
});

describe('POST /email/inbound', () => {
  it('stores a verified message and fetches its body', async () => {
    const fetchSpy = stubBody({ text: 'It says my password is wrong.', html: '<p>…</p>' });
    const payload = event();

    const response = await app.inject({
      method: 'POST',
      url: '/email/inbound',
      headers: sign(payload),
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, stored: true });

    const [stored] = await listSupportEmails();
    expect(stored).toMatchObject({
      from_email: 'nik@example.test',
      from_name: 'Nik Lyutov',
      to_email: 'support@daysofar.com',
      subject: 'I cannot sign in',
      text_body: 'It says my password is wrong.',
      handled_at: null,
      user_id: null,
    });
    expect(stored!.received_at).toBe('2026-08-20T09:15:00.000Z');
    expect(fetchSpy.mock.calls[0]![0]).toContain('/emails/receiving/inb_123');
  });

  it('matches the sender to an account when there is one', async () => {
    const user = await createUser({ email: 'nik@example.test', display_name: 'Nik' });
    stubBody({ text: 'hello' });
    const payload = event();

    await app.inject({ method: 'POST', url: '/email/inbound', headers: sign(payload), payload });

    const [stored] = await listSupportEmails();
    expect(stored).toMatchObject({ user_id: user.id, user_name: 'Nik' });
  });

  it('keeps the message when the account is later deleted', async () => {
    const user = await createUser({ email: 'nik@example.test' });
    stubBody({ text: 'hello' });
    const payload = event();
    await app.inject({ method: 'POST', url: '/email/inbound', headers: sign(payload), payload });

    await query('DELETE FROM users WHERE id = $1', [user.id]);

    const [stored] = await listSupportEmails();
    expect(stored).toMatchObject({ from_email: 'nik@example.test', user_id: null });
  });

  it('refuses an unsigned request', async () => {
    const payload = event();
    const response = await app.inject({
      method: 'POST',
      url: '/email/inbound',
      headers: { 'content-type': 'application/json' },
      payload,
    });

    expect(response.statusCode).toBe(401);
    expect(await listSupportEmails()).toEqual([]);
  });

  it('refuses a body swapped after signing', async () => {
    const headers = sign(event());
    const response = await app.inject({
      method: 'POST',
      url: '/email/inbound',
      headers,
      // Signed one message, sent another.
      payload: event({ from: 'attacker@evil.test' }),
    });

    expect(response.statusCode).toBe(401);
    expect(await listSupportEmails()).toEqual([]);
  });

  it('refuses everything when no secret is configured', async () => {
    env.email.webhookSecret = null;
    const payload = event();

    const response = await app.inject({
      method: 'POST',
      url: '/email/inbound',
      headers: sign(payload),
      payload,
    });

    // Fail closed: with no secret there is no way to tell Resend from anyone.
    expect(response.statusCode).toBe(503);
    expect(await listSupportEmails()).toEqual([]);
  });

  it('is idempotent, because Svix delivers at least once', async () => {
    stubBody({ text: 'hello' });
    const payload = event();
    const headers = sign(payload);

    const first = await app.inject({ method: 'POST', url: '/email/inbound', headers, payload });
    const second = await app.inject({ method: 'POST', url: '/email/inbound', headers, payload });

    expect(first.json()).toEqual({ ok: true, stored: true });
    expect(second.json()).toEqual({ ok: true, stored: false });
    expect(await listSupportEmails()).toHaveLength(1);
  });

  it('acknowledges an event type it does not handle, rather than making Svix retry', async () => {
    const payload = JSON.stringify({ type: 'email.delivered', data: { email_id: 'x' } });

    const response = await app.inject({
      method: 'POST',
      url: '/email/inbound',
      headers: sign(payload),
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, stored: false });
    expect(await listSupportEmails()).toEqual([]);
  });

  it('keeps the message and says why when the body cannot be fetched', async () => {
    stubBody({}, false);
    const payload = event();

    const response = await app.inject({
      method: 'POST',
      url: '/email/inbound',
      headers: sign(payload),
      payload,
    });

    // A non-2xx here would have Svix redeliver a message already on disk, into
    // the same failing fetch. "Somebody wrote in and we lost it" is the outcome
    // worth avoiding, not a gap in one column.
    expect(response.statusCode).toBe(200);
    const [stored] = await listSupportEmails();
    expect(stored!.text_body).toBeNull();
    expect(stored!.body_error).toContain('500');
  });

  it('counts attachments without storing them', async () => {
    stubBody({ text: 'see attached' });
    const payload = event({ attachments: [{ id: 'a1' }, { id: 'a2' }] });

    await app.inject({ method: 'POST', url: '/email/inbound', headers: sign(payload), payload });

    const [stored] = await listSupportEmails();
    expect(stored!.attachments).toBe(2);
  });

  it('copes with a message that has no subject and no recipient list', async () => {
    stubBody({ text: 'hi' });
    const payload = event({ subject: null, to: [] });

    await app.inject({ method: 'POST', url: '/email/inbound', headers: sign(payload), payload });

    const [stored] = await listSupportEmails();
    expect(stored).toMatchObject({ subject: null, to_email: '' });
  });
});

describe('the inbox', () => {
  async function store(providerId: string, subject: string) {
    const { recordSupportEmail } = await import('../src/services/support.ts');
    return recordSupportEmail({
      providerId,
      fromEmail: 'someone@example.test',
      fromName: null,
      toEmail: 'support@daysofar.com',
      subject,
      attachments: 0,
      receivedAt: new Date(),
    });
  }

  it('puts what still needs an answer first', async () => {
    const first = await store('a', 'First');
    await store('b', 'Second');
    await setHandled(first!, true);

    expect((await listSupportEmails()).map((e) => e.subject)).toEqual(['Second', 'First']);
    expect(await unhandledCount()).toBe(1);
  });

  it('reopens as readily as it closes', async () => {
    const id = await store('a', 'First');
    await setHandled(id!, true);
    expect(await unhandledCount()).toBe(0);

    await setHandled(id!, false);
    expect(await unhandledCount()).toBe(1);
  });

  it('reports a message that is not there', async () => {
    expect(await setHandled('00000000-0000-0000-0000-000000000000', true)).toBe(false);
  });

  it('honours the limit', async () => {
    for (const id of ['a', 'b', 'c']) await store(id, id);
    expect(await listSupportEmails(2)).toHaveLength(2);
  });
});

describe('GET /admin/support', () => {
  it('is admin-only, like everything else on that panel', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/support' });
    expect(response.statusCode).toBe(401);
  });

  it('serves the inbox to an admin', async () => {
    const admin = await createUser();
    env.adminEmails.push(admin.email.toLowerCase());
    try {
      const { appFor } = await import('./helpers/factories.ts');
      const { app: signedIn, cookie } = await appFor(admin);
      try {
        stubBody({ text: 'hello' });
        const payload = event();
        await app.inject({ method: 'POST', url: '/email/inbound', headers: sign(payload), payload });

        const response = await signedIn.inject({
          method: 'GET',
          url: '/admin/support',
          headers: { cookie },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().unhandled).toBe(1);
        expect(response.json().emails[0]).toMatchObject({ subject: 'I cannot sign in' });

        const marked = await signedIn.inject({
          method: 'POST',
          url: `/admin/support/${response.json().emails[0].id}/handled`,
          headers: { cookie },
          payload: { handled: true },
        });
        expect(marked.statusCode).toBe(200);
        expect(await unhandledCount()).toBe(0);
      } finally {
        await signedIn.close();
      }
    } finally {
      env.adminEmails.pop();
    }
  });
});
