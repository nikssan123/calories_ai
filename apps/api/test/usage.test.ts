import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  spend,
  spendsGrant,
  type RecordUsageInput,
} from '../src/services/usage.ts';
import { FREE_TURNS } from '@ct/shared';
import { MODELS } from '../src/ai/client.ts';
import type { TurnKind } from '../src/ai/providers/types.ts';

/**
 * These tests are about the arithmetic, not the routing, so they all file under
 * the metered lane. `lanes.test.ts` is where the lane column itself is pinned.
 */
const record = (input: Omit<RecordUsageInput, 'provider'>) =>
  recordUsage({ ...input, provider: 'anthropic-api' });
import { runTurn } from '../src/ai/run.ts';
import { getUser } from '../src/services/user.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import {
  addWeight,
  createUser,
  ROOMY_ALLOWANCE,
  setUserTargets,
  type TestUser,
} from './helpers/factories.ts';

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
      await record({ userId: user.id, kind, outcome: { ...OUTCOME, model: MODELS[kind].model } });
    }

    const rows = await query<{ kind: string }>(
      'SELECT kind FROM ai_usage WHERE user_id = $1',
      [user.id],
    );
    expect(rows.map((r) => r.kind).sort()).toEqual([...kinds].sort());
  });
});

/**
 * The row keeps the sentence, not the prompt around it.
 *
 * A price with no subject is the thing the panel could not explain, so the text
 * is worth a row of its own — but only the person's own words, and only as much
 * of them as makes a turn recognisable. A recipe import is a pasted webpage, and
 * a cost ledger that stores the whole of one has become a second copy of the
 * conversation.
 */
describe('the message a turn carries', () => {
  it('keeps what the person typed', async () => {
    await record({ userId: user.id, kind: 'text_log', outcome: OUTCOME, prompt: 'two eggs' });

    const [row] = await rows();
    expect(row.prompt).toBe('two eggs');
  });

  it('truncates a long one rather than storing the whole paste', async () => {
    await record({ userId: user.id, kind: 'recipe', outcome: OUTCOME, prompt: 'x'.repeat(2000) });

    const [row] = await rows();
    expect(row.prompt).toBe(`${'x'.repeat(500)}\u2026`);
  });

  it('stores nothing for a turn nobody typed a sentence for', async () => {
    await record({ userId: user.id, kind: 'review', outcome: OUTCOME });
    await record({ userId: user.id, kind: 'photo_log', outcome: OUTCOME, prompt: '   ' });

    const stored = (await rows()).map((row) => row.prompt);
    expect(stored).toEqual([null, null]);
  });
});

