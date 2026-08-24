import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Which lane a person's turns run on.
 *
 * The routing is a three-way agreement between an env var, an address on a user
 * row, and a credentials file on disk, and every one of the failure modes here
 * is silent: a turn on the wrong lane still logs the meal correctly. It is only
 * visible in the bill, weeks later. Hence the tests.
 */

const ORIGINAL_ENV = { ...process.env };

/**
 * Empty rather than deleted, because `env.ts` reloads the `.env` files on every
 * re-import and fills in whatever `process.env` does not already have. A key
 * removed here would simply come back from the developer's own file — and the
 * whole point of these cases is a deployment with no key at all.
 */
const NO_KEY = '';

/** Fresh modules per case: `env.ts` reads the environment once, at import. */
async function lanes(vars: Record<string, string | undefined>, signedIn: boolean) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.doMock('../src/ai/client.ts', async () => ({
    ...(await vi.importActual<object>('../src/ai/client.ts')),
    hasSubscriptionAuth: () => signedIn,
    // Mirrors the real one, over the mocked file check: credentials are only
    // what pays while there is no key in the environment to take precedence.
    onSubscription: () => signedIn && !process.env.ANTHROPIC_API_KEY,
  }));
  return import('../src/ai/providers/index.ts');
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  vi.doUnmock('../src/ai/client.ts');
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe('who runs on the subscription', () => {
  it('sends a named address to the subscription and everyone else to the key', async () => {
    const { laneFor } = await lanes(
      { AI_PROVIDER: 'anthropic-api', SUBSCRIPTION_EMAILS: 'me@example.com,partner@example.com' },
      true,
    );
    expect(laneFor('me@example.com')).toBe('anthropic');
    expect(laneFor('partner@example.com')).toBe('anthropic');
    expect(laneFor('astranger@example.com')).toBe('anthropic-api');
  });

  it('matches the address however it was typed, either side', async () => {
    const { laneFor } = await lanes(
      { AI_PROVIDER: 'anthropic-api', SUBSCRIPTION_EMAILS: '  Me@Example.COM , ' },
      true,
    );
    expect(laneFor('ME@EXAMPLE.com')).toBe('anthropic');
    expect(laneFor(' me@example.com ')).toBe('anthropic');
  });

  /** An account with no address is the anonymous signup the metered lane is for. */
  it('never puts a user without an address on the subscription', async () => {
    const { laneFor } = await lanes(
      { AI_PROVIDER: 'anthropic-api', SUBSCRIPTION_EMAILS: 'me@example.com' },
      true,
    );
    expect(laneFor(null)).toBe('anthropic-api');
    expect(laneFor(undefined)).toBe('anthropic-api');
    expect(laneFor('')).toBe('anthropic-api');
  });

  it('bills everybody when the list is empty or absent', async () => {
    for (const SUBSCRIPTION_EMAILS of ['', '  ', ',,', undefined]) {
      const { laneFor } = await lanes({ AI_PROVIDER: 'anthropic-api', SUBSCRIPTION_EMAILS }, true);
      expect(laneFor('me@example.com')).toBe('anthropic-api');
    }
  });

  /**
   * Without a login the Agent SDK falls back to ANTHROPIC_API_KEY, so this lane
   * would be the metered one plus a subprocess — the same bill, slower. Naming
   * an address must never be able to make a turn worse than not naming it.
   */
  it('leaves a listed address alone when there is no login to use', async () => {
    const { laneFor } = await lanes(
      { AI_PROVIDER: 'anthropic-api', SUBSCRIPTION_EMAILS: 'me@example.com' },
      false,
    );
    expect(laneFor('me@example.com')).toBe('anthropic-api');
  });

  /** The list can only move somebody onto the subscription, never off it. */
  it('is inert on a deployment already running the subscription for everyone', async () => {
    const { laneFor } = await lanes(
      { AI_PROVIDER: 'anthropic', SUBSCRIPTION_EMAILS: 'me@example.com' },
      true,
    );
    expect(laneFor('me@example.com')).toBe('anthropic');
    expect(laneFor('astranger@example.com')).toBe('anthropic');
  });

  it('leaves a third-party lane as the default for everyone unnamed', async () => {
    const { laneFor } = await lanes(
      { AI_PROVIDER: 'openai', SUBSCRIPTION_EMAILS: 'me@example.com' },
      true,
    );
    expect(laneFor('me@example.com')).toBe('anthropic');
    expect(laneFor('astranger@example.com')).toBe('openai');
  });
});

/**
 * Who pays, which is a different question from which lane runs — and the one
 * the plan meters are built on.
 *
 * Every ceiling in `plans.ts` is priced in dollars off `ai_usage`. A turn on
 * the subscription does not spend any, so metering it refuses work that has no
 * marginal price. What must never happen is the inverse: an account that is
 * really being billed, quietly handed an unlimited plan.
 */
