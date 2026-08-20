import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db.ts';
import {
  costByDay,
  costByKind,
  costByUser,
  costTotals,
  economics,
  estimateCost,
  recentUsage,
  recordUsage,
} from '../src/services/usage.ts';
import { MODELS } from '../src/ai/client.ts';
import type { TurnKind } from '../src/ai/providers/types.ts';
import { runTurn } from '../src/ai/run.ts';
import { getUser } from '../src/services/user.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import { addWeight, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * Cost accounting.
 *
 * The tests below are mostly about the ways a cost report can be quietly wrong
 * rather than loudly broken: a failed turn that silently vanishes, a zero that
 * means "free" when it meant "unpriced", a per-user average computed across
 * accounts that logged nothing.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2020-01-01', { kcal: 2200, protein_g: 160 });
  await addWeight(user, '2026-03-01', 85);
});

const OUTCOME = {
  text: 'Logged.',
  sessionId: 's1',
  numTurns: 2,
  costUsd: 0.02,
  costSource: 'reported' as const,
  model: 'claude-sonnet-5',
  durationMs: 1500,
  usage: { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 4000, cacheWriteTokens: 100 },
};

async function rows() {
  return query<any>('SELECT * FROM ai_usage ORDER BY occurred_at ASC');
}

/**
 * Every turn kind must be storable.
 *
 * Table-driven over `MODELS` rather than listing the kinds, because the failure
 * this guards against is adding a kind and forgetting the migration that widens
 * the CHECK constraint. `recordUsage` swallows its own write failures by design
 * — so that a broken cost write can never take down the turn it is measuring —
 * which means the symptom in production is not an error. It is an expensive new
 * feature that costs real money and records nothing at all.
 */
describe('the kinds the table accepts', () => {
  it('stores a row for every turn kind the router knows about', async () => {
    const kinds = Object.keys(MODELS) as TurnKind[];

    for (const kind of kinds) {
      await recordUsage({ userId: user.id, kind, outcome: { ...OUTCOME, model: MODELS[kind].model } });
    }

    const rows = await query<{ kind: string }>(
      'SELECT kind FROM ai_usage WHERE user_id = $1',
      [user.id],
    );
    expect(rows.map((r) => r.kind).sort()).toEqual([...kinds].sort());
  });
});

