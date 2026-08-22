import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createOpenAiProvider, OPENAI_AUTH_HELP } from '../src/ai/providers/openai.ts';
import type { AgentRequest, ToolDefinition } from '../src/ai/providers/types.ts';

/**
 * The OpenAI-compatible provider.
 *
 * Unlike the Claude path, this one drives the tool loop itself and gets no
 * price back from the API — so the loop and the token accounting are both ours
 * to get wrong, and both are pinned here. `fetch` is stubbed rather than the
 * `openai` package, because the wire format is the only thing this provider
 * actually depends on.
 */

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  setEnv({
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-test',
    OPENAI_BASE_URL: 'https://example.invalid/v1',
    OPENAI_PRICE_INPUT: undefined,
    OPENAI_PRICE_OUTPUT: undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

const logFood: ToolDefinition = {
  name: 'log_food',
  description: 'Log a meal',
  inputSchema: { description: z.string() },
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

/** Queues one HTTP response per expected round trip. */
function stubFetch(...replies: Array<Record<string, unknown>>) {
  const calls: Array<{ url: string; body: any }> = [];
  const queue = [...replies];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      const reply = queue.shift();
      if (!reply) throw new Error('unexpected extra request');
      if (reply.__status) {
        return new Response(String(reply.__body ?? 'nope'), { status: reply.__status as number });
      }
      return new Response(JSON.stringify(reply), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

const usage = (prompt: number, completion: number, cached = 0) => ({
  prompt_tokens: prompt,
  completion_tokens: completion,
  prompt_tokens_details: { cached_tokens: cached },
});

const text = (content: string, tokens = usage(1000, 200)) => ({
  choices: [{ message: { content, tool_calls: undefined } }],
  usage: tokens,
});

describe('auth', () => {
  it('explains how to fix a missing key rather than failing at the wire', () => {
    setEnv({ OPENAI_API_KEY: undefined });
    expect(createOpenAiProvider().checkAuth()).toBe(OPENAI_AUTH_HELP);
  });

  it('is happy with a key', () => {
    expect(createOpenAiProvider().checkAuth()).toBeNull();
  });
});

describe('a plain turn', () => {
  it('returns the assistant text and the model that ran', async () => {
    stubFetch(text('Logged two eggs — 140 kcal.'));

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.text).toBe('Logged two eggs — 140 kcal.');
    expect(outcome.model).toBe('gpt-test');
    expect(outcome.numTurns).toBe(1);
    expect(outcome.error).toBeUndefined();
  });

  it('sends the system prompt and replays the transcript, since it has no session store', async () => {
    const calls = stubFetch(text('Sure.'));
    await createOpenAiProvider().run(
      request({ history: [{ role: 'user', content: 'earlier' }] }),
      null,
    );

    const messages = calls[0]!.body.messages;
    expect(messages[0]).toMatchObject({ role: 'system', content: 'You are a nutrition journal.' });
    expect(messages[1]).toMatchObject({ role: 'user', content: 'earlier' });
    expect(messages[2]).toMatchObject({ role: 'user', content: 'two eggs' });
  });

  /**
   * This dialect has no cache breakpoint to place, so the two halves are joined
   * into one system message rather than dropped — which is what the seam in
   * `types.ts` means by "providers that cannot just join them".
   */
  it('joins the two halves of the system prompt, having nowhere to cut them', async () => {
    const calls = stubFetch(text('Sure.'));
    await createOpenAiProvider().run(
      request({ dynamicSystemPrompt: 'They are still being onboarded.' }),
      null,
    );

    expect(calls[0]!.body.messages[0].content).toBe(
      'You are a nutrition journal.\n\n---\n\nThey are still being onboarded.',
    );
  });

  it('attaches a photo as a data URI', async () => {
    const calls = stubFetch(text('A plate of pasta.'));
    await createOpenAiProvider().run(
      request({ photo: { mediaType: 'image/jpeg', base64: 'AAAA' } }),
      null,
    );

    const content = calls[0]!.body.messages.at(-1).content;
    expect(content[1].image_url.url).toBe('data:image/jpeg;base64,AAAA');
  });
});

/**
 * No streaming here, deliberately.
 *
 * `runStream` is optional at the seam precisely so this lane needs no work to
 * keep functioning: `/chat/stream` still answers, it just answers all at once —
 * which is what every provider did before streaming existed. Pinned as a
 * contract rather than left implicit, because the failure it prevents is a
 * caller that assumes every provider narrates itself.
 */
describe('streaming', () => {
  it('is not implemented, and the seam falls back to a whole reply', () => {
    expect(createOpenAiProvider().runStream).toBeUndefined();
  });
});

describe('the tool loop', () => {
  it('runs a tool, feeds the result back, and finishes', async () => {
    const calls = stubFetch(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'log_food', arguments: '{"description":"two eggs"}' },
                },
              ],
            },
          },
        ],
        usage: usage(1000, 50),
      },
      text('Logged.', usage(1200, 80)),
    );

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.text).toBe('Logged.');
    expect(outcome.numTurns).toBe(2);

    // The assistant's tool-call turn must precede the results, or the next
    // request is malformed.
    const second = calls[1]!.body.messages;
    expect(second.at(-2)).toMatchObject({ role: 'assistant' });
    expect(second.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_1', content: 'logged two eggs' });
  });

  it('hands an unknown tool back as a result rather than collapsing the turn', async () => {
    const calls = stubFetch(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'c', type: 'function', function: { name: 'nope', arguments: '{}' } },
              ],
            },
          },
        ],
        usage: usage(100, 10),
      },
      text('Sorry, I cannot do that.'),
    );

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.error).toBeUndefined();
    expect(calls[1]!.body.messages.at(-1).content).toMatch(/Unknown tool: nope/);
  });

  it('turns a throwing handler into a tool result the model can react to', async () => {
    const exploding: ToolDefinition = {
      ...logFood,
      handler: async () => {
        throw new Error('database is on fire');
      },
    };
    const calls = stubFetch(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'c', type: 'function', function: { name: 'log_food', arguments: '{}' } },
              ],
            },
          },
        ],
        usage: usage(100, 10),
      },
      text('Something went wrong logging that.'),
    );

    const outcome = await createOpenAiProvider().run(request({ tools: [exploding] }), null);
    expect(outcome.error).toBeUndefined();
    expect(calls[1]!.body.messages.at(-1).content).toMatch(/database is on fire/);
  });

  it('stops at maxTurns and says the reply is truncated, not that the turn failed', async () => {
    const toolCall = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'c', type: 'function', function: { name: 'log_food', arguments: '{"description":"x"}' } },
            ],
          },
        },
      ],
      usage: usage(100, 10),
    };
    stubFetch(toolCall, toolCall);

    const outcome = await createOpenAiProvider().run(request({ maxTurns: 2 }), null);
    expect(outcome.error).toMatch(/stopped early \(max turns: 2\)/);
  });
});

