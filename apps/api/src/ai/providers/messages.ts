import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  anthropicRate,
  CACHE_WRITE_MULTIPLIER_1H,
  CACHE_WRITE_MULTIPLIER_5M,
  priceUsage,
} from '../pricing.ts';
import { MAX_OUTPUT_TOKENS, MODELS } from '../client.ts';
import { reserve, settle as settleBucket, type Reservation } from '../token-bucket.ts';
import {
  EMPTY_USAGE,
  type AgentMessage,
  type AgentRequest,
  type AiProvider,
  type Outcome,
  type StreamSink,
  type TokenUsage,
  type ToolDefinition,
} from './types.ts';

/**
 * Claude over the Messages API, on a metered key.
 *
 * The same models and the same tool handlers as the `anthropic` provider, with
 * the Agent SDK taken out from between them. That is the whole change, and it
 * exists for one reason: the SDK spawns the `claude` binary once per turn, so a
 * turn holds a process for its whole twenty seconds. At roughly 250 MB a turn
 * the 2 GB API container runs out of memory somewhere around eight concurrent
 * turns — a lunch window at a couple of thousand accounts — and no amount of
 * adding boxes helps while the session store is a file on one of them.
 *
 * What the SDK was actually supplying here was an agent loop and a conversation
 * store, and this repository already had both: `providers/openai.ts` drives the
 * same tools over plain `fetch`, and `loadHistory` in `ai/run.ts` replays the
 * transcript for providers that cannot remember it themselves.
 *
 * The in-process MCP server was never in the way either. `buildNutritionServer`
 * already hands back the raw `ToolDefinition[]` alongside the MCP wrapper, so
 * going direct means dropping the wrapper and the `mcp__ct__*` name prefixes
 * rather than porting a protocol.
 *
 * Two things are given up, both deliberately. Server-side sessions go, which is
 * the point — that column is what pins the deployment to one host. And the
 * SDK's self-reported `total_cost_usd` goes, so a turn is priced from
 * `ANTHROPIC_RATES` instead; `cost_source` already models exactly that
 * distinction, and it costs a maintenance obligation rather than accuracy.
 *
 * The `anthropic` provider stays as it is. Running on a subscription is exactly
 * the right thing in development, and it is still the default.
 */

export const ANTHROPIC_API_AUTH_HELP =
  'No Anthropic API key found. Create one at https://console.anthropic.com/settings/keys ' +
  'and set ANTHROPIC_API_KEY in .env. This provider bills per token — a Claude Code ' +
  'subscription does not cover it, so use AI_PROVIDER=anthropic for that.';

/**
 * One client per key, rather than one per turn.
 *
 * `createProvider` is called on every turn because the tool context is
 * per-turn, and a fresh `Anthropic` each time would mean a fresh connection
 * pool each time — a new TLS handshake on a path whose entire reason for
 * existing is to survive concurrency. Keyed on the key so that changing it
 * still takes effect, which is mostly a courtesy to the test suite.
 */
let cached: { apiKey: string; client: Anthropic } | null = null;

function clientFor(apiKey: string): Anthropic {
  if (cached?.apiKey !== apiKey) {
    cached = {
      apiKey,
      client: new Anthropic({
        apiKey,
        /*
         * One retry, not the default two.
         *
         * Somebody is watching a spinner. The default is tuned for a batch job,
         * where waiting is free and failing costs a rerun; here the exponential
         * backoff can hold an interactive turn for the better part of a minute
         * before it either succeeds or fails anyway. One retry absorbs the blip
         * that a retry actually fixes, and past that an honest "try again in a
         * moment" is a better answer than a longer wait for the same outcome.
         */
        maxRetries: 1,
      }),
    };
  }
  return cached.client;
}

/**
 * The message a failed turn carries.
 *
 * A 429 is the one failure here that is both expected and temporary, and it is
 * worth saying so in words rather than surfacing the SDK's own string: at the
 * volumes this provider exists to serve, being briefly over the per-minute
 * ceiling is ordinary operation, not a fault. `retry-after` is the server's own
 * estimate and is far better than any number invented here.
 */
function describe(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) {
    const after = Number(error.headers?.get('retry-after'));
    return Number.isFinite(after) && after > 0
      ? `Too many requests right now. Try again in ${Math.ceil(after)} seconds.`
      : 'Too many requests right now. Try again in a moment.';
  }
  return error instanceof Error ? error.message : String(error);
}

