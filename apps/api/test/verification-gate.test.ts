import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { EMAIL_UNVERIFIED } from '@ct/shared';
import { query, queryOne } from '../src/db.ts';
import { consumeCode, issueVerification, MAX_CODE_ATTEMPTS } from '../src/services/tokens.ts';
import { anonymousApp, codeFromEmail, confirmEmail, createUser } from './helpers/factories.ts';
import { lastEmail, mailbox } from './helpers/email.ts';

/**
 * The gate: a new account cannot use the product until its address is proved.
 *
 * The thing worth testing hardest is not that it blocks — that is one `if` —
 * but that the ways *past* it stay open. An account held behind a code it never
 * received, with no way to sign out, ask again, or leave, is a support ticket
 * that ends in a chargeback.
 */

let app: FastifyInstance;

const CREDENTIALS = { email: 'new@example.test', password: 'correct-horse' };

beforeEach(async () => {
  app = await anonymousApp();
});

afterEach(async () => {
  await app.close();
});

/**
 * Signs up through the API and returns the session cookie plus the code.
 *
 * As the app, because that is where accounts are made — the browser gets one
 * signup only, on a server with no accounts at all, and several cases below
 * seed a stranger first. The session still arrives as a cookie either way,
 * which is the only part these tests care about.
 */
async function signUp(): Promise<{ cookie: string; code: string; userId: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: CREDENTIALS,
    headers: { 'x-session-transport': 'bearer' },
  });
  expect(response.statusCode).toBe(200);
  const cookie = (response.headers['set-cookie'] as string[] | string).toString().split(';')[0]!;
  const row = await queryOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [
    CREDENTIALS.email,
  ]);
  return { cookie, code: codeFromEmail(lastEmail()!.text), userId: row!.id };
}

describe('a new account', () => {
  it('is created unconfirmed and signed in', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });

    // Signed in, because the code has to be scoped to *some* account — but not
    // yet through the gate.
    expect(response.json()).toMatchObject({
      authenticated: true,
      profile: { email_verified: false },
    });
  });

  it('is refused everywhere the product actually lives', async () => {
    const { cookie } = await signUp();

    for (const url of ['/day', '/profile', '/progress', '/onboarding', '/chat/history']) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie } });
      expect(response.statusCode, url).toBe(403);
      // A distinguishable code, so the client shows the confirmation screen
      // rather than throwing away a perfectly good session.
      expect(response.json().code, url).toBe(EMAIL_UNVERIFIED);
    }
  });

  it('can still read its own session, ask again, and sign out', async () => {
    const { cookie } = await signUp();

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ authenticated: true, profile: { email_verified: false } });

    const resend = await app.inject({
      method: 'POST',
      url: '/auth/verify/resend',
      headers: { cookie },
    });
    expect(resend.statusCode).toBe(200);

    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);
  });

  /**
   * The escape hatch. Someone whose code never arrived — most likely because
   * they mistyped their own address — must not be stranded with an account they
   * can neither use nor be rid of.
   */
  it('can delete itself without ever confirming', async () => {
    const { cookie, userId } = await signUp();

    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie },
      payload: { password: CREDENTIALS.password },
    });

    expect(response.statusCode).toBe(200);
    expect(await query('SELECT 1 FROM users WHERE id = $1', [userId])).toHaveLength(0);
  });

  it('still has to prove itself to delete, gate or no gate', async () => {
    const { cookie, userId } = await signUp();

    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie },
      payload: { password: 'not-the-password' },
    });

    expect(response.statusCode).toBe(403);
    expect(await query('SELECT 1 FROM users WHERE id = $1', [userId])).toHaveLength(1);
  });
});

describe('entering the code', () => {
  it('opens the product', async () => {
    const { cookie, code } = await signUp();

    const verify = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      headers: { cookie },
      payload: { code },
    });
    expect(verify.statusCode).toBe(200);

    const day = await app.inject({ method: 'GET', url: '/day', headers: { cookie } });
    expect(day.statusCode).toBe(200);
  });

  it('tolerates the spaces a paste brings with it', async () => {
    const { cookie, code } = await signUp();

    const verify = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      headers: { cookie },
      payload: { code: `  ${code} ` },
    });
    expect(verify.statusCode).toBe(200);
  });

  it('works once', async () => {
    const { cookie, code } = await signUp();
    const payload = { code };

    expect(
      (await app.inject({ method: 'POST', url: '/auth/verify', headers: { cookie }, payload }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/auth/verify', headers: { cookie }, payload }))
        .statusCode,
    ).toBe(400);
  });

  it('says how many tries are left, then burns the code', async () => {
    const { cookie, code } = await signUp();
    const wrong = { code: code === '000000' ? '111111' : '000000' };

    for (let attempt = 1; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify',
        headers: { cookie },
        payload: wrong,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain(`${MAX_CODE_ATTEMPTS - attempt}`);
    }

    // The fifth wrong answer spends it — and the right code no longer works.
    await app.inject({ method: 'POST', url: '/auth/verify', headers: { cookie }, payload: wrong });
    const withRight = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      headers: { cookie },
      payload: { code },
    });
    expect(withRight.statusCode).toBe(400);
    expect(withRight.json().error).toContain('expired or been used up');
  });

  it('refuses a code belonging to somebody else', async () => {
    const stranger = await createUser();
    await query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [stranger.id]);
    const { code: theirCode } = await issueVerification(stranger.id, stranger.email);

    const { cookie } = await signUp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      headers: { cookie },
      payload: { code: theirCode },
    });

    // Six digits are not unique across accounts, which is exactly why the code
    // is only ever checked against the session holding it.
    expect(response.statusCode).toBe(400);
  });

  it('refuses a code with no session to scope it to', async () => {
    const { code } = await signUp();

    const response = await app.inject({ method: 'POST', url: '/auth/verify', payload: { code } });
    expect(response.statusCode).toBe(401);
  });

  it('rejects something that is not six digits', async () => {
    const { cookie } = await signUp();

    for (const code of ['12345', '1234567', 'abcdef', '', '12 34 56']) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify',
        headers: { cookie },
        payload: { code },
      });
      expect(response.statusCode, code).toBe(400);
    }
  });

  it('replaces the old code when a new one is asked for', async () => {
    const { cookie, code: first } = await signUp();

    await app.inject({ method: 'POST', url: '/auth/verify/resend', headers: { cookie } });
    const second = codeFromEmail(lastEmail()!.text);
    expect(second).not.toBe(first);

    // Three impatient clicks must not leave three live codes.
    const withOld = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      headers: { cookie },
      payload: { code: first },
    });
    expect(withOld.statusCode).toBe(400);

    const withNew = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      headers: { cookie },
      payload: { code: second },
    });
    expect(withNew.statusCode).toBe(200);
  });
});