describe('who is metered', () => {
  /** The addresses belonging to whoever runs the box, on a billed deployment. */
  it('lifts the meters for the addresses running on the subscription', async () => {
    const { unmeteredFor } = await lanes(
      {
        AI_PROVIDER: 'anthropic-api',
        SUBSCRIPTION_EMAILS: 'me@example.com',
        ANTHROPIC_API_KEY: NO_KEY,
      },
      true,
    );
    expect(unmeteredFor('me@example.com')).toBe(true);
    expect(unmeteredFor('ME@Example.com ')).toBe(true);
    // Everybody else on that deployment is billed a token at a time, and their
    // plan is the whole of what stands between the product and the bill.
    expect(unmeteredFor('astranger@example.com')).toBe(false);
    expect(unmeteredFor(null)).toBe(false);
  });

  /**
   * The one that would be silent. `laneFor` says `anthropic` here and the turn
   * really does run through the Agent SDK — but with a key in the environment
   * the SDK bills it, so the same lane is a real invoice. An entitlement built
   * on the lane alone would hand that account unlimited turns at $0.15 a scan.
   */
  it('keeps metering when a key is what actually pays', async () => {
    const { laneFor, unmeteredFor } = await lanes(
      {
        AI_PROVIDER: 'anthropic-api',
        SUBSCRIPTION_EMAILS: 'me@example.com',
        ANTHROPIC_API_KEY: 'sk-ant-test',
      },
      true,
    );
    expect(laneFor('me@example.com')).toBe('anthropic');
    expect(unmeteredFor('me@example.com')).toBe(false);
  });

  /**
   * A personal install or a development box: `AI_PROVIDER` is `anthropic` and
   * everybody's turns are on the operator's subscription, so everybody is
   * unmetered. That is the honest answer rather than a hole — there is no
   * per-token bill on that deployment for a ceiling to be protecting.
   */
  it('lifts them for everyone on a deployment that runs on the subscription', async () => {
    const { unmeteredFor } = await lanes(
      { AI_PROVIDER: 'anthropic', SUBSCRIPTION_EMAILS: '', ANTHROPIC_API_KEY: NO_KEY },
      true,
    );
    expect(unmeteredFor('anyone@example.com')).toBe(true);
    expect(unmeteredFor(null)).toBe(true);
  });

  /** No login at all: the SDK falls back to the key, so the turn is billed. */
  it('meters everybody when there is no login behind the lane', async () => {
    const { unmeteredFor } = await lanes(
      { AI_PROVIDER: 'anthropic', SUBSCRIPTION_EMAILS: 'me@example.com' },
      false,
    );
    expect(unmeteredFor('me@example.com')).toBe(false);
    expect(unmeteredFor('anyone@example.com')).toBe(false);
  });

  /** A third-party lane is billed by a third party. Nothing here is free. */
  it('never lifts them on another vendor', async () => {
    const { unmeteredFor } = await lanes(
      { AI_PROVIDER: 'openai', SUBSCRIPTION_EMAILS: '', ANTHROPIC_API_KEY: NO_KEY },
      true,
    );
    expect(unmeteredFor('anyone@example.com')).toBe(false);
  });
});

describe('which provider gets built', () => {
  const toolContext = { userId: 'u', actions: [] } as never;

  it('builds the lane it is handed, not the deployment default', async () => {
    const { createProvider } = await lanes(
      { AI_PROVIDER: 'anthropic-api', ANTHROPIC_API_KEY: 'sk-ant-test' },
      true,
    );
    expect(createProvider(toolContext, 'anthropic').id).toBe('anthropic');
    expect(createProvider(toolContext, 'anthropic-api').id).toBe('anthropic-api');
    expect(createProvider(toolContext, 'openai').id).toBe('openai');
  });

  it('falls back to the deployment default when handed nothing', async () => {
    const { createProvider } = await lanes({ AI_PROVIDER: 'anthropic-api' }, true);
    expect(createProvider(toolContext).id).toBe('anthropic-api');
  });
});

/**
 * The cost ledger has to name the lane that ran, not the lane configured.
 *
 * This is the bug the per-user routing shipped with, and it is worth a test
 * rather than a fix because of how it failed: `ai_usage.provider` was written
 * from `providerId()`, which was right for exactly as long as a deployment had
 * one lane. Afterwards every subscription turn was filed under `anthropic-api`,
 * nothing errored, and the cost column quietly mixed money that was billed with
 * money a subscription had already paid for. It took somebody asking "did my
 * turn use the subscription?" to notice.
 */
describe('what the cost ledger records', () => {
  it('files a turn under the lane that ran it, not the deployment default', async () => {
    process.env.AI_PROVIDER = 'anthropic-api';
    const { recordUsage } = await import('../src/services/usage.ts');
    const { query } = await import('../src/db.ts');
    const { createUser } = await import('./helpers/factories.ts');

    const user = await createUser();
    const outcome = {
      text: 'Logged.',
      model: 'claude-sonnet-5',
      sessionId: 's1',
      numTurns: 1,
      costUsd: 0.02,
      costSource: 'reported' as const,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };

    await recordUsage({ userId: user.id, kind: 'text_log', outcome, provider: 'anthropic' });

    const rows = await query<{ provider: string }>(
      'SELECT provider FROM ai_usage WHERE user_id = $1',
      [user.id],
    );
    expect(rows[0]!.provider).toBe('anthropic');
  });
});