export function createAnthropicApiProvider(): AiProvider {
  return {
    id: 'anthropic-api',
    label: 'Claude (Messages API)',
    // No server-side conversation store: every turn replays the transcript.
    needsHistory: true,

    checkAuth() {
      return process.env.ANTHROPIC_API_KEY ? null : ANTHROPIC_API_AUTH_HELP;
    },

    run(request: AgentRequest): Promise<Outcome> {
      return execute(request);
    },

    runStream(request: AgentRequest, _state: string | null, emit: StreamSink): Promise<Outcome> {
      return execute(request, emit);
    },
  };
}

/**
 * One turn, with or without somebody watching it.
 *
 * `run` and `runStream` are the same function because they have to be: the tool
 * loop, the cache breakpoint, the token accounting and the price are all things
 * that would rot the moment there were two copies, and the difference between
 * the two entry points is exactly one call — `messages.stream` in place of
 * `messages.create`. Everything downstream reads a finished `Message` either
 * way, so nothing else in here knows which one it got.
 */
async function execute(request: AgentRequest, emit?: StreamSink): Promise<Outcome> {
  const usage: TokenUsage = { ...EMPTY_USAGE };
  const startedAt = Date.now();
  const choice = request.model ?? MODELS[request.kind];

  const outcome: Outcome = {
    text: '',
    model: choice.model,
    sessionId: null,
    numTurns: 0,
    costUsd: 0,
    costSource: 'unknown',
    usage,
    // Whatever `CACHE_TTL` asked the API for, priced at the multiple that TTL
    // actually costs. See `pricing.ts`.
    cacheWriteMultiplier: CACHE_TTL.multiplier,
  };

  /**
   * What this turn reserved out of the model's per-minute budget, or null when
   * no budget is configured. Held here so every exit below settles it.
   */
  let reservation: Reservation | null = null;

  /**
   * A turn is several round trips, and each one bills. Settling up in one
   * place — including on the error paths — is what stops a tool loop that
   * failed halfway through from being recorded as free.
   */
  const settle = async (): Promise<Outcome> => {
    outcome.durationMs = Date.now() - startedAt;
    usage.byModel = { [choice.model]: { ...usage, byModel: undefined } };
    const rate = anthropicRate(choice.model);
    if (rate) {
      outcome.costUsd = priceUsage(usage, rate, CACHE_TTL.multiplier);
      outcome.costSource = 'estimated';
    }
    /*
     * The bucket is balanced against what the turn really put on the meter,
     * which is uncached input plus cache writes — the two figures that count
     * toward the input-tokens-per-minute ceiling. Cache reads are deliberately
     * absent: they are excluded from it outright, and folding them in would
     * govern this lane to about a quarter of the capacity it actually has.
     *
     * Here rather than at the end of the loop so it also covers the turn that
     * threw, which is the one that most needs it: a run that spent nothing
     * gives its whole reservation back instead of holding capacity for a
     * minute.
     */
    await settleBucket(reservation, usage.inputTokens + usage.cacheWriteTokens);
    return outcome;
  };

  const byName = new Map(request.tools.map((t) => [t.name, t]));
  const messages: Anthropic.MessageParam[] = [
    ...replayable(request.history),
    { role: 'user', content: userContent(request) },
  ];

  /*
   * Admission, before anything is sent and outside the catch below.
   *
   * Outside it on purpose: a bucket refusal is not a failed turn and must not
   * be flattened into `outcome.error`, which every caller turns into a 502. It
   * travels as `ModelBusyError` so the routes can answer it the way they answer
   * the turn lease — a 429 carrying the seconds to wait. Nothing has been sent
   * and nothing has been written, so there is nothing to unwind.
   */
  reservation = await reserve(choice.model, request.kind);

  try {
    const client = clientFor(process.env.ANTHROPIC_API_KEY ?? '');

    for (let turn = 0; turn < request.maxTurns; turn++) {
      outcome.numTurns = turn + 1;

      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: choice.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemBlocks(request),
        messages,
        ...(request.tools.length > 0 ? { tools: request.tools.map(toolSpec) } : {}),
        // Spread rather than assigned, for the reason the Agent SDK path
        // spreads it: Haiku 4.5 rejects `effort` with a 400, `text_log`
        // runs on Haiku, and an explicit `undefined` is not the same as an
        // absent key. Nothing sets `thinking` — Opus 5 thinks adaptively by
        // default, and Haiku does not think unless asked, which is what the
        // routing table in `client.ts` wants from each of them.
        ...(choice.effort ? { output_config: { effort: choice.effort } } : {}),
      };

      const response = emit
        ? await watched(client, params, emit)
        : await client.messages.create(params);

      accumulate(usage, response.usage);

      if (response.stop_reason !== 'tool_use') {
        outcome.text = textOf(response.content);
        // A refusal arrives as a 200 with no usable content, so it has to
        // be read off `stop_reason` rather than caught. Reported as an
        // error because that is what it is: the turn produced nothing.
        if (response.stop_reason === 'refusal') {
          const category = response.stop_details?.category ?? 'unspecified';
          outcome.error = `The model declined to answer (${category}).`;
        } else if (response.stop_reason === 'max_tokens') {
          outcome.error = `The reply was cut off at the ${MAX_OUTPUT_TOKENS}-token ceiling.`;
        }
        return settle();
      }

      // The assistant's tool-call turn goes back verbatim — content blocks,
      // not extracted text — or the tool results below answer calls the
      // conversation no longer contains.
      messages.push({ role: 'assistant', content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') results.push(await runTool(byName, block));
      }

      /*
       * Every result in one user message.
       *
       * Claude may emit several `tool_use` blocks in a single assistant
       * message, and splitting the answers across several user messages
       * raises no error — it quietly teaches the model to stop calling
       * tools in parallel, which surfaces only as a latency regression
       * weeks later.
       *
       * The calls above are run one at a time rather than concurrently,
       * which is a separate decision: the handlers write to the log and
       * push cards onto `tc.actions`, so serial execution keeps the cards
       * in the order the model asked for them and keeps two writes to the
       * same day from reading each other's totals half-applied.
       */
      messages.push({ role: 'user', content: results });
    }

    // Out of round trips with tools still in flight. The writes already
    // happened, so this is a truncated reply rather than a failed turn.
    outcome.error = `The agent stopped early (max turns: ${request.maxTurns}).`;
    return settle();
  } catch (error) {
    outcome.error = describe(error);
    return settle();
  }
}