describe('recordUsage', () => {
  it('writes one row per turn with the tokens split by kind', async () => {
    await recordUsage({ userId: user.id, kind: 'text_log', outcome: OUTCOME });

    const [row] = await rows();
    expect(row).toMatchObject({
      user_id: user.id,
      kind: 'text_log',
      model: 'claude-sonnet-5',
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_tokens: 4000,
      cache_write_tokens: 100,
      cost_source: 'reported',
      ok: true,
    });
    expect(Number(row.cost_usd)).toBeCloseTo(0.02, 6);
  });

  /**
   * The turn that costs money and produces nothing is the one worth counting.
   * Averaging it away would flatter every figure on the panel.
   */
  it('records a failed turn, and marks it failed', async () => {
    await recordUsage({
      userId: user.id,
      kind: 'photo_log',
      outcome: { ...OUTCOME, error: 'The agent stopped early (error_max_turns).' },
    });

    const [row] = await rows();
    expect(row.ok).toBe(false);
    expect(row.error).toMatch(/stopped early/);
    expect(Number(row.cost_usd)).toBeGreaterThan(0);
  });

  it('prices a turn from the rate card when the provider reported nothing', async () => {
    await recordUsage({
      userId: user.id,
      kind: 'text_log',
      outcome: { ...OUTCOME, costUsd: 0, costSource: 'unknown' },
    });

    const [row] = await rows();
    expect(row.cost_source).toBe('estimated');
    expect(Number(row.cost_usd)).toBeGreaterThan(0);
  });

  /** No rate card covers a local model, and inventing one would be worse. */
  it('leaves an unpriceable model at zero and says so', async () => {
    await recordUsage({
      userId: user.id,
      kind: 'text_log',
      outcome: { ...OUTCOME, model: 'llama-3-local', costUsd: 0, costSource: 'unknown' },
    });

    const [row] = await rows();
    expect(row.cost_source).toBe('unknown');
    expect(Number(row.cost_usd)).toBe(0);
  });

  /**
   * A provider that reports a flat zero on a turn that plainly did work is
   * reporting a gap, not a free turn.
   */
  it('re-prices a reported zero from the rate card', async () => {
    await recordUsage({
      userId: user.id,
      kind: 'text_log',
      outcome: { ...OUTCOME, costUsd: 0, costSource: 'reported' },
    });
    const [row] = await rows();
    expect(row.cost_source).toBe('estimated');
    expect(Number(row.cost_usd)).toBeGreaterThan(0);
  });

  it('prefers the provider figure over the rate card when it has one', async () => {
    await recordUsage({
      userId: user.id,
      kind: 'text_log',
      outcome: { ...OUTCOME, costUsd: 0.999 },
    });
    const [row] = await rows();
    expect(Number(row.cost_usd)).toBeCloseTo(0.999, 6);
    expect(row.cost_source).toBe('reported');
  });

  it('keeps the per-model breakdown for a turn that touched several', async () => {
    await recordUsage({
      userId: user.id,
      kind: 'review',
      outcome: {
        ...OUTCOME,
        usage: {
          ...OUTCOME.usage,
          byModel: {
            'claude-opus-5': { inputTokens: 900, outputTokens: 250, cacheReadTokens: 0, cacheWriteTokens: 0 },
          },
        },
      },
    });
    const [row] = await rows();
    expect(row.breakdown).toHaveProperty('claude-opus-5');
  });

  it('falls back to the routed model when the provider named none', async () => {
    await recordUsage({
      userId: user.id,
      kind: 'photo_log',
      outcome: { ...OUTCOME, model: undefined },
    });
    const [row] = await rows();
    expect(row.model).toBe('claude-opus-5');
  });

  /**
   * Deliberately swallowed. Accounting that can take the product down with it
   * gets switched off, and then there is no accounting.
   */
  it('never lets a write failure escape into the turn', async () => {
    await expect(
      recordUsage({
        userId: 'not-a-uuid',
        kind: 'text_log',
        outcome: OUTCOME,
      }),
    ).resolves.toBeUndefined();
    expect(await rows()).toHaveLength(0);
  });
});

