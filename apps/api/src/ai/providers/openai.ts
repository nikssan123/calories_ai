import { z } from 'zod';
import { openAiRate, priceUsage } from '../pricing.ts';
import {
  EMPTY_USAGE,
  type AgentRequest,
  type AiProvider,
  type Outcome,
  type TokenUsage,
  type ToolDefinition,
  type TurnKind,
} from './types.ts';

/**
 * OpenAI, and anything speaking its Chat Completions dialect — Groq, Together,
 * OpenRouter, a local Ollama. Deliberately built on `fetch` rather than the
 * `openai` package: the wire format is the only thing we depend on, so pointing
 * OPENAI_BASE_URL at a compatible endpoint is all it takes to switch vendor, and
 * the project gains no new dependency.
 *
 * Unlike the Claude Code path, there is no subscription auth here and no agent
 * loop to borrow. A ChatGPT subscription cannot pay for API calls — this is a
 * metered key — and everything the Agent SDK does for free (calling tools,
 * feeding results back, remembering the conversation) is implemented below.
 */

interface OpenAiConfig {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  /** Per-turn-kind overrides, each falling back to `model`. */
  models: Record<TurnKind, string>;
  /**
   * USD per million tokens, or null when nobody configured it. Null is a real
   * state, not a zero: the tokens still get recorded and the admin panel says
   * the price is unconfigured, because a made-up rate is worse than a blank.
   */
  rate: ReturnType<typeof openAiRate>;
}

export function readOpenAiConfig(source: NodeJS.ProcessEnv = process.env): OpenAiConfig {
  // No default worth trusting for long — model names churn. Whatever your
  // account can see is the right answer, so this is configuration, not policy.
  const base = source.OPENAI_MODEL ?? 'gpt-4o';

  /**
   * Turn kinds are routed separately here for the same reason as on Claude: the
   * text log is most of the volume and sets the unit economics, while vision and
   * the weekly review are rare enough to spend on.
   *
   * This is also where a non-OpenAI vendor lands. DeepSeek, Qwen, GLM and Kimi
   * all serve this dialect, so pointing OPENAI_BASE_URL at one of them and
   * naming its models here is the whole integration — but note that only some of
   * them can see an image, which is why the vision slot is configured apart.
   */
  return {
    apiKey: source.OPENAI_API_KEY,
    baseUrl: (source.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: base,
    models: {
      text_log: source.OPENAI_MODEL_TEXT ?? base,
      photo_log: source.OPENAI_MODEL_VISION ?? base,
      setup: source.OPENAI_MODEL_SETUP ?? base,
      review: source.OPENAI_MODEL_REVIEW ?? base,
      // A fridge photo needs the vision slot, not the base model: on a
      // deployment pointed at a vendor whose default cannot see, this is the
      // difference between a scan and a confidently empty list.
      pantry_scan: source.OPENAI_MODEL_VISION ?? base,
      recipe: source.OPENAI_MODEL_RECIPE ?? source.OPENAI_MODEL_REVIEW ?? base,
      // Two sentences from numbers already computed. No slot of its own, and it
      // does not follow the review's: a nudge is the smallest job here, and a
      // deployment that pointed its review model at something expensive should
      // not find it spending that on a one-line message nobody asked for.
      nudge: source.OPENAI_MODEL_NUDGE ?? base,
      // Follows the recipe slot: it is the same job at seven times the size, so
      // a deployment that chose a model good at writing recipes has already
      // made this decision.
      meal_plan: source.OPENAI_MODEL_PLAN ?? source.OPENAI_MODEL_RECIPE ?? base,
    },
    rate: openAiRate(source),
  };
}

export const OPENAI_AUTH_HELP =
  'No OpenAI credentials found. Create a key at https://platform.openai.com/api-keys ' +
  'and set OPENAI_API_KEY in .env. Note this bills per token — a ChatGPT subscription ' +
  'does not cover API usage.';

/** Chat Completions message shapes, narrowed to what this loop actually sends. */
type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: unknown }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export function createOpenAiProvider(): AiProvider {
  const config = readOpenAiConfig();

  return {
    id: 'openai',
    label: 'OpenAI',
    // No server-side conversation store: every turn replays the transcript.
    needsHistory: true,

    checkAuth() {
      return config.apiKey ? null : OPENAI_AUTH_HELP;
    },

    async run(request: AgentRequest): Promise<Outcome> {
      const usage: TokenUsage = { ...EMPTY_USAGE };
      const startedAt = Date.now();
      const outcome: Outcome = {
        text: '',
        sessionId: null,
        numTurns: 0,
        costUsd: 0,
        costSource: 'unknown',
        usage,
      };

      const messages: ChatMessage[] = [
        { role: 'system', content: `${request.staticSystemPrompt}\n\n---\n\n${request.dynamicSystemPrompt}` },
        ...request.history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
        { role: 'user', content: userContent(request) },
      ];

      const byName = new Map(request.tools.map((t) => [t.name, t]));
      const toolSpecs = request.tools.map(toFunctionSpec);

      // Resolved once: every round trip in this turn runs on the same model.
      const model = config.models[request.kind];
      outcome.model = model;

      /**
       * A turn is several round trips, and each one bills. Settling up only at
       * the end — including on the error paths — is what stops a tool loop that
       * failed halfway from looking free.
       */
      const settle = (): Outcome => {
        outcome.durationMs = Date.now() - startedAt;
        usage.byModel = { [model]: { ...usage, byModel: undefined } };
        if (config.rate) {
          outcome.costUsd = priceUsage(usage, config.rate);
          outcome.costSource = 'estimated';
        }
        return outcome;
      };

      try {
        for (let turn = 0; turn < request.maxTurns; turn++) {
          outcome.numTurns = turn + 1;
          const reply = await callApi(config, model, messages, toolSpecs);
          accumulate(usage, reply.usage);

          const calls = reply.tool_calls ?? [];
          if (calls.length === 0) {
            outcome.text = (reply.content ?? '').trim();
            return settle();
          }

          // Push the assistant's tool-call turn before the results, or the next
          // request is malformed — every tool message must answer a visible call.
          messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: calls });

          for (const call of calls) {
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: await runTool(byName, call),
            });
          }
        }

        // Out of turns with tools still in flight. The writes already happened,
        // so this is a truncated reply rather than a failed one.
        outcome.error = `The agent stopped early (max turns: ${request.maxTurns}).`;
        return settle();
      } catch (error) {
        outcome.error = error instanceof Error ? error.message : String(error);
        return settle();
      }
    },
  };
}

