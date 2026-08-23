import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../src/db.ts';
import { generateNudge } from '../src/ai/nudge.ts';
import { isNudgeTime, runDueNudges } from '../src/scheduler.ts';
import { dueNudge, listNudges, NUDGE_HOUR, saveNudge } from '../src/services/nudges.ts';
import { saveReview } from '../src/services/reviews.ts';
import { registerPushToken } from '../src/services/push-tokens.ts';
import { addDays } from '../src/time.ts';
import { agentCalls, scriptAgent, systemPromptOf } from './helpers/agent-mock.ts';
import { mailbox } from './helpers/email.ts';
import {
  addMeal,
  addWeight,
  createUser,
  setUserTargets,
  type TestUser,
} from './helpers/factories.ts';

/**
 * Speaking first.
 *
 * The tests that matter here are the ones about *not* sending. A nudge that
 * fires too easily is not a smaller version of a good feature — it is the
 * reason somebody turns notifications off, and then stops opening the app.
 */

/** 19:30 on Thursday 19 March 2026 in Sofia (UTC+2) — after the nudge hour. */
const EVENING = new Date('2026-03-19T17:30:00Z');
const TODAY = '2026-03-19';

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
});

/** A week of logging ending yesterday, which is the window every trigger reads. */
async function logWeek(spec: Parameters<typeof addMeal>[1] extends never ? never : {
  kcal: number;
  protein_g?: number;
  fiber_g?: number;
  days?: number;
  endingOn?: string;
}) {
  const end = spec.endingOn ?? addDays(TODAY, -1);
  for (let i = 0; i < (spec.days ?? 7); i++) {
    await addMeal(user, {
      date: addDays(end, -i),
      kcal: spec.kcal,
      protein_g: spec.protein_g,
      fiber_g: spec.fiber_g,
    });
  }
}

describe('isNudgeTime', () => {
  it('opens at the local hour and stays open for the evening', () => {
    expect(isNudgeTime(EVENING, 'Europe/Sofia')).toBe(true);
    // 17:30 UTC is 10:30 in Los Angeles — long before their evening.
    expect(isNudgeTime(EVENING, 'America/Los_Angeles')).toBe(false);
  });

  it('opens exactly at the configured local hour', () => {
    const hours = Array.from({ length: 24 }, (_, h) =>
      isNudgeTime(new Date(`2026-03-19T${String(h).padStart(2, '0')}:15:00Z`), 'Europe/Sofia'),
    );
    expect(hours.indexOf(true)).toBe(NUDGE_HOUR - 2); // Sofia is UTC+2 in March
  });
});

