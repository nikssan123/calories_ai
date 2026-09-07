import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db.ts';
import { isDigestTime, runDueDigests } from '../src/scheduler.ts';
import {
  acceptInvite,
  createInvite,
  ensureCoachAccount,
  listDigests,
  setCoachPlan,
} from '../src/services/coach.ts';
import { addDays, localDateFor } from '../src/time.ts';
import { mailbox } from './helpers/email.ts';
import { addMeal, appFor, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * The coach's Monday. See COACH.md §8.
 *
 * Arithmetic, not inference: no model is scripted anywhere in this file, and
 * the pass has to run on a deployment with no credentials at all. What is
 * pinned is the clock, the once-per-week write, the mail, and the switch.
 */

/** 07:30 on Monday 16 March 2026 in Sofia (UTC+2). */
const MONDAY_MORNING = new Date('2026-03-16T05:30:00Z');
const SOFIA = { timezone: 'Europe/Sofia', dayStartHour: 4 };

let coach: TestUser;
let client: TestUser;
let app: FastifyInstance;
let cookie: string;

beforeEach(async () => {
  coach = await createUser({ email: 'coach@example.com', display_name: 'Maria Petrova' });
  client = await createUser({ email: 'client@example.com', display_name: 'Elena Koleva', plan: 'free' });
  await ensureCoachAccount(coach.id);
  await setCoachPlan(coach.id, 'paid', 10);
  const invite = await createInvite(coach.id);
  const outcome = await acceptInvite(client.id, invite.code);
  if (!outcome.ok) throw new Error(outcome.reason);
  // Linked well before the Monday under test, so nobody reads as "new".
  await query(`UPDATE coach_clients SET accepted_at = '2026-02-01' WHERE client_user_id = $1`, [client.id]);
  ({ app, cookie } = await appFor(coach));
});

afterEach(async () => {
  await app.close();
});

/** A week of low protein ending the Sunday before the Monday under test. */
async function seedWeek(): Promise<void> {
  const monday = localDateFor(MONDAY_MORNING, SOFIA);
  await setUserTargets(client, addDays(monday, -30), { kcal: 1900, protein_g: 120 });
  for (let back = 1; back <= 7; back += 1) {
    await addMeal(client, { date: addDays(monday, -back), kcal: 1850, protein_g: 90 });
  }
}

describe('isDigestTime', () => {
  it('opens at seven on Monday in the coach’s own zone', () => {
    expect(isDigestTime(MONDAY_MORNING, 'Europe/Sofia')).toBe(true);
    expect(isDigestTime(new Date('2026-03-16T04:30:00Z'), 'Europe/Sofia')).toBe(false);
    expect(isDigestTime(MONDAY_MORNING, 'America/Los_Angeles')).toBe(false);
    expect(isDigestTime(new Date('2026-03-17T05:30:00Z'), 'Europe/Sofia')).toBe(false);
  });
});

describe('runDueDigests', () => {
  it('writes the week once and mails it to the coach', async () => {
    await seedWeek();

    const first = await runDueDigests(MONDAY_MORNING);
    expect(first.generated).toEqual([coach.id]);
    expect(first.failed).toEqual([]);

    const digests = await listDigests(coach.id);
    expect(digests).toHaveLength(1);
    expect(digests[0]!.week_start).toBe('2026-03-09');
    expect(digests[0]!.stats.week).toEqual({ start: '2026-03-09', end: '2026-03-15' });
    expect(digests[0]!.stats.clients[0]!.client.display_name).toBe('Elena Koleva');
    expect(digests[0]!.stats.clients[0]!.flags.map((f) => f.kind)).toEqual(['protein_short']);
    expect(digests[0]!.sent_at).not.toBeNull();

    expect(mailbox()).toHaveLength(1);
    expect(mailbox()[0]).toMatchObject({
      to: coach.email,
      subject: 'Monday: 1 client needs you · 1 on the roster',
    });
    expect(mailbox()[0]!.text).toContain('Elena Koleva');
    expect(mailbox()[0]!.text).toContain('Protein short');
    expect(mailbox()[0]!.text).toContain('/coach');

    // An hour later: the row is found, nothing is written, nothing is re-sent.
    const later = await runDueDigests(new Date('2026-03-16T06:30:00Z'));
    expect(later.generated).toEqual([]);
    expect(later.skipped).toBe(1);
    expect(mailbox()).toHaveLength(1);
    expect(await listDigests(coach.id)).toHaveLength(1);
  });

  it('says so when everyone is on track', async () => {
    const monday = localDateFor(MONDAY_MORNING, SOFIA);
    await setUserTargets(client, addDays(monday, -30), { kcal: 1900, protein_g: 120 });
    for (let back = 1; back <= 7; back += 1) {
      await addMeal(client, { date: addDays(monday, -back), kcal: 1900, protein_g: 125 });
    }
    await runDueDigests(MONDAY_MORNING);
    expect(mailbox()[0]!.subject).toBe('Monday: everyone on track · 1 on the roster');
    expect(mailbox()[0]!.text).toContain('Nobody needs chasing');
  });

  it('does nothing on a Tuesday, or for a coach with nobody', async () => {
    await seedWeek();
    expect((await runDueDigests(new Date('2026-03-17T05:30:00Z'))).considered).toBe(0);

    const lonely = await createUser({ email: 'lonely@example.com' });
    await ensureCoachAccount(lonely.id);
    const result = await runDueDigests(MONDAY_MORNING);
    expect(result.considered).toBe(1);
    expect(result.generated).toEqual([coach.id]);
    expect(mailbox().map((m) => m.to)).toEqual([coach.email]);
  });

  it('keeps the row and skips the mail for a coach who turned it off', async () => {
    await seedWeek();
    const patched = await app.inject({
      method: 'PATCH',
      url: '/coach/me',
      headers: { cookie },
      payload: { notify_digest: false },
    });
    expect(patched.json().notify_digest).toBe(false);

    const result = await runDueDigests(MONDAY_MORNING);
    expect(result.generated).toEqual([coach.id]);
    expect(mailbox()).toHaveLength(0);
    expect((await listDigests(coach.id))[0]!.sent_at).toBeNull();
  });
});

describe('the dashboard', () => {
  it('previews this Monday without writing it, and lists the ones sent', async () => {
    await seedWeek();
    const preview = await app.inject({ method: 'GET', url: '/coach/digest/preview', headers: { cookie } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().clients).toHaveLength(1);
    expect(preview.json().seats).toEqual({ used: 1, limit: 10 });
    expect(await listDigests(coach.id)).toEqual([]);

    await runDueDigests(MONDAY_MORNING);
    const list = await app.inject({ method: 'GET', url: '/coach/digests', headers: { cookie } });
    expect(list.json().digests).toHaveLength(1);
    expect(list.json().digests[0].week_start).toBe('2026-03-09');
  });
});
