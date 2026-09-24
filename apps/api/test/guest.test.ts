import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { env } from '../src/env.ts';
import { isAdmin } from '../src/services/admin.ts';
import { createSession } from '../src/services/auth.ts';
import { challengeFor } from '../src/services/google.ts';
import { absorbGuest } from '../src/services/guest-merge.ts';
import { issueHandoff } from '../src/services/tokens.ts';
import { claimWithProvider, signInWithProvider } from '../src/services/identities.ts';
import { listActiveUsers, purgeTestDeviceGuests } from '../src/services/user.ts';
import { emailTo, lastEmail, mailbox } from './helpers/email.ts';
import { anonymousApp, codeFromEmail, createUser } from './helpers/factories.ts';

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

describe('a guest made by a Google test device', () => {
  it('is filed as one, kept out of the scheduler, and purged once the robots are done', async () => {
    const { json: robot } = await startGuest({ timezone: 'America/Los_Angeles', locale: 'en', test_device: true });
    const { json: person } = await startGuest();
    await query('UPDATE users SET is_setup_complete = TRUE WHERE id = ANY($1)', [[robot.profile.id, person.profile.id]]);

    const flags = await query<{ id: string; test_device: boolean }>(
      'SELECT id, test_device FROM users WHERE id = ANY($1)',
      [[robot.profile.id, person.profile.id]],
    );
    expect(Object.fromEntries(flags.map((row) => [row.id, row.test_device]))).toEqual({
      [robot.profile.id]: true,
      [person.profile.id]: false,
    });

    const active = (await listActiveUsers()).map((user) => user.id);
    expect(active).toContain(person.profile.id);
    expect(active).not.toContain(robot.profile.id);

    // Fresh rows stay: the robot is still using its session.
    expect(await purgeTestDeviceGuests()).toBe(0);

    await query("UPDATE users SET created_at = now() - interval '7 hours' WHERE id = ANY($1)", [
      [robot.profile.id, person.profile.id],
    ]);
    expect(await purgeTestDeviceGuests()).toBe(1);
    expect(await queryOne('SELECT id FROM users WHERE id = $1', [robot.profile.id])).toBeNull();
    expect(await queryOne('SELECT id FROM users WHERE id = $1', [person.profile.id])).not.toBeNull();
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

describe('saving a guest with an address', () => {
  const CLAIM = { email: 'guest@example.com', password: 'long enough password', display_name: 'Ivan' };

  async function trialOf(id: string) {
    return queryOne<{ trial_started_at: Date | null; guest_since: Date | null; email_verified_at: Date | null }>(
      'SELECT trial_started_at, guest_since, email_verified_at FROM users WHERE id = $1',
      [id],
    );
  }

  it('puts the address on the same row, and only the code ends the guest and starts the trial', async () => {
    const { json, auth } = await startGuest();
    const id = json.profile.id;
    await query(
      `INSERT INTO food_entries (user_id, eaten_at, local_date, meal, description)
       VALUES ($1, now(), CURRENT_DATE, 'lunch', 'Guest lunch')`,
      [id],
    );

    const claim = await app.inject({ method: 'POST', url: '/auth/claim', headers: auth, payload: CLAIM });
    expect(claim.statusCode).toBe(200);
    // Pending, not the account's address: nothing else on the server can see it yet.
    expect(claim.json().profile).toMatchObject({ id, guest: true, email: null, pending_email: CLAIM.email });
    expect((await trialOf(id))?.trial_started_at).toBeNull();

    const code = codeFromEmail(lastEmail()!.text);
    const verify = await app.inject({ method: 'POST', url: '/auth/verify', headers: auth, payload: { code } });
    expect(verify.statusCode).toBe(200);

    const saved = await trialOf(id);
    expect(saved?.guest_since).toBeNull();
    expect(saved?.email_verified_at).not.toBeNull();
    expect(saved?.trial_started_at).not.toBeNull();
    const meals = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM food_entries WHERE user_id = $1', [id]);
    expect(meals?.n).toBe(1);

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: auth });
    expect(me.json().profile).toMatchObject({ id, guest: false, email: CLAIM.email, pending_email: null, email_verified: true });
  });

  it('says so, with a code, when the address already has an account', async () => {
    await createUser({ email: CLAIM.email });
    const { auth } = await startGuest();
    const claim = await app.inject({ method: 'POST', url: '/auth/claim', headers: auth, payload: CLAIM });
    expect(claim.statusCode).toBe(409);
    expect(claim.json().code).toBe('EMAIL_TAKEN');
  });

  it('is only for guests', async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const claim = await app.inject({
      method: 'POST',
      url: '/auth/claim',
      headers: { authorization: `Bearer ${token}` },
      payload: CLAIM,
    });
    expect(claim.statusCode).toBe(409);
    expect(claim.json().code).toBe('NOT_GUEST');
  });

  it('lets the real owner of an address a guest never confirmed sign up with it', async () => {
    const { json, auth } = await startGuest();
    await app.inject({ method: 'POST', url: '/auth/claim', headers: auth, payload: CLAIM });

    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: AS_APP,
      payload: { email: CLAIM.email, password: 'the owner password' },
    });
    expect(signup.statusCode).toBe(200);
    expect(signup.json().profile.id).not.toBe(json.profile.id);
    const guest = await queryOne<{ email: string | null }>('SELECT email FROM users WHERE id = $1', [json.profile.id]);
    expect(guest?.email).toBeNull();
  });
});