describe('the link, still', () => {
  it('confirms without a session, and spends the code with it', async () => {
    const { cookie, code } = await signUp();
    const token = decodeURIComponent(/\/verify\?token=(\S+)/.exec(lastEmail()!.text)![1]!);

    // No cookie: the link is opened wherever it is opened.
    const response = await app.inject({ method: 'POST', url: '/auth/verify', payload: { token } });
    expect(response.statusCode).toBe(200);

    // One row, two doors. Spending either has to spend both, or the code would
    // still be sitting there asking to be typed after the link already worked.
    const withCode = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      headers: { cookie },
      payload: { code },
    });
    expect(withCode.statusCode).toBe(400);

    const day = await app.inject({ method: 'GET', url: '/day', headers: { cookie } });
    expect(day.statusCode).toBe(200);
  });
});

describe('accounts that predate the gate', () => {
  it('are let through, because the migration confirmed them', async () => {
    // `createUser` mirrors the migration: everyone who already had an account
    // keeps it. Locking them out retroactively would prove nothing.
    const existing = await createUser();
    const { appFor } = await import('./helpers/factories.ts');
    const { app: signedIn, cookie } = await appFor(existing);
    try {
      const response = await signedIn.inject({ method: 'GET', url: '/day', headers: { cookie } });
      expect(response.statusCode).toBe(200);
    } finally {
      await signedIn.close();
    }
  });
});

describe('consumeCode', () => {
  it('reports a wrong code without spending the row', async () => {
    const user = await createUser();
    await confirmEmail(user.id);
    const { code } = await issueVerification(user.id, user.email);

    const wrong = await consumeCode(user.id, code === '000000' ? '111111' : '000000');
    expect(wrong).toEqual({ ok: false, reason: 'wrong', remaining: MAX_CODE_ATTEMPTS - 1 });

    expect(await consumeCode(user.id, code)).toEqual({ ok: true, email: user.email });
  });

  it('reports an account with no live code at all', async () => {
    const user = await createUser();
    expect(await consumeCode(user.id, '123456')).toEqual({ ok: false, reason: 'spent' });
  });

  it('refuses an expired code', async () => {
    const user = await createUser();
    const { code } = await issueVerification(user.id, user.email);
    await query("UPDATE auth_tokens SET expires_at = now() - interval '1 minute'");

    expect(await consumeCode(user.id, code)).toEqual({ ok: false, reason: 'spent' });
  });

  it('lets only one of two simultaneous correct answers win', async () => {
    const user = await createUser();
    const { code } = await issueVerification(user.id, user.email);

    const results = await Promise.all([
      consumeCode(user.id, code),
      consumeCode(user.id, code),
      consumeCode(user.id, code),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe('a code that cannot be delivered', () => {
  /**
   * The one place a delivery failure is worth reporting. Everywhere else the
   * user was doing something else and the mail was incidental; here they are
   * sitting behind a gate waiting for it.
   */
  it('says so, rather than answering "check your inbox"', async () => {
    const { cookie } = await signUp();
    const { setTransport } = await import('../src/email/transport.ts');
    setTransport({
      name: 'broken',
      send: async () => {
        throw new Error('the from address is not verified');
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify/resend',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().error).toContain('could not send');
    // Never the provider's own words: the caller gets what to do, not our plumbing.
    expect(response.json().error).not.toContain('from address');
  });

  it('still creates the account when the very first code cannot be sent', async () => {
    const { setTransport } = await import('../src/email/transport.ts');
    setTransport({
      name: 'broken',
      send: async () => {
        throw new Error('provider on fire');
      },
    });

    const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });

    // Signup does not hang on the provider — the account exists, the session
    // works, and "send a new code" is one tap away once the provider is back.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ profile: { email_verified: false } });
  });
});

describe('the confirmation email', () => {
  it('leads with the code, in the subject and the body', async () => {
    await signUp();
    const message = lastEmail()!;
    const code = codeFromEmail(message.text);

    expect(message.subject).toBe(`${code} is your Day So Far confirmation code`);
    expect(message.html).toContain(code);
    expect(message.text).toContain(code);
    // And the link, for whoever is reading this on the device they signed up on.
    expect(message.text).toMatch(/\/verify\?token=\S+/);
  });

  it('is the only thing sent at signup', async () => {
    await signUp();
    expect(mailbox()).toHaveLength(1);
  });
});
