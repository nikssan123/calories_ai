import { describe, expect, it } from 'vitest';
import { executeAgent } from '../src/ai/agent.ts';
import { scriptAgent } from './helpers/agent-mock.ts';

/**
 * The single place SDK messages are turned into a result. Both the journal turn
 * and the weekly review depend on it behaving the same way.
 */

const OPTIONS = {} as any;

describe('executeAgent', () => {
  it('collects the final text and the run metadata', async () => {
    scriptAgent({ text: 'Added to lunch — ~620 kcal.', sessionId: 's1', numTurns: 3, costUsd: 0.04 });

    expect(await executeAgent('log it', OPTIONS)).toEqual({
      text: 'Added to lunch — ~620 kcal.',
      sessionId: 's1',
      numTurns: 3,
      costUsd: 0.04,
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
