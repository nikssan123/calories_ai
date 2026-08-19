import {
  query,
  type Options,
  type SDKResultMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { EMPTY_USAGE, type Outcome, type TokenUsage } from './providers/types.ts';

/**
 * One agent run, collapsed to a result. Both the journal turn and the weekly
 * review go through here so there is a single place where SDK message handling,
 * stale-session detection and the empty-result fallback live.
 */

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
        // Claude Code prices the turn itself, against whatever the current
        // rates are — always fresher than a rate card we would have to
        // maintain, so a result message is authoritative by definition.
        outcome.costUsd = message.total_cost_usd;
        outcome.costSource = 'reported';
        outcome.durationMs = message.duration_ms;
        outcome.usage = readUsage(message);
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

/**
 * Token counts off the result message.
 *
 * `modelUsage` is the field to read rather than `usage`: the latter covers only
 * the main loop, while the former includes every model call the turn made —
 * compaction, any subagent — which is the number that actually gets billed. It
 * is keyed by model, so summing it also gives the per-model split the admin
 * panel shows.
 */
function readUsage(message: SDKResultMessage): TokenUsage {
  const byModel: NonNullable<TokenUsage['byModel']> = {};
  const total: TokenUsage = { ...EMPTY_USAGE, byModel };

  for (const [model, entry] of Object.entries(message.modelUsage)) {
    const per = {
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cacheReadTokens: entry.cacheReadInputTokens,
      cacheWriteTokens: entry.cacheCreationInputTokens,
      costUsd: entry.costUSD,
    };
    byModel[model] = per;
    total.inputTokens += per.inputTokens;
    total.outputTokens += per.outputTokens;
    total.cacheReadTokens += per.cacheReadTokens;
    total.cacheWriteTokens += per.cacheWriteTokens;
  }

  // A crash or startup-error result carries zeroed `modelUsage`. The main-loop
  // `usage` block is narrower — it excludes subagents — but recording a real
  // undercount beats recording a zero that reads as "this turn was free".
  if (Object.keys(byModel).length === 0) {
    const usage = message.usage;
    total.inputTokens = usage.input_tokens;
    total.outputTokens = usage.output_tokens;
    total.cacheReadTokens = usage.cache_read_input_tokens ?? 0;
    total.cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  }

  return total;
}
