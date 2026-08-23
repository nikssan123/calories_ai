import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { query, queryOne } from '../src/db.ts';
import { MODELS } from '../src/ai/client.ts';
import { createAnthropicApiProvider } from '../src/ai/providers/messages.ts';
import type { AgentRequest, ToolDefinition } from '../src/ai/providers/types.ts';
import {
  HEADROOM,
  limitFor,
  ModelBusyError,
  parseLimits,
  reserve,
  settle,
  TURN_INPUT_TOKENS,
} from '../src/ai/token-bucket.ts';

/**
 * Governing the metered lane in tokens per minute.
 *
 * `CHAT_LIMIT` counts requests, which cannot tell a photo turn from a text turn
 * — an order of magnitude apart in tokens. This is the ceiling that can, and
 * the properties worth pinning are the ones a limiter fails silently on: that
 * it refuses *before* a turn starts rather than halfway through, that a refusal
 * does not itself cost capacity, that the buckets are per model, and that what
 * a turn really spent replaces what it was estimated to spend.
 */

const MODEL = MODELS.text_log.model;
const ORIGINAL_ENV = { ...process.env };

/** One text log's worth of tokens is the unit every case below counts in. */
const TURN = TURN_INPUT_TOKENS.text_log;

/**
 * A ceiling of exactly ten turns once the headroom is taken off, so "the
 * eleventh is refused" is a statement about the limiter rather than about
 * arithmetic.
 */
const TEN_TURNS = (TURN * 10) / HEADROOM;

function govern(value: string | number): void {
  process.env.ANTHROPIC_ITPM = String(value);
}

const balance = async (model = MODEL) =>
  (
    await queryOne<{ tokens: number }>('SELECT tokens FROM model_token_buckets WHERE model = $1', [
      model,
    ])
  )?.tokens ?? null;

/** What the bucket earns back per second at the ceiling these cases govern by. */
const PER_SECOND = (TEN_TURNS * HEADROOM) / 60;

/**
 * The bucket refills in real time, so a balance read a moment after it was
 * written is legitimately a little above where it was left. Every assertion
 * here allows a second of that rather than freezing the clock: the refill is
 * the thing under test in half these cases, and a frozen `now()` would take it
 * away.
 */
async function expectBalance(expected: number, model = MODEL): Promise<void> {
  const actual = await balance(model);
  expect(actual).not.toBeNull();
  expect(actual!).toBeGreaterThanOrEqual(expected - 1);
  expect(actual!).toBeLessThan(expected + PER_SECOND);
}

/** Winds a bucket back in time, which is the only way to observe a refill. */
async function age(seconds: number, model = MODEL): Promise<void> {
  await query(
    `UPDATE model_token_buckets SET refilled_at = now() - ($2 || ' seconds')::interval
      WHERE model = $1`,
    [model, String(seconds)],
  );
}

/**
 * A key per case, because the provider caches one client per key and the SDK
 * binds `fetch` when the client is built — reusing a key hands this case the
 * previous one's stub, and the turn quietly succeeds against a reply written
 * for a different test.
 */
let keyCounter = 0;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = `sk-ant-bucket-${++keyCounter}`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe('reading the ceiling', () => {
  it('is off when nothing is configured, which is what a personal install wants', () => {
    delete process.env.ANTHROPIC_ITPM;
    expect(limitFor(MODEL)).toBeNull();
  });

  it('takes a bare number as the limit for every model', () => {
    govern(2_000_000);
    expect(limitFor(MODEL)).toBe(2_000_000);
    expect(limitFor('claude-opus-5')).toBe(2_000_000);
  });

  it('takes per-model pairs, because the real tiers differ by model', () => {
    govern('claude-haiku-4-5:2000000,claude-opus-5:400000');
    expect(limitFor('claude-haiku-4-5')).toBe(2_000_000);
    expect(limitFor('claude-opus-5')).toBe(400_000);
  });

  it('leaves a model nobody named ungoverned when there is no bare number', () => {
    govern('claude-opus-5:400000');
    expect(limitFor('claude-haiku-4-5')).toBeNull();
  });

  it('lets a bare number stand behind the pairs as the default', () => {
    govern('500000,claude-opus-5:400000');
    expect(limitFor('claude-opus-5')).toBe(400_000);
    expect(limitFor('claude-sonnet-5')).toBe(500_000);
  });

  /**
   * A typo in an optional variable must not be how the journal stops working.
   * The failure it causes is a limiter that does not limit — the same failure
   * as not setting it, which is a supported configuration.
   */
  it('ignores nonsense rather than throwing on the turn path', () => {
    expect(parseLimits('nope,claude-opus-5:banana,,-5, ')).toEqual({
      fallback: null,
      byModel: new Map(),
    });
  });

  it('re-reads when the variable changes rather than caching the first answer', () => {
    govern(1_000_000);
    expect(limitFor(MODEL)).toBe(1_000_000);
    govern(2_000_000);
    expect(limitFor(MODEL)).toBe(2_000_000);
  });
});

