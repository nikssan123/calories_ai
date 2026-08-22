import { describe, expect, it } from 'vitest';
import { executeAgent } from '../src/ai/agent.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import type { StreamEvent } from '../src/ai/providers/types.ts';

/**
 * The single place SDK messages are turned into a result. Both the journal turn
 * and the weekly review depend on it behaving the same way.
 */

const OPTIONS = {} as any;

describe('executeAgent', () => {
  it('collects the final text and the run metadata', async () => {
    scriptAgent({
      text: 'Added to lunch — ~620 kcal.',
      sessionId: 's1',
      numTurns: 3,
      costUsd: 0.04,
      durationMs: 2400,
    });

    expect(await executeAgent('log it', OPTIONS)).toMatchObject({
      text: 'Added to lunch — ~620 kcal.',
      sessionId: 's1',
      numTurns: 3,
      costUsd: 0.04,
      // The SDK prices its own turns, so nothing downstream re-derives this.
      costSource: 'reported',
      durationMs: 2400,
    });
  });

  it('sums modelUsage across every model a turn touched', async () => {
    scriptAgent({
      modelUsage: {
        'claude-sonnet-5': { inputTokens: 1200, outputTokens: 300, cacheReadInputTokens: 8000 },
        // A compaction pass or subagent shows up as a second model on the same
        // turn; attributing it all to the routed model would understate cost.
        'claude-haiku-4-5': { inputTokens: 400, outputTokens: 50, cacheCreationInputTokens: 900 },
      },
    });

    const { usage } = await executeAgent('log it', OPTIONS);
    expect(usage).toMatchObject({
      inputTokens: 1600,
      outputTokens: 350,
      cacheReadTokens: 8000,
      cacheWriteTokens: 900,
    });
    expect(Object.keys(usage!.byModel!)).toEqual(['claude-sonnet-5', 'claude-haiku-4-5']);
  });

  /**
   * A crash or startup-error result carries zeroed `modelUsage`. Recording a
   * narrower real number beats recording a zero that reads as "this was free".
   */
  it('falls back to the main-loop usage block when modelUsage is empty', async () => {
    scriptAgent({
      modelUsage: {},
      usage: { input_tokens: 700, output_tokens: 90, cache_read_input_tokens: 2000 },
    });

    const { usage } = await executeAgent('log it', OPTIONS);
    expect(usage).toMatchObject({
      inputTokens: 700,
      outputTokens: 90,
      cacheReadTokens: 2000,
      cacheWriteTokens: 0,
    });
  });

  it('reports a run that ended early as an error', async () => {
    scriptAgent({ subtype: 'error_max_turns' });
    const outcome = await executeAgent('log it', OPTIONS);
    expect(outcome.error).toMatch(/stopped early \(error_max_turns\)/);
  });

  it('falls back to the streamed chunks when there is no result message', async () => {
    scriptAgent({ chunksOnly: ['Logged the eggs.', 'And the toast.'] });
    const outcome = await executeAgent('log it', OPTIONS);
    expect(outcome.text).toBe('Logged the eggs.\nAnd the toast.');
    expect(outcome.error).toBeUndefined();
  });

  it('returns empty text rather than inventing one', async () => {
    scriptAgent({ chunksOnly: [] });
    expect((await executeAgent('log it', OPTIONS)).text).toBe('');
  });

  it('surfaces a thrown error', async () => {
    scriptAgent({ throws: 'spawn claude ENOENT' });
    expect((await executeAgent('log it', OPTIONS)).error).toBe('spawn claude ENOENT');
  });

  it('flags a dead resumed session instead of failing the turn', async () => {
    scriptAgent({ throws: 'session 123 not found' });
    const outcome = await executeAgent('log it', OPTIONS, 'session-123');
    expect(outcome.staleSession).toBe(true);
    expect(outcome.error).toBeUndefined();
  });

  it('does not mistake an unrelated failure for a stale session', async () => {
    scriptAgent({ throws: 'network unreachable' });
    const outcome = await executeAgent('log it', OPTIONS, 'session-123');
    expect(outcome.staleSession).toBeUndefined();
    expect(outcome.error).toBe('network unreachable');
  });

  it('treats a session error with no resume as an ordinary failure', async () => {
    scriptAgent({ throws: 'session not found' });
    const outcome = await executeAgent('log it', OPTIONS, null);
    expect(outcome.staleSession).toBeUndefined();
    expect(outcome.error).toBe('session not found');
  });

  it('passes the resume id through to the SDK', async () => {
    scriptAgent({ text: 'ok' });
    const { agentCalls } = await import('./helpers/agent-mock.ts');
    await executeAgent('log it', { model: 'x' } as any, 'session-9');
    expect(agentCalls[0]!.resume).toBe('session-9');
  });

  it('accepts a streaming prompt and drains it', async () => {
    scriptAgent({ text: 'ok' });
    let drained = false;
    async function* prompt() {
      yield { type: 'user', message: { role: 'user', content: [] }, parent_tool_use_id: null } as any;
      drained = true;
    }
    expect((await executeAgent(prompt(), OPTIONS)).text).toBe('ok');
    expect(drained).toBe(true);
  });
});

/**
 * Streaming on the subscription lane.
 *
 * This loop was already iterating the SDK's messages — that was always the easy
 * half — so what needs pinning is not that events come out but that they come
 * out in the shape the *other* lane produces. A client should not be able to
 * tell which provider answered, and the tool name is where that would leak:
 * this lane reaches its tools over MCP and the names arrive prefixed.
 */
describe('executeAgent, watched', () => {
  it('emits the assistant text as the SDK delivers it', async () => {
    scriptAgent({ turns: [{ text: 'Let me log that.' }], text: 'Logged — 140 kcal.' });

    const events: StreamEvent[] = [];
    const outcome = await executeAgent('log it', OPTIONS, null, (e) => events.push(e));

    expect(events).toEqual([
      { type: 'text', text: 'Let me log that.' },
      { type: 'text', text: 'Logged — 140 kcal.' },
    ]);
    // Watching a run changes nothing about what it returns.
    expect(outcome.text).toBe('Logged — 140 kcal.');
  });

  it('reports tool names unprefixed, exactly as the Messages API lane does', async () => {
    scriptAgent({
      turns: [{ text: 'One moment.', toolUse: 'mcp__nutrition__log_food' }],
      text: 'Logged.',
    });

    const events: StreamEvent[] = [];
    await executeAgent('log it', OPTIONS, null, (e) => events.push(e));

    expect(events).toContainEqual({ type: 'tool', name: 'log_food' });
    // The MCP prefix is an artefact of how this lane reaches its tools, and a
    // client that had to know about it would be a client that knows which
    // provider answered.
    expect(JSON.stringify(events)).not.toContain('mcp__');
  });

  it('says nothing at all when nobody is watching', async () => {
    scriptAgent({ turns: [{ text: 'Preamble.' }], text: 'Logged.' });
    // No sink: the unwatched path must not construct events, and this is the
    // only assertion that can catch it having been made mandatory.
    expect((await executeAgent('log it', OPTIONS)).text).toBe('Logged.');
  });
});