/** This turn's user message: text, plus the photo as a data URI when present. */
function userContent(request: AgentRequest): unknown {
  if (!request.photo) return request.text;
  return [
    { type: 'text', text: request.text },
    {
      type: 'image_url',
      image_url: { url: `data:${request.photo.mediaType};base64,${request.photo.base64}` },
    },
  ];
}

/**
 * The MCP tool definitions carry a Zod raw shape, which is exactly what the
 * function-calling API wants once it is JSON Schema.
 */
function toFunctionSpec(tool: ToolDefinition) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(z.object(tool.inputSchema), { io: 'input' }),
    },
  };
}

/**
 * Tool handlers are shared with the Claude path untouched, so a tool behaves
 * identically whichever provider called it. A throwing handler comes back as a
 * tool result rather than an exception — the model can then apologise or retry,
 * which is far better than collapsing the whole turn.
 */
async function runTool(byName: Map<string, ToolDefinition>, call: ToolCall): Promise<string> {
  const tool = byName.get(call.function.name);
  if (!tool) return `Unknown tool: ${call.function.name}`;

  try {
    const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    const result = await tool.handler(args, {});
    return result.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
      .trim();
  } catch (error) {
    return `Tool failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Adds one response's token counts onto the running total for the turn.
 *
 * `prompt_tokens` includes cached tokens in this dialect, unlike Anthropic's,
 * so the cached portion is subtracted back out — otherwise a cache hit would be
 * charged at the full input rate, which is ten times what it costs.
 */
function accumulate(usage: TokenUsage, reported: ApiUsage | undefined): void {
  if (!reported) return;
  const cached = reported.prompt_tokens_details?.cached_tokens ?? 0;
  usage.inputTokens += Math.max(0, (reported.prompt_tokens ?? 0) - cached);
  usage.cacheReadTokens += cached;
  usage.outputTokens += reported.completion_tokens ?? 0;
}

interface ApiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

async function callApi(
  config: OpenAiConfig,
  model: string,
  messages: ChatMessage[],
  tools: ReturnType<typeof toFunctionSpec>[],
): Promise<{ content: string | null; tool_calls?: ToolCall[]; usage?: ApiUsage }> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 400)}`);
  }

  const body = (await response.json()) as {
    choices?: { message?: { content: string | null; tool_calls?: ToolCall[] } }[];
    usage?: ApiUsage;
  };
  const message = body.choices?.[0]?.message;
  if (!message) throw new Error('OpenAI returned no choices.');
  // Usage is reported per response, not per choice, so it rides along here.
  return { ...message, usage: body.usage };
}
