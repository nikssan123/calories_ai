import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { createSession } from '../src/services/auth.ts';
import { anonymousApp, createUser } from './helpers/factories.ts';

/**
 * Guest accounts (GUEST-ACCOUNTS.md).
 *
 * A phone that finished the first-run walk gets a row with no address and a
 * session, and goes straight into the app. The bar: a guest can use the journal
 * without proving anything, can never be mistaken for — or merged into — somebody
 * else's account, can erase itself, and does not get signed out by a calendar.
 */

const AS_APP = { 'x-session-transport': 'bearer' };

let app: FastifyInstance;

beforeEach(async () => {
  app = await anonymousApp();
});

afterEach(async () => {
  await app.close();
});

async function startGuest(body: Record<string, unknown> = { timezone: 'Europe/Sofia', locale: 'bg' }) {
  const response = await app.inject({ method: 'POST', url: '/auth/guest', headers: AS_APP, payload: body });
  expect(response.statusCode).toBe(200);
  const json = response.json();
  return { json, token: json.token as string, auth: { authorization: `Bearer ${json.token}` } };
}

describe('POST /auth/guest', () => {
  it('makes a signed-in guest with no address', async () => {
    const { json } = await startGuest();
    expect(json.authenticated).toBe(true);
    expect(json.token).toEqual(expect.any(String));
    expect(json.profile).toMatchObject({ guest: true, email: null, email_verified: false, locale: 'bg' });
    expect(json.profile.timezone).toBe('Europe/Sofia');
  });

  it('is for the app, not a browser', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/guest', payload: {} });
    expect(response.statusCode).toBe(403);
  });

  it('refuses a malformed hint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/guest',
      headers: AS_APP,
      payload: { locale: 'klingon' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('what a guest can reach', () => {
  it('passes the verification gate that holds an unconfirmed sign-up', async () => {
    const { auth } = await startGuest();
    const onboarding = await app.inject({ method: 'GET', url: '/onboarding', headers: auth });
    expect(onboarding.statusCode).toBe(200);

    // An ordinary unconfirmed account is still held, so the exception is the guest, not the gate.
    const unconfirmed = await createUser({ email_verified_at: null });
    const { token } = await createSession(unconfirmed.id);
    const held = await app.inject({ method: 'GET', url: '/onboarding', headers: { authorization: `Bearer ${token}` } });
    expect(held.statusCode).toBe(403);
  });

  it('reports itself as a guest on /auth/me', async () => {
    const { auth } = await startGuest();
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: auth });
    expect(me.json()).toMatchObject({ authenticated: true, profile: { guest: true } });
  });
});

describe('a guest row is nobody else’s', () => {
  it('is never adopted by the first sign-up on an empty deployment', async () => {
    const { json: guest } = await startGuest();
    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: AS_APP,
      payload: { email: 'first@example.com', password: 'long enough password' },
    });
    expect(signup.statusCode).toBe(200);
    expect(signup.json().profile.id).not.toBe(guest.profile.id);
    expect(signup.json().profile.guest).toBe(false);

    const stillGuest = await queryOne<{ email: string | null }>('SELECT email FROM users WHERE id = $1', [
      guest.profile.id,
    ]);
    expect(stillGuest?.email).toBeNull();
  });
});

describe('erasing a guest', () => {
  it('deletes the row with the explicit flag', async () => {
    const { json, auth } = await startGuest();
    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: auth,
      payload: { erase_guest: true },
    });
    expect(response.statusCode).toBe(200);
    expect(await queryOne('SELECT id FROM users WHERE id = $1', [json.profile.id])).toBeNull();
  });

  it('is refused for an account with an identity', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { erase_guest: true },
    });
    expect(response.statusCode).toBe(400);
    expect(await queryOne('SELECT id FROM users WHERE id = $1', [user.id])).not.toBeNull();
  });
});

describe('guest sessions', () => {
  async function expiryDays(token: string): Promise<number> {
    const row = await queryOne<{ days: number }>(
      `SELECT extract(epoch FROM expires_at - now()) / 86400 AS days
         FROM auth_sessions ORDER BY created_at DESC LIMIT 1`,
    );
    return Number(row?.days);
  }

  it('are renewed while in use, once they are within a month of running out', async () => {
    const { auth, token } = await startGuest();
    await query(`UPDATE auth_sessions SET expires_at = now() + interval '10 days'`);
    await app.inject({ method: 'GET', url: '/auth/me', headers: auth });
    expect(await expiryDays(token)).toBeGreaterThan(59);
  });

  it('leave an ordinary account’s expiry alone', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    await query(`UPDATE auth_sessions SET expires_at = now() + interval '10 days'`);
    await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(await expiryDays(token)).toBeLessThan(11);
  });
});