describe('admission', () => {
  beforeEach(() => govern(TEN_TURNS));

  it('reserves nothing at all when the bucket is off', async () => {
    delete process.env.ANTHROPIC_ITPM;
    expect(await reserve(MODEL, 'text_log')).toBeNull();
    expect(await balance()).toBeNull();
  });

  it('spends only the headroom, not the whole published ceiling', async () => {
    await reserve(MODEL, 'text_log');
    await expectBalance(TEN_TURNS * HEADROOM - TURN);
  });

  it('admits a full minute of turns and refuses the one after', async () => {
    for (let i = 0; i < 10; i++) {
      expect(await reserve(MODEL, 'text_log')).toEqual({ model: MODEL, tokens: TURN });
    }
    await expect(reserve(MODEL, 'text_log')).rejects.toThrow(ModelBusyError);
  });

  /**
   * A refused turn must leave the bucket exactly as it found it. Debiting on
   * the way past is how a queue of refusals digs the hole deeper and turns a
   * busy minute into a busy hour.
   */
  it('costs nothing when it refuses', async () => {
    for (let i = 0; i < 10; i++) await reserve(MODEL, 'text_log');
    const before = await balance();
    await expect(reserve(MODEL, 'text_log')).rejects.toThrow(ModelBusyError);
    expect(await balance()).toBeCloseTo(before!, 5);
  });

  it('says when to come back, from the bucket rather than from a guess', async () => {
    for (let i = 0; i < 10; i++) await reserve(MODEL, 'text_log');
    const error = await reserve(MODEL, 'text_log').catch((e: unknown) => e);
    // Narrowed rather than cast: a reservation coming back here instead of a
    // refusal is the failure this test exists to catch, and a cast would read it
    // as a pass with two undefined properties.
    expect(error).toBeInstanceOf(ModelBusyError);
    // A tenth of the bucket, refilling at a bucket a minute: six seconds.
    expect((error as ModelBusyError).retryAfterSeconds).toBe(6);
    expect((error as ModelBusyError).message).toMatch(/Try again in 6 seconds/);
  });

  it('refills as time passes rather than on a tick somebody has to run', async () => {
    for (let i = 0; i < 10; i++) await reserve(MODEL, 'text_log');
    await age(30);
    // Half a minute is half a bucket: five more turns, and no more.
    for (let i = 0; i < 5; i++) expect(await reserve(MODEL, 'text_log')).not.toBeNull();
    await expect(reserve(MODEL, 'text_log')).rejects.toThrow(ModelBusyError);
  });

  it('never fills past a minute of capacity, however long it sat idle', async () => {
    await reserve(MODEL, 'text_log');
    await age(3600);
    await settle({ model: MODEL, tokens: 0 }, 0);
    await expectBalance(TEN_TURNS * HEADROOM);
  });

  /**
   * Rate limits are per model, and `MODELS` already routes by turn kind. One
   * shared counter would let the Monday review pass throttle the meal logs
   * against a ceiling they were never near.
   */
  it('keeps a separate bucket per model', async () => {
    for (let i = 0; i < 10; i++) await reserve(MODEL, 'text_log');
    await expect(reserve(MODEL, 'text_log')).rejects.toThrow(ModelBusyError);
    expect(await reserve('claude-opus-5', 'review')).not.toBeNull();
  });

  it('charges a photo turn what a photo turn costs, not what a text turn does', async () => {
    expect(await reserve(MODEL, 'photo_log')).toEqual({
      model: MODEL,
      tokens: TURN_INPUT_TOKENS.photo_log,
    });
  });

  /**
   * A ceiling below the cost of one turn is a misconfiguration, and the best
   * available behaviour is one turn at a time from a full bucket — not every
   * turn refused forever with a wait that would never be long enough.
   */
  it('cannot be wedged by a ceiling smaller than a single turn', async () => {
    govern(TURN / 2);
    expect(await reserve(MODEL, 'text_log')).toEqual({
      model: MODEL,
      tokens: (TURN / 2) * HEADROOM,
    });
  });
});

describe('settling up', () => {
  beforeEach(() => govern(TEN_TURNS));

  it('gives back a reservation the turn never spent', async () => {
    const reservation = await reserve(MODEL, 'text_log');
    await settle(reservation, 0);
    await expectBalance(TEN_TURNS * HEADROOM);
  });

  /**
   * The estimates only have to be roughly right because of this: a turn that
   * read more than it reserved leaves the difference behind as a debt the next
   * minute's refill pays off.
   */
  it('takes the difference when a turn read more than it reserved', async () => {
    const reservation = await reserve(MODEL, 'text_log');
    await settle(reservation, TURN * 3);
    await expectBalance(TEN_TURNS * HEADROOM - TURN * 3);
  });

  it('counts uncached input and cache writes only — never cache reads', async () => {
    govern(TEN_TURNS);
    // 2k of counted input against 40k of cache reads, which do not count at all
    // toward the ceiling this bucket protects.
    stubFetch({ input_tokens: 1_500, output_tokens: 200, cache_read: 40_000, cache_write: 500 });

    await createAnthropicApiProvider().run(journalRequest(), null);
    await expectBalance(TEN_TURNS * HEADROOM - 2_000);
  });

  it('floors the debt at a minute, so one wild turn cannot lock the model out', async () => {
    const reservation = await reserve(MODEL, 'text_log');
    await settle(reservation, TEN_TURNS * 100);
    await expectBalance(-TEN_TURNS * HEADROOM);
  });

  it('does nothing with nothing, so an ungoverned lane stays ungoverned', async () => {
    await settle(null, 5_000);
    expect(await balance()).toBeNull();
  });
});

