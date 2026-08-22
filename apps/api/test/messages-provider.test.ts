import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { MAX_OUTPUT_TOKENS, MODELS } from '../src/ai/client.ts';
import {
  ANTHROPIC_API_AUTH_HELP,
  createAnthropicApiProvider,
} from '../src/ai/providers/messages.ts';
import type { AgentRequest, StreamEvent, ToolDefinition } from '../src/ai/providers/types.ts';

/**
 * Claude over the Messages API.
 *
 * This provider owns everything the Agent SDK used to do for free — the tool
 * loop, the transcript, the cache breakpoint and the price — so all four are
 * ours to get wrong and all four are pinned here. `fetch` is stubbed rather
 * than the SDK, because the request that goes on the wire is the thing under
 * test: where `cache_control` lands and how tool results are grouped are both
 * invisible in the return value and expensive to get wrong.
 */

const ORIGINAL_ENV = { ...process.env };

/**
 * A key per case, because the provider caches one client per key — it is called
 * once per turn and a fresh connection pool per turn would defeat the point of
 * the file. The SDK binds `fetch` when the client is built, so a new key is
 * what gets each case a client bound to its own stub.
 */
let keyCounter = 0;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = `sk-ant-test-${++keyCounter}`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

const logFood: ToolDefinition = {
  name: 'log_food',
  description: 'Log a meal',
  inputSchema: { description: z.string().describe('What they ate') },
  handler: async (args: { description: string }) => ({
    content: [{ type: 'text', text: `logged ${args.description}` }],
  }),
};

function request(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    kind: 'text_log',
    staticSystemPrompt: 'You are a nutrition journal.',
    dynamicSystemPrompt: undefined,
    text: 'two eggs',
    photo: null,
    tools: [logFood],
    toolNames: ['log_food'],
    history: [],
    readOnly: false,
    toolset: 'journal',
    maxTurns: 5,
    ...overrides,
  };
}

interface Reply {
  content?: unknown[];
  stop_reason?: string;
  stop_details?: unknown;
  usage?: Record<string, number>;
  __status?: number;
  __body?: string;
  __headers?: Record<string, string>;
}

const usage = (input: number, output: number, read = 0, write = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
});

const says = (text: string, tokens = usage(1000, 200)): Reply => ({
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  usage: tokens,
});

const calls = (
  wanted: { id: string; name: string; input: unknown }[],
  tokens = usage(1000, 50),
): Reply => ({
  content: wanted.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.input })),
  stop_reason: 'tool_use',
  usage: tokens,
});

/** Queues one HTTP response per expected round trip. */
function stubFetch(...replies: Reply[]) {
  const seen: { url: string; body: any }[] = [];
  const queue = [...replies];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init: RequestInit) => {
      seen.push({ url: String(url), body: JSON.parse(String(init.body)) });
      const reply = queue.shift();
      if (!reply) throw new Error('unexpected extra request');
      if (reply.__status) {
        return new Response(String(reply.__body ?? '{"error":{"message":"nope"}}'), {
          status: reply.__status,
          headers: { 'content-type': 'application/json', ...reply.__headers },
        });
      }
      return new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: MODELS.text_log.model,
          content: reply.content ?? [],
          stop_reason: reply.stop_reason ?? 'end_turn',
          stop_sequence: null,
          stop_details: reply.stop_details ?? null,
          usage: reply.usage ?? usage(0, 0),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  return seen;
}

describe('auth', () => {
  it('explains how to fix a missing key rather than failing at the wire', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(createAnthropicApiProvider().checkAuth()).toBe(ANTHROPIC_API_AUTH_HELP);
  });

  it('says plainly that a subscription does not pay for this', () => {
    expect(ANTHROPIC_API_AUTH_HELP).toMatch(/subscription does not cover it/);
  });

  it('is happy with a key', () => {
    expect(createAnthropicApiProvider().checkAuth()).toBeNull();
  });

  /** The whole reason this provider exists: no session file, so no one host. */
  it('replays the transcript rather than resuming a session', () => {
    expect(createAnthropicApiProvider().needsHistory).toBe(true);
  });
});

