import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { runTurn } from '../src/ai/run.ts';
import { listMessages } from '../src/services/chat.ts';
import { getUser } from '../src/services/user.ts';
import { saveReview } from '../src/services/reviews.ts';
import { agentCalls, scriptAgent, systemPromptOf } from './helpers/agent-mock.ts';
import { MAX_SESSION_MESSAGES } from '../src/ai/client.ts';
import type { StreamEvent } from '../src/ai/providers/types.ts';
import { addMeal, addWeight, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * One journal turn. The model is scripted; what is under test is everything
 * around it — the prompt it is handed, when messages are persisted, and how a
 * dead session recovers.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
  await addWeight(user, '2026-03-01', 85);
});

async function turn(text = 'two eggs and toast') {
  const profile = await getUser(user.id);
  return runTurn({ userId: user.id, ctx: user.ctx, profile, text });
}

/**
 * Backdates a prior turn so the next one lands on a different logging day. The
 * session is resumed for the life of the account, so this is the ordinary case
 * every morning — not an edge case.
 */
async function seedPriorTurn(daysAgo: number) {
  await queryOne(
    `INSERT INTO chat_messages (user_id, role, content, created_at)
     VALUES ($1, 'user', 'yesterday''s message', now() - ($2 || ' days')::interval)
     RETURNING id`,
    [user.id, String(daysAgo)],
  );
}

async function setSession(id: string | null) {
  await query('UPDATE users SET agent_session_id = $1 WHERE id = $2', [id, user.id]);
}

async function storedSession(): Promise<string | null> {
  const row = await queryOne<{ agent_session_id: string | null }>(
    'SELECT agent_session_id FROM users WHERE id = $1',
    [user.id],
  );
  return row?.agent_session_id ?? null;
}

describe('when the agent session is dropped', () => {
  it('resumes within the same day', async () => {
    scriptAgent({ text: 'a', sessionId: 'sess-1' }, { text: 'b', sessionId: 'sess-1' });

    await turn('first');
    await turn('second');

    expect(agentCalls.at(-1)!.resume).toBe('sess-1');
  });

  it('starts fresh once the day has rolled over', async () => {
    await seedPriorTurn(2);
    await setSession('sess-yesterday');
    scriptAgent({ text: 'Logged.', sessionId: 'sess-today' });

    await turn('Breakfast');

    // Yesterday's transcript is what made the model treat this morning's photo
    // as a correction to last night's entry. Dropping it is the actual fix; the
    // rollover marker only covers the providers that replay history anyway.
    expect(agentCalls.at(-1)!.resume).toBeUndefined();
    expect(await storedSession()).toBe('sess-today');
  });

  it('rotates a session that has run away inside a single day', async () => {
    // The guard against one very long day reaching the context window on its
    // own. Ordinary days are nowhere near this.
    await query(
      `INSERT INTO chat_messages (user_id, role, content)
       SELECT $1, 'user', 'chatter' FROM generate_series(1, $2)`,
      [user.id, MAX_SESSION_MESSAGES],
    );
    await setSession('sess-long');
    scriptAgent({ text: 'Logged.', sessionId: 'sess-rotated' });

    await turn('and another');

    expect(agentCalls.at(-1)!.resume).toBeUndefined();
  });

  it('keeps resuming while the day is merely busy', async () => {
    await query(
      `INSERT INTO chat_messages (user_id, role, content)
       SELECT $1, 'user', 'chatter' FROM generate_series(1, $2)`,
      [user.id, MAX_SESSION_MESSAGES - 10],
    );
    await setSession('sess-busy');
    scriptAgent({ text: 'Logged.' });

    await turn('one more');

    expect(agentCalls.at(-1)!.resume).toBe('sess-busy');
  });
});

