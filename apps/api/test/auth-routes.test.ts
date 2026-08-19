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