describe('what fires', () => {
  it('notices a log that has gone quiet after a habit of logging', async () => {
    // A fortnight of logging, then four silent days.
    for (let i = 0; i < 14; i++) {
      await addMeal(user, { date: addDays(TODAY, -(4 + i)), kcal: 2100 });
    }

    const trigger = await dueNudge(user.id, user.ctx, TODAY);
    expect(trigger?.kind).toBe('dormant');
    expect(trigger?.stats.days_since_logged).toBe(4);
  });

  it('says nothing about a gap left by somebody who never had the habit', async () => {
    // Two entries, then silence. Nothing has lapsed — nothing was established.
    await addMeal(user, { date: addDays(TODAY, -5), kcal: 2100 });
    await addMeal(user, { date: addDays(TODAY, -6), kcal: 2100 });

    expect(await dueNudge(user.id, user.ctx, TODAY)).toBeNull();
  });

  it('lets somebody who has actually left be', async () => {
    for (let i = 0; i < 14; i++) {
      await addMeal(user, { date: addDays(TODAY, -(21 + i)), kcal: 2100 });
    }
    // Three weeks gone is a decision, and a weekly "we miss you" is what makes
    // leaving feel like it was the right one.
    expect(await dueNudge(user.id, user.ctx, TODAY)).toBeNull();
  });

  it('notices a fortnight of flat weight against a goal of losing', async () => {
    for (let i = 0; i < 14; i++) {
      const date = addDays(TODAY, -(1 + i));
      await addMeal(user, { date, kcal: 2100, protein_g: 200, confidence: 'high' });
      await addWeight(user, date, 84 + (i % 2) * 0.1);
    }

    const trigger = await dueNudge(user.id, user.ctx, TODAY);
    expect(trigger?.kind).toBe('stalled');
    expect(Math.abs(trigger!.stats.weight_change_kg_per_week!)).toBeLessThan(0.15);
  });

  it('leaves a scale that is moving alone', async () => {
    for (let i = 0; i < 14; i++) {
      const date = addDays(TODAY, -(1 + i));
      // Protein clear of target, so a scale that is moving leaves nothing at all.
      await addMeal(user, { date, kcal: 2100, protein_g: 200, confidence: 'high' });
      await addWeight(user, date, 84 - (13 - i) * 0.07);
    }
    expect(await dueNudge(user.id, user.ctx, TODAY)).toBeNull();
  });

  it('notices protein under target every day of a fully logged week', async () => {
    await logWeek({ kcal: 2100, protein_g: 90 });

    const trigger = await dueNudge(user.id, user.ctx, TODAY);
    expect(trigger?.kind).toBe('protein_short');
    expect(trigger?.stats.mean_protein_g).toBe(90);
  });

  it('says nothing when one day of the week cleared the target', async () => {
    await logWeek({ kcal: 2100, protein_g: 90, days: 6 });
    await addMeal(user, { date: addDays(TODAY, -7), kcal: 2100, protein_g: 200 });

    expect(await dueNudge(user.id, user.ctx, TODAY)).toBeNull();
  });

  it('notices a week short on fiber, when the week was actually measured', async () => {
    await logWeek({ kcal: 2100, protein_g: 200, fiber_g: 9 });

    const trigger = await dueNudge(user.id, user.ctx, TODAY);
    expect(trigger?.kind).toBe('quality_short');
    expect(trigger?.stats.mean_fiber_g).toBe(9);
    expect(trigger?.stats.target_fiber_g).toBe(31);
  });

  it('will not mention fiber for a week nobody estimated', async () => {
    // Telling someone their fiber is low when the app never read it is telling
    // them off for its own gap.
    await logWeek({ kcal: 2100, protein_g: 200 });
    expect(await dueNudge(user.id, user.ctx, TODAY)).toBeNull();
  });

  it('says nothing at all about an ordinary week', async () => {
    await logWeek({ kcal: 2100, protein_g: 200, fiber_g: 40 });
    expect(await dueNudge(user.id, user.ctx, TODAY)).toBeNull();
  });
});

