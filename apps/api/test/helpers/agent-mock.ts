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
  /** Anything but 'success' surfaces as "the agent stopped early". */
  subtype?: 'success' | 'error_max_turns' | 'error_during_execution';
  /** Throw instead of streaming, to exercise the failure paths. */
  throws?: string;
  /** Emit assistant text blocks and no result, as a truncated run would. */
  chunksOnly?: string[];
  /** Runs before the result is emitted; receives the options the SDK was given. */
  act?: (options: any) => Promise<void> | void;
}

export interface AgentCall {
  prompt: unknown;
  options: any;
  /** The session the caller asked to resume, if any. */
  resume: string | undefined;
}

const script: ScriptedRun[] = [];
export const agentCalls: AgentCall[] = [];

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
  agentCalls.push({ prompt: args.prompt, options: args.options, resume: args.options?.resume });

  // Drain a streaming-input prompt so the caller's generator finishes, exactly
  // as the real SDK would.
  if (args.prompt && typeof args.prompt[Symbol.asyncIterator] === 'function') {
    for await (const _ of args.prompt) void _;
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
    result: run.text ?? 'Logged.',
  };
}
