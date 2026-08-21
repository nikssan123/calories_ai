import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryOne } from '../src/db.ts';
import { MAX_SESSION_MESSAGES, MODELS } from '../src/ai/client.ts';
import { runTurn } from '../src/ai/run.ts';
import { getUser } from '../src/services/user.ts';
import { addWeight, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * A whole journal turn on the direct Messages API provider, tools and all.
 *
 * `messages-provider.test.ts` pins the wire format against a synthetic request.
 * This one goes the other way: it drives `runTurn` end to end with the real
 * prompt, the real nutrition tools and the real database, and asserts on what
 * actually left the process. It is the test that would notice the provider
 * being wired up wrongly, as opposed to being written wrongly.
 */

const ORIGINAL_ENV = { ...process.env };
let user: TestUser;

beforeEach(async () => {
  process.env.AI_PROVIDER = 'anthropic-api';
  process.env.ANTHROPIC_API_KEY = `sk-ant-turn-${Date.now()}-${Math.random()}`;

  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
  await addWeight(user, '2026-03-01', 85);
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

const usage = (input = 500, output = 100) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
});

function stubFetch(...replies: { content: unknown[]; stop_reason: string }[]) {
  const seen: { body: any }[] = [];
  const queue = [...replies];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string | URL | Request, init: RequestInit) => {
      seen.push({ body: JSON.parse(String(init.body)) });
      const reply = queue.shift();
      if (!reply) throw new Error('unexpected extra request');
      return new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: MODELS.text_log.model,
          stop_sequence: null,
          stop_details: null,
          usage: usage(),
          ...reply,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  return seen;
}

const says = (text: string) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

async function turn(text = 'two eggs and toast') {
  const profile = await getUser(user.id);
  return runTurn({ userId: user.id, ctx: user.ctx, profile, text });
}

/** Backdates a prior turn so the next one lands on a different logging day. */
async function seedPriorTurn(daysAgo: number, content = "yesterday's message") {
  await queryOne(
    `INSERT INTO chat_messages (user_id, role, content, created_at)
     VALUES ($1, 'user', $3, now() - ($2 || ' days')::interval)
     RETURNING id`,
    [user.id, String(daysAgo), content],
  );
}

describe('a turn on the direct provider', () => {
  it('logs a meal through the real tools and answers', async () => {
    const seen = stubFetch(
      {
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'log_food',
            input: {
              description: 'Two eggs and toast',
              meal: 'breakfast',
              when: null,
              note: null,
              confidence: 'medium',
              items: [
                {
                  name: 'Eggs',
                  quantity_g: 100,
                  quantity_desc: '2',
                  kcal: 140,
                  protein_g: 12,
                  carbs_g: 1,
                  fat_g: 10,
                },
              ],
            },
          },
        ],
        stop_reason: 'tool_use',
      },
      says('Logged — 140 kcal.'),
    );

    const response = await turn();

    expect(response.message.content).toBe('Logged — 140 kcal.');
    expect(response.actions.map((a) => a.kind)).toContain('food_logged');
    // The tool actually wrote, rather than the model being taken at its word.
    expect(response.day.consumed.kcal).toBeGreaterThan(0);

    // And the result went back as a tool_result in its own user message.
    expect(seen[1]!.body.messages.at(-1).content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tu_1',
    });
  });

  it('sends the real system prompt with the breakpoint on the stable half', async () => {
    const seen = stubFetch(says('Logged.'));
    await turn();

    const system = seen[0]!.body.system;
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(system[0].text.length).toBeGreaterThan(500);
  });

  /**
   * The day's numbers ride on the user turn rather than in the system prompt.
   * If they ever migrate back, the prefix is re-keyed every turn and the whole
   * conversation is rewritten at the cache-write rate — which was 87% of the
   * production bill the last time it happened.
   */
  it('keeps the day numbers out of the cached prefix', async () => {
    const seen = stubFetch(says('Logged.'));
    await turn();

    const system = seen[0]!.body.system.map((b: any) => b.text).join('\n');
    expect(system).not.toMatch(/2200/);
    expect(String(seen[0]!.body.messages.at(-1).content)).toMatch(/2200/);
  });

  it('records the turn against the model that ran it', async () => {
    stubFetch(says('Logged.'));
    const response = await turn();

    const row = await queryOne<{ tool_trace: any }>(
      'SELECT tool_trace FROM chat_messages WHERE id = $1',
      [response.message.id],
    );
    expect(row!.tool_trace).toMatchObject({ model: MODELS.text_log.model, kind: 'text_log' });
    // Nothing to resume, so nothing is stored to resume from.
    expect(row!.tool_trace.session_id).toBeNull();
  });

  it('prices the turn from the rate card, since the API reports no cost', async () => {
    stubFetch(says('Logged.'));
    await turn();

    const row = await queryOne<{ cost_source: string; cost_usd: string }>(
      'SELECT cost_source, cost_usd FROM ai_usage WHERE user_id = $1',
      [user.id],
    );
    expect(row!.cost_source).toBe('estimated');
    expect(Number(row!.cost_usd)).toBeGreaterThan(0);
  });
});

/**
 * The transcript is cut at the same boundary a session is dropped at.
 *
 * Without this, everything `shouldStartFreshSession` defends is defended only
 * for the Agent SDK — and this provider, which replays rather than resumes, is
 * the one production is meant to run on.
 */
describe('how far back the transcript reaches', () => {
  it('replays the conversation within a day', async () => {
    await seedPriorTurn(0, 'earlier today');
    const seen = stubFetch(says('Sure.'));
    await turn();

    const contents = seen[0]!.body.messages.map((m: any) => String(m.content));
    expect(contents.some((c: string) => c.includes('earlier today'))).toBe(true);
  });

  it('replays nothing once the day has rolled over', async () => {
    await seedPriorTurn(1, "yesterday's dinner");
    const seen = stubFetch(says('Morning.'));
    await turn();

    const messages = seen[0]!.body.messages;
    expect(messages).toHaveLength(1);
    expect(String(messages[0].content)).not.toMatch(/yesterday's dinner/);
  });

  /** The notice still explains the discontinuity, even with nothing replayed. */
  it('still marks the boundary on the turn itself', async () => {
    await seedPriorTurn(1);
    const seen = stubFetch(says('Morning.'));
    await turn();

    expect(String(seen[0]!.body.messages[0].content)).toMatch(/new day/i);
  });

  it('cuts a single day that has run away, so one conversation cannot fill the window', async () => {
    for (let i = 0; i < MAX_SESSION_MESSAGES; i++) await seedPriorTurn(0, `message ${i}`);

    const seen = stubFetch(says('Still here.'));
    await turn();

    expect(seen[0]!.body.messages).toHaveLength(1);
  });
});