describe('estimateCost', () => {
  it('returns null when no rate card covers the model', () => {
    expect(
      estimateCost('mistral-local', {
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBeNull();
  });
});

describe('a real turn', () => {
  it('records itself through runTurn', async () => {
    scriptAgent({ text: 'Logged.' });
    const profile = await getUser(user.id);
    await runTurn({ userId: user.id, ctx: user.ctx, profile, text: 'two eggs' });

    const [row] = await rows();
    expect(row).toMatchObject({ user_id: user.id, kind: 'text_log', ok: true });
    expect(Number(row.input_tokens)).toBeGreaterThan(0);
  });
});

describe('reporting', () => {
  beforeEach(async () => {
    await recordUsage({ userId: user.id, kind: 'text_log', outcome: OUTCOME });
    await recordUsage({
      userId: user.id,
      kind: 'photo_log',
      outcome: { ...OUTCOME, model: 'claude-opus-5', costUsd: 0.3 },
    });
    await recordUsage({
      userId: user.id,
      kind: 'text_log',
      outcome: { ...OUTCOME, error: 'boom' },
    });
  });

  it('totals the window', async () => {
    const totals = await costTotals(30);
    expect(totals.turns).toBe(3);
    expect(totals.failed_turns).toBe(1);
    expect(totals.cost_usd).toBeCloseTo(0.34, 4);
    expect(totals.active_users).toBe(1);
    expect(totals.p95_duration_ms).toBe(1500);
  });

  it('splits by turn kind and model, most expensive first', async () => {
    const byKind = await costByKind(30);
    expect(byKind[0]).toMatchObject({ kind: 'photo_log', model: 'claude-opus-5' });
    expect(byKind.find((r) => r.kind === 'text_log')?.turns).toBe(2);
  });

  it('groups by day', async () => {
    const byDay = await costByDay(30);
    expect(byDay).toHaveLength(1);
    expect(byDay[0]!.turns).toBe(3);
  });

  it('groups by account, resolving the email', async () => {
    const byUser = await costByUser(30);
    expect(byUser[0]).toMatchObject({ user_id: user.id, email: user.email, turns: 3 });
  });

  it('lists the raw turns, newest first', async () => {
    const turns = await recentUsage(10);
    expect(turns).toHaveLength(3);
    expect(turns.every((t) => t.email === user.email)).toBe(true);
  });

  it('filters the raw turns to one account', async () => {
    const other = await createUser();
    expect(await recentUsage(10, other.id)).toHaveLength(0);
    expect(await recentUsage(10, user.id)).toHaveLength(3);
  });

  it('excludes turns older than the window', async () => {
    await query(`UPDATE ai_usage SET occurred_at = now() - interval '60 days'`);
    expect((await costTotals(30)).turns).toBe(0);
    expect((await costTotals(90)).turns).toBe(3);
  });
});

describe('economics', () => {
  it('is empty and safe on a deployment that has run nothing', async () => {
    const result = await economics(30);
    expect(result).toMatchObject({
      turns: 0,
      active_users: 0,
      cost_per_turn_usd: 0,
      cost_per_user_month_usd: 0,
      unpriced_share: 0,
    });
    // The divide-by-zero guard: no users must not become an infinite per-user cost.
    expect(result.projection.every((tier) => tier.monthly_usd === 0)).toBe(true);
  });

  it('derives cost per turn and scales spend to a month', async () => {
    for (let i = 0; i < 4; i++) {
      await recordUsage({ userId: user.id, kind: 'text_log', outcome: { ...OUTCOME, costUsd: 0.25 } });
    }

    const result = await economics(30);
    expect(result.cost_per_turn_usd).toBeCloseTo(0.25, 4);
    // One user, $1 over the 30-day window, so a month is the window.
    expect(result.cost_per_user_month_usd).toBeCloseTo(1, 4);
    expect(result.projection).toEqual([
      { users: 100, monthly_usd: 100 },
      { users: 1000, monthly_usd: 1000 },
      { users: 10000, monthly_usd: 10000 },
    ]);
  });

  /**
   * A shorter window has to be scaled up, not read as a monthly figure. Getting
   * this backwards would report a week's spend as a month's and understate the
   * projection fourfold.
   */
  it('scales a seven-day window up to a month', async () => {
    await recordUsage({ userId: user.id, kind: 'text_log', outcome: { ...OUTCOME, costUsd: 7 } });
    const result = await economics(7);
    expect(result.cost_per_user_month_usd).toBeCloseTo(30, 4);
  });

  it('reports the heaviest account separately from the mean', async () => {
    const light = await createUser();
    await recordUsage({ userId: light.id, kind: 'text_log', outcome: { ...OUTCOME, costUsd: 0.01 } });
    await recordUsage({ userId: user.id, kind: 'text_log', outcome: { ...OUTCOME, costUsd: 5 } });

    const result = await economics(30);
    expect(result.heaviest_user_month_usd).toBeCloseTo(5, 4);
    expect(result.cost_per_user_month_usd).toBeCloseTo(2.505, 3);
  });

  /** An undercount that does not announce itself is the worst kind. */
  it('reports the share of turns nobody could price', async () => {
    await recordUsage({ userId: user.id, kind: 'text_log', outcome: OUTCOME });
    await recordUsage({
      userId: user.id,
      kind: 'text_log',
      outcome: { ...OUTCOME, model: 'llama-3-local', costUsd: 0, costSource: 'unknown' },
    });
    expect((await economics(30)).unpriced_share).toBeCloseTo(0.5, 4);
  });
});