/**
 * The same round trip, narrated.
 *
 * `messages.stream` is the SDK's own accumulator: it reassembles the deltas
 * into the identical `Message` that `messages.create` would have returned, so
 * the loop above is unchanged and nothing downstream — the tool dispatch, the
 * token accounting, the price — learns that this turn was watched. What is
 * gained is only the middle: the text as it is written, instead of after it is.
 *
 * Two kinds of event are forwarded, and the second is the less obvious one.
 *
 * `text` deltas are the point. `tool` fires on `content_block_start` rather
 * than when the block finishes, which is the whole difference between useful
 * and decorative: the arguments to `log_food` stream in over a second or two,
 * and the reader wants to know something is happening at the start of that,
 * not at the end.
 *
 * Nothing is forwarded from a `thinking` block. Reasoning is not the reply,
 * `MODELS` only asks for it on the slow kinds, and showing a reader the model's
 * working and then replacing it with two sentences is worse than the spinner
 * this exists to remove.
 */
async function watched(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  emit: StreamSink,
): Promise<Anthropic.Message> {
  const stream = client.messages.stream(params);

  stream.on('text', (delta) => emit({ type: 'text', text: delta }));
  stream.on('streamEvent', (event) => {
    if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
      emit({ type: 'tool', name: event.content_block.name });
    }
  });

  /*
   * `finalMessage()` is what rejects on a failed stream, and it rejects with
   * the same error classes `create` throws — `RateLimitError` included — so
   * `describe` upstream keeps working unchanged. The listener-based `error`
   * event is deliberately not used: it would need its own path to the caller
   * and would race this one.
   */
  return stream.finalMessage();
}