describe('token accounting', () => {
  it('sums tokens across every round trip in the turn', async () => {
    stubFetch(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'c', type: 'function', function: { name: 'log_food', arguments: '{"description":"x"}' } },
              ],
            },
          },
        ],
        usage: usage(1000, 50),
      },
      text('Logged.', usage(1500, 120)),
    );

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.usage).toMatchObject({ inputTokens: 2500, outputTokens: 170 });
  });

  /**
   * This dialect counts cached tokens inside `prompt_tokens`, unlike Anthropic's.
   * Not subtracting them back out would bill a cache hit at the full input rate,
   * which is ten times what it costs.
   */
  it('separates cached prompt tokens out of the input count', async () => {
    stubFetch(text('Logged.', usage(5000, 100, 4000)));

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.usage).toMatchObject({ inputTokens: 1000, cacheReadTokens: 4000 });
  });

  it('copes with a vendor that reports no usage block at all', async () => {
    stubFetch({ choices: [{ message: { content: 'Logged.' } }] });

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.usage).toMatchObject({ inputTokens: 0, outputTokens: 0 });
    expect(outcome.costUsd).toBe(0);
  });

  /** The tokens are real even when nobody configured a price for them. */
  it('records tokens but no price when the rate card is unset', async () => {
    stubFetch(text('Logged.'));

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.usage!.inputTokens).toBe(1000);
    expect(outcome.costUsd).toBe(0);
    expect(outcome.costSource).toBe('unknown');
  });

  it('prices the turn once the rates are configured', async () => {
    setEnv({ OPENAI_PRICE_INPUT: '1', OPENAI_PRICE_OUTPUT: '2' });
    stubFetch(text('Logged.', usage(1_000_000, 1_000_000)));

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.costUsd).toBeCloseTo(3, 6);
    expect(outcome.costSource).toBe('estimated');
    expect(outcome.usage!.byModel).toHaveProperty('gpt-test');
  });

  /**
   * A turn that spent several round trips and then failed still spent them.
   * Settling only on the success path would report the most expensive kind of
   * failure as free.
   */
  it('still reports the tokens a failed turn already spent', async () => {
    setEnv({ OPENAI_PRICE_INPUT: '1', OPENAI_PRICE_OUTPUT: '2' });
    stubFetch(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'c', type: 'function', function: { name: 'log_food', arguments: '{"description":"x"}' } },
              ],
            },
          },
        ],
        usage: usage(1_000_000, 0),
      },
      { __status: 500, __body: 'upstream exploded' },
    );

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.error).toMatch(/OpenAI request failed \(500\)/);
    expect(outcome.usage!.inputTokens).toBe(1_000_000);
    expect(outcome.costUsd).toBeCloseTo(1, 6);
  });

  it('measures how long the turn took', async () => {
    stubFetch(text('Logged.'));
    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
  });
});

