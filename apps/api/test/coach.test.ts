import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import {
  acceptInvite,
  attention,
  createInvite,
  ensureCoachAccount,
  expireTrials,
  flagsFor,
  formatCode,
  normaliseCode,
  roster,
  setCoachPlan,
  TRIAL_DAYS,
  TRIAL_SEATS,
} from '../src/services/coach.ts';
import { targetsForDate } from '../src/services/targets.ts';
import { addDays, localDateFor } from '../src/time.ts';
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
 * The coach seat. See COACH.md.
 *
 * Three things have to hold. The coach's surface is invisible to anybody who
 * is not one. Nothing about a client reaches a coach without an active link
 * the client accepted. And the seat — Plus on the client's account — follows
 * the link exactly: granted on accept, taken back on revoke, never touching a
 * client who pays for themselves.
 */

const AS_APP = { 'x-session-transport': 'bearer' };

let coach: TestUser;
let client: TestUser;
let app: FastifyInstance;
let coachCookie: string;
let clientCookie: string;

/** Today in the fixtures' timezone; the roster window is the week before it. */
const today = () => localDateFor(new Date(), { timezone: 'Europe/Sofia', dayStartHour: 4 });

beforeEach(async () => {
  coach = await createUser({ email: 'coach@example.com', display_name: 'Maria' });
  client = await createUser({ email: 'client@example.com', display_name: 'Elena', plan: 'free' });
  ({ app, cookie: coachCookie } = await appFor(coach));
  const { createSession } = await import('../src/services/auth.ts');
  clientCookie = `ct_session=${(await createSession(client.id)).token}`;
});

afterEach(async () => {
  await app.close();
});

const asCoach = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie: coachCookie }, payload: payload as never });
const asClient = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie: clientCookie }, payload: payload as never });

/** Coach and client, linked, with a seat. What most cases start from. */
async function link(): Promise<void> {
  await ensureCoachAccount(coach.id);
  const invite = await createInvite(coach.id);
  const outcome = await acceptInvite(client.id, invite.code);
  if (!outcome.ok) throw new Error(`accept failed: ${outcome.reason}`);
}

describe('the guard', () => {
  it('hides every coach route from an account with no coach seat', async () => {
    for (const url of ['/coach/me', '/coach/roster', '/coach/invites']) {
      expect((await asCoach('GET', url)).statusCode, url).toBe(404);
    }
  });

  it('lets an account become a coach, once', async () => {
    const first = await asCoach('POST', '/coach/account');
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      plan: 'trial',
      seat_limit: TRIAL_SEATS,
      seats_used: 0,
      seats_carry_plus: true,
    });
    const trialEnds = new Date(first.json().trial_ends_at).getTime();
    expect(trialEnds - Date.now()).toBeGreaterThan((TRIAL_DAYS - 1) * 86_400_000);

    // A second knock returns the same account rather than restarting the trial.
    const again = await asCoach('POST', '/coach/account');
    expect(again.json().trial_ends_at).toBe(first.json().trial_ends_at);

    expect((await asCoach('GET', '/coach/me')).statusCode).toBe(200);
    expect((await asCoach('GET', '/coach/roster')).json().clients).toEqual([]);
  });

  it('rejects an anonymous caller before it gets that far', async () => {
    const anon = await anonymousApp();
    try {
      expect((await anon.inject({ method: 'GET', url: '/coach/roster' })).statusCode).toBe(401);
    } finally {
      await anon.close();
    }
  });

  it('reports the seat on the session status', async () => {
    expect((await asCoach('GET', '/auth/me')).json().is_coach).toBe(false);
    await asCoach('POST', '/coach/account');
    expect((await asCoach('GET', '/auth/me')).json().is_coach).toBe(true);
  });
});