describe('a plain turn', () => {
  it('returns the assistant text and the model that ran', async () => {
    stubFetch(says('Logged two eggs — 140 kcal.'));

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.text).toBe('Logged two eggs — 140 kcal.');
    expect(outcome.model).toBe(MODELS.text_log.model);
    expect(outcome.numTurns).toBe(1);
    expect(outcome.error).toBeUndefined();
  });

  it('hands back no session id at all, since there is nothing to resume', async () => {
    stubFetch(says('Logged.'));
    expect((await createAnthropicApiProvider().run(request(), null)).sessionId).toBeNull();
  });

  it('names an output ceiling, which the Messages API requires', async () => {
    const seen = stubFetch(says('Logged.'));
    await createAnthropicApiProvider().run(request(), null);
    expect(seen[0]!.body.max_tokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it('attaches a photo ahead of the text', async () => {
    const seen = stubFetch(says('A plate of pasta.'));
    await createAnthropicApiProvider().run(
      request({ kind: 'photo_log', photo: { mediaType: 'image/jpeg', base64: 'AAAA' } }),
      null,
    );

    const content = seen[0]!.body.messages.at(-1).content;
    expect(content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' },
    });
    expect(content[1]).toMatchObject({ type: 'text', text: 'two eggs' });
  });
});

/**
 * Where the cache breakpoint falls is the single largest line on the bill, and
 * it is invisible in the response — the only evidence is the shape of the
 * request and a non-zero `cache_read_input_tokens` on the turn after.
 */
describe('the cache breakpoint', () => {
  it('caches the stable half and leaves the per-account half after it', async () => {
    const seen = stubFetch(says('Logged.'));
    await createAnthropicApiProvider().run(
      request({ dynamicSystemPrompt: 'They are still being onboarded.' }),
      null,
    );

    const system = seen[0]!.body.system;
    expect(system).toHaveLength(2);
    expect(system[0]).toMatchObject({
      text: 'You are a nutrition journal.',
      cache_control: { type: 'ephemeral' },
    });
    expect(system[1].text).toBe('They are still being onboarded.');
    expect(system[1]).not.toHaveProperty('cache_control');
  });

  /**
   * The five-minute TTL, deliberately — see `pricing.ts`. The one-hour one
   * doubles the write cost to close a gap that stops existing once the prefix,
   * which is shared by every account, is being hit by real traffic.
   */
  it('takes the five-minute TTL rather than the one-hour one', async () => {
    const seen = stubFetch(says('Logged.'));
    await createAnthropicApiProvider().run(request(), null);
    expect(seen[0]!.body.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  /**
   * The review and the fridge scan have no volatile half — their numbers ride
   * in the user turn — and an empty trailing block is the kind of thing the API
   * rejects.
   */
  it('sends one block when there is no volatile half to separate', async () => {
    const seen = stubFetch(says('A steady week.'));
    await createAnthropicApiProvider().run(request({ dynamicSystemPrompt: '' }), null);

    expect(seen[0]!.body.system).toHaveLength(1);
    expect(seen[0]!.body.system[0]).toHaveProperty('cache_control');
  });
});

describe('tool definitions', () => {
  it('sends plain tool names, with no MCP prefix left on them', async () => {
    const seen = stubFetch(says('Logged.'));
    await createAnthropicApiProvider().run(request(), null);

    expect(seen[0]!.body.tools).toHaveLength(1);
    expect(seen[0]!.body.tools[0].name).toBe('log_food');
  });

  it('turns the Zod shape into an input schema', async () => {
    const seen = stubFetch(says('Logged.'));
    await createAnthropicApiProvider().run(request(), null);

    expect(seen[0]!.body.tools[0].input_schema).toMatchObject({
      type: 'object',
      properties: { description: { type: 'string', description: 'What they ate' } },
      required: ['description'],
    });
  });

  /**
   * Tool definitions render *ahead of* the system prompt in the cache key, so
   * an inert extra key here is still a byte in the prefix that has to stay
   * identical to be read back rather than rewritten.
   */
  it('leaves no $schema key in the prefix', async () => {
    const seen = stubFetch(says('Logged.'));
    await createAnthropicApiProvider().run(request(), null);
    expect(seen[0]!.body.tools[0].input_schema).not.toHaveProperty('$schema');
  });

  it('omits the tools key entirely when the turn has none', async () => {
    const seen = stubFetch(says('Hello.'));
    await createAnthropicApiProvider().run(request({ tools: [] }), null);
    expect(seen[0]!.body).not.toHaveProperty('tools');
  });
});

describe('the replayed transcript', () => {
  it('replays prior turns ahead of this one', async () => {
    const seen = stubFetch(says('Sure.'));
    await createAnthropicApiProvider().run(
      request({
        history: [
          { role: 'user', content: 'earlier' },
          { role: 'assistant', content: 'Logged.' },
        ],
      }),
      null,
    );

    const messages = seen[0]!.body.messages;
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'earlier' });
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'Logged.' });
    expect(messages[2]).toMatchObject({ role: 'user' });
  });

  /**
   * The window of recent messages can easily open mid-exchange — or on the
   * weekly review, which is published into the journal as an assistant message
   * with nothing before it. The API requires the conversation to start on a
   * user turn.
   */
  it('drops a leading assistant message rather than sending an illegal opener', async () => {
    const seen = stubFetch(says('Sure.'));
    await createAnthropicApiProvider().run(
      request({
        history: [
          { role: 'assistant', content: 'Here is your week in review.' },
          { role: 'user', content: 'thanks' },
        ],
      }),
      null,
    );

    const messages = seen[0]!.body.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'thanks' });
  });

  it('drops empty messages, which the API refuses', async () => {
    const seen = stubFetch(says('Sure.'));
    await createAnthropicApiProvider().run(
      request({
        history: [
          { role: 'user', content: 'earlier' },
          { role: 'assistant', content: '   ' },
        ],
      }),
      null,
    );

    expect(seen[0]!.body.messages).toHaveLength(2);
  });

  it('sends only this turn when the history is nothing but assistant messages', async () => {
    const seen = stubFetch(says('Sure.'));
    await createAnthropicApiProvider().run(
      request({ history: [{ role: 'assistant', content: 'A steady week.' }] }),
      null,
    );

    expect(seen[0]!.body.messages).toHaveLength(1);
    expect(seen[0]!.body.messages[0].role).toBe('user');
  });
});