describe('who waits and who is told no', () => {
  beforeEach(() => govern(TEN_TURNS));

  /**
   * Somebody is watching the screen. A queue moves the wait rather than
   * removing it, which is the same reason the turn lease refuses a
   * double-tapped send instead of holding it.
   */
  it('refuses a watched turn straight away', async () => {
    for (let i = 0; i < 10; i++) await reserve(MODEL, 'text_log');
    const startedAt = Date.now();
    await expect(reserve(MODEL, 'text_log')).rejects.toThrow(ModelBusyError);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  /**
   * Nobody is waiting on a weekly review, and the alternative to a short wait
   * is a review that is simply never written.
   */
  it('waits for capacity on a scheduler turn', async () => {
    // Empty the bucket, then hand back a little under one review's worth.
    for (let i = 0; i < 10; i++) await reserve(MODEL, 'text_log');
    await settle({ model: MODEL, tokens: TURN_INPUT_TOKENS.review * 0.8 }, 0);

    const startedAt = Date.now();
    expect(await reserve(MODEL, 'review')).not.toBeNull();
    expect(Date.now() - startedAt).toBeGreaterThan(500);
  });

  /**
   * Past a minute the bucket is not a queue about to clear — it is a deployment
   * over its ceiling, and holding a scheduler pass open behind its job lock
   * helps nobody. The next tick tries again.
   */
  it('gives up rather than holding a pass open past a full refill', async () => {
    const reservation = await reserve(MODEL, 'review');
    await settle(reservation, TEN_TURNS * 100);
    const startedAt = Date.now();
    await expect(reserve(MODEL, 'review')).rejects.toThrow(ModelBusyError);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});

describe('through the provider', () => {
  it('leaves the bucket alone when no ceiling is configured', async () => {
    delete process.env.ANTHROPIC_ITPM;
    stubFetch({ input_tokens: 1_000, output_tokens: 100 });

    const outcome = await createAnthropicApiProvider().run(journalRequest(), null);
    expect(outcome.error).toBeUndefined();
    expect(await balance()).toBeNull();
  });

  /**
   * A bucket refusal is not a failed turn. Flattened into `outcome.error` it
   * would reach the client as a 502 and be logged as a fault; thrown, the route
   * answers it the way it answers the turn lease.
   */
  it('throws rather than returning a failed outcome, so the route can send a 429', async () => {
    govern(TEN_TURNS);
    for (let i = 0; i < 10; i++) await reserve(MODEL, 'text_log');
    const fetched = stubFetch({ input_tokens: 1_000, output_tokens: 100 });

    await expect(createAnthropicApiProvider().run(journalRequest(), null)).rejects.toThrow(
      ModelBusyError,
    );
    // Refused before anything went on the wire, which is the only refusal that
    // costs nothing: no tool has written to the log yet.
    expect(fetched).toHaveLength(0);
  });

  it('hands the reservation back when the turn fails at the wire', async () => {
    govern(TEN_TURNS);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"nope"}}', { status: 400 })),
    );

    const outcome = await createAnthropicApiProvider().run(journalRequest(), null);
    expect(outcome.error).toBeTruthy();
    await expectBalance(TEN_TURNS * HEADROOM);
  });
});

// ---- Fixtures ---------------------------------------------------------------

const logFood: ToolDefinition = {
  name: 'log_food',
  description: 'Log a meal',
  inputSchema: { description: z.string() },
  handler: async () => ({ content: [{ type: 'text', text: 'logged' }] }),
};

function journalRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    kind: 'text_log',
    staticSystemPrompt: 'You are a nutrition journal.',
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

/** One assistant reply, with the token counts the case cares about. */
function stubFetch(tokens: {
  input_tokens: number;
  output_tokens: number;
  cache_read?: number;
  cache_write?: number;
}) {
  const seen: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init: RequestInit) => {
      seen.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: MODEL,
          content: [{ type: 'text', text: 'Logged.' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: tokens.input_tokens,
            output_tokens: tokens.output_tokens,
            cache_read_input_tokens: tokens.cache_read ?? 0,
            cache_creation_input_tokens: tokens.cache_write ?? 0,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  return seen;
}