describe('the web door', () => {
  const CREDENTIALS = { email: 'newcoach@example.com', password: 'correct-horse' };

  it('opens sign-up on the web to a coach, and to nobody else', async () => {
    const anon = await anonymousApp();
    try {
      const refused = await anon.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS });
      expect(refused.statusCode).toBe(403);

      const allowed = await anon.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { ...CREDENTIALS, intent: 'coach' },
      });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json().is_coach).toBe(true);
      const row = await queryOne<{ plan: string }>(
        `SELECT a.plan FROM coach_accounts a JOIN users u ON u.id = a.user_id WHERE u.email = $1`,
        [CREDENTIALS.email],
      );
      expect(row?.plan).toBe('trial');
    } finally {
      await anon.close();
    }
  });

  it('lets a coach sign in on the web, and turns a non-coach away with the app sentence', async () => {
    const anon = await anonymousApp();
    try {
      // A real password, made the way the product makes one.
      await anon.inject({ method: 'POST', url: '/auth/signup', payload: CREDENTIALS, headers: AS_APP });

      const refused = await anon.inject({ method: 'POST', url: '/auth/login', payload: CREDENTIALS });
      expect(refused.statusCode).toBe(403);
      expect(refused.json().error).toMatch(/lives in the app/);

      const asCoachIntent = await anon.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { ...CREDENTIALS, intent: 'coach' },
      });
      expect(asCoachIntent.statusCode).toBe(200);
      expect(asCoachIntent.json().is_coach).toBe(true);

      // And from then on, no intent needed: the seat is the key.
      const plain = await anon.inject({ method: 'POST', url: '/auth/login', payload: CREDENTIALS });
      expect(plain.statusCode).toBe(200);
      expect(plain.json().is_coach).toBe(true);
    } finally {
      await anon.close();
    }
  });
});

