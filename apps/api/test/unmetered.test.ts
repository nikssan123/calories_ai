import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { meterFor } from '../src/services/plans.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import { appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The account nobody is billed for.
 *
 * Every ceiling in `plans.ts` is a cost control written in dollars, and none of
 * those dollars are spent when the turn runs on the Claude Code subscription:
 * it is already paid for, flat, by whoever signed the box in. So the meters do
 * not apply — and the property worth pinning is not that a number got bigger
 * but that *the wall never appears*, on every door that has one.
 *
 * `lanes.test.ts` covers who this is. Here the predicate is mocked, for the
 * reason `helpers/setup.ts` gives: the suite runs with an `ANTHROPIC_API_KEY`
 * set so that whether the developer happens to be signed into Claude Code
 * cannot change what any test asserts — which also means the real
 * `unmeteredFor` is false everywhere in here by construction.
 */
const { lane } = vi.hoisted(() => ({ lane: { unmetered: false } }));

vi.mock('../src/ai/lane.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ai/lane.ts')>();
  return {
    ...actual,
    unmeteredFor: (email: string | null | undefined) => lane.unmetered && Boolean(email),
  };
});

let user: TestUser;
let app: FastifyInstance;
let cookie: string;

beforeEach(async () => {
  lane.unmetered = true;
  user = await createUser();
  ({ app, cookie } = await appFor(user));
});

afterEach(async () => {
  lane.unmetered = false;
  await app.close();
});

/** Free, throughout. The plan column is untouched — this is not an upgrade. */
async function spend(kind: string, n: number) {
  const { recordUsage } = await import('../src/services/usage.ts');
  for (let i = 0; i < n; i++) {
    await recordUsage({
      userId: user.id,
      kind: kind as never,
      provider: 'anthropic',
      outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 0, model: 'claude-sonnet-5' } as never,
    });
  }
}

const chat = (payload: Record<string, unknown> = { text: 'Two eggs' }) => {
  scriptAgent({ text: 'Logged.' });
  return app.inject({ method: 'POST', url: '/chat', headers: { cookie }, payload });
};

describe('the meters', () => {
  /**
   * The free tier's ten messages a month, and this account has spent twice
   * them. On a metered lane the next turn is the 402 that `plans.test.ts`
   * asserts; here there is no bill for it to be protecting.
   */
  it('does not wall a spent journal', async () => {
    await spend('text_log', meterFor('free', 'chat').allowed! * 2);
    expect((await chat()).statusCode).toBe(200);
  });

  /** The single lifetime photo is the sharpest wall in the product. */
  it('does not wall the photo scan', async () => {
    await spend('photo_log', 5);
    const response = await chat({ text: 'What is this?', photo_base64: 'iVBORw0KGgo=' });
    expect(response.statusCode).toBe(200);
  });

  /**
   * A locked feature rather than a spent one, which is the other half: `free`
   * carries no kitchen at all, so this is 402 on the very first press.
   */
  it('unlocks the kitchen a free plan does not carry', async () => {
    scriptAgent({ text: 'Nothing much in there.' });
    const response = await app.inject({
      method: 'POST',
      url: '/pantry/scan',
      headers: { cookie },
      payload: { photo_base64: 'iVBORw0KGgo=' },
    });
    expect(response.statusCode).toBe(200);
  });

  /** `reviewsPerDay` is zero on free, which the route answers as a paywall. */
  it('lets a free account run its own review', async () => {
    const response = await app.inject({ method: 'POST', url: '/reviews/run', headers: { cookie } });
    expect(response.statusCode).not.toBe(402);
  });
});

describe('what the client is told', () => {
  const entitlements = () =>
    app.inject({ method: 'GET', url: '/entitlements', headers: { cookie } });

  /**
   * `unlimited`, not a large `allowed`, and not the `allowed: null` that means
   * "not on this plan" — the client draws a locked panel for that one, so a
   * third state is the difference between an unmetered kitchen and a kitchen
   * that looks locked to the person who is allowed to use it.
   */
  it('reports every meter as unlimited rather than as locked', async () => {
    const body = (await entitlements()).json();
    for (const allowance of body.allowances) {
      expect(allowance, allowance.meter).toMatchObject({
        unlimited: true,
        allowed: null,
        used: 0,
        resets_at: null,
      });
    }
  });

  /** The tier ladder is the product's, not this account's. Nothing is for sale here. */
  it('leaves the plan and the tiers alone', async () => {
    const body = (await entitlements()).json();
    expect(body.plan).toBe('free');
    expect(body.tiers.map((t: { plan: string }) => t.plan)).toEqual(['free', 'plus', 'coach']);
    expect(body.tiers.find((t: { plan: string }) => t.plan === 'free').meters[0].allowed).toBe(
      meterFor('free', 'chat').allowed,
    );
  });

  /**
   * Bought scans are stock somebody paid for. They are never spent on this lane
   * — there is nothing to spend them against — but reporting none because the
   * account happens to be unmetered would be the settings screen lying about a
   * purchase.
   */
  it('still reports scans that were bought', async () => {
    const { grantPhotoCredits } = await import('../src/services/credits.ts');
    await grantPhotoCredits(user.id, 'photo_10', 'evt-unmetered-1');

    const photo = (await entitlements())
      .json()
      .allowances.find((a: { meter: string }) => a.meter === 'photo');
    expect(photo).toMatchObject({ unlimited: true, credits: 10 });

    // And spending a turn does not draw one down.
    await chat({ text: 'What is this?', photo_base64: 'iVBORw0KGgo=' });
    const { photoCreditBalance } = await import('../src/services/credits.ts');
    expect(await photoCreditBalance(user.id)).toBe(10);
  });

  /**
   * The ledger still records every turn. It is the only place a subscription's
   * consumption is visible at all — an unmetered account that recorded nothing
   * would be the one lane with no invoice *and* no numbers.
   */
  it('still writes the turn to the cost ledger', async () => {
    const { query } = await import('../src/db.ts');
    await chat();
    const rows = await query<{ n: string }>('SELECT count(*) AS n FROM ai_usage WHERE user_id = $1', [
      user.id,
    ]);
    expect(Number(rows[0]!.n)).toBe(1);
  });
});
