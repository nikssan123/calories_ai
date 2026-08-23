/**
 * A scriptable stand-in for the Agent SDK's `query`.
 *
 * Each queued run describes one `query()` call: what the assistant said, how it
 * ended, and optionally something to do first — a test that wants "the model
 * logged a meal and then replied" calls the real MCP tool handler from `act`.
 */

export interface ScriptedRun {
  /** The assistant's final text, delivered on the result message. */
  text?: string;
  sessionId?: string;
  numTurns?: number;
  costUsd?: number;
  /** Per-model token counts, as the SDK's `modelUsage` reports them. */
  modelUsage?: Record<string, Partial<ScriptedModelUsage>>;
  /** The narrower main-loop block. Read only when `modelUsage` is empty. */
  usage?: Record<string, number>;
  durationMs?: number;
  /** Anything but 'success' surfaces as "the agent stopped early". */
  subtype?: 'success' | 'error_max_turns' | 'error_during_execution';
  /** Throw instead of streaming, to exercise the failure paths. */
  throws?: string;
  /**
   * Throw *after* the scripted turns have been yielded. The failure that only
   * a streamed route can distinguish: the head is already on the wire, so the
   * error has to arrive as a frame rather than as a status code.
   */
  throwsLate?: string;
  /** Emit assistant text blocks and no result, as a truncated run would. */
  chunksOnly?: string[];
  /**
   * Assistant messages before the final one, as the SDK delivers them: a
   * preamble, a tool call, then the answer. Only the streaming path can see
   * these, which is the point of being able to script them.
   */
  turns?: { text?: string; toolUse?: string }[];
  /** Runs before the result is emitted; receives the options the SDK was given. */
  act?: (options: any) => Promise<void> | void;
}

export interface ScriptedModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}

export interface AgentCall {
  prompt: unknown;
  options: any;
  /** The session the caller asked to resume, if any. */
  resume: string | undefined;
  /**
   * The text of a streamed-input turn, captured as it is drained. A photo turn
   * arrives as a generator, so `prompt` on its own is an exhausted iterator by
   * the time an assertion reaches it.
   */
  turnText: string;
}

const script: ScriptedRun[] = [];
export const agentCalls: AgentCall[] = [];

/**
 * The system prompt as one string.
 *
 * The Anthropic provider passes it as an array so the cache breakpoint can sit
 * between the stable and volatile halves; these assertions are about what the
 * model was told, not about where the blocks were cut.
 */
/** The user turn as one string, whether it was streamed in or passed whole. */
export function userTurnOf(call: AgentCall): string {
  return typeof call.prompt === 'string' ? call.prompt : call.turnText;
}

export function systemPromptOf(call: AgentCall): string {
  const prompt = call.options?.systemPrompt;
  return Array.isArray(prompt) ? prompt.join('\n') : String(prompt ?? '');
}

/** Queues one run per expected `query()` call, in order. */
export function scriptAgent(...runs: ScriptedRun[]): void {
  script.length = 0;
  script.push(...runs);
}

export function resetAgent(): void {
  script.length = 0;
  agentCalls.length = 0;
}

/** Drives one call. Used by the `vi.mock` factory in `setup.ts`. */
export async function* runScripted(args: any): AsyncGenerator<any> {
  const run = script.shift() ?? { text: 'Logged.' };
  const call: AgentCall = {
    prompt: args.prompt,
    options: args.options,
    resume: args.options?.resume,
    turnText: '',
  };
  agentCalls.push(call);

  // Drain a streaming-input prompt so the caller's generator finishes, exactly
  // as the real SDK would — keeping the text on the way past, since draining is
  // the only chance anything has to read it.
  if (args.prompt && typeof args.prompt[Symbol.asyncIterator] === 'function') {
    for await (const message of args.prompt) {
      const content = (message as any)?.message?.content;
      if (!Array.isArray(content)) continue;
      call.turnText += content
        .filter((part: any) => part?.type === 'text')
        .map((part: any) => part.text)
        .join('\n');
    }
  }

  if (run.throws) throw new Error(run.throws);
  await run.act?.(args.options);

  const sessionId = run.sessionId ?? 'session-1';

  for (const chunk of run.chunksOnly ?? []) {
    yield {
      type: 'assistant',
      session_id: sessionId,
      message: { content: [{ type: 'text', text: chunk }] },
    };
  }
  if (run.chunksOnly) return;

  for (const turn of run.turns ?? []) {
    const content: unknown[] = [];
    if (turn.text) content.push({ type: 'text', text: turn.text });
    if (turn.toolUse) {
      content.push({ type: 'tool_use', id: 'toolu_1', name: turn.toolUse, input: {} });
    }
    yield { type: 'assistant', session_id: sessionId, message: { content } };
  }

  if (run.throwsLate) throw new Error(run.throwsLate);

  yield {
    type: 'assistant',
    session_id: sessionId,
    message: { content: [{ type: 'text', text: run.text ?? 'Logged.' }] },
  };
  yield {
    type: 'result',
    subtype: run.subtype ?? 'success',
    session_id: sessionId,
    num_turns: run.numTurns ?? 2,
    total_cost_usd: run.costUsd ?? 0.01,
    duration_ms: run.durationMs ?? 1200,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      ...run.usage,
    },
    // Shaped like the real `modelUsage`: keyed by model, camelCase fields.
    // Defaulted rather than left empty so every turn the suite runs also
    // exercises the usage-recording path.
    modelUsage: Object.fromEntries(
      Object.entries(run.modelUsage ?? { 'claude-sonnet-5': {} }).map(([model, usage]) => [
        model,
        {
          inputTokens: 1000,
          outputTokens: 200,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUSD: 0.01,
          ...usage,
        },
      ]),
    ),
    result: run.text ?? 'Logged.',
  };
}
