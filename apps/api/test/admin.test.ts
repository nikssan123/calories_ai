import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { env } from '../src/env.ts';
import {
  BROWSABLE_TABLES,
  buildOverview,
  deleteAccount,
  isAdmin,
  listTables,
  readTable,
  resetPassword,
} from '../src/services/admin.ts';
import { savePhoto } from '../src/services/photos.ts';
import { verifyPassword } from '../src/services/auth.ts';
import { recordUsage } from '../src/services/usage.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import { emailTo, mailbox } from './helpers/email.ts';
import {
  addMeal,
  addWeight,
  anonymousApp,
  appFor,
  createUser,
  setUserTargets,
  type TestUser,
} from './helpers/factories.ts';

/**
 * The admin panel.
 *
 * The bar for the read side is that it cannot leak a credential or be talked
 * into touching a table it was not meant to. The bar for the write side is that
 * every action is reachable only by an admin and does exactly one thing.
 */

let owner: TestUser;
let member: TestUser;
let app: FastifyInstance;
let cookie: string;

/**
 * `owner` is created first, so with ADMIN_EMAILS unset it is the admin by the
 * "oldest account" fallback. Nothing in the suite sets ADMIN_EMAILS globally.
 */
beforeEach(async () => {
  owner = await createUser({ email: 'owner@example.com' });
  member = await createUser({ email: 'member@example.com' });
  ({ app, cookie } = await appFor(owner));
});

afterEach(async () => {
  await app.close();
  env.adminEmails.length = 0;
});

function get(url: string, as = cookie) {
  return app.inject({ method: 'GET', url, headers: { cookie: as } });
}
function post(url: string, payload?: unknown, as = cookie) {
  return app.inject({ method: 'POST', url, headers: { cookie: as }, payload: payload as never });
}