describe('saving a guest with Google', () => {
  const OPTIONS = { allowSignup: true, timezone: 'Europe/Sofia', locale: null };
  const IDENTITY = { subject: '110000000000000000009', email: 'ivan@gmail.com', name: 'Ivan' };

  it('attaches the identity to the guest row, confirmed, and starts the trial', async () => {
    const { json } = await startGuest();
    const result = await claimWithProvider('google', IDENTITY, json.profile.id, OPTIONS);
    expect(result).toEqual({ ok: true, userId: json.profile.id, outcome: 'claimed' });
    const row = await queryOne<any>('SELECT email, guest_since, email_verified_at, trial_started_at FROM users WHERE id = $1', [
      json.profile.id,
    ]);
    expect(row).toMatchObject({ email: IDENTITY.email, guest_since: null });
    expect(row.email_verified_at).not.toBeNull();
    expect(row.trial_started_at).not.toBeNull();
  });

  it('signs in to the existing account when the address already has one, and leaves the guest alone', async () => {
    const owner = await createUser({ email: IDENTITY.email });
    const { json } = await startGuest();
    const result = await claimWithProvider('google', IDENTITY, json.profile.id, OPTIONS);
    expect(result).toMatchObject({ ok: true, userId: owner.id });
    const guest = await queryOne<any>('SELECT email, guest_since FROM users WHERE id = $1', [json.profile.id]);
    expect(guest.email).toBeNull();
    expect(guest.guest_since).not.toBeNull();
  });

  it('never hands a stranger’s guest journal to the owner of an address the guest only typed', async () => {
    const { json, auth } = await startGuest();
    await app.inject({
      method: 'POST',
      url: '/auth/claim',
      headers: auth,
      payload: { email: IDENTITY.email, password: 'long enough password' },
    });
    const result = await signInWithProvider('google', IDENTITY, OPTIONS);
    expect(result).toMatchObject({ ok: true, outcome: 'created' });
    if (result.ok) expect(result.userId).not.toBe(json.profile.id);
  });

  it('builds a start URL that carries the guest inside the signed state', async () => {
    env.google = {
      clientId: 'client-id.apps.googleusercontent.com',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost:3000/api/auth/google/callback',
    };
    try {
      const { json, auth } = await startGuest();
      const response = await app.inject({
        method: 'POST',
        url: '/auth/google/claim',
        headers: auth,
        payload: { redirect: 'daysofar://auth/google', challenge: 'c'.repeat(43) },
      });
      expect(response.statusCode).toBe(200);
      const state = new URL(response.json().url).searchParams.get('state')!;
      const payload = JSON.parse(Buffer.from(state.split('.')[0]!, 'base64url').toString('utf8'));
      expect(payload.guest).toBe(json.profile.id);
    } finally {
      env.google = null;
    }
  });
});