describe('the day rollover marker', () => {
  it('marks the boundary when the conversation resumes on a later day', async () => {
    await seedPriorTurn(2);
    scriptAgent({ text: 'Logged.' });

    await turn('Breakfast');

    const prompt = agentCalls.at(-1)!.prompt as string;
    expect(prompt).toContain('New day');
    expect(prompt).toContain('get_day');
    // The user's own words still end the turn, untouched.
    expect(prompt.endsWith('Breakfast')).toBe(true);
  });

  it('stays silent when the previous turn was earlier the same day', async () => {
    scriptAgent({ text: 'Logged.' }, { text: 'Logged.' });

    await turn('first');
    await turn('second');

    const prompt = agentCalls.at(-1)!.prompt as string;
    expect(prompt).not.toContain('New day');
    expect(prompt.endsWith('second')).toBe(true);
  });

  it('stays silent on the very first turn of a new account', async () => {
    scriptAgent({ text: 'Logged.' });
    await turn('two eggs and toast');
    const prompt = agentCalls.at(-1)!.prompt as string;
    expect(prompt).not.toContain('New day');
    expect(prompt.endsWith('two eggs and toast')).toBe(true);
  });

  it('keeps the marker out of the conversation that gets stored', async () => {
    await seedPriorTurn(2);
    scriptAgent({ text: 'Logged.' });

    await turn('Breakfast');

    // It steers this one turn; it is not part of what the user said, and it must
    // not come back as history on the next one.
    const messages = await listMessages(user.id);
    expect(messages.some((m) => m.content === 'Breakfast')).toBe(true);
    expect(messages.some((m) => m.content.includes('New day'))).toBe(false);
  });
});