describe('isAdmin', () => {
  it('grants the oldest account when ADMIN_EMAILS is unset', async () => {
    expect(await isAdmin(owner.id)).toBe(true);
    expect(await isAdmin(member.id)).toBe(false);
  });

  it('follows ADMIN_EMAILS once it is set, ignoring account age', async () => {
    env.adminEmails.push('member@example.com');
    expect(await isAdmin(member.id)).toBe(true);
    // The fallback stops applying entirely — otherwise naming one admin would
    // silently leave the first account holding the panel as well.
    expect(await isAdmin(owner.id)).toBe(false);
  });

  it('matches the address case-insensitively', async () => {
    env.adminEmails.push('MEMBER@example.com'.toLowerCase());
    expect(await isAdmin(member.id)).toBe(true);
  });

  it('refuses the credential-less pre-accounts row', async () => {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO users (display_name) VALUES ('legacy') RETURNING id`,
    );
    expect(await isAdmin(row!.id)).toBe(false);
  });
});

describe('the guard', () => {
  it('lets an admin in', async () => {
    expect((await get('/admin/overview')).statusCode).toBe(200);
  });

  /**
   * 404 rather than 403: an ordinary account has no business learning that an
   * admin panel is mounted here at all.
   */
  it('hides every admin route from an ordinary account', async () => {
    const { app: theirs, cookie: theirCookie } = await appFor(member);
    try {
      for (const url of ['/admin/overview', '/admin/users', '/admin/costs', '/admin/tables']) {
        const response = await theirs.inject({ method: 'GET', url, headers: { cookie: theirCookie } });
        expect(response.statusCode, url).toBe(404);
      }
    } finally {
      await theirs.close();
    }
  });

  it('rejects an anonymous caller before it gets that far', async () => {
    const anon = await anonymousApp();
    try {
      expect((await anon.inject({ method: 'GET', url: '/admin/overview' })).statusCode).toBe(401);
    } finally {
      await anon.close();
    }
  });

  it('does not gate the ordinary product routes', async () => {
    const { app: theirs, cookie: theirCookie } = await appFor(member);
    try {
      const response = await theirs.inject({ method: 'GET', url: '/day', headers: { cookie: theirCookie } });
      expect(response.statusCode).toBe(200);
    } finally {
      await theirs.close();
    }
  });
});

describe('overview', () => {
  it('counts what the instance holds', async () => {
    await addMeal(owner, { date: '2026-03-01', kcal: 500 });
    const overview = await buildOverview();

    expect(overview.users.total).toBe(2);
    expect(overview.data.food_entries).toBe(1);
    expect(overview.storage.database_bytes).toBeGreaterThan(0);
    expect(overview.config.provider).toBe('anthropic');
    expect(overview.config.admin_source).toBe('first-account');
  });

  it('says where admin came from once ADMIN_EMAILS is set', async () => {
    env.adminEmails.push('owner@example.com');
    expect((await buildOverview()).config.admin_source).toBe('env');
  });

  /** The panel says whether an OpenAI-compatible endpoint has rates configured. */
  it('reports the OpenAI rate card only when that provider is selected', async () => {
    expect((await buildOverview()).config.openai_rate).toBeNull();

    const restore = { ...process.env };
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_PRICE_INPUT = '0.5';
    process.env.OPENAI_PRICE_OUTPUT = '1.5';
    try {
      const config = (await buildOverview()).config;
      expect(config.provider).toBe('openai');
      expect(config.openai_rate).toEqual({ input: 0.5, output: 1.5 });
    } finally {
      process.env = restore;
    }
  });

  it('sizes the photo volume separately from the database', async () => {
    await savePhoto(owner.id, 'image/png', Buffer.from('not really a png').toString('base64'));
    const overview = await buildOverview();
    expect(overview.storage.uploads_bytes).toBeGreaterThan(0);
    expect(overview.storage.photo_count).toBeGreaterThan(0);
  });

  it('reports the applied migrations', async () => {
    const response = await get('/admin/migrations');
    const { migrations } = response.json();
    expect(migrations.map((m: { name: string }) => m.name)).toContain('001_init.sql');
  });
});

describe('the database browser', () => {
  it('lists every browsable table with an exact row count', async () => {
    await addMeal(owner, { date: '2026-03-01', kcal: 500 });
    const tables = await listTables();
    expect(tables.map((t) => t.name).sort()).toEqual(Object.keys(BROWSABLE_TABLES).sort());
    expect(tables.find((t) => t.name === 'food_entries')?.rows).toBe(1);
    expect(tables.find((t) => t.name === 'users')?.rows).toBe(2);
  });

  /** The reason the allowlist carries a redact list rather than trusting the UI. */
  it('never returns a password hash or a session token', async () => {
    const users = await readTable('users', { limit: 10, offset: 0 });
    expect(users!.columns).not.toContain('password_hash');
    expect(users!.redacted).toContain('password_hash');
    expect(JSON.stringify(users!.rows)).not.toContain('scrypt$');

    const sessions = await readTable('auth_sessions', { limit: 10, offset: 0 });
    expect(sessions!.columns).not.toContain('token_hash');
  });

  it('refuses a table that is not on the allowlist', async () => {
    expect(await readTable('schema_migrations_backup', { limit: 10, offset: 0 })).toBeNull();
    expect((await get('/admin/tables/pg_shadow')).statusCode).toBe(404);
  });

  /**
   * The table name is a key into the allowlist rather than a string that
   * reaches SQL, so an injection attempt is simply an unknown table.
   */
  it('treats an injection attempt as an unknown table', async () => {
    const response = await get('/admin/tables/users;%20DROP%20TABLE%20users');
    expect(response.statusCode).toBe(404);
    expect((await listTables()).find((t) => t.name === 'users')?.rows).toBe(2);
  });

  it('paginates', async () => {
    for (let i = 0; i < 5; i++) {
      await addMeal(owner, { date: '2026-03-01', kcal: 100 + i, description: `Meal ${i}` });
    }
    const first = await readTable('food_entries', { limit: 2, offset: 0 });
    const second = await readTable('food_entries', { limit: 2, offset: 2 });

    expect(first!.total).toBe(5);
    expect(first!.rows).toHaveLength(2);
    expect(second!.rows[0]!.id).not.toBe(first!.rows[0]!.id);
  });

  it('filters to one account where the table has a user_id', async () => {
    await addMeal(owner, { date: '2026-03-01', kcal: 500 });
    await addMeal(member, { date: '2026-03-01', kcal: 600 });

    const mine = await readTable('food_entries', { limit: 10, offset: 0, userId: owner.id });
    expect(mine!.total).toBe(1);
  });

  it('ignores a user filter on a table that has no user_id', async () => {
    const page = await readTable('schema_migrations', { limit: 10, offset: 0, userId: owner.id });
    expect(page!.total).toBeGreaterThan(0);
  });

  it('serialises timestamps as strings', async () => {
    const page = await readTable('users', { limit: 1, offset: 0 });
    expect(typeof page!.rows[0]!.created_at).toBe('string');
  });

  it('clamps an absurd page size', async () => {
    const response = await get('/admin/tables/users?limit=99999&offset=-5');
    expect(response.json().limit).toBe(500);
    expect(response.json().offset).toBe(0);
  });
});

describe('accounts', () => {
  it('lists accounts with their activity and spend', async () => {
    await addMeal(owner, { date: '2026-03-01', kcal: 500 });
    await recordUsage({
      userId: owner.id,
      kind: 'text_log',
      outcome: { text: '', sessionId: null, numTurns: 1, costUsd: 0.05, costSource: 'reported' },
    });

    const { users } = (await get('/admin/users')).json();
    const row = users.find((u: { id: string }) => u.id === owner.id);
    expect(row).toMatchObject({ email: owner.email, food_entries: 1, ai_turns: 1 });
    expect(row.ai_cost_usd).toBeCloseTo(0.05, 4);
  });

  it('404s for an account that does not exist', async () => {
    expect((await get('/admin/users/00000000-0000-0000-0000-000000000000')).statusCode).toBe(404);
  });

  it('surfaces a suspension and the last time the account was seen', async () => {
    await post(`/admin/users/${member.id}/disabled`, { disabled: true });

    const { users } = (await get('/admin/users')).json();
    const row = users.find((u: { id: string }) => u.id === member.id);
    expect(row.disabled_at).toEqual(expect.any(String));
    // The admin's own row has a live session; the suspended one no longer does.
    const mine = users.find((u: { id: string }) => u.id === owner.id);
    expect(mine.last_seen_at).toEqual(expect.any(String));
    expect(row.last_seen_at).toBeNull();
  });
});

describe('actions', () => {
  it('revokes every session', async () => {
    const { app: theirs, cookie: theirCookie } = await appFor(member);
    try {
      const response = await post(`/admin/users/${member.id}/sign-out`);
      expect(response.json().revoked).toBeGreaterThan(0);

      const after = await theirs.inject({ method: 'GET', url: '/day', headers: { cookie: theirCookie } });
      expect(after.statusCode).toBe(401);
    } finally {
      await theirs.close();
    }
  });

  it('sets a new password and drops the old sessions with it', async () => {
    const before = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [member.id],
    );

    expect((await post(`/admin/users/${member.id}/password`, { password: 'a-new-password' })).statusCode).toBe(200);

    const after = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [member.id],
    );
    expect(after!.password_hash).not.toBe(before!.password_hash);
    expect(await verifyPassword('a-new-password', after!.password_hash)).toBe(true);
    expect(await query('SELECT id FROM auth_sessions WHERE user_id = $1', [member.id])).toHaveLength(0);
  });

  it('rejects a password that is too short', async () => {
    expect((await post(`/admin/users/${member.id}/password`, { password: 'short' })).statusCode).toBe(400);
  });

  it('returns false for a password reset on a missing account', async () => {
    expect(await resetPassword('00000000-0000-0000-0000-000000000000', 'long-enough')).toBe(false);
  });

  describe('suspension', () => {
    it('signs the account out and refuses its next request', async () => {
      const { app: theirs, cookie: theirCookie } = await appFor(member);
      try {
        expect((await post(`/admin/users/${member.id}/disabled`, { disabled: true })).statusCode).toBe(200);
        const after = await theirs.inject({ method: 'GET', url: '/day', headers: { cookie: theirCookie } });
        expect(after.statusCode).toBe(401);
      } finally {
        await theirs.close();
      }
    });

    /**
     * Without this, a suspended user signs in successfully and then gets a 401
     * on every request afterwards, which looks like a broken server.
     */
    it('refuses a fresh login with a plain sentence', async () => {
      await post(`/admin/users/${member.id}/disabled`, { disabled: true });
      await resetPassword(member.id, 'correct-horse');

      const anon = await anonymousApp();
      try {
        const response = await anon.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: member.email, password: 'correct-horse' },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json().error).toMatch(/suspended/i);
      } finally {
        await anon.close();
      }
    });

    it('restores the account again', async () => {
      await post(`/admin/users/${member.id}/disabled`, { disabled: true });
      await post(`/admin/users/${member.id}/disabled`, { disabled: false });

      const { app: theirs, cookie: theirCookie } = await appFor(member);
      try {
        const after = await theirs.inject({ method: 'GET', url: '/day', headers: { cookie: theirCookie } });
        expect(after.statusCode).toBe(200);
      } finally {
        await theirs.close();
      }
    });

    /** Suspending yourself locks you out of the panel that would undo it. */
    it('refuses to suspend the admin doing the suspending', async () => {
      const response = await post(`/admin/users/${owner.id}/disabled`, { disabled: true });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/your own account/i);
    });

    it('rejects a malformed body', async () => {
      expect((await post(`/admin/users/${member.id}/disabled`, { disabled: 'yes' })).statusCode).toBe(400);
    });

    it('404s for an account that does not exist', async () => {
      const response = await post(
        '/admin/users/00000000-0000-0000-0000-000000000000/disabled',
        { disabled: true },
      );
      expect(response.statusCode).toBe(404);
    });
  });

  describe('deletion', () => {
    it('takes the account and everything it logged', async () => {
      await addMeal(member, { date: '2026-03-01', kcal: 500 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${member.id}`,
        headers: { cookie },
        payload: { confirm_email: member.email },
      });

      expect(response.statusCode).toBe(200);
      expect(await query('SELECT id FROM users WHERE id = $1', [member.id])).toHaveLength(0);
      expect(await query('SELECT id FROM food_entries WHERE user_id = $1', [member.id])).toHaveLength(0);
    });

    /**
     * The cost history is the one thing that survives. Deleting an account must
     * not retroactively change what the product costs to run.
     */
    it('keeps the AI cost history, orphaned', async () => {
      await recordUsage({
        userId: member.id,
        kind: 'text_log',
        outcome: { text: '', sessionId: null, numTurns: 1, costUsd: 0.05, costSource: 'reported' },
      });
      await deleteAccount(member.id);

      const rows = await query<any>('SELECT user_id, cost_usd FROM ai_usage');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.user_id).toBeNull();
      expect(Number(rows[0]!.cost_usd)).toBeCloseTo(0.05, 4);
    });

    /** Photos are files in a volume, so the rows cascading is not enough. */
    it('unlinks the photo files too', async () => {
      const { filePath } = await savePhoto(
        member.id,
        'image/png',
        Buffer.from('bytes').toString('base64'),
      );
      const summary = await deleteAccount(member.id);
      expect(summary!.photos).toContain(filePath);

      const { access } = await import('node:fs/promises');
      await expect(access(filePath)).rejects.toThrow();
    });

    it('refuses when the confirmation email does not match', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${member.id}`,
        headers: { cookie },
        payload: { confirm_email: 'wrong@example.com' },
      });
      expect(response.statusCode).toBe(400);
      expect(await query('SELECT id FROM users WHERE id = $1', [member.id])).toHaveLength(1);
    });

    it('refuses without a confirmation at all', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${member.id}`,
        headers: { cookie },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('refuses to delete the admin doing the deleting', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${owner.id}`,
        headers: { cookie },
        payload: { confirm_email: owner.email },
      });
      expect(response.statusCode).toBe(400);
    });

    it('404s for an account that does not exist', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/admin/users/00000000-0000-0000-0000-000000000000',
        headers: { cookie },
        payload: { confirm_email: 'anyone@example.com' },
      });
      expect(response.statusCode).toBe(404);
    });

    /** The pre-accounts placeholder row has no email, so nothing can confirm it. */
    it('cannot confirm an account that has no email', async () => {
      const legacy = await queryOne<{ id: string }>(
        `INSERT INTO users (display_name) VALUES ('legacy') RETURNING id`,
      );
      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${legacy!.id}`,
        headers: { cookie },
        payload: { confirm_email: '' },
      });
      expect(response.statusCode).toBe(400);
      expect(await query('SELECT id FROM users WHERE id = $1', [legacy!.id])).toHaveLength(1);
    });

    it('returns null rather than throwing for a missing account', async () => {
      expect(await deleteAccount('00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });

  /**
   * Everything an administrator can do here happens to someone who is not in
   * the room. Each of these actions is silent from the inside — the app simply
   * starts behaving differently — so each of them says so.
   */
  describe('telling the account what was done to it', () => {
    it('reports a password an administrator set', async () => {
      await post(`/admin/users/${member.id}/password`, { password: 'a-new-password' });

      // From the owner's side this is indistinguishable from being compromised
      // until somebody says otherwise.
      expect(emailTo(member.email)).toMatchObject({ subject: 'Your password was changed' });
    });

    it('reports a suspension, and says the data is untouched', async () => {
      await post(`/admin/users/${member.id}/disabled`, { disabled: true });

      const message = emailTo(member.email)!;
      expect(message.subject).toBe('Your account has been suspended');
      expect(message.text).toContain('Nothing has been deleted');
    });

    it('reports being let back in', async () => {
      await post(`/admin/users/${member.id}/disabled`, { disabled: true });
      await post(`/admin/users/${member.id}/disabled`, { disabled: false });

      expect(mailbox().at(-1)).toMatchObject({ subject: 'Your account is active again' });
    });

    it('sends the same deletion receipt an owner would get', async () => {
      await addMeal(member, { date: '2026-03-01', kcal: 500 });

      await app.inject({
        method: 'DELETE',
        url: `/admin/users/${member.id}`,
        headers: { cookie },
        payload: { confirm_email: member.email },
      });

      const message = emailTo(member.email)!;
      expect(message.subject).toBe('Your account has been deleted');
      expect(message.text).toContain('1 entry');
    });

    it('says nothing when the action did not happen', async () => {
      const missing = '00000000-0000-0000-0000-000000000000';
      await post(`/admin/users/${missing}/disabled`, { disabled: true });
      await post(`/admin/users/${missing}/password`, { password: 'a-new-password' });

      expect(mailbox()).toHaveLength(0);
    });
  });

  describe('running the agent for a user', () => {
    beforeEach(async () => {
      await setUserTargets(member, '2020-01-01', { kcal: 2200, protein_g: 160 });
      await addWeight(member, '2026-03-01', 85);
      await addMeal(member, { date: '2026-03-01', kcal: 2000 });
    });

    it('generates a weekly review on demand', async () => {
      scriptAgent({ text: 'A solid week.' });
      const response = await post(`/admin/users/${member.id}/review`);
      expect(response.statusCode).toBe(200);
      expect(response.json().content).toBe('A solid week.');
    });

    it('reports a failed review as a bad gateway rather than a crash', async () => {
      scriptAgent({ throws: 'claude binary missing' });
      const response = await post(`/admin/users/${member.id}/review`);
      expect(response.statusCode).toBe(502);
    });

    it('runs the adaptive pass', async () => {
      const response = await post(`/admin/users/${member.id}/adaptive`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('applied');
    });

    it('404s both agent actions for an account that does not exist', async () => {
      const missing = '00000000-0000-0000-0000-000000000000';
      expect((await post(`/admin/users/${missing}/review`)).statusCode).toBe(404);
      expect((await post(`/admin/users/${missing}/adaptive`)).statusCode).toBe(404);
      expect((await post(`/admin/users/${missing}/sign-out`)).statusCode).toBe(404);
    });
  });
});

describe('the cost routes', () => {
  it('answers the viability question in one response', async () => {
    await recordUsage({
      userId: owner.id,
      kind: 'text_log',
      outcome: {
        text: '',
        sessionId: null,
        numTurns: 2,
        costUsd: 0.02,
        costSource: 'reported',
        model: 'claude-sonnet-5',
        usage: { inputTokens: 900, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    });

    const body = (await get('/admin/costs?days=30')).json();
    expect(body.days).toBe(30);
    expect(body.totals.turns).toBe(1);
    expect(body.by_kind).toHaveLength(1);
    expect(body.by_day).toHaveLength(1);
    expect(body.economics.projection).toHaveLength(3);
  });

  it('clamps the window', async () => {
    expect((await get('/admin/costs?days=100000')).json().days).toBe(365);
    expect((await get('/admin/costs?days=nonsense')).json().days).toBe(30);
    expect((await get('/admin/costs?days=0')).json().days).toBe(1);
  });

  it('serves the raw turn log', async () => {
    await recordUsage({
      userId: owner.id,
      kind: 'photo_log',
      outcome: { text: '', sessionId: null, numTurns: 1, costUsd: 0.3, costSource: 'reported' },
    });
    const body = (await get('/admin/costs/turns?limit=10')).json();
    expect(body.turns).toHaveLength(1);
    expect(body.turns[0]).toMatchObject({ kind: 'photo_log', email: owner.email });
  });

  it('confirms admin status for the nav link', async () => {
    expect((await get('/admin/me')).json()).toEqual({ admin: true });
  });
});