describe('invites', () => {
  beforeEach(async () => {
    await ensureCoachAccount(coach.id);
  });

  it('mints a readable code and a link', async () => {
    const response = await asCoach('POST', '/coach/invites', {});
    expect(response.statusCode).toBe(200);
    const invite = response.json();
    expect(invite.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(invite.url).toMatch(/\/c\/[A-HJ-NP-Z2-9]{8}$/);
    expect(invite.accepted_at).toBeNull();

    const list = await asCoach('GET', '/coach/invites');
    expect(list.json().invites.map((i: any) => i.id)).toEqual([invite.id]);
  });

  it('normalises what people type', () => {
    expect(normaliseCode(' 7kq4-mr2x ')).toBe('7KQ4MR2X');
    expect(formatCode('7KQ4MR2X')).toBe('7KQ4-MR2X');
  });

  it('links the client on accept and puts them on a seat', async () => {
    const invite = await createInvite(coach.id);

    const response = await asClient('POST', '/me/coach/accept', { code: invite.code.toLowerCase() });
    expect(response.statusCode).toBe(200);
    expect(response.json().link).toMatchObject({
      coach: { display_name: 'Maria' },
      scope: { meals: true, weight: true, metrics: false },
      seat: 'plus',
    });

    const user = await queryOne<any>('SELECT plan, plan_source FROM users WHERE id = $1', [client.id]);
    expect(user).toMatchObject({ plan: 'plus', plan_source: 'coach_seat' });

    // The coach sees them, and the invite is spent.
    expect((await asCoach('GET', '/coach/roster')).json().seats).toEqual({ used: 1, limit: TRIAL_SEATS });
    const spent = (await asCoach('GET', '/coach/invites')).json().invites[0];
    expect(spent.accepted_by).toBe(client.id);
    expect(spent.accepted_name).toBe('Elena');
  });

  it('refuses a spent, expired, unknown or self-addressed code', async () => {
    const invite = await createInvite(coach.id);
    await acceptInvite(client.id, invite.code);

    const other = await createUser({ email: 'other@example.com' });
    expect(await acceptInvite(other.id, invite.code)).toEqual({ ok: false, reason: 'used' });
    expect(await acceptInvite(other.id, 'ZZZZ-ZZZZ')).toEqual({ ok: false, reason: 'invalid' });
    expect(await acceptInvite(other.id, 'nope')).toEqual({ ok: false, reason: 'invalid' });

    const stale = await createInvite(coach.id, null, new Date(Date.now() - 30 * 86_400_000));
    expect(await acceptInvite(other.id, stale.code)).toEqual({ ok: false, reason: 'expired' });

    const own = await createInvite(coach.id);
    expect(await acceptInvite(coach.id, own.code)).toEqual({ ok: false, reason: 'self' });
  });

  it('holds the seat limit, and says so to the client', async () => {
    await query('UPDATE coach_accounts SET seat_limit = 1 WHERE user_id = $1', [coach.id]);
    await acceptInvite(client.id, (await createInvite(coach.id)).code);

    const second = await createUser({ email: 'second@example.com' });
    const { createSession } = await import('../src/services/auth.ts');
    const secondCookie = `ct_session=${(await createSession(second.id)).token}`;
    const response = await app.inject({
      method: 'POST',
      url: '/me/coach/accept',
      headers: { cookie: secondCookie },
      payload: { code: (await createInvite(coach.id)).code },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().reason).toBe('seats_full');
  });

  it('names the coach behind a code before anything is agreed', async () => {
    const invite = await createInvite(coach.id);
    const fresh = await asClient('GET', `/me/coach/invite/${invite.code.toLowerCase()}`);
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json()).toMatchObject({ valid: true, reason: null, coach: { display_name: 'Maria' } });

    await acceptInvite(client.id, invite.code);
    expect((await asClient('GET', `/me/coach/invite/${invite.code}`)).json()).toMatchObject({ valid: false, reason: 'used' });
    expect((await asClient('GET', '/me/coach/invite/ZZZZ-ZZZZ')).json()).toMatchObject({ valid: false, reason: 'invalid', coach: null });

    const stale = await createInvite(coach.id, null, new Date(Date.now() - 30 * 86_400_000));
    expect((await asClient('GET', `/me/coach/invite/${stale.code}`)).json()).toMatchObject({ valid: false, reason: 'expired' });
  });

  it('allows one coach at a time', async () => {
    await acceptInvite(client.id, (await createInvite(coach.id)).code);
    const rival = await createUser({ email: 'rival@example.com' });
    await ensureCoachAccount(rival.id);
    const outcome = await acceptInvite(client.id, (await createInvite(rival.id)).code);
    expect(outcome).toEqual({ ok: false, reason: 'already_linked' });
  });

  it('does not take a seat from a client already paying for themselves', async () => {
    await query(`UPDATE users SET plan = 'coach', plan_source = 'app_store' WHERE id = $1`, [client.id]);
    await acceptInvite(client.id, (await createInvite(coach.id)).code);
    const user = await queryOne<any>('SELECT plan, plan_source FROM users WHERE id = $1', [client.id]);
    expect(user).toMatchObject({ plan: 'coach', plan_source: 'app_store' });
    expect((await asClient('GET', '/me/coach')).json().link.seat).toBe('free');
  });
});

describe('the roster', () => {
  beforeEach(link);

  it('shows the week, the averages and the flags', async () => {
    const yesterday = addDays(today(), -1);
    await setUserTargets(client, addDays(today(), -30), { kcal: 2000, protein_g: 150 });
    // Five logged days, every one short on protein.
    for (let i = 1; i <= 5; i += 1) {
      await addMeal(client, { date: addDays(today(), -i), kcal: 1900, protein_g: 90 });
    }

    const response = await asCoach('GET', '/coach/roster');
    expect(response.statusCode).toBe(200);
    const [row] = response.json().clients;
    expect(row.client).toMatchObject({ id: client.id, display_name: 'Elena', seat: 'plus' });
    expect(row.week).toEqual({ start: addDays(today(), -7), end: yesterday });
    expect(row.days).toHaveLength(7);
    expect(row.days.at(-1)).toMatchObject({ local_date: yesterday, logged: true, kcal: 1900, protein_g: 90 });
    expect(row.days_logged).toBe(5);
    expect(row.kcal).toEqual({ average: 1900, target: 2000 });
    expect(row.protein).toEqual({ average_g: 90, target_g: 150 });
    expect(row.flags.map((f: any) => f.kind)).toEqual(['protein_short', 'new']);
    expect(row.last_logged_at).not.toBeNull();
  });

  it('flags silence before anything else', async () => {
    await addMeal(client, { date: addDays(today(), -4), kcal: 1800 });
    const [row] = (await asCoach('GET', '/coach/roster')).json().clients;
    expect(row.flags[0]).toMatchObject({ kind: 'no_log', severity: 'critical', days: 4 });
  });

  it('sorts the people who need attention first', () => {
    const base = {
      client: { id: 'x', display_name: 'B', goal: null, timezone: 'UTC', accepted_at: '', scope: { meals: true, weight: true, metrics: false }, seat: 'plus' as const },
      week: { start: '', end: '' },
      days: [],
      kcal: { average: null, target: 2000 },
      protein: { average_g: null, target_g: 150 },
      weight: { current_kg: null, change_4w_kg: null, weigh_ins: 0 },
      last_logged_at: null,
      last_comment_at: null,
    };
    const quiet = { ...base, days_logged: 7, flags: [] };
    const short = { ...base, days_logged: 7, flags: [{ kind: 'protein_short' as const, severity: 'warning' as const, label: '', days: null }] };
    const gone = { ...base, days_logged: 2, flags: [{ kind: 'no_log' as const, severity: 'critical' as const, label: '', days: 3 }] };
    expect([quiet, short, gone].sort(attention).map((r) => r.flags[0]?.kind ?? 'none')).toEqual([
      'no_log',
      'protein_short',
      'none',
    ]);
  });

  it('is empty for a coach with nobody yet', async () => {
    const other = await createUser({ email: 'lonely@example.com' });
    await ensureCoachAccount(other.id);
    expect((await roster(other.id)).clients).toEqual([]);
  });
});

describe('flagsFor', () => {
  const week = {
    today: '2026-09-07',
    lastLoggedDate: '2026-09-06',
    acceptedDate: '2026-08-01',
    acceptedWeekday: 'Sat',
    daysLogged: 7,
    averageKcal: 2000,
    targetKcal: 2000,
    averageProtein: 150,
    targetProtein: 150,
    goal: 'lose' as const,
    weighIns: 6,
    weightChange4w: -1.2,
  };

  it('is quiet for a good week', () => {
    expect(flagsFor(week)).toEqual([]);
  });

  it('names each thing that slipped', () => {
    expect(flagsFor({ ...week, lastLoggedDate: '2026-09-04' })[0]).toMatchObject({ kind: 'no_log', days: 3 });
    expect(flagsFor({ ...week, averageProtein: 120 }).map((f) => f.kind)).toEqual(['protein_short']);
    expect(flagsFor({ ...week, averageKcal: 2400 }).map((f) => f.kind)).toEqual(['kcal_over']);
    expect(flagsFor({ ...week, averageKcal: 1400 }).map((f) => f.kind)).toEqual(['kcal_under']);
    expect(flagsFor({ ...week, weightChange4w: 0.1 }).map((f) => f.kind)).toEqual(['stalled']);
    expect(flagsFor({ ...week, acceptedDate: '2026-09-04' }).map((f) => f.kind)).toEqual(['new']);
  });

  it('does not read an average off two days', () => {
    expect(flagsFor({ ...week, daysLogged: 2, averageProtein: 40 })).toEqual([]);
  });

  it('does not call a maintainer stalled, or a first weigh-in a plateau', () => {
    expect(flagsFor({ ...week, goal: 'maintain', weightChange4w: 0 })).toEqual([]);
    expect(flagsFor({ ...week, weighIns: 2, weightChange4w: 0 })).toEqual([]);
  });

  it('is gentler about silence from somebody who just joined', () => {
    expect(flagsFor({ ...week, lastLoggedDate: null, acceptedDate: '2026-09-05' })[0]).toMatchObject({
      kind: 'no_log',
      severity: 'warning',
    });
  });
});

describe('one client', () => {
  beforeEach(link);

  it('answers the week with entries, weights and targets, and 404s for anyone else', async () => {
    const day = addDays(today(), -1);
    await addMeal(client, { date: day, kcal: 650, description: 'Tarator and kyufte' });
    await addWeight(client, day, 61.4);

    const response = await asCoach('GET', `/coach/clients/${client.id}/week`);
    expect(response.statusCode).toBe(200);
    const week = response.json();
    expect(week.client.id).toBe(client.id);
    expect(week.days).toHaveLength(7);
    expect(week.week.end).toBe(day);
    const last = week.days.at(-1);
    expect(last.food_entries[0].description).toBe('Tarator and kyufte');
    expect(last.weight.weight_kg).toBe(61.4);
    expect(week.weights.map((w: any) => w.weight_kg)).toEqual([61.4]);
    expect(week.targets.kcal).toBeGreaterThan(0);
    expect(week.notes).toBe('');
    expect(week.comments).toEqual([]);

    const stranger = await createUser({ email: 'stranger@example.com' });
    expect((await asCoach('GET', `/coach/clients/${stranger.id}/week`)).statusCode).toBe(404);
    expect((await asCoach('GET', `/coach/clients/not-a-uuid/week`)).statusCode).toBe(404);
  });

  it('cuts what the client did not share', async () => {
    const day = addDays(today(), -1);
    await addMeal(client, { date: day, kcal: 650 });
    await addWeight(client, day, 61.4);
    await asClient('PATCH', '/me/coach/scope', { weight: false });

    const week = (await asCoach('GET', `/coach/clients/${client.id}/week`)).json();
    expect(week.client.scope.weight).toBe(false);
    expect(week.days.at(-1).weight).toBeNull();
    expect(week.weights).toEqual([]);
    expect(week.days.at(-1).food_entries).toHaveLength(1);
  });

  it('sets targets the app attributes to the coach', async () => {
    const response = await asCoach('PUT', `/coach/clients/${client.id}/targets`, {
      kcal: 1900,
      protein_g: 120,
      carbs_g: 200,
      fat_g: 60,
    });
    expect(response.statusCode).toBe(200);

    const targets = await targetsForDate(client.id, today());
    expect(targets).toMatchObject({ kcal: 1900, protein_g: 120, is_custom: true, source: 'coach' });
    // And the client's own day reads them.
    expect((await asClient('GET', '/day')).json().targets.kcal).toBe(1900);

    const bad = await asCoach('PUT', `/coach/clients/${client.id}/targets`, { kcal: 100 });
    expect(bad.statusCode).toBe(400);
  });

  it('writes a comment into the journal as a third voice', async () => {
    const day = addDays(today(), -1);
    const response = await asCoach('POST', `/coach/clients/${client.id}/comments`, {
      local_date: day,
      body: 'Add the second kyufte at dinner.',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ local_date: day, body: 'Add the second kyufte at dinner.', coach_name: 'Maria', read_at: null });

    const history = (await asClient('GET', '/chat/history')).json().messages;
    expect(history.at(-1)).toMatchObject({ role: 'coach', content: 'Add the second kyufte at dinner.' });

    const list = (await asCoach('GET', `/coach/clients/${client.id}/comments`)).json().comments;
    expect(list).toHaveLength(1);

    const empty = await asCoach('POST', `/coach/clients/${client.id}/comments`, { local_date: day, body: '  ' });
    expect(empty.statusCode).toBe(400);
  });

  it('marks a comment read when the client opens the journal', async () => {
    await asCoach('POST', `/coach/clients/${client.id}/comments`, { local_date: addDays(today(), -1), body: 'Read me.' });
    expect((await asCoach('GET', `/coach/clients/${client.id}/comments`)).json().comments[0].read_at).toBeNull();

    await asClient('GET', '/chat/history');
    // The receipt is written after the page is served, not before it.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await asCoach('GET', `/coach/clients/${client.id}/comments`)).json().comments[0].read_at).not.toBeNull();
  });

  it('keeps private notes private', async () => {
    await asCoach('PUT', `/coach/clients/${client.id}/notes`, { body: 'Travels Tue/Wed.' });
    expect((await asCoach('GET', `/coach/clients/${client.id}/notes`)).json().body).toBe('Travels Tue/Wed.');
    // Nothing on the client's side carries them.
    const status = (await asClient('GET', '/me/coach')).json();
    expect(JSON.stringify(status)).not.toContain('Travels');
  });
});

describe('ending the link', () => {
  beforeEach(link);

  it('from the client: the seat goes, the coach loses the view, comments stay', async () => {
    await asCoach('POST', `/coach/clients/${client.id}/comments`, { local_date: addDays(today(), -1), body: 'Nice week.' });

    const response = await asClient('DELETE', '/me/coach');
    expect(response.statusCode).toBe(200);
    expect(response.json().link).toBeNull();

    const user = await queryOne<any>('SELECT plan, plan_source FROM users WHERE id = $1', [client.id]);
    expect(user).toMatchObject({ plan: 'free', plan_source: 'manual' });
    expect((await asCoach('GET', '/coach/roster')).json().clients).toEqual([]);
    expect((await asCoach('GET', `/coach/clients/${client.id}/week`)).statusCode).toBe(404);
    expect((await asClient('GET', '/chat/history')).json().messages.at(-1).role).toBe('coach');

    const row = await queryOne<any>('SELECT status, revoked_by FROM coach_clients WHERE client_user_id = $1', [client.id]);
    expect(row).toMatchObject({ status: 'revoked', revoked_by: 'client' });
  });

  it('from the coach', async () => {
    expect((await asCoach('DELETE', `/coach/clients/${client.id}`)).statusCode).toBe(200);
    expect((await asClient('GET', '/me/coach')).json().link).toBeNull();
    const row = await queryOne<any>('SELECT revoked_by FROM coach_clients WHERE client_user_id = $1', [client.id]);
    expect(row?.revoked_by).toBe('coach');
  });

  it('can be accepted again afterwards, on a fresh scope', async () => {
    await asClient('PATCH', '/me/coach/scope', { metrics: true });
    await asClient('DELETE', '/me/coach');
    const outcome = await acceptInvite(client.id, (await createInvite(coach.id)).code);
    expect(outcome.ok).toBe(true);
    expect((await asClient('GET', '/me/coach')).json().link.scope.metrics).toBe(false);
  });
});

describe('seats and plans', () => {
  beforeEach(link);

  it('drops the seat to free when the trial runs out, and keeps the link', async () => {
    await query('UPDATE coach_accounts SET trial_ends_at = now() - interval \'1 day\' WHERE user_id = $1', [coach.id]);
    expect(await expireTrials()).toBe(1);

    const account = (await asCoach('GET', '/coach/me')).json();
    expect(account).toMatchObject({ plan: 'solo', seat_limit: 1, seats_carry_plus: false });
    const user = await queryOne<any>('SELECT plan, plan_source FROM users WHERE id = $1', [client.id]);
    expect(user).toMatchObject({ plan: 'free', plan_source: 'manual' });
    expect((await asCoach('GET', '/coach/roster')).json().clients[0].client.seat).toBe('free');
  });

  it('re-cuts the seats when the plan moves, earliest links first', async () => {
    const second = await createUser({ email: 'second@example.com', plan: 'free' });
    await acceptInvite(second.id, (await createInvite(coach.id)).code);

    await setCoachPlan(coach.id, 'paid', 1);
    const plans = await query<any>(
      'SELECT id, plan FROM users WHERE id = ANY($1::uuid[]) ORDER BY created_at',
      [[client.id, second.id]],
    );
    expect(plans.map((p) => p.plan)).toEqual(['plus', 'free']);

    await setCoachPlan(coach.id, 'paid', 5);
    const restored = await query<any>('SELECT plan FROM users WHERE id = $1', [second.id]);
    expect(restored[0].plan).toBe('plus');

    await setCoachPlan(coach.id, 'lapsed', 5);
    const lapsed = await query<any>('SELECT plan FROM users WHERE id = ANY($1::uuid[])', [[client.id, second.id]]);
    expect(lapsed.map((p) => p.plan)).toEqual(['free', 'free']);
  });
});