describe('the rate limits, which are the feature', () => {
  beforeEach(async () => {
    await logWeek({ kcal: 2100, protein_g: 90 });
  });

  it('allows at most one in a rolling week', async () => {
    await saveNudge(user.id, 'protein_short', addDays(TODAY, -3), 'Already said.', null);
    expect(await dueNudge(user.id, user.ctx, TODAY)).toBeNull();
  });

  it('opens up again once the week has passed', async () => {
    await saveNudge(user.id, 'protein_short', addDays(TODAY, -8), 'Last week.', null);
    expect((await dueNudge(user.id, user.ctx, TODAY))?.kind).toBe('protein_short');
  });

  it('stays quiet in the day after the weekly review', async () => {
    // The review says everything a nudge would, in more detail. Two messages
    // about the same week a day apart reads as an app that has lost track.
    await saveReview(
      user.id,
      { week_start: addDays(TODAY, -7), week_end: addDays(TODAY, -1), days_logged: 7 } as never,
      'Your week.',
      null,
    );
    expect(await dueNudge(user.id, user.ctx, TODAY)).toBeNull();
  });

  it('is silent for a plan with no allowance', async () => {
    const { limitsFor } = await import('../src/services/plans.ts');
    const spy = vi.spyOn(await import('../src/services/plans.ts'), 'limitsFor');
    spy.mockReturnValue({ ...limitsFor('free'), nudgesPerWeek: 0 });
    try {
      expect(await dueNudge(user.id, user.ctx, TODAY)).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('runDueNudges', () => {
  beforeEach(async () => {
    await logWeek({ kcal: 2100, protein_g: 90 });
  });

  it('writes one message, and records what it was for', async () => {
    scriptAgent({ text: 'Protein has been running a bit low — an extra egg at breakfast covers most of it.' });

    const result = await runDueNudges(EVENING);
    expect(result.generated).toEqual([user.id]);
    expect(result.failed).toEqual([]);

    const [nudge] = await listNudges(user.id);
    expect(nudge!.kind).toBe('protein_short');
    expect(nudge!.content).toMatch(/extra egg/);

    // And it lands in the journal, which is the channel that always works.
    const messages = await query<{ content: string; role: string }>(
      'SELECT content, role FROM chat_messages WHERE user_id = $1',
      [user.id],
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'assistant' });
    expect(nudge!.message_id).not.toBeNull();
  });

  it('is a no-op on the second pass', async () => {
    scriptAgent({ text: 'The first one.' });
    expect((await runDueNudges(EVENING)).generated).toEqual([user.id]);

    scriptAgent({ text: 'Should never be written.' });
    const second = await runDueNudges(new Date('2026-03-19T18:30:00Z'));
    expect(second.generated).toEqual([]);
    expect(await listNudges(user.id)).toHaveLength(1);
  });

  it('and on the next day too, because once a week is once a week', async () => {
    scriptAgent({ text: 'The first one.' });
    await runDueNudges(EVENING);

    scriptAgent({ text: 'Should never be written.' });
    expect((await runDueNudges(new Date('2026-03-20T17:30:00Z'))).generated).toEqual([]);
    expect(await listNudges(user.id)).toHaveLength(1);
  });

  it('does nothing before the local evening', async () => {
    const result = await runDueNudges(new Date('2026-03-19T09:30:00Z'));
    expect(result).toMatchObject({ considered: 1, generated: [], skipped: 1 });
  });

  it('records what the run cost', async () => {
    scriptAgent({ text: 'A nudge.', costUsd: 0.004 });
    await runDueNudges(EVENING);

    const usage = await query<{ kind: string }>(
      "SELECT kind FROM ai_usage WHERE user_id = $1 AND kind = 'nudge'",
      [user.id],
    );
    expect(usage).toHaveLength(1);
  });

  it('gives the model the numbers and never the decision', async () => {
    scriptAgent({ text: 'A nudge.' });
    await runDueNudges(EVENING);

    const call = agentCalls.at(-1)!;
    const prompt = String(call.prompt);
    // The trigger arrives as a finding, with the figures behind it.
    expect(prompt).toMatch(/under target on every one of the last 7 days/);
    expect(prompt).toContain('90 g');
    // And the system prompt says the send decision was already made.
    expect(systemPromptOf(call)).toMatch(/decided before you were called/i);
    expect(systemPromptOf(call)).toMatch(/No guilt, ever/);
  });

  it('emails it only to somebody who asked for that', async () => {
    scriptAgent({ text: 'A nudge.' });

    await runDueNudges(EVENING);
    expect(mailbox()).toHaveLength(0);

    // Opt in, and the next one arrives.
    await query('UPDATE users SET notify_nudges = TRUE WHERE id = $1', [user.id]);
    await query('DELETE FROM nudges WHERE user_id = $1', [user.id]);
    scriptAgent({ text: 'A second nudge, this time by email.' });
    await runDueNudges(EVENING);

    const sent = mailbox();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toMatch(/second nudge/);
  });

  it('sends it to the phone instead of the inbox, so nobody hears it twice', async () => {
    await query('UPDATE users SET notify_nudges = TRUE WHERE id = $1', [user.id]);
    await registerPushToken(user.id, { token: 'ExponentPushToken[nudge]', platform: 'ios' });

    // The relay accepts it. A nudge is one sentence with nothing behind it to
    // go and read, so a lock screen is the whole message — and repeating it in
    // an email is how "at most one a week" quietly becomes two of the same.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ status: 'ok', id: 'x' }] }),
        text: async () => '',
      })),
    );

    scriptAgent({ text: 'A nudge that goes to the phone.' });
    await runDueNudges(EVENING);

    expect(mailbox()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('still emails somebody whose phone could not be reached', async () => {
    await query('UPDATE users SET notify_nudges = TRUE WHERE id = $1', [user.id]);
    await registerPushToken(user.id, { token: 'ExponentPushToken[dead]', platform: 'android' });

    // The relay is down. The pocket stayed quiet, so the inbox must not.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, text: async () => 'down' })),
    );

    scriptAgent({ text: 'A nudge that falls back to email.' });
    await runDueNudges(EVENING);

    expect(mailbox()).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('keeps the message when the model fails, using its own words', async () => {
    scriptAgent({ text: '' });
    await runDueNudges(EVENING);

    const [nudge] = await listNudges(user.id);
    expect(nudge!.content).toMatch(/Protein has been running under target/);
  });
});

describe('generateNudge', () => {
  it('returns null when nothing is due, without calling the model', async () => {
    await logWeek({ kcal: 2100, protein_g: 200, fiber_g: 40 });
    const before = agentCalls.length;

    expect(await generateNudge(user.id, { today: TODAY })).toBeNull();
    expect(agentCalls).toHaveLength(before);
  });
});