describe('the tool loop', () => {
  it('runs a tool, feeds the result back, and finishes', async () => {
    const seen = stubFetch(
      calls([{ id: 'tu_1', name: 'log_food', input: { description: 'two eggs' } }]),
      says('Logged.', usage(1200, 80)),
    );

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.text).toBe('Logged.');
    expect(outcome.numTurns).toBe(2);

    const messages = seen[1]!.body.messages;
    // The assistant's tool-call turn goes back verbatim, or the result below
    // answers a call the conversation no longer contains.
    expect(messages.at(-2)).toMatchObject({ role: 'assistant' });
    expect(messages.at(-2).content[0]).toMatchObject({ type: 'tool_use', id: 'tu_1' });
    expect(messages.at(-1)).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'logged two eggs' }],
    });
  });

  /**
   * The quiet one. Splitting parallel results across several user messages
   * raises no error — it teaches the model to stop calling tools in parallel,
   * which shows up weeks later as a latency regression and nothing else.
   */
  it('returns every parallel result in a single user message', async () => {
    const seen = stubFetch(
      calls([
        { id: 'tu_1', name: 'log_food', input: { description: 'breakfast' } },
        { id: 'tu_2', name: 'log_food', input: { description: 'lunch' } },
      ]),
      says('Both logged.'),
    );

    await createAnthropicApiProvider().run(request(), null);

    const messages = seen[1]!.body.messages;
    expect(messages.filter((m: any) => m.role === 'user')).toHaveLength(2);
    expect(messages.at(-1).content).toHaveLength(2);
    expect(messages.at(-1).content.map((b: any) => b.tool_use_id)).toEqual(['tu_1', 'tu_2']);
  });

  it('hands an unknown tool back as a failed result rather than collapsing the turn', async () => {
    const seen = stubFetch(
      calls([{ id: 'tu_1', name: 'nope', input: {} }]),
      says('Sorry, I cannot do that.'),
    );

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.error).toBeUndefined();
    expect(seen[1]!.body.messages.at(-1).content[0]).toMatchObject({
      is_error: true,
      content: 'Unknown tool: nope',
    });
  });

  it('turns a throwing handler into a result the model can react to', async () => {
    const exploding: ToolDefinition = {
      ...logFood,
      handler: async () => {
        throw new Error('database is on fire');
      },
    };
    const seen = stubFetch(
      calls([{ id: 'tu_1', name: 'log_food', input: {} }]),
      says('Something went wrong logging that.'),
    );

    const outcome = await createAnthropicApiProvider().run(request({ tools: [exploding] }), null);
    expect(outcome.error).toBeUndefined();
    expect(seen[1]!.body.messages.at(-1).content[0]).toMatchObject({ is_error: true });
    expect(seen[1]!.body.messages.at(-1).content[0].content).toMatch(/database is on fire/);
  });

  it('marks a tool that reported failure, so the model does not read it as success', async () => {
    const refusing: ToolDefinition = {
      ...logFood,
      handler: async () => ({ content: [{ type: 'text', text: 'No budget left.' }], isError: true }),
    };
    const seen = stubFetch(calls([{ id: 'tu_1', name: 'log_food', input: {} }]), says('Ah.'));

    await createAnthropicApiProvider().run(request({ tools: [refusing] }), null);
    expect(seen[1]!.body.messages.at(-1).content[0]).toMatchObject({
      is_error: true,
      content: 'No budget left.',
    });
  });

  /** A blank `tool_result` is rejected outright, so silence has to be said. */
  it('never sends an empty tool result', async () => {
    const silent: ToolDefinition = { ...logFood, handler: async () => ({ content: [] }) };
    const seen = stubFetch(calls([{ id: 'tu_1', name: 'log_food', input: {} }]), says('Done.'));

    await createAnthropicApiProvider().run(request({ tools: [silent] }), null);
    expect(seen[1]!.body.messages.at(-1).content[0].content).toBe('(no output)');
  });

  it('stops at maxTurns and says the reply is truncated, not that the turn failed', async () => {
    const call = calls([{ id: 'tu_1', name: 'log_food', input: { description: 'x' } }]);
    stubFetch(call, call);

    const outcome = await createAnthropicApiProvider().run(request({ maxTurns: 2 }), null);
    expect(outcome.error).toMatch(/stopped early \(max turns: 2\)/);
  });
});

