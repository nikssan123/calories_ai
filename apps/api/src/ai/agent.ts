import { query, type Options, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * One agent run, collapsed to a result. Both the journal turn and the weekly
 * review go through here so there is a single place where SDK message handling,
 * stale-session detection and the empty-result fallback live.
 */

export interface Outcome {
  text: string;
  sessionId: string | null;
  numTurns: number;
  costUsd: number;
  error?: string;
  /** The resumed session is gone; the caller may retry without one. */
  staleSession?: boolean;
}

export type AgentPrompt = string | AsyncIterable<SDKUserMessage>;

export async function executeAgent(
  prompt: AgentPrompt,
  options: Options,
  resume: string | null = null,
): Promise<Outcome> {
  const outcome: Outcome = { text: '', sessionId: null, numTurns: 0, costUsd: 0 };
  const assistantChunks: string[] = [];

  try {
    for await (const message of query({
      prompt: prompt as never,
      options: resume ? { ...options, resume } : options,
    })) {
      if (message.type === 'assistant') {
        outcome.sessionId = message.session_id;
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text.trim()) assistantChunks.push(block.text);
        }
      } else if (message.type === 'result') {
        outcome.sessionId = message.session_id;
        outcome.numTurns = message.num_turns;
        outcome.costUsd = message.total_cost_usd ?? 0;
        if (message.subtype === 'success') {
          outcome.text = message.result.trim();
        } else {
          outcome.error = `The agent stopped early (${message.subtype}).`;
        }
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (resume && /session|resume|not found/i.test(detail)) {
      return { ...outcome, staleSession: true };
    }
    return { ...outcome, error: detail };
  }

  // A success result carries the final text; fall back to streamed chunks if the
  // run ended without one (e.g. hit maxTurns after doing the logging work).
  if (!outcome.text) outcome.text = assistantChunks.join('\n').trim();
  return outcome;
}