/**
 * How long a cache entry survives, and what writing it costs.
 *
 * One setting rather than two, because the two are the same decision: the
 * one-hour TTL is bought at 2× the write price instead of 1.25×, and pricing a
 * write at the wrong multiple misreports the largest line on the bill. They are
 * resolved together here so they cannot drift apart.
 *
 * The default is the five-minute TTL, which is not the obvious answer and is
 * worth the paragraph. The longer TTL only pays for itself in the *middle* of
 * the volume curve. Below it — a handful of accounts, turns hours apart — every
 * turn is a cold write under either setting, and the only thing an hour buys is
 * a 60% larger bill for it. Above it, traffic keeps the prefix warm on its own:
 * the tools and the static system prompt are byte-identical for every account,
 * so once somebody logs a meal every few minutes nobody is ever cold and the
 * TTL stops mattering. The window where an hour wins is the band between, where
 * turns cluster inside an hour but not inside five minutes.
 *
 * The break-even is worth carrying in your head, because the band starts earlier
 * than "at scale" suggests: switching wins as soon as the hour cuts the cold
 * share by more than about a quarter, which is any traffic where turns land
 * between five minutes and an hour apart. `SUBSCRIPTIONS.md` works it through
 * and puts it at roughly twenty active users, not thousands.
 *
 * So this is a knob and not a decision: read the cold-write share off
 * `ai_usage` and set it when the numbers say the band has arrived.
 *
 * Read once, at import, so a typo is a boot failure rather than a silent
 * fallback to a setting nobody chose — the same bargain `AI_PROVIDER` makes.
 */
const CACHE_TTL = resolveCacheTtl(process.env.ANTHROPIC_CACHE_TTL);

export function resolveCacheTtl(raw: string | undefined): {
  control: Anthropic.CacheControlEphemeral;
  multiplier: number;
} {
  const value = (raw ?? '').trim() || '5m';
  if (value === '5m') {
    return { control: { type: 'ephemeral' }, multiplier: CACHE_WRITE_MULTIPLIER_5M };
  }
  if (value === '1h') {
    return { control: { type: 'ephemeral', ttl: '1h' }, multiplier: CACHE_WRITE_MULTIPLIER_1H };
  }
  throw new Error(`ANTHROPIC_CACHE_TTL must be "5m" or "1h", got "${value}"`);
}

/**
 * The system prompt as blocks, with the cache breakpoint between the halves.
 *
 * This is the direct equivalent of `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` on the
 * Agent SDK path, and the single largest line on the bill. Everything before
 * the breakpoint is byte-identical for every turn of every account — the tool
 * definitions render ahead of it and are covered by it too — so it is the part
 * a cross-user prefix can hold. The per-account half goes after it, uncached,
 * where changing it costs only itself.
 *
 * The breakpoint is only placed when there is a volatile half to separate: the
 * review and the fridge scan pass an empty dynamic prompt, and an empty
 * trailing block is the kind of thing the API rejects.
 */
function systemBlocks(request: AgentRequest): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: request.staticSystemPrompt,
      // The longest-lived thing in the request, and the reason the TTL is worth
      // a setting at all: this prefix is shared by every account on the
      // deployment. See `CACHE_TTL`.
      cache_control: CACHE_TTL.control,
    },
  ];
  if (request.dynamicSystemPrompt) {
    blocks.push({ type: 'text', text: request.dynamicSystemPrompt });
  }
  return blocks;
}

/** This turn's user message: the photo first, then what they said. */
function userContent(request: AgentRequest): string | Anthropic.ContentBlockParam[] {
  if (!request.photo) return request.text;
  return [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: request.photo.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
        data: request.photo.base64,
      },
    },
    { type: 'text', text: request.text },
  ];
}

/**
 * The stored transcript, trimmed to something the API will accept, and marked
 * so the next turn does not pay for it twice.
 *
 * Two rules for the trimming, both of which the journal can break through no
 * fault of its own. The conversation must open on a user message, and the
 * window of recent messages can easily begin mid-exchange on an assistant reply
 * — or on the weekly review, which is published into the journal as one. And no
 * message may be empty, which a row can be if a turn stored a blank reply.
 *
 * Note that both rules are stable under a stable window: the same messages in,
 * the same messages out. Neither can move the front of the prefix on its own,
 * which is what makes it safe to cache what they produce.
 */