describe('model routing', () => {
  it('sends each kind to the model the routing table names', async () => {
    const seen = stubFetch(says('a'), says('b'));

    const provider = createAnthropicApiProvider();
    await provider.run(request({ kind: 'text_log' }), null);
    await provider.run(request({ kind: 'review', dynamicSystemPrompt: '' }), null);

    expect(seen[0]!.body.model).toBe(MODELS.text_log.model);
    expect(seen[1]!.body.model).toBe(MODELS.review.model);
  });

  it('pins effort where the table sets one', async () => {
    const seen = stubFetch(says('A steady week.'));
    await createAnthropicApiProvider().run(request({ kind: 'review' }), null);
    expect(seen[0]!.body.output_config).toEqual({ effort: MODELS.review.effort });
  });

  /**
   * Haiku 4.5 rejects `effort` with a 400, and `text_log` runs on Haiku — so an
   * unset effort has to reach the wire as an absent key, not as `undefined`.
   */
  it('omits output_config entirely for the model that would 400 on it', async () => {
    const seen = stubFetch(says('Logged.'));
    await createAnthropicApiProvider().run(request({ kind: 'text_log' }), null);

    expect(MODELS.text_log.effort).toBeUndefined();
    expect(seen[0]!.body).not.toHaveProperty('output_config');
  });

  /**
   * Nothing sets `thinking`. Opus 5 thinks adaptively by default and Haiku does
   * not think unless asked, which is exactly what the routing table wants of
   * each — and an explicit `disabled` on Opus 5 buys two failure modes for
   * nothing.
   */
  it('leaves thinking to the model default on every kind', async () => {
    const seen = stubFetch(says('a'), says('b'));

    const provider = createAnthropicApiProvider();
    await provider.run(request({ kind: 'text_log' }), null);
    await provider.run(request({ kind: 'photo_log' }), null);

    expect(seen[0]!.body).not.toHaveProperty('thinking');
    expect(seen[1]!.body).not.toHaveProperty('thinking');
  });
});

