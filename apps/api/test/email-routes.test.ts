import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query, queryOne } from '../src/db.ts';
import { unsubscribeLink } from '../src/email/unsubscribe.ts';
import { issueToken } from '../src/services/tokens.ts';
import { anonymousApp, appFor, createUser } from './helpers/factories.ts';
import { lastEmail, mailbox } from './helpers/email.ts';

/**
 * The flows end to end, through HTTP.
 *
 * The unit tests below this cover whether a token can be spent twice; these
 * cover the things only the route knows — that an unknown address is answered
 * identically to a known one, that a reset takes every session with it, and
 * that an unsubscribe link works with no session at all.
 */

let app: FastifyInstance;

const CREDENTIALS = { email: 'nik@example.test', password: 'correct-horse' };
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';

beforeEach(async () => {
  app = await anonymousApp();
});

afterEach(async () => {
  await app.close();
});

/** A real account, created the way a person would, so its password works. */
async function signUp(headers: Record<string, string> = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: CREDENTIALS,
    headers,
  });
  expect(response.statusCode).toBe(200);
  return response;
}

function tokenFrom(pattern: RegExp): string {
  const match = lastEmail()!.text.match(pattern);
  expect(match, `no link matching ${pattern} in the last email`).not.toBeNull();
  return decodeURIComponent(match![1]!);
}

describe('POST /auth/signup', () => {
  it('sends the confirmation email', async () => {
    await signUp();

    expect(mailbox()).toHaveLength(1);
    expect(lastEmail()!.to).toBe(CREDENTIALS.email);
    expect(lastEmail()!.subject).toMatch(/^\d{6} is your Day So Far confirmation code$/);
  });

  it('creates the account unconfirmed, and does not gate anything on it', async () => {
    const response = await signUp();

    expect(response.json().profile).toMatchObject({ email_verified: false });
    // Signed in regardless: nothing in the product waits for the link.
    expect(response.json().authenticated).toBe(true);
  });

  it('does not report the signup device as a new sign-in', async () => {
    await signUp({ 'user-agent': CHROME });

    // "We noticed a sign-in" as the opening message of a new account is absurd.
    expect(mailbox()).toHaveLength(1);
    expect(lastEmail()!.subject).toMatch(/confirmation code$/);
    expect(await query('SELECT 1 FROM known_devices')).toHaveLength(1);
  });

  it('still creates the account when the provider is down', async () => {
    const { setTransport } = await import('../src/email/transport.ts');
    setTransport({
      name: 'broken',
      send: async () => {
        throw new Error('provider on fire');
      },
    });

    const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });

    expect(response.statusCode).toBe(200);
    expect(await query('SELECT 1 FROM users WHERE email IS NOT NULL')).toHaveLength(1);
    expect((await query<any>('SELECT status FROM email_deliveries'))[0]!.status).toBe('failed');
  });
});

describe('POST /auth/login', () => {
  it('emails an alert for a device this account has not used', async () => {
    await signUp({ 'user-agent': CHROME });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: CREDENTIALS,
      headers: { 'user-agent': FIREFOX },
    });

    expect(response.statusCode).toBe(200);
    expect(lastEmail()).toMatchObject({ subject: 'New sign-in to Day So Far' });
    expect(lastEmail()!.text).toContain('Firefox on Windows');
  });

  it('says nothing when the device is a familiar one', async () => {
    await signUp({ 'user-agent': CHROME });
    const before = mailbox().length;

    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: CREDENTIALS,
      headers: { 'user-agent': CHROME },
    });

    expect(mailbox()).toHaveLength(before);
  });

  it('says nothing when the password was wrong', async () => {
    await signUp({ 'user-agent': CHROME });
    const before = mailbox().length;

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { ...CREDENTIALS, password: 'wrong-horse' },
      headers: { 'user-agent': FIREFOX },
    });

    // Otherwise the alert is a way to make this server mail someone on demand.
    expect(response.statusCode).toBe(401);
    expect(mailbox()).toHaveLength(before);
    expect(await query('SELECT 1 FROM known_devices')).toHaveLength(1);
  });
});