function replayable(history: AgentMessage[]): Anthropic.MessageParam[] {
  const kept = history.filter((m) => m.content.trim().length > 0);
  const start = kept.findIndex((m) => m.role === 'user');
  if (start === -1) return [];

  const replay = kept.slice(start);
  return replay.map((m, i): Anthropic.MessageParam => {
    /*
     * Block form for every message, not only the marked one.
     *
     * `content` may be a bare string, and only a block can carry a breakpoint —
     * so the tempting version converts just the last message and leaves the
     * rest as strings. That version cannot work. The message marked on this
     * turn is an unmarked message on the next one, and if the two forms do not
     * serialise identically the prefix changes underneath the breakpoint every
     * single turn. Rendering all of them the same way costs nothing and removes
     * the question.
     */
    const block: Anthropic.TextBlockParam = { type: 'text', text: m.content };

    /*
     * The second breakpoint, at the end of the replayed transcript.
     *
     * It moves forward two messages a turn, and that is the intended use: the
     * entry written here is a prefix of the next turn's request, so the next
     * turn reads back everything up to this point and writes only what it
     * added. Earlier entries stay readable, so a turn that misses the newest
     * one still lands on an older one rather than falling all the way through.
     *
     * What it caches is everything ahead of it — tools, the system prompt, and
     * the whole conversation — which is why the transcript's own stability is a
     * precondition rather than a detail. `loadHistory` evicts in chunks for
     * exactly this reason; with the sliding window it replaced, the prefix was
     * re-keyed every turn and this marker would have bought nothing but the
     * write. The two changes are one change.
     *
     * Two things still re-key it legitimately, and both are worth knowing when
     * the hit rate is read off `ai_usage` rather than guessed at: a photo turn,
     * because the presence of an image invalidates the message tier, and a
     * language escalation, because caches are per-model.
     */
    if (i === replay.length - 1) block.cache_control = CACHE_TTL.control;

    return { role: m.role, content: [block] };
  });
}

/**
 * The MCP tool definitions carry a Zod raw shape, which is what `input_schema`
 * wants once it is JSON Schema — the same conversion the OpenAI path makes.
 *
 * `$schema` is dropped rather than sent. It is inert to the API, but tool
 * definitions render *ahead of* the system prompt in the cache key, so every
 * byte here is part of the prefix that has to stay identical to be read back
 * rather than rewritten.
 */
function toolSpec(tool: ToolDefinition): Anthropic.Tool {
  const { $schema: _schema, ...schema } = z.toJSONSchema(z.object(tool.inputSchema), {
    io: 'input',
  }) as Record<string, unknown>;

  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema as Anthropic.Tool.InputSchema,
  };
}

/**
 * Runs one tool call and shapes the answer as a `tool_result`.
 *
 * The handlers are shared with the other two providers untouched, so a meal is
 * logged identically whichever one ran the turn. A throwing handler comes back
 * as a failed result rather than as an exception: the model can then apologise
 * or try something else, which is far better than collapsing the whole turn —
 * and every call needs its block regardless, because a `tool_use` left
 * unanswered makes the next request malformed.
 */
async function runTool(
  byName: Map<string, ToolDefinition>,
  block: Anthropic.ToolUseBlock,
): Promise<Anthropic.ToolResultBlockParam> {
  const tool = byName.get(block.name);
  if (!tool) {
    return { type: 'tool_result', tool_use_id: block.id, content: `Unknown tool: ${block.name}`, is_error: true };
  }

  try {
    const result = await tool.handler(block.input, {});
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      // Never empty: a blank `tool_result` is rejected, and a tool that
      // genuinely has nothing to say still has to say so.
      content: flatten(result.content) || '(no output)',
      ...(result.isError ? { is_error: true } : {}),
    };
  } catch (error) {
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content: `Tool failed: ${error instanceof Error ? error.message : String(error)}`,
      is_error: true,
    };
  }
}

function flatten(content: { type: string; text?: string }[]): string {
  return content
    .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
    .join('\n')
    .trim();
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
    .trim();
}

/**
 * Adds one response's token counts onto the running total for the turn.
 *
 * Anthropic reports `input_tokens` with the cached portions already excluded,
 * unlike the OpenAI dialect, so the three buckets add up here rather than
 * needing anything subtracted back out. Keeping them apart is what makes a
 * cache-heavy turn price at a tenth instead of at full input rate.
 */
function accumulate(usage: TokenUsage, reported: Anthropic.Usage | undefined): void {
  if (!reported) return;
  usage.inputTokens += reported.input_tokens ?? 0;
  usage.outputTokens += reported.output_tokens ?? 0;
  usage.cacheReadTokens += reported.cache_read_input_tokens ?? 0;
  usage.cacheWriteTokens += reported.cache_creation_input_tokens ?? 0;
}
