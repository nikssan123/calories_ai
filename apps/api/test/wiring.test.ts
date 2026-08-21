import { afterEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { authDescription, AUTH_HELP, MAX_TURNS, MODELS, hasSubscriptionAuth } from '../src/ai/client.ts';
import { ensureDirectories, env } from '../src/env.ts';
import { anonymousApp } from './helpers/factories.ts';

/**
 * The wiring nobody thinks about until it is wrong: how the agent reports its
 * credentials, and the two directories the process needs before it can serve.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('agent client', () => {
  it('routes each kind of turn to its own model', () => {
    // The highest-volume path takes the cheapest model; the rare and the hard
    // ones take the expensive one. That split is the unit economics.
    expect(MODELS.text_log.model).toBe('claude-haiku-4-5');
    expect(MODELS.photo_log.model).toBe('claude-opus-5');
    expect(MODELS.setup.model).toBe('claude-opus-5');
    expect(MODELS.review.model).toBe('claude-opus-5');
    expect(MAX_TURNS).toBeGreaterThan(1);
  });

  /**
   * Haiku 4.5 is the one model in the line-up that rejects `effort` outright —
   * it returns a 400 rather than ignoring it. `text_log` runs on Haiku and is
   * ~70% of all turns, so setting an effort there would not degrade the product
   * quietly, it would break every meal log in production. Hence a test rather
   * than a comment.
   */
  it('never pins an effort on a model that rejects one', () => {
    for (const choice of Object.values(MODELS)) {
      if (choice.model.includes('haiku')) expect(choice.effort).toBeUndefined();
    }
  });

  it('pins reasoning effort on every kind that accepts one', () => {
    for (const kind of ['photo_log', 'setup', 'review'] as const) {
      expect(MODELS[kind].effort).toBe('high');
    }
  });


  it('prefers an API key when one is set', () => {
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    try {
      expect(authDescription()).toBe('anthropic-api-key');
    } finally {
      process.env.ANTHROPIC_API_KEY = original;
    }
  });

  /**
   * `authDescription` calls `hasSubscriptionAuth` inside its own module, so a
   * spy on the export cannot reach it. Re-import the module against a fake home
   * directory instead — which also makes the result independent of whether the
   * machine running the suite happens to be signed into Claude Code.
   */
  it('falls back to the subscription, then to nothing', async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const home = await mkdtemp(join(tmpdir(), 'ct-home-'));

    vi.resetModules();
    vi.doMock('node:os', () => ({ homedir: () => home, default: { homedir: () => home } }));
    try {
      const cold = await import('../src/ai/client.ts');
      expect(cold.hasSubscriptionAuth()).toBe(false);
      expect(cold.authDescription()).toBe('none');

      await mkdir(join(home, '.claude'), { recursive: true });
      await writeFile(join(home, '.claude', '.credentials.json'), '{}');
      expect(cold.hasSubscriptionAuth()).toBe(true);
      expect(cold.authDescription()).toBe('claude-code-subscription');

      process.env.ANTHROPIC_API_KEY = 'sk-test';
      expect(cold.authDescription()).toBe('anthropic-api-key');
    } finally {
      vi.doUnmock('node:os');
      vi.resetModules();
      process.env.ANTHROPIC_API_KEY = original;
      await rm(home, { recursive: true, force: true });
    }
  });

  it('answers whether the subscription credentials file exists', () => {
    expect(typeof hasSubscriptionAuth()).toBe('boolean');
  });

  it('tells the user how to fix a missing credential', () => {
    expect(AUTH_HELP).toMatch(/~\/\.claude\/\.credentials\.json/);
  });
});

describe('ensureDirectories', () => {
  it('creates the upload and agent directories, and is idempotent', async () => {
    await rm(env.uploadDir, { recursive: true, force: true });
    await rm(env.agentCwd, { recursive: true, force: true });

    await ensureDirectories();
    expect(existsSync(env.uploadDir)).toBe(true);
    expect(existsSync(env.agentCwd)).toBe(true);

    await expect(ensureDirectories()).resolves.toBeUndefined();
  });

  /** The agent's cwd must not be the folder holding meal photos. */
  it('keeps the agent’s working directory separate from the uploads', () => {
    expect(env.agentCwd).not.toBe(env.uploadDir);
  });
});

describe('buildApp', () => {
  it('builds with a logger unless one is switched off', async () => {
    const { buildApp } = await import('../src/app.ts');
    const original = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'silent';
    const app = await buildApp();
    process.env.LOG_LEVEL = original;
    try {
      expect(app.log.level).toBeDefined();
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('answers a CORS preflight with credentials allowed', async () => {
    const app = await anonymousApp();
    try {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/day',
        headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    } finally {
      await app.close();
    }
  });

  /** An OPTIONS that CORS does not claim must not be turned into a 401. */
  it('lets a bare OPTIONS past the auth guard', async () => {
    const app = await anonymousApp();
    try {
      const response = await app.inject({ method: 'OPTIONS', url: '/day' });
      expect(response.statusCode).not.toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404s an unknown route rather than 401ing it', async () => {
    const app = await anonymousApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/health/nope' });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