describe('runTurn', () => {
  it('persists both messages and echoes the day back', async () => {
    scriptAgent({ text: 'Added to breakfast — ~400 kcal.', sessionId: 'sess-1' });

    const response = await turn();

    expect(response.message.content).toBe('Added to breakfast — ~400 kcal.');
    expect(response.day.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const messages = await listMessages(user.id);
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'two eggs and toast'],
      ['assistant', 'Added to breakfast — ~400 kcal.'],
    ]);
  });

  it('records the run metadata on the assistant message', async () => {
    scriptAgent({ text: 'Logged.', sessionId: 'sess-1', numTurns: 4, costUsd: 0.12 });
    const response = await turn();

    const row = await queryOne<{ tool_trace: any }>(
      'SELECT tool_trace FROM chat_messages WHERE id = $1',
      [response.message.id],
    );
    expect(row!.tool_trace).toMatchObject({ session_id: 'sess-1', num_turns: 4, cost_usd: 0.12 });
  });

  it('leaves no dangling user message when the turn fails', async () => {
    scriptAgent({ throws: 'the model exploded' });

    await expect(turn()).rejects.toThrow('the model exploded');
    expect(await listMessages(user.id)).toEqual([]);
  });

  it('substitutes a default when the model says nothing', async () => {
    scriptAgent({ chunksOnly: [] });
    expect((await turn()).message.content).toBe('Logged.');
  });

  it('stores the session id and resumes it next turn', async () => {
    scriptAgent({ text: 'One.', sessionId: 'sess-a' });
    await turn();

    const stored = await queryOne<{ agent_session_id: string }>(
      'SELECT agent_session_id FROM users WHERE id = $1',
      [user.id],
    );
    expect(stored!.agent_session_id).toBe('sess-a');

    scriptAgent({ text: 'Two.', sessionId: 'sess-a' });
    await turn('and a coffee');
    expect(agentCalls.at(-1)!.resume).toBe('sess-a');
  });

  it('starts a new session when the stored one is gone', async () => {
    scriptAgent({ text: 'One.', sessionId: 'sess-a' });
    await turn();

    // First attempt resumes and fails; the retry runs cold and succeeds.
    scriptAgent({ throws: 'session sess-a not found' }, { text: 'Recovered.', sessionId: 'sess-b' });
    const response = await turn('again');

    expect(response.message.content).toBe('Recovered.');
    expect(agentCalls.at(-1)!.resume).toBeUndefined();

    const stored = await queryOne<{ agent_session_id: string }>(
      'SELECT agent_session_id FROM users WHERE id = $1',
      [user.id],
    );
    expect(stored!.agent_session_id).toBe('sess-b');
  });

  /**
   * The retry re-runs the whole turn, so anything already streamed belongs to
   * the run that just died. In practice a resume fails before the model has
   * said a word — which is why the first scripted run below says something,
   * so the case is actually exercised rather than merely allowed for.
   */
  it('tells a watcher to discard the dead run before retrying', async () => {
    scriptAgent({ text: 'One.', sessionId: 'sess-a' });
    await turn();

    scriptAgent(
      { turns: [{ text: 'Half a thought' }], throwsLate: 'session sess-a not found' },
      { text: 'Recovered.', sessionId: 'sess-b' },
    );

    const events: StreamEvent[] = [];
    const profile = await getUser(user.id);
    const response = await runTurn(
      { userId: user.id, ctx: user.ctx, profile, text: 'again' },
      (e) => events.push(e),
    );

    expect(response.message.content).toBe('Recovered.');
    expect(events).toEqual([
      { type: 'text', text: 'Half a thought' },
      { type: 'reset' },
      { type: 'text', text: 'Recovered.' },
    ]);
  });

  it('reflects a tool’s writes in the day and the actions it returns', async () => {
    // The turn owns the tool context, so intercept it on the way in and call the
    // real handler from inside the scripted run — the same order the agent does.
    const tools = await import('../src/ai/tools.ts');
    const spy = vi.spyOn(tools, 'buildNutritionServer');

    scriptAgent({
      text: 'Added to lunch — ~640 kcal.',
      act: async () => {
        const built = spy.mock.results.at(-1)!.value as ReturnType<typeof tools.buildNutritionServer>;
        const logFood = built.tools.find((t) => t.name === 'log_food')!;
        await logFood.handler(
          {
            description: 'Chicken and rice',
            meal: 'lunch',
            when: null,
            items: [
              { name: 'Chicken', quantity_g: 200, quantity_desc: null, kcal: 640, protein_g: 62, carbs_g: 50, fat_g: 8 },
            ],
            note: null,
            confidence: 'medium',
          } as never,
          {},
        );
      },
    });

    const response = await turn();

    expect(response.day.consumed.kcal).toBe(640);
    expect(response.actions).toEqual([
      {
        kind: 'food_logged',
        entry_id: expect.any(String),
        summary: expect.stringContaining('lunch'),
        card: expect.objectContaining({ type: 'food', kcal: 640 }),
      },
    ]);
    // Same array on the message, which is what a reload will read back.
    expect(response.message.actions).toEqual(response.actions);

    // The tools that ran are recorded on the message for later debugging.
    const row = await queryOne<{ tool_trace: any }>(
      'SELECT tool_trace FROM chat_messages WHERE id = $1',
      [response.message.id],
    );
    expect(row!.tool_trace.tools).toEqual(['food_logged']);
    spy.mockRestore();
  });

  /**
   * Today's numbers ride on the user turn, and keeping them off the system
   * prompt is a billing constraint rather than a stylistic one: the system
   * prompt sits in front of the whole transcript, so anything there that
   * changes per-turn re-keys the cache for every message behind it and the
   * conversation is re-written at 2x input instead of read back at 0.1x. That
   * was 87% of the production bill. The `not.toContain` half is the guard.
   */
  it('puts today’s numbers and the entry ids on the user turn, not the system prompt', async () => {
    const { localDateFor } = await import('../src/time.ts');
    const today = localDateFor(new Date(), user.ctx);
    const entry = await addMeal(user, { date: today, kcal: 620, description: 'Chicken and rice' });

    scriptAgent({ text: 'Noted.' });
    await turn('what have I had today?');

    const prompt = agentCalls[0]!.prompt as string;
    expect(prompt).toContain('620 / 2200 kcal');
    expect(prompt).toContain(entry.id);
    expect(prompt).toContain('Chicken and rice');
    // The user's own words still end the turn.
    expect(prompt.endsWith('what have I had today?')).toBe(true);

    const system = systemPromptOf(agentCalls[0]!);
    expect(system).not.toContain('620 / 2200 kcal');
    expect(system).not.toContain(entry.id);
  });

  /**
   * The other half of the same constraint: two turns of one conversation must
   * hand the model a byte-identical system prompt, or the cache cannot hold it.
   */
  it('sends a byte-identical system prompt across turns of the same day', async () => {
    scriptAgent({ text: 'Logged.' }, { text: 'Logged.' });

    await turn('two eggs');
    await addMeal(user, {
      date: (await import('../src/time.ts')).localDateFor(new Date(), user.ctx),
      kcal: 620,
      description: 'Chicken and rice',
    });
    await turn('and a coffee');

    expect(systemPromptOf(agentCalls[1]!)).toBe(systemPromptOf(agentCalls[0]!));
  });

  it('adds the setup brief only while the profile is incomplete', async () => {
    scriptAgent({ text: 'Noted.' });
    await turn();
    expect(systemPromptOf(agentCalls[0]!)).not.toContain('Setup mode');

    const fresh = await createUser({ sex: null, is_setup_complete: false });
    user = fresh;
    scriptAgent({ text: 'Hello.' });
    await turn('hi');
    expect(systemPromptOf(agentCalls.at(-1)!)).toContain('Setup mode');
    expect(systemPromptOf(agentCalls.at(-1)!)).toContain('current weight');
  });

  it('carries a recent weekly review into the journal’s context', async () => {
    const { localDateFor, addDays } = await import('../src/time.ts');
    const today = localDateFor(new Date(), user.ctx);

    await saveReview(
      user.id,
      {
        week_start: addDays(today, -8),
        week_end: addDays(today, -2),
        days_logged: 6,
        mean_kcal: 2100,
        mean_protein_g: 150,
        target_kcal: 2200,
        target_protein_g: 160,
        days_on_target: 4,
        days_protein_hit: 3,
        previous_mean_kcal: null,
        previous_days_logged: 0,
        weight_start_kg: null,
        weight_end_kg: null,
        weight_change_kg: null,
        exercise_sessions: 0,
        exercise_kcal: 0,
        top_foods: [],
        highest_day: null,
        lowest_day: null,
        adaptive: null,
      },
      'You averaged 2,100 against a 2,200 target.',
      null,
    );

    scriptAgent({ text: 'Noted.' });
    await turn('how was last week?');
    expect(systemPromptOf(agentCalls[0]!)).toContain('You averaged 2,100');
  });

  it('locks the agent down: no built-ins, no inherited settings', async () => {
    scriptAgent({ text: 'Noted.' });
    await turn();

    const options = agentCalls[0]!.options;
    expect(options.tools).toEqual([]);
    expect(options.settingSources).toEqual([]);
    expect(options.allowedTools.every((n: string) => n.startsWith('mcp__nutrition__'))).toBe(true);
    expect(options.permissionMode).toBe('bypassPermissions');
  });

  it('attaches a photo to the prompt and to the user message', async () => {
    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(user.id, 'image/png', 'AAAA');

    scriptAgent({ text: 'Looks like ~700 kcal.' });
    const profile = await getUser(user.id);
    const response = await runTurn({
      userId: user.id,
      ctx: user.ctx,
      profile,
      text: 'what is this?',
      photo: { id: photo.id, mediaType: 'image/png', base64: 'AAAA' },
    });

    expect(response.message.role).toBe('assistant');
    // The image rides on the prompt, and the photo is linked to what they said.
    const prompt = agentCalls[0]!.prompt as AsyncIterable<any>;
    expect(typeof (prompt as any)[Symbol.asyncIterator]).toBe('function');

    const messages = await listMessages(user.id);
    expect(messages[0]!.photo_id).toBe(photo.id);
    expect(messages[1]!.photo_id).toBeNull();
  });
});
