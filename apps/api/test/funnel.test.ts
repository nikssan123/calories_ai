import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db.ts';
import { readFunnel } from '../src/services/funnel.ts';
import { anonymousApp, appFor, createUser } from './helpers/factories.ts';

/**
 * The first-run funnel.
 *
 * The bar is that a phone with no account can add to a count and do nothing
 * else — no identifier lands anywhere, a malformed step is refused, and only
 * an admin can read the result.
 */

let app: FastifyInstance;

beforeEach(async () => {
  app = await anonymousApp();
});

afterEach(async () => {
  await app.close();
});

function ping(payload: unknown) {
  return app.inject({ method: 'POST', url: '/funnel', payload: payload as never });
}

describe('POST /funnel', () => {
  it('counts a step without a session', async () => {
    const response = await ping({ step: 'welcome', platform: 'android', app_version: '1.2.1' });
    expect(response.statusCode).toBe(204);

    await ping({ step: 'welcome', platform: 'android', app_version: '1.2.1' });
    await ping({ step: 'welcome', platform: 'ios', app_version: '1.2.1' });
    const rows = await query<{ step: string; platform: string; reached: number }>(
      `SELECT step, platform, reached FROM onboarding_funnel ORDER BY platform`,
    );
    expect(rows).toEqual([
      { step: 'welcome', platform: 'android', reached: 2 },
      { step: 'welcome', platform: 'ios', reached: 1 },
    ]);
  });

  /** A row is a count and its key. Anything that could tell two phones apart would be a column here. */
  it('stores nothing but the count and its key', async () => {
    await ping({ step: 'goal', platform: 'ios', app_version: '1.2.1' });
    const columns = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'onboarding_funnel' ORDER BY column_name`,
    );
    expect(columns.map((c) => c.column_name)).toEqual(['app_version', 'day', 'platform', 'reached', 'step']);
  });

  it('refuses a step it does not know, and extra fields do not get through', async () => {
    expect((await ping({ step: 'credit_card', platform: 'ios', app_version: '1.2.1' })).statusCode).toBe(400);
    expect((await ping({ step: 'goal', platform: 'web', app_version: '1.2.1' })).statusCode).toBe(400);
    expect((await ping({ step: 'goal', platform: 'ios', app_version: 'x'.repeat(40) })).statusCode).toBe(400);
    expect((await ping({ step: 'goal', platform: 'ios', app_version: '1.2.1', device: 'abc' })).statusCode).toBe(204);
    const [row] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM onboarding_funnel`);
    expect(row!.n).toBe(1);
  });
});

describe('the admin read', () => {
  it('returns every step in walk order, zeros included, split by platform and version', async () => {
    await ping({ step: 'welcome', platform: 'android', app_version: '1.2.1' });
    await ping({ step: 'welcome', platform: 'ios', app_version: '1.2.2' });
    await ping({ step: 'goal', platform: 'android', app_version: '1.2.1' });
    // A day outside a one-day window.
    await query(
      `INSERT INTO onboarding_funnel (day, step, platform, app_version, reached)
       VALUES (CURRENT_DATE - 3, 'welcome', 'android', '1.2.0', 5)`,
    );

    const today = await readFunnel(1);
    expect(today.steps[0]).toEqual({ step: 'welcome', reached: 2, ios: 1, android: 1 });
    expect(today.steps[1]).toEqual({ step: 'start', reached: 0, ios: 0, android: 0 });
    expect(today.steps.find((s) => s.step === 'goal')!.reached).toBe(1);
    expect(today.versions.map((v) => `${v.app_version}:${v.step}`)).toEqual([
      '1.2.2:welcome',
      '1.2.1:welcome',
      '1.2.1:goal',
    ]);

    const week = await readFunnel(7);
    expect(week.steps[0]!.reached).toBe(7);
  });

  it('counts accounts made in the same window', async () => {
    await createUser({ email: 'new@example.com' });
    expect((await readFunnel(1)).accounts_created).toBe(1);
  });

  it('is admin-only', async () => {
    const owner = await createUser({ email: 'owner@example.com' });
    const member = await createUser({ email: 'member@example.com' });
    const asOwner = await appFor(owner);
    const asMember = await appFor(member);
    try {
      const mine = await asOwner.app.inject({ method: 'GET', url: '/admin/funnel?days=7', headers: { cookie: asOwner.cookie } });
      expect(mine.statusCode).toBe(200);
      expect(mine.json().days).toBe(7);
      const theirs = await asMember.app.inject({ method: 'GET', url: '/admin/funnel', headers: { cookie: asMember.cookie } });
      expect(theirs.statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/admin/funnel' })).statusCode).toBe(401);
    } finally {
      await asOwner.app.close();
      await asMember.app.close();
    }
  });
});