describe('a pending address grants nothing', () => {
  const CLAIM = { email: 'typo@example.com', password: 'long enough password' };

  it('cannot be reset into by whoever reads that inbox', async () => {
    const { auth } = await startGuest();
    await app.inject({ method: 'POST', url: '/auth/claim', headers: auth, payload: CLAIM });
    const before = mailbox().length;

    const forgot = await app.inject({ method: 'POST', url: '/auth/password/forgot', payload: { email: CLAIM.email } });
    expect(forgot.statusCode).toBe(200);
    expect(mailbox().length).toBe(before);
    const tokens = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM auth_tokens WHERE purpose = 'password_reset'`,
    );
    expect(tokens?.n).toBe(0);
  });

  it('is not confirmed by the emailed link, only by the code in the guest’s session', async () => {
    const { json, auth } = await startGuest();
    await app.inject({ method: 'POST', url: '/auth/claim', headers: auth, payload: CLAIM });
    const text = emailTo(CLAIM.email)!.text;
    const token = decodeURIComponent(/verify\?token=([^\s]+)/.exec(text)![1]!);

    const link = await app.inject({ method: 'POST', url: '/auth/verify', payload: { token } });
    expect(link.statusCode).toBe(403);
    expect(link.json().code).toBe('USE_CODE');

    const code = codeFromEmail(text);
    const confirmed = await app.inject({ method: 'POST', url: '/auth/verify', headers: auth, payload: { code } });
    expect(confirmed.statusCode).toBe(200);
    const row = await queryOne<any>('SELECT email, guest_since FROM users WHERE id = $1', [json.profile.id]);
    expect(row).toMatchObject({ email: CLAIM.email, guest_since: null });
  });

  it('says so when the address was registered by somebody else before the code came back', async () => {
    const { json, auth } = await startGuest();
    await app.inject({ method: 'POST', url: '/auth/claim', headers: auth, payload: CLAIM });
    const code = codeFromEmail(lastEmail()!.text);
    await createUser({ email: CLAIM.email });

    const verify = await app.inject({ method: 'POST', url: '/auth/verify', headers: auth, payload: { code } });
    expect(verify.statusCode).toBe(409);
    expect(verify.json().code).toBe('EMAIL_TAKEN');
    const row = await queryOne<any>('SELECT email, guest_since FROM users WHERE id = $1', [json.profile.id]);
    expect(row.email).toBeNull();
    expect(row.guest_since).not.toBeNull();
  });

  it('never makes a guest an admin', async () => {
    const { json, auth } = await startGuest();
    await app.inject({ method: 'POST', url: '/auth/claim', headers: auth, payload: CLAIM });
    expect(await isAdmin(json.profile.id)).toBe(false);
  });

  it('can be erased without a password while the address is still pending', async () => {
    const { json, auth } = await startGuest();
    await app.inject({ method: 'POST', url: '/auth/claim', headers: auth, payload: CLAIM });
    const erase = await app.inject({ method: 'DELETE', url: '/account', headers: auth, payload: { erase_guest: true } });
    expect(erase.statusCode).toBe(200);
    expect(await queryOne('SELECT id FROM users WHERE id = $1', [json.profile.id])).toBeNull();
  });

  it('mails one address only a few codes an hour, however many guests type it', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const { auth } = await startGuest();
      const claim = await app.inject({ method: 'POST', url: '/auth/claim', headers: auth, payload: { ...CLAIM } });
      statuses.push(claim.statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe('guest creation is limited by address, not by session', () => {
  it('does not start a fresh bucket for a request carrying the previous guest’s token', async () => {
    let token: string | null = null;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const response: Awaited<ReturnType<typeof app.inject>> = await app.inject({
        method: 'POST',
        url: '/auth/guest',
        headers: { ...AS_APP, ...(token ? { authorization: `Bearer ${token}` } : {}) },
        payload: {},
      });
      statuses.push(response.statusCode);
      if (response.statusCode === 200) token = response.json().token;
    }
    expect(statuses.slice(0, 10).every((code) => code === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('saving with Google happens in the guest’s own request', () => {
  const VERIFIER = 'v'.repeat(64);
  const IDENTITY = { subject: '110000000000000000077', email: 'owner@gmail.com', name: 'Owner' };

  async function handoffFor(guestId: string) {
    const payload = {
      kind: 'guest_claim',
      provider: 'google',
      subject: IDENTITY.subject,
      name: IDENTITY.name,
      timezone: 'Europe/Sofia',
      locale: 'bg',
    };
    const { token } = await issueHandoff(guestId, IDENTITY.email, challengeFor(VERIFIER), payload);
    return token;
  }

  it('attaches the identity when the exchange carries the guest’s session', async () => {
    const { json, auth } = await startGuest();
    const code = await handoffFor(json.profile.id);
    const exchange = await app.inject({
      method: 'POST',
      url: '/auth/google/exchange',
      headers: { ...AS_APP, ...auth },
      payload: { code, verifier: VERIFIER },
    });
    expect(exchange.statusCode).toBe(200);
    expect(exchange.json().profile).toMatchObject({ id: json.profile.id, guest: false, email: IDENTITY.email });
  });

  it('attaches nothing for a request without that guest’s session', async () => {
    const { json } = await startGuest();
    const code = await handoffFor(json.profile.id);
    const exchange = await app.inject({
      method: 'POST',
      url: '/auth/google/exchange',
      headers: AS_APP,
      payload: { code, verifier: VERIFIER },
    });
    expect(exchange.statusCode).toBe(401);
    const row = await queryOne<any>('SELECT email, guest_since FROM users WHERE id = $1', [json.profile.id]);
    expect(row.email).toBeNull();
    expect(row.guest_since).not.toBeNull();
    const linked = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM oauth_identities WHERE subject = $1', [
      IDENTITY.subject,
    ]);
    expect(linked?.n).toBe(0);
  });
});

describe('a guest whose save lands on an existing account brings its journal', () => {
  async function seedGuest(id: string) {
    await query(
      `INSERT INTO food_entries (user_id, eaten_at, local_date, meal, description)
       VALUES ($1, now(), CURRENT_DATE, 'lunch', 'Guest lunch')`,
      [id],
    );
    await query(
      `INSERT INTO weight_entries (user_id, weight_kg, local_date, measured_at) VALUES
         ($1, 81, CURRENT_DATE, now()), ($1, 82, CURRENT_DATE - 1, now() - interval '1 day')`,
      [id],
    );
    await query(`INSERT INTO routines (user_id, name, category) VALUES ($1, 'Push day', 'strength'), ($1, 'Legs', 'strength')`, [
      id,
    ]);
    await query(
      `INSERT INTO ai_usage (user_id, provider, kind, model, cost_usd) VALUES ($1, 'test', 'text_log', 'test', 0.04)`,
      [id],
    );
  }

  it('moves meals, weigh-ins and routines, keeps the account’s copy where both have one, and removes the guest', async () => {
    const { json } = await startGuest();
    const guestId = json.profile.id;
    await seedGuest(guestId);
    const owner = await createUser({ email: 'owner@example.com' });
    await query(
      `INSERT INTO weight_entries (user_id, weight_kg, local_date, measured_at) VALUES ($1, 70, CURRENT_DATE, now())`,
      [owner.id],
    );
    await query(`INSERT INTO routines (user_id, name, category) VALUES ($1, 'push day', 'strength')`, [owner.id]);

    const summary = await absorbGuest(guestId, owner.id);
    expect(summary).toMatchObject({ food_entries: 1, weight_entries: 1 });

    const meals = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM food_entries WHERE user_id = $1', [owner.id]);
    expect(meals?.n).toBe(1);
    const today = await queryOne<{ weight_kg: string }>(
      'SELECT weight_kg FROM weight_entries WHERE user_id = $1 AND local_date = CURRENT_DATE',
      [owner.id],
    );
    expect(Number(today?.weight_kg)).toBe(70);
    const weights = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM weight_entries WHERE user_id = $1', [owner.id]);
    expect(weights?.n).toBe(2);
    const routines = await query<{ name: string }>('SELECT name FROM routines WHERE user_id = $1 ORDER BY name', [owner.id]);
    expect(routines.map((r) => r.name)).toEqual(['Legs', 'push day']);

    expect(await queryOne('SELECT id FROM users WHERE id = $1', [guestId])).toBeNull();
    // The guest's turns keep their cost but count against nobody's allowance.
    const usage = await queryOne<{ user_id: string | null }>(`SELECT user_id FROM ai_usage WHERE provider = 'test'`);
    expect(usage?.user_id).toBeNull();
  });

  it('refuses to absorb an account that is not a guest', async () => {
    const owner = await createUser({ email: 'owner@example.com' });
    const other = await createUser({ email: 'other@example.com' });
    expect(await absorbGuest(other.id, owner.id)).toBeNull();
    expect(await queryOne('SELECT id FROM users WHERE id = $1', [other.id])).not.toBeNull();
  });

  it('happens in the Google exchange when that Google account already had an account', async () => {
    const owner = await createUser({ email: 'owner@gmail.com' });
    await query(
      `INSERT INTO oauth_identities (provider, subject, user_id, email) VALUES ('google', '110000000000000000088', $1, 'owner@gmail.com')`,
      [owner.id],
    );
    const { json, auth } = await startGuest();
    await seedGuest(json.profile.id);
    const verifier = 'w'.repeat(64);
    const { token: code } = await issueHandoff(json.profile.id, 'owner@gmail.com', challengeFor(verifier), {
      kind: 'guest_claim',
      provider: 'google',
      subject: '110000000000000000088',
      name: 'Owner',
      timezone: 'Europe/Sofia',
      locale: 'en',
    });

    const exchange = await app.inject({
      method: 'POST',
      url: '/auth/google/exchange',
      headers: { ...AS_APP, ...auth },
      payload: { code, verifier },
    });
    expect(exchange.statusCode).toBe(200);
    expect(exchange.json().profile.id).toBe(owner.id);
    const meals = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM food_entries WHERE user_id = $1', [owner.id]);
    expect(meals?.n).toBe(1);
    expect(await queryOne('SELECT id FROM users WHERE id = $1', [json.profile.id])).toBeNull();
  });

  it('happens through /auth/absorb-guest after signing in with a password, given the guest’s token', async () => {
    const { json, token: guestToken } = await startGuest();
    await seedGuest(json.profile.id);
    const owner = await createUser({ email: 'owner@example.com' });
    const { token } = await createSession(owner.id);
    const asOwner = { authorization: `Bearer ${token}` };

    const absorbed = await app.inject({
      method: 'POST',
      url: '/auth/absorb-guest',
      headers: asOwner,
      payload: { guest_token: guestToken },
    });
    expect(absorbed.statusCode).toBe(200);
    expect(absorbed.json()).toMatchObject({ food_entries: 1 });

    // Spent: the guest and its session are gone.
    const again = await app.inject({
      method: 'POST',
      url: '/auth/absorb-guest',
      headers: asOwner,
      payload: { guest_token: guestToken },
    });
    expect(again.statusCode).toBe(404);
  });

  it('will not take a real account’s token as a guest’s', async () => {
    const owner = await createUser({ email: 'owner@example.com' });
    const victim = await createUser({ email: 'victim@example.com' });
    const { token } = await createSession(owner.id);
    const { token: victimToken } = await createSession(victim.id);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/absorb-guest',
      headers: { authorization: `Bearer ${token}` },
      payload: { guest_token: victimToken },
    });
    expect(response.statusCode).toBe(404);
    expect(await queryOne('SELECT id FROM users WHERE id = $1', [victim.id])).not.toBeNull();
  });

  it('is not for a guest to call', async () => {
    const { auth } = await startGuest();
    const { token: otherGuest } = await startGuest();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/absorb-guest',
      headers: auth,
      payload: { guest_token: otherGuest },
    });
    expect(response.statusCode).toBe(401);
  });
});
