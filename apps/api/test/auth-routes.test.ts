import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query } from '../src/db.ts';
import { env } from '../src/env.ts';
import { anonymousApp, appFor, createUser, type TestUser } from './helpers/factories.ts';

let app: FastifyInstance;

beforeEach(async () => {
  app = await anonymousApp();
});

afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
});

const CREDENTIALS = { email: 'nik@example.com', password: 'correct-horse' };

function sessionCookie(response: { headers: Record<string, unknown> }): string | undefined {
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.find((c): c is string => typeof c === 'string' && c.startsWith('ct_session='));
}

describe('GET /auth/me', () => {
  it('reports an anonymous visitor on a fresh server', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(response.json()).toEqual({
      authenticated: false,
      profile: null,
      signup_allowed: true,
      has_accounts: false,
      is_admin: false,
    });
  });

  it('returns the profile once signed in', async () => {
    const user = await createUser();
    const { app: signedIn, cookie } = await appFor(user);
    try {
      const response = await signedIn.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
      expect(response.json()).toMatchObject({ authenticated: true, profile: { id: user.id } });
    } finally {
      await signedIn.close();
    }
  });
});

describe('POST /auth/signup', () => {
  it('creates the account and sets an httpOnly session cookie', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ authenticated: true, profile: { email: CREDENTIALS.email } });

    const cookie = sessionCookie(response)!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('stores a hash, never the password', async () => {
    await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });
    const rows = await query<{ password_hash: string }>('SELECT password_hash FROM users');
    expect(rows[0]!.password_hash.startsWith('scrypt$')).toBe(true);
    expect(rows[0]!.password_hash).not.toContain(CREDENTIALS.password);
  });

  it('carries the browser’s timezone and display name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...CREDENTIALS, display_name: 'Nik', timezone: 'America/Los_Angeles' },
    });
    expect(response.json().profile).toMatchObject({
      display_name: 'Nik',
      timezone: 'America/Los_Angeles',
    });
  });

  it('refuses an email already registered', async () => {
    await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });
    const second = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { ...CREDENTIALS, email: 'NIK@EXAMPLE.COM' },
    });
    expect(second.statusCode).toBe(409);
  });

  it.each([
    ['a malformed email', { email: 'not-an-email', password: 'correct-horse' }],
    ['a short password', { email: 'a@b.com', password: 'short' }],
    ['nothing at all', {}],
  ])('rejects %s', async (_label, payload) => {
    const response = await app.inject({ method: 'POST', url: '/auth/signup', payload });
    expect(response.statusCode).toBe(400);
  });

  it('still allows the very first account when signup is closed', async () => {
    const spy = vi.spyOn(env, 'allowSignup', 'get').mockReturnValue(false);
    try {
      const first = await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });
      expect(first.statusCode).toBe(200);

      const second = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email: 'second@example.com', password: 'correct-horse' },
      });
      expect(second.statusCode).toBe(403);
      expect(second.json().error).toMatch(/closed/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });
  });

  it('signs in with the right password', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/login', payload: CREDENTIALS });
    expect(response.statusCode).toBe(200);
    expect(sessionCookie(response)).toBeDefined();
  });

  it('is case-insensitive about the email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { ...CREDENTIALS, email: 'NIK@example.com' },
    });
    expect(response.statusCode).toBe(200);
  });

  /** An attacker must not learn which half of the pair was wrong. */
  it('gives the same answer for an unknown email and a wrong password', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { ...CREDENTIALS, password: 'wrong-horse' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'correct-horse' },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });

  it('rejects a malformed body before touching the database', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'x' } });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /auth/logout', () => {
  it('destroys the session and clears the cookie', async () => {
    const signup = await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });
    const cookie = sessionCookie(signup)!.split(';')[0]!;

    const response = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    expect(response.json().authenticated).toBe(false);
    expect(await query('SELECT * FROM auth_sessions')).toEqual([]);

    const after = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(after.json().authenticated).toBe(false);
  });

  it('is harmless without a session', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/logout' });
    expect(response.statusCode).toBe(200);
  });
});

/**
 * The native app has no cookie jar, so it asks for the session token and sends
 * it back as a bearer. Both transports resolve to the same session row; what
 * differs is only who is trusted to hold the raw value.
 */
describe('bearer sessions', () => {
  const BEARER = { 'x-session-transport': 'bearer' };

  async function signUpAsApp(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: CREDENTIALS,
      headers: BEARER,
    });
    // A brand-new account is unconfirmed, and every route but /auth/ answers
    // 403 until it is. These tests are about how the session is carried, not
    // about the gate, so step over it.
    await query('UPDATE users SET email_verified_at = now() WHERE lower(email) = lower($1)', [
      CREDENTIALS.email,
    ]);
    return response.json().token;
  }

  it('returns the token to a client that asks to carry it', async () => {
    const token = await signUpAsApp();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });

  /** The cookie is httpOnly so that script cannot read it; echoing the same
      value into the body for a browser would give that protection away. */
  it('withholds the token from a client that did not ask', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });
    expect(response.json().token).toBeUndefined();
    expect(sessionCookie(response)).toBeDefined();
  });

  it('returns the token on login too', async () => {
    await app.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: CREDENTIALS,
      headers: BEARER,
    });
    expect(typeof response.json().token).toBe('string');
  });

  it('authenticates a protected route with no cookie at all', async () => {
    const token = await signUpAsApp();
    const response = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe(CREDENTIALS.email);
  });

  it('resolves /auth/me the same way a cookie does', async () => {
    const token = await signUpAsApp();
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.json()).toMatchObject({ authenticated: true, profile: { email: CREDENTIALS.email } });
  });

  it('logs out the session the bearer names', async () => {
    const token = await signUpAsApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.json().authenticated).toBe(false);
    expect(await query('SELECT * FROM auth_sessions')).toEqual([]);

    const after = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.statusCode).toBe(401);
  });

  it.each([
    ['a token that was never issued', 'Bearer not-a-real-token'],
    ['a scheme we do not speak', 'Basic bmlrOmh1bnRlcjI='],
    ['a bearer with nothing behind it', 'Bearer'],
  ])('is anonymous given %s', async (_label, authorization) => {
    await signUpAsApp();
    const response = await app.inject({ method: 'GET', url: '/profile', headers: { authorization } });
    expect(response.statusCode).toBe(401);
  });

  /** Ambient credentials lose to deliberate ones — see the hook in app.ts. */
  it('prefers the bearer when a request carries both', async () => {
    const token = await signUpAsApp();
    const second = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'other@example.com', password: 'correct-horse' },
    });
    const cookie = sessionCookie(second)!.split(';')[0]!;

    const response = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { authorization: `Bearer ${token}`, cookie },
    });
    expect(response.json().email).toBe(CREDENTIALS.email);
  });
});