describe('recordUsage', () => {
  it('writes one row per turn with the tokens split by kind', async () => {
    await record({ userId: user.id, kind: 'text_log', outcome: OUTCOME });

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
    await record({
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
    await record({
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
    await record({
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
    await record({
      userId: user.id,
      kind: 'text_log',
      outcome: { ...OUTCOME, costUsd: 0, costSource: 'reported' },
    });
    const [row] = await rows();
    expect(row.cost_source).toBe('estimated');
    expect(Number(row.cost_usd)).toBeGreaterThan(0);
  });

  it('prefers the provider figure over the rate card when it has one', async () => {
    await record({
      userId: user.id,
      kind: 'text_log',
      outcome: { ...OUTCOME, costUsd: 0.999 },
    });
    const [row] = await rows();
    expect(Number(row.cost_usd)).toBeCloseTo(0.999, 6);
    expect(row.cost_source).toBe('reported');
  });

  it('keeps the per-model breakdown for a turn that touched several', async () => {
    await record({
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
    await record({
      userId: user.id,
      kind: 'photo_log',
      outcome: { ...OUTCOME, model: undefined },
    });
    const [row] = await rows();
    expect(row.model).toBe(MODELS.photo_log.model);
  });

  /**
   * Deliberately swallowed. Accounting that can take the product down with it
   * gets switched off, and then there is no accounting.
   */
  it('never lets a write failure escape into the turn', async () => {
    await expect(
      record({
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
    await runTurn({ userId: user.id, ctx: user.ctx, profile, text: 'two eggs', allowance: ROOMY_ALLOWANCE });

    const [row] = await rows();
    expect(row).toMatchObject({ user_id: user.id, kind: 'text_log', ok: true });
    expect(Number(row.input_tokens)).toBeGreaterThan(0);
  });

  /**
   * The greeting. A guest typed "Здрасти" on 2026-09-22, was greeted back, and
   * met the wall a meal early because hello had taken a third of a grant of
   * three — see `063_ai_usage_metered.sql`. The row is still written in full;
   * it is simply not one of the three.
   */
  it('is recorded but not counted when it wrote nothing into the journal', async () => {
    scriptAgent({ text: 'Здрасти! Как я караш — какво хапна днес?' });
    const profile = await getUser(user.id);
    const turn = await runTurn({
      userId: user.id,
      ctx: user.ctx,
      profile,
      text: 'Здрасти',
      allowance: ROOMY_ALLOWANCE,
    });

    const [row] = await rows();
    expect(row).toMatchObject({ kind: 'text_log', ok: true, metered: false, changed_journal: false });
    expect(Number(row.input_tokens)).toBeGreaterThan(0);
    // And the reply says so: the number the journal draws has not moved.
    expect(turn.allowance).toMatchObject({ used: ROOMY_ALLOWANCE.used });
  });

  it('counts the turn that logged the meal, and says so on the reply', async () => {
    const tools = await import('../src/ai/tools.ts');
    const spy = vi.spyOn(tools, 'buildNutritionServer');
    scriptAgent({
      text: 'Готово, две яйца влязоха.',
      act: async () => {
        const built = spy.mock.results.at(-1)!.value as ReturnType<typeof tools.buildNutritionServer>;
        const logFood = built.tools.find((t) => t.name === 'log_food')!;
        await logFood.handler(
          {
            description: 'Two eggs',
            meal: null,
            when: null,
            note: null,
            confidence: 'high',
            items: [
              {
                name: 'Eggs',
                quantity_g: 100,
                quantity_desc: null,
                kcal: 150,
                protein_g: 13,
                carbs_g: 1,
                fat_g: 11,
                fiber_g: null,
                sodium_mg: null,
                sat_fat_g: null,
                sugar_g: null,
              },
            ],
          } as never,
          {},
        );
      },
    });

    const profile = await getUser(user.id);
    const turn = await runTurn({
      userId: user.id,
      ctx: user.ctx,
      profile,
      text: 'Яйца',
      allowance: ROOMY_ALLOWANCE,
    });

    const [row] = await rows();
    expect(row).toMatchObject({ metered: true, changed_journal: true });
    expect(turn.allowance).toMatchObject({ used: ROOMY_ALLOWANCE.used + 1 });
  });
});

/**
 * The rule itself, away from the model.
 *
 * A grant is sold as meals logged, so a turn that changed nothing does not
 * spend one — earned rather than granted, because a flat allowance of free
 * turns is a free model with a greeting for a password.
 */
describe('what spends a grant', () => {
  const chatter = () => spendsGrant(user.id, { changed: false, failed: false, unlimited: false });
  /** A turn that said something and logged nothing, as the lanes record one. */
  const idleRow = () =>
    record({ userId: user.id, kind: 'text_log', outcome: OUTCOME, metered: false, changed: false });
  /** The same turn once the budget has gone: charged, and still logging nothing. */
  const chargedIdleRow = () =>
    record({ userId: user.id, kind: 'text_log', outcome: OUTCOME, metered: true, changed: false });
  const loggedRow = () =>
    record({ userId: user.id, kind: 'text_log', outcome: OUTCOME, metered: true, changed: true });

  it('does not charge a turn that changed nothing', async () => {
    expect(await chatter()).toBe(false);
  });

  it('charges a turn that touched the journal', async () => {
    expect(await spendsGrant(user.id, { changed: true, failed: false, unlimited: false })).toBe(true);
  });

  /* A meter a broken provider can switch off is not a meter. */
  it('charges a turn that burned tokens and then failed', async () => {
    expect(await spendsGrant(user.id, { changed: false, failed: true, unlimited: false })).toBe(true);
  });

  /* Nothing is counted on those accounts, so the flag is decoration. */
  it('asks nothing of an account with no ceiling', async () => {
    for (let i = 0; i < FREE_TURNS.starter; i++) await idleRow();
    expect(await spendsGrant(user.id, { changed: false, failed: false, unlimited: true })).toBe(true);
  });

  it('charges chatter once the starter is gone', async () => {
    for (let i = 0; i < FREE_TURNS.starter; i++) await idleRow();
    expect(await chatter()).toBe(true);
  });

  it('buys another free turn with a turn that logged something', async () => {
    for (let i = 0; i < FREE_TURNS.starter; i++) await idleRow();
    await loggedRow();
    expect(await chatter()).toBe(false);
  });

  /**
   * The exploit the two columns exist for.
   *
   * A chatter turn charged because the budget ran out is metered and logged
   * nothing. If being metered were what earned the next free turn, hello and
   * hello would alternate for as long as the grant lasted and every guest would
   * cost twice what they used to. Only a turn that wrote something buys one.
   */
  it('is not earned back by the chatter it just charged for', async () => {
    for (let i = 0; i < FREE_TURNS.starter; i++) await idleRow();
    for (let i = 0; i < 5; i++) {
      expect(await chatter()).toBe(true);
      await chargedIdleRow();
    }
  });

  it('is one budget across both journal lanes, not one each', async () => {
    for (let i = 0; i < FREE_TURNS.starter; i++) {
      await record({ userId: user.id, kind: 'photo_log', outcome: OUTCOME, metered: false, changed: false });
    }
    expect(await chatter()).toBe(true);
  });

  /**
   * A review, a nudge, a recipe and a fridge scan write rows here and none of
   * them logs a meal. They carry no journal fact at all, so they cannot buy a
   * free turn on the journal's behalf.
   */
  it('is not earned by a turn with no journal behind it', async () => {
    for (let i = 0; i < FREE_TURNS.starter; i++) await idleRow();
    await record({ userId: user.id, kind: 'review', outcome: OUTCOME });
    expect(await chatter()).toBe(true);
  });

  /* Rolling, like every other window here: no cliff, and no date to remember. */
  it('lets yesterday’s chatter age out of the window', async () => {
    for (let i = 0; i < FREE_TURNS.starter; i++) await idleRow();
    await query(
      `UPDATE ai_usage SET occurred_at = now() - interval '25 hours' WHERE user_id = $1`,
      [user.id],
    );
    expect(await chatter()).toBe(false);
  });

  it('is another account’s business, not this one’s', async () => {
    const other = await createUser();
    for (let i = 0; i < FREE_TURNS.starter; i++) {
      await record({ userId: other.id, kind: 'text_log', outcome: OUTCOME, metered: false, changed: false });
    }
    expect(await chatter()).toBe(false);
  });
});

describe('the allowance a reply carries', () => {
  it('adds the turn when it was charged for', () => {
    expect(spend(ROOMY_ALLOWANCE, true).used).toBe(ROOMY_ALLOWANCE.used + 1);
  });

  it('leaves it alone when it was not', () => {
    expect(spend(ROOMY_ALLOWANCE, false).used).toBe(ROOMY_ALLOWANCE.used);
  });

  /*
   * Nothing was counted in the first place on an unmetered account, so adding
   * one here would start a tally against a ceiling that does not exist and
   * `/entitlements` would go on answering zero.
   */
  it('never starts a tally on an account that has no ceiling', () => {
    const free = { ...ROOMY_ALLOWANCE, unlimited: true, allowed: null };
    expect(spend(free, true)).toEqual(free);
  });
});

describe('reporting', () => {
  beforeEach(async () => {
    await record({ userId: user.id, kind: 'text_log', outcome: OUTCOME });
    await record({
      userId: user.id,
      kind: 'photo_log',
      outcome: { ...OUTCOME, model: 'claude-opus-5', costUsd: 0.3 },
    });
    await record({
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

  it('groups by day, and keeps the days nothing ran on', async () => {
    const byDay = await costByDay(30);
    // One row per calendar day in the window plus the partial day it opened
    // on, so a chart drawn from this cannot pass five scattered days off as a
    // month of steady use.
    expect(byDay).toHaveLength(31);
    expect(byDay.filter((d) => d.turns > 0)).toHaveLength(1);

    const active = byDay.find((d) => d.turns > 0)!;
    expect(active.turns).toBe(3);
    expect(active.failed_turns).toBe(1);
    expect(active.cache_read_tokens).toBe(12_000);
    expect(byDay.every((d) => d.turns > 0 || d.cost_usd === 0)).toBe(true);
  });

  /**
   * Deleting an account nulls `user_id` and leaves the turns. Counting those
   * as nobody was the bug: the spend stayed in every total while the headcount
   * it is divided by silently shrank, which inflates cost-per-user by exactly
   * the amount a deleted account used to absorb.
   */
  it('counts turns from deleted accounts as one anonymous user', async () => {
    await query('UPDATE ai_usage SET user_id = NULL WHERE kind = $1', ['photo_log']);

    expect((await costTotals(30)).active_users).toBe(2);
    expect((await economics(30)).active_users).toBe(2);
    expect((await costByDay(30)).find((d) => d.turns > 0)!.active_users).toBe(2);
  });

  it('counts a window of nothing but deleted accounts as one user', async () => {
    await query('UPDATE ai_usage SET user_id = NULL');
    expect((await costTotals(30)).active_users).toBe(1);
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
      await record({ userId: user.id, kind: 'text_log', outcome: { ...OUTCOME, costUsd: 0.25 } });
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
    await record({ userId: user.id, kind: 'text_log', outcome: { ...OUTCOME, costUsd: 7 } });
    const result = await economics(7);
    expect(result.cost_per_user_month_usd).toBeCloseTo(30, 4);
  });

  it('reports the heaviest account separately from the mean', async () => {
    const light = await createUser();
    await record({ userId: light.id, kind: 'text_log', outcome: { ...OUTCOME, costUsd: 0.01 } });
    await record({ userId: user.id, kind: 'text_log', outcome: { ...OUTCOME, costUsd: 5 } });

    const result = await economics(30);
    expect(result.heaviest_user_month_usd).toBeCloseTo(5, 4);
    expect(result.cost_per_user_month_usd).toBeCloseTo(2.505, 3);
  });

  /** An undercount that does not announce itself is the worst kind. */
  it('reports the share of turns nobody could price', async () => {
    await record({ userId: user.id, kind: 'text_log', outcome: OUTCOME });
    await record({
      userId: user.id,
      kind: 'text_log',
      outcome: { ...OUTCOME, model: 'llama-3-local', costUsd: 0, costSource: 'unknown' },
    });
    expect((await economics(30)).unpriced_share).toBeCloseTo(0.5, 4);
  });
});
