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

/**
 * A calendar day relative to the database's own `CURRENT_DATE`, spelled the way
 * a phone spells it.
 *
 * Asked of the database rather than built from `new Date()` because the clamp
 * in `recordFunnelStep` compares against `CURRENT_DATE`, and a test process on a
 * different TZ to its Postgres would otherwise be off by one for part of every
 * day — the kind of failure that arrives at midnight and cannot be reproduced
 * at noon.
 */
async function dbDay(offset: number): Promise<string> {
  const [row] = await query<{ d: string }>(`SELECT to_char(CURRENT_DATE + $1::int, 'YYYY-MM-DD') AS d`, [offset]);
  return row!.d;
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
    expect(columns.map((c) => c.column_name)).toEqual([
      'app_version',
      'day',
      'internal',
      'locale',
      'platform',
      'reached',
      'reason',
      'step',
    ]);
  });

  /*
   * The language, which is what makes a cliff attributable to the campaign that
   * bought it. Thirteen shared words and never a country — see `FunnelPing`.
   */
  it('counts a step per language, and folds a missing one rather than splitting it', async () => {
    await ping({ step: 'goal', platform: 'android', app_version: '1.5.5', locale: 'bg' });
    await ping({ step: 'goal', platform: 'android', app_version: '1.5.5', locale: 'bg' });
    await ping({ step: 'goal', platform: 'android', app_version: '1.5.5', locale: 'fr' });
    // A phone on a build from before the funnel carried one.
    await ping({ step: 'goal', platform: 'android', app_version: '1.5.4' });
    await ping({ step: 'goal', platform: 'android', app_version: '1.5.4' });

    const rows = await query<{ locale: string | null; reached: number }>(
      `SELECT locale, reached FROM onboarding_funnel ORDER BY locale NULLS FIRST`,
    );
    expect(rows).toEqual([
      { locale: null, reached: 2 },
      { locale: 'bg', reached: 2 },
      { locale: 'fr', reached: 1 },
    ]);
  });

  it('refuses a language that is not one of ours', async () => {
    expect(
      (await ping({ step: 'goal', platform: 'ios', app_version: '1.5.5', locale: 'jp' })).statusCode,
    ).toBe(400);
    const [row] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM onboarding_funnel`);
    expect(row!.n).toBe(0);
  });

  /** A ping that does not mention it is a store build: the safe direction. */
  it('marks our own builds and defaults everything else to real', async () => {
    await ping({ step: 'welcome', platform: 'android', app_version: '1.5.5', internal: true });
    await ping({ step: 'welcome', platform: 'android', app_version: '1.5.5' });

    const rows = await query<{ internal: boolean; reached: number }>(
      `SELECT internal, reached FROM onboarding_funnel ORDER BY internal`,
    );
    expect(rows).toEqual([
      { internal: false, reached: 1 },
      { internal: true, reached: 1 },
    ]);
  });

  /*
   * Which prompt asked (GUEST-ACCOUNTS.md's ladder). It is four shared words
   * rather than anything about a phone, and it keeps its own count: the wall a
   * spent guest hits and a tap on the You tab are the same step and different
   * questions.
   */
  it('counts the save prompt separately by the prompt that opened it', async () => {
    await ping({ step: 'save_prompt', platform: 'android', app_version: '1.5.4', reason: 'guest_limit' });
    await ping({ step: 'save_prompt', platform: 'android', app_version: '1.5.4', reason: 'guest_limit' });
    await ping({ step: 'save_prompt', platform: 'android', app_version: '1.5.4', reason: 'you' });
    await ping({ step: 'account', platform: 'android', app_version: '1.5.4', reason: 'guest_limit' });
    // The same step from the sign-in screen, where no prompt asked.
    await ping({ step: 'account', platform: 'android', app_version: '1.5.4' });

    const rows = await query<{ step: string; reason: string | null; reached: number }>(
      `SELECT step, reason, reached FROM onboarding_funnel ORDER BY step, reason NULLS FIRST`,
    );
    expect(rows).toEqual([
      { step: 'account', reason: null, reached: 1 },
      { step: 'account', reason: 'guest_limit', reached: 1 },
      { step: 'save_prompt', reason: 'guest_limit', reached: 2 },
      { step: 'save_prompt', reason: 'you', reached: 1 },
    ]);
  });

  /** A reason nobody asked for would be a word on a row that cannot be read. */
  it('refuses a reason it does not know, or one on a step that has no prompt', async () => {
    expect(
      (await ping({ step: 'save_prompt', platform: 'ios', app_version: '1.5.4', reason: 'curiosity' })).statusCode,
    ).toBe(400);
    expect(
      (await ping({ step: 'welcome', platform: 'ios', app_version: '1.5.4', reason: 'guest_limit' })).statusCode,
    ).toBe(400);
    const [row] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM onboarding_funnel`);
    expect(row!.n).toBe(0);
  });

  /** The step still counts once per install per day, reason or no reason. */
  it('keeps one row per key, and nulls do not multiply it', async () => {
    await ping({ step: 'welcome', platform: 'ios', app_version: '1.5.4' });
    await ping({ step: 'welcome', platform: 'ios', app_version: '1.5.4' });
    await ping({ step: 'welcome', platform: 'ios', app_version: '1.5.4' });
    const rows = await query<{ reached: number }>(`SELECT reached FROM onboarding_funnel`);
    expect(rows).toEqual([{ reached: 3 }]);
  });

  /*
   * A ping is queued on the phone when it fails and flushed later, so the day
   * it happened is carried rather than read off this clock on arrival — see
   * `FunnelPing`. Without this a ping held overnight moves both the count and
   * the cliff.
   */
  it('files a late ping on the day it happened', async () => {
    await ping({ step: 'save_prompt', platform: 'android', app_version: '1.5.6', reason: 'guest_limit', day: await dbDay(-1) });
    await ping({ step: 'save_prompt', platform: 'android', app_version: '1.5.6', reason: 'guest_limit' });

    const rows = await query<{ ago: number; reached: number }>(
      `SELECT (CURRENT_DATE - day) AS ago, reached FROM onboarding_funnel ORDER BY day`,
    );
    expect(rows).toEqual([
      { ago: 1, reached: 1 },
      { ago: 0, reached: 1 },
    ]);
  });

  /*
   * Bounded rather than trusted: the route is public, so a day it will believe
   * is a day anybody can add to. Outside the window the ping still counts — it
   * lands on today, which is what every build older than this sends anyway.
   * Dropping it would turn a stale clock into a step that reads as unreached.
   */
  it('files a day outside the window under today rather than believing it', async () => {
    await ping({ step: 'welcome', platform: 'ios', app_version: '1.5.6', day: await dbDay(-3) });
    await ping({ step: 'welcome', platform: 'ios', app_version: '1.5.6', day: await dbDay(7) });

    const rows = await query<{ ago: number; reached: number }>(
      `SELECT (CURRENT_DATE - day) AS ago, reached FROM onboarding_funnel`,
    );
    expect(rows).toEqual([{ ago: 0, reached: 2 }]);
  });

  /*
   * `2026-02-30` is four digits, two and two, and is not a day. The shape check
   * in `FunnelPing` cannot see that, and casting it in the insert would be a
   * 500 on a route anybody can post to.
   */
  it('does not fall over on a date that passes the shape check and is not one', async () => {
    const response = await ping({ step: 'goal', platform: 'ios', app_version: '1.5.6', day: '2026-02-30' });
    expect(response.statusCode).toBe(204);

    const rows = await query<{ ago: number }>(`SELECT (CURRENT_DATE - day) AS ago FROM onboarding_funnel`);
    expect(rows).toEqual([{ ago: 0 }]);
  });

  it('refuses a day that is not shaped like one', async () => {
    expect((await ping({ step: 'goal', platform: 'ios', app_version: '1.5.6', day: 'yesterday' })).statusCode).toBe(400);
    expect((await ping({ step: 'goal', platform: 'ios', app_version: '1.5.6', day: '2026-9-3' })).statusCode).toBe(400);
    const [row] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM onboarding_funnel`);
    expect(row!.n).toBe(0);
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

  it('splits the save prompt and the account by which prompt asked, zeros included', async () => {
    await ping({ step: 'save_prompt', platform: 'android', app_version: '1.5.4', reason: 'guest_limit' });
    await ping({ step: 'save_prompt', platform: 'ios', app_version: '1.5.4', reason: 'guest_limit' });
    await ping({ step: 'account', platform: 'ios', app_version: '1.5.4', reason: 'guest_limit' });
    await ping({ step: 'save_prompt', platform: 'ios', app_version: '1.5.4', reason: 'purchase' });
    await ping({ step: 'account', platform: 'android', app_version: '1.5.4' });

    const today = await readFunnel(1);
    const at = (step: string, reason: string) =>
      today.reasons.find((r) => r.step === step && r.reason === reason)!.reached;
    expect(at('save_prompt', 'guest_limit')).toBe(2);
    expect(at('account', 'guest_limit')).toBe(1);
    expect(at('save_prompt', 'purchase')).toBe(1);
    expect(at('account', 'purchase')).toBe(0);
    // A rung nobody has built yet is a row of zeros, not a missing row.
    expect(at('save_prompt', 'first_log')).toBe(0);
    expect(today.reasons).toHaveLength(8);
    // The step totals are unchanged by the split: the reasonless account counts too.
    expect(today.steps.find((s) => s.step === 'account')!.reached).toBe(2);
    expect(today.steps.find((s) => s.step === 'save_prompt')!.reached).toBe(3);
  });

  it('groups the walk by language, zeros and all, so a campaign can be read out of the blend', async () => {
    await ping({ step: 'welcome', platform: 'android', app_version: '1.5.5', locale: 'bg' });
    await ping({ step: 'goal', platform: 'android', app_version: '1.5.5', locale: 'bg' });
    await ping({ step: 'welcome', platform: 'android', app_version: '1.5.5', locale: 'fr' });
    await ping({ step: 'welcome', platform: 'ios', app_version: '1.5.4' });

    const today = await readFunnel(1);
    const at = (locale: string | null, step: string) =>
      today.locales.find((l) => l.locale === locale && l.step === step)?.reached ?? 0;
    expect(at('bg', 'welcome')).toBe(1);
    expect(at('bg', 'goal')).toBe(1);
    expect(at('fr', 'welcome')).toBe(1);
    expect(at('fr', 'goal')).toBe(0);
    expect(at(null, 'welcome')).toBe(1);
    // The totals are the blend the split came out of.
    expect(today.steps.find((s) => s.step === 'welcome')!.reached).toBe(3);
  });

  /*
   * The whole point of the flag: a morning spent driving the walk on a simulator
   * used to read as installs that opened the app and left.
   */
  it('leaves our own builds out of every count, and says how many it left out', async () => {
    await ping({ step: 'welcome', platform: 'android', app_version: '1.5.5', locale: 'bg' });
    await ping({ step: 'welcome', platform: 'android', app_version: '1.5.5', locale: 'bg', internal: true });
    await ping({ step: 'goal', platform: 'android', app_version: '1.5.5', locale: 'bg', internal: true });
    await ping({ step: 'save_prompt', platform: 'android', app_version: '1.5.5', reason: 'guest_limit', internal: true });

    const today = await readFunnel(1);
    expect(today.steps.find((s) => s.step === 'welcome')!.reached).toBe(1);
    expect(today.steps.find((s) => s.step === 'goal')!.reached).toBe(0);
    expect(today.locales.find((l) => l.locale === 'bg' && l.step === 'goal')).toBeUndefined();
    expect(today.versions.find((v) => v.step === 'goal')).toBeUndefined();
    expect(today.reasons.find((r) => r.step === 'save_prompt' && r.reason === 'guest_limit')!.reached).toBe(0);
    expect(today.internal_pings).toBe(3);
  });

  /*
   * Guests are accounts. This number counted `email IS NOT NULL` and so read
   * zero through a week in which the ads made twenty of them.
   */
  it('counts every account made in the same window, and the subset that saved an address', async () => {
    await createUser({ email: 'new@example.com' });
    await createUser({ email: null, password_hash: null, guest_since: new Date().toISOString() });
    const today = await readFunnel(1);
    expect(today.accounts_created).toBe(2);
    expect(today.accounts_saved).toBe(1);
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
