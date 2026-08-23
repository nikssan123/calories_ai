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