describe('token accounting', () => {
  it('sums tokens across every round trip in the turn', async () => {
    stubFetch(
      calls([{ id: 'tu_1', name: 'log_food', input: { description: 'x' } }], usage(1000, 50)),
      says('Logged.', usage(1500, 120)),
    );

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.usage).toMatchObject({ inputTokens: 2500, outputTokens: 170 });
  });

  /**
   * Anthropic reports `input_tokens` with the cached portions already taken
   * out, unlike the OpenAI dialect — so these add up rather than needing
   * anything subtracted back.
   */
  it('keeps the three token buckets apart', async () => {
    stubFetch(says('Logged.', usage(400, 120, 5800, 200)));

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.usage).toMatchObject({
      inputTokens: 400,
      outputTokens: 120,
      cacheReadTokens: 5800,
      cacheWriteTokens: 200,
    });
  });

  it('reports a per-model split, so the panel can attribute the turn', async () => {
    stubFetch(says('Logged.'));
    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.usage!.byModel).toHaveProperty(MODELS.text_log.model);
  });

  it('measures how long the turn took', async () => {
    stubFetch(says('Logged.'));
    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
  });
});

/**
 * The SDK priced its own turns and this does not, so the rate card is now
 * load-bearing rather than a fallback — and it has to be told which cache-write
 * TTL was actually taken, or it overstates the largest line by 60%.
 */
describe('pricing', () => {
  it('prices the turn from the rate card, as an estimate rather than a report', async () => {
    stubFetch(says('Logged.', usage(1_000_000, 1_000_000)));

    const outcome = await createAnthropicApiProvider().run(request(), null);
    // Haiku 4.5 at $1 in / $5 out.
    expect(outcome.costUsd).toBeCloseTo(6, 6);
    expect(outcome.costSource).toBe('estimated');
  });

  it('charges a cache write at the five-minute rate, not the one-hour one', async () => {
    stubFetch(says('Logged.', usage(0, 0, 0, 1_000_000)));

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.costUsd).toBeCloseTo(1.25, 6);
    expect(outcome.cacheWriteMultiplier).toBe(1.25);
  });

  it('charges a cache read at a tenth of the input rate', async () => {
    stubFetch(says('Logged.', usage(0, 0, 1_000_000, 0)));
    expect((await createAnthropicApiProvider().run(request(), null)).costUsd).toBeCloseTo(0.1, 6);
  });

  /**
   * A turn that spent several round trips and then failed still spent them.
   * Settling only on the success path would report the most expensive kind of
   * failure as free.
   */
  it('still reports the tokens a failed turn already spent', async () => {
    stubFetch(
      calls([{ id: 'tu_1', name: 'log_food', input: { description: 'x' } }], usage(1_000_000, 0)),
      { __status: 400, __body: '{"error":{"message":"bad request"}}' },
    );

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.error).toBeTruthy();
    expect(outcome.usage!.inputTokens).toBe(1_000_000);
    expect(outcome.costUsd).toBeCloseTo(1, 6);
  });
});