describe('POST /auth/password/forgot', () => {
  it('emails a link to an address that has an account', async () => {
    const user = await createUser();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/forgot',
      payload: { email: user.email },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    expect(lastEmail()).toMatchObject({ to: user.email, subject: 'Reset your password' });
  });

  it('answers an unknown address identically, and sends nothing', async () => {
    const known = await createUser();

    const forKnown = await app.inject({
      method: 'POST',
      url: '/auth/password/forgot',
      payload: { email: known.email },
    });
    const forUnknown = await app.inject({
      method: 'POST',
      url: '/auth/password/forgot',
      payload: { email: 'stranger@example.test' },
    });

    // A form that says "no account with that email" is a form that will be fed
    // a list of addresses to find out who uses this product.
    expect(forUnknown.statusCode).toBe(forKnown.statusCode);
    expect(forUnknown.json()).toEqual(forKnown.json());
    expect(mailbox()).toHaveLength(1);
  });

  it('rejects something that is not an address', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/forgot',
      payload: { email: 'not-an-address' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /auth/password/reset', () => {
  async function requestReset(email: string): Promise<string> {
    await app.inject({ method: 'POST', url: '/auth/password/forgot', payload: { email } });
    return tokenFrom(/\/reset\?token=(\S+)/);
  }

  it('changes the password so the new one works and the old one does not', async () => {
    await signUp();
    const token = await requestReset(CREDENTIALS.email);

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: { token, password: 'a-brand-new-password' },
    });
    expect(reset.statusCode).toBe(200);

    const withNew = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { ...CREDENTIALS, password: 'a-brand-new-password' },
    });
    const withOld = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: CREDENTIALS,
    });
    expect(withNew.statusCode).toBe(200);
    expect(withOld.statusCode).toBe(401);
  });

  it('signs every device out', async () => {
    const user = await createUser();
    const { app: signedIn, cookie } = await appFor(user);
    try {
      const token = await requestReset(user.email);
      await app.inject({
        method: 'POST',
        url: '/auth/password/reset',
        payload: { token, password: 'a-brand-new-password' },
      });

      // Someone resetting a password they did not choose to change is telling
      // you they think somebody else is inside. Leaving that session alive
      // would make the reset theatre.
      const me = await signedIn.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
      expect(me.json().authenticated).toBe(false);
      expect(await query('SELECT 1 FROM auth_sessions')).toHaveLength(0);
    } finally {
      await signedIn.close();
    }
  });

  it('emails the owner that it happened', async () => {
    const user = await createUser();
    const token = await requestReset(user.email);
    await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: { token, password: 'a-brand-new-password' },
    });

    expect(lastEmail()).toMatchObject({ to: user.email, subject: 'Your password was changed' });
  });

  it('treats reading the reset link as proof of the address', async () => {
    const user = await createUser();
    await query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [user.id]);

    const token = await requestReset(user.email);
    await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: { token, password: 'a-brand-new-password' },
    });

    // Two links to prove one mailbox is a chore with no security in it.
    const row = await queryOne<{ email_verified_at: string | null }>(
      'SELECT email_verified_at FROM users WHERE id = $1',
      [user.id],
    );
    expect(row!.email_verified_at).not.toBeNull();
  });

  it('refuses a token that has already been spent', async () => {
    const user = await createUser();
    const token = await requestReset(user.email);
    const payload = { token, password: 'a-brand-new-password' };

    expect((await app.inject({ method: 'POST', url: '/auth/password/reset', payload })).statusCode)
      .toBe(200);
    const second = await app.inject({ method: 'POST', url: '/auth/password/reset', payload });
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toContain('already been used');
  });

  it('refuses an expired token', async () => {
    const user = await createUser();
    const token = await requestReset(user.email);
    await query("UPDATE auth_tokens SET expires_at = now() - interval '1 minute'");

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: { token, password: 'a-brand-new-password' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a confirmation token presented as a reset', async () => {
    const user = await createUser();
    const { token } = await issueToken(user.id, 'email_verification', user.email);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: { token, password: 'a-brand-new-password' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a password too short to be worth setting', async () => {
    const user = await createUser();
    const token = await requestReset(user.email);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/password/reset',
      payload: { token, password: 'short' },
    });
    expect(response.statusCode).toBe(400);
    // And the token survives, so the link still works with a longer one.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/password/reset',
          payload: { token, password: 'long-enough-now' },
        })
      ).statusCode,
    ).toBe(200);
  });
});

describe('POST /auth/verify', () => {
  it('confirms the address, once', async () => {
    await signUp();
    const token = tokenFrom(/\/verify\?token=(\S+)/);

    const first = await app.inject({ method: 'POST', url: '/auth/verify', payload: { token } });
    expect(first.statusCode).toBe(200);
    expect(first.json().ok).toBe(true);

    const me = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(me.statusCode).toBe(200);
    const row = await queryOne<{ email_verified_at: string | null }>(
      'SELECT email_verified_at FROM users WHERE email IS NOT NULL',
    );
    expect(row!.email_verified_at).not.toBeNull();

    const second = await app.inject({ method: 'POST', url: '/auth/verify', payload: { token } });
    expect(second.statusCode).toBe(400);
  });

  it('works with no session, because a link is opened wherever it is opened', async () => {
    await signUp();
    const token = tokenFrom(/\/verify\?token=(\S+)/);

    // No cookie on this request at all.
    const response = await app.inject({ method: 'POST', url: '/auth/verify', payload: { token } });
    expect(response.statusCode).toBe(200);
  });

  it('rejects a missing or malformed token', async () => {
    expect((await app.inject({ method: 'POST', url: '/auth/verify', payload: {} })).statusCode).toBe(
      400,
    );
    expect(
      (await app.inject({ method: 'POST', url: '/auth/verify', payload: { token: 'nope' } }))
        .statusCode,
    ).toBe(400);
  });

  it('ignores a link issued for an address the account no longer uses', async () => {
    const user = await createUser();
    await query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [user.id]);
    const { token } = await issueToken(user.id, 'email_verification', 'old@example.test');
    await query('UPDATE users SET email = $1 WHERE id = $2', ['new@example.test', user.id]);

    // Reading the old mailbox is not evidence about the new one.
    await app.inject({ method: 'POST', url: '/auth/verify', payload: { token } });
    const row = await queryOne<{ email_verified_at: string | null }>(
      'SELECT email_verified_at FROM users WHERE id = $1',
      [user.id],
    );
    expect(row!.email_verified_at).toBeNull();
  });
});

