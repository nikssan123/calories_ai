import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryOne } from '../src/db.ts';
import { runTurn } from '../src/ai/run.ts';
import { listMessages } from '../src/services/chat.ts';
import { getUser } from '../src/services/user.ts';
import { saveReview } from '../src/services/reviews.ts';
import { agentCalls, scriptAgent } from './helpers/agent-mock.ts';
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
      { kind: 'food_logged', entry_id: expect.any(String), summary: expect.stringContaining('lunch') },
    ]);

    // The tools that ran are recorded on the message for later debugging.
    const row = await queryOne<{ tool_trace: any }>(
      'SELECT tool_trace FROM chat_messages WHERE id = $1',
      [response.message.id],
    );
    expect(row!.tool_trace.tools).toEqual(['food_logged']);
    spy.mockRestore();
  });

  it('puts today’s numbers and the entry ids in the system prompt', async () => {
    const { localDateFor } = await import('../src/time.ts');
    const today = localDateFor(new Date(), user.ctx);
    const entry = await addMeal(user, { date: today, kcal: 620, description: 'Chicken and rice' });

    scriptAgent({ text: 'Noted.' });
    await turn('what have I had today?');

    const prompt = agentCalls[0]!.options.systemPrompt as string;
    expect(prompt).toContain('620 / 2200 kcal');
    expect(prompt).toContain(entry.id);
    expect(prompt).toContain('Chicken and rice');
  });

  it('adds the setup brief only while the profile is incomplete', async () => {
    scriptAgent({ text: 'Noted.' });
    await turn();
    expect(agentCalls[0]!.options.systemPrompt).not.toContain('Setup mode');

    const fresh = await createUser({ sex: null, is_setup_complete: false });
    user = fresh;
    scriptAgent({ text: 'Hello.' });
    await turn('hi');
    expect(agentCalls.at(-1)!.options.systemPrompt).toContain('Setup mode');
    expect(agentCalls.at(-1)!.options.systemPrompt).toContain('current weight');
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
    expect(agentCalls[0]!.options.systemPrompt).toContain('You averaged 2,100');
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