describe('failures', () => {
  it('surfaces an API error as a turn error rather than throwing', async () => {
    stubFetch({ __status: 400, __body: '{"error":{"message":"invalid api key"}}' });

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.error).toMatch(/invalid api key/);
    expect(outcome.text).toBe('');
  });

  /**
   * A refusal is a 200 with no usable content, so it has to be read off
   * `stop_reason` — nothing throws, and the turn would otherwise be recorded as
   * a success that happened to say nothing.
   */
  it('reports a refusal, which arrives as a perfectly ordinary response', async () => {
    stubFetch({
      content: [],
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: 'no' },
      usage: usage(100, 0),
    });

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.error).toMatch(/declined to answer \(cyber\)/);
  });

  /**
   * Being briefly over the per-minute ceiling is ordinary operation at the
   * volumes this provider exists to serve, not a fault — so it gets a sentence
   * someone can act on rather than the SDK's own string.
   */
  it('turns a 429 into something worth telling a person, with the server’s own delay', async () => {
    const rateLimited = {
      __status: 429,
      __body: '{"error":{"message":"rate_limit_error"}}',
      __headers: { 'retry-after': '30', 'retry-after-ms': '1' },
    };
    stubFetch(rateLimited, rateLimited);

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.error).toBe('Too many requests right now. Try again in 30 seconds.');
  });

  it('falls back to a vaguer sentence when the server names no delay', async () => {
    const rateLimited = { __status: 429, __body: '{"error":{"message":"rate_limit_error"}}' };
    stubFetch(rateLimited, rateLimited);

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.error).toBe('Too many requests right now. Try again in a moment.');
  });

  /**
   * One retry, not the SDK's default two. Someone is watching a spinner, and
   * the second retry's backoff buys a minute of waiting for the same answer.
   */
  it('retries a rate-limited turn exactly once', async () => {
    const rateLimited = {
      __status: 429,
      __body: '{"error":{"message":"rate_limit_error"}}',
      __headers: { 'retry-after-ms': '1' },
    };
    const seen = stubFetch(rateLimited, rateLimited);

    await createAnthropicApiProvider().run(request(), null);
    expect(seen).toHaveLength(2);
  });

  it('says when a reply was cut off at the output ceiling', async () => {
    stubFetch({
      content: [{ type: 'text', text: 'It started well and then' }],
      stop_reason: 'max_tokens',
      usage: usage(100, MAX_OUTPUT_TOKENS),
    });

    const outcome = await createAnthropicApiProvider().run(request(), null);
    expect(outcome.error).toMatch(/cut off/);
  });
});

/**
 * Streaming.
 *
 * The property under test is not "deltas arrive" — it is that a watched turn
 * and an unwatched one are the *same turn*. The tool loop, the token counts and
 * the price all come off a `Message` the SDK reassembles from the wire, so the
 * risk worth pinning is that reassembly silently losing something the
 * non-streaming path had. Hence the assertions on usage and on the tool round
 * trip, not only on the text.
 */

/** One SSE frame, in the shape the Messages API actually puts on the wire. */
function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

interface StreamedReply {
  /** Text blocks, delivered a delta at a time so a partial reply is observable. */
  text?: string[];
  tools?: { id: string; name: string; input: unknown }[];
  stopReason?: string;
  usage?: Record<string, number>;
}

/** Renders one round trip as an event stream and queues it on `fetch`. */
function stubStream(...replies: StreamedReply[]) {
  const seen: { url: string; body: any }[] = [];
  const queue = [...replies];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init: RequestInit) => {
      seen.push({ url: String(url), body: JSON.parse(String(init.body)) });
      const reply = queue.shift();
      if (!reply) throw new Error('unexpected extra request');

      const counts = reply.usage ?? usage(1000, 200);
      let body = frame('message_start', {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: MODELS.text_log.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: counts,
        },
      });

      let index = 0;
      for (const chunk of reply.text ?? []) {
        body += frame('content_block_start', {
          type: 'content_block_start',
          index,
          content_block: { type: 'text', text: '' },
        });
        // Two deltas per block, so the test can tell "streamed" from "sent at
        // the end in one piece" — which is exactly the regression that would
        // otherwise pass silently.
        const half = Math.ceil(chunk.length / 2);
        for (const part of [chunk.slice(0, half), chunk.slice(half)]) {
          body += frame('content_block_delta', {
            type: 'content_block_delta',
            index,
            delta: { type: 'text_delta', text: part },
          });
        }
        body += frame('content_block_stop', { type: 'content_block_stop', index });
        index += 1;
      }

      for (const call of reply.tools ?? []) {
        body += frame('content_block_start', {
          type: 'content_block_start',
          index,
          content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} },
        });
        body += frame('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) },
        });
        body += frame('content_block_stop', { type: 'content_block_stop', index });
        index += 1;
      }

      body += frame('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: reply.stopReason ?? 'end_turn', stop_sequence: null },
        usage: { output_tokens: counts.output_tokens },
      });
      body += frame('message_stop', { type: 'message_stop' });

      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }),
  );
  return seen;
}