describe('POST /auth/verify/resend', () => {
  it('sends another link to a signed-in account', async () => {
    const user = await createUser();
    await query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [user.id]);
    const { app: signedIn, cookie } = await appFor(user);
    try {
      const response = await signedIn.inject({
        method: 'POST',
        url: '/auth/verify/resend',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(lastEmail()!.to).toBe(user.email);
      expect(lastEmail()!.subject).toMatch(/confirmation code$/);
    } finally {
      await signedIn.close();
    }
  });

  it('refuses an anonymous caller', async () => {
    // Otherwise it is an open relay for one message to any account on the server.
    const response = await app.inject({ method: 'POST', url: '/auth/verify/resend' });
    expect(response.statusCode).toBe(401);
    expect(mailbox()).toHaveLength(0);
  });
});

describe('POST /email/unsubscribe', () => {
  async function linkFor(userId: string) {
    const link = await unsubscribeLink(userId);
    return new URL(link.postUrl).search;
  }

  it('turns the weekly email off without a session', async () => {
    const user = await createUser();

    const response = await app.inject({
      method: 'POST',
      url: `/email/unsubscribe${await linkFor(user.id)}`,
    });

    expect(response.statusCode).toBe(200);
    const row = await queryOne<{ notify_weekly_review: boolean }>(
      'SELECT notify_weekly_review FROM users WHERE id = $1',
      [user.id],
    );
    expect(row!.notify_weekly_review).toBe(false);
  });

  it('accepts the form body a mail client posts for one-click', async () => {
    const user = await createUser();

    const response = await app.inject({
      method: 'POST',
      url: `/email/unsubscribe${await linkFor(user.id)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    });

    // Without a parser for this content type Fastify answers 415 and Gmail's
    // own unsubscribe button fails silently.
    expect(response.statusCode).toBe(200);
  });

  it('refuses a forged or altered signature', async () => {
    const user = await createUser();
    const other = await createUser();
    const search = await linkFor(user.id);

    const tampered = search.replace(
      /u=[^&]+/,
      `u=${encodeURIComponent(other.id)}`,
    );
    const response = await app.inject({ method: 'POST', url: `/email/unsubscribe${tampered}` });

    expect(response.statusCode).toBe(403);
    const row = await queryOne<{ notify_weekly_review: boolean }>(
      'SELECT notify_weekly_review FROM users WHERE id = $1',
      [other.id],
    );
    expect(row!.notify_weekly_review).toBe(true);
  });

  it('refuses a link with nothing in it', async () => {
    expect((await app.inject({ method: 'POST', url: '/email/unsubscribe' })).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/email/unsubscribe?u=someone' })).statusCode,
    ).toBe(403);
  });

  it('is repeatable, because a second click should not be an error', async () => {
    const user = await createUser();
    const search = await linkFor(user.id);

    await app.inject({ method: 'POST', url: `/email/unsubscribe${search}` });
    const again = await app.inject({ method: 'POST', url: `/email/unsubscribe${search}` });
    expect(again.statusCode).toBe(200);
  });
});

describe('DELETE /account', () => {
  it('emails the receipt to the address that is about to stop existing', async () => {
    await signUp();
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: CREDENTIALS });
    const cookie = (login.headers['set-cookie'] as string[] | string)
      .toString()
      .split(';')[0]!;

    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie },
      payload: { password: CREDENTIALS.password },
    });

    expect(response.statusCode).toBe(200);
    expect(lastEmail()).toMatchObject({
      to: CREDENTIALS.email,
      subject: 'Your account has been deleted',
    });
    // The record outlives the account, which is why user_id is nullable.
    const row = await queryOne<{ user_id: string | null }>(
      "SELECT user_id FROM email_deliveries WHERE template = 'account_deleted'",
    );
    expect(row).not.toBeNull();
    expect(row!.user_id).toBeNull();
  });
});