/**
 * OpenAI-compatible endpoints are uneven about what they report, and a vendor
 * that omits half the usage block must not produce NaN tokens or a crash.
 */
describe('a partially-compliant vendor', () => {
  it('copes with a usage block missing the completion count', async () => {
    stubFetch({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 500 } });

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.usage).toMatchObject({ inputTokens: 500, outputTokens: 0, cacheReadTokens: 0 });
  });

  it('never reports negative input when cached exceeds the prompt count', async () => {
    stubFetch({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 900 } },
    });

    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.usage!.inputTokens).toBe(0);
  });

  it('treats a null assistant message as empty text', async () => {
    stubFetch({ choices: [{ message: { content: null } }], usage: usage(10, 0) });
    expect((await createOpenAiProvider().run(request(), null)).text).toBe('');
  });

  it('calls a tool that was invoked with no arguments at all', async () => {
    const calls = stubFetch(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: 'c', type: 'function', function: { name: 'log_food', arguments: '' } }],
            },
          },
        ],
        usage: usage(10, 1),
      },
      text('Logged.'),
    );

    await createOpenAiProvider().run(request(), null);
    expect(calls[1]!.body.messages.at(-1).content).toMatch(/logged undefined/);
  });

  it('omits the tools key entirely when the turn has none', async () => {
    const calls = stubFetch(text('Hello.'));
    await createOpenAiProvider().run(request({ tools: [] }), null);
    expect(calls[0]!.body).not.toHaveProperty('tools');
  });
});

describe('failures', () => {
  it('surfaces a non-2xx with its status and a slice of the body', async () => {
    stubFetch({ __status: 401, __body: 'invalid api key' });
    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.error).toMatch(/OpenAI request failed \(401\).*invalid api key/);
  });

  it('reports a response with no choices rather than throwing', async () => {
    stubFetch({ choices: [] });
    const outcome = await createOpenAiProvider().run(request(), null);
    expect(outcome.error).toMatch(/no choices/);
  });
});

describe('model routing', () => {
  it('sends each turn kind to its configured model', async () => {
    setEnv({ OPENAI_MODEL_VISION: 'gpt-vision', OPENAI_MODEL_REVIEW: 'gpt-reasoner' });
    const calls = stubFetch(text('a'), text('b'));

    const provider = createOpenAiProvider();
    await provider.run(request({ kind: 'photo_log' }), null);
    await provider.run(request({ kind: 'review' }), null);

    expect(calls[0]!.body.model).toBe('gpt-vision');
    expect(calls[1]!.body.model).toBe('gpt-reasoner');
  });

  it('falls back to OPENAI_MODEL for a kind with no override', async () => {
    const calls = stubFetch(text('a'));
    await createOpenAiProvider().run(request({ kind: 'setup' }), null);
    expect(calls[0]!.body.model).toBe('gpt-test');
  });

  it('falls back to a default model name when OPENAI_MODEL is unset', async () => {
    setEnv({ OPENAI_MODEL: undefined, OPENAI_MODEL_VISION: undefined, OPENAI_MODEL_REVIEW: undefined });
    const calls = stubFetch(text('a'));
    await createOpenAiProvider().run(request(), null);
    expect(calls[0]!.body.model).toBe('gpt-4o');
  });

  it('defaults the base URL to OpenAI itself', async () => {
    setEnv({ OPENAI_BASE_URL: undefined });
    const calls = stubFetch(text('a'));
    await createOpenAiProvider().run(request(), null);
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('trims a trailing slash off the base URL', async () => {
    setEnv({ OPENAI_BASE_URL: 'https://example.invalid/v1/' });
    const calls = stubFetch(text('a'));
    await createOpenAiProvider().run(request(), null);
    expect(calls[0]!.url).toBe('https://example.invalid/v1/chat/completions');
  });
});