describe('a watched turn', () => {
  it('asks the API to stream, which the plain path does not', async () => {
    const seen = stubStream({ text: ['Logged.'] });
    await createAnthropicApiProvider().runStream!(request(), null, () => {});
    expect(seen[0]!.body.stream).toBe(true);
  });

  it('hands over the reply in pieces rather than in one go', async () => {
    stubStream({ text: ['Logged two eggs — 140 kcal.'] });

    const events: StreamEvent[] = [];
    const outcome = await createAnthropicApiProvider().runStream!(request(), null, (e) =>
      events.push(e),
    );

    const texts = events.filter((e) => e.type === 'text');
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.map((e) => (e as { text: string }).text).join('')).toBe(
      'Logged two eggs — 140 kcal.',
    );
    // And the outcome is unchanged by having been watched.
    expect(outcome.text).toBe('Logged two eggs — 140 kcal.');
  });

  /**
   * The event that tells a client its preamble was a preamble. It has to fire
   * when the block *starts*: the arguments to `log_food` stream in over a
   * second or two, and announcing the tool after they finish is announcing it
   * after the pause it was meant to explain.
   */
  it('says which tool it is running, before the arguments have arrived', async () => {
    stubStream(
      { text: ['Let me log that.'], tools: [{ id: 't1', name: 'log_food', input: { description: 'two eggs' } }], stopReason: 'tool_use' },
      { text: ['Logged.'] },
    );

    const events: StreamEvent[] = [];
    await createAnthropicApiProvider().runStream!(request(), null, (e) => events.push(e));

    expect(events).toContainEqual({ type: 'tool', name: 'log_food' });
    // Preamble, then the tool, then the answer — the order a client folds into
    // a single bubble by clearing on the middle one.
    const kinds = events.map((e) => e.type);
    expect(kinds.indexOf('tool')).toBeGreaterThan(kinds.indexOf('text'));
    expect(kinds.lastIndexOf('text')).toBeGreaterThan(kinds.indexOf('tool'));
  });

  it('runs the tool and comes back with the same answer the plain path gives', async () => {
    stubStream(
      { text: [], tools: [{ id: 't1', name: 'log_food', input: { description: 'two eggs' } }], stopReason: 'tool_use' },
      { text: ['Logged two eggs.'] },
    );

    const outcome = await createAnthropicApiProvider().runStream!(request(), null, () => {});
    expect(outcome.text).toBe('Logged two eggs.');
    expect(outcome.numTurns).toBe(2);
    expect(outcome.error).toBeUndefined();
  });

  /**
   * The quiet failure worth guarding: a turn that streams perfectly and is
   * recorded as free, because the counts only ever appear in frames nobody
   * accumulated.
   */
  it('still counts every token, including the cache', async () => {
    stubStream({ text: ['Logged.'], usage: usage(120, 40, 6000, 0) });

    const outcome = await createAnthropicApiProvider().runStream!(request(), null, () => {});
    expect(outcome.usage).toMatchObject({
      inputTokens: 120,
      outputTokens: 40,
      cacheReadTokens: 6000,
      cacheWriteTokens: 0,
    });
    expect(outcome.costUsd).toBeGreaterThan(0);
    expect(outcome.costSource).toBe('estimated');
  });

  it('reports a mid-stream failure as an ordinary failed turn', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"error":{"message":"overloaded_error"}}', {
            status: 529,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    const outcome = await createAnthropicApiProvider().runStream!(request(), null, () => {});
    expect(outcome.error).toBeTruthy();
    expect(outcome.text).toBe('');
  });
});
