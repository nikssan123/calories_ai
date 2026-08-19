import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { scriptAgent } from './helpers/agent-mock.ts';
import { anonymousApp, appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * Rate limits exist on exactly two kinds of route: the ones that spend money on
 * the agent, and the ones that guard a password. Everything else must stay
 * unthrottled — the dashboard polls, and throttling it only breaks the app.
 */

let user: TestUser;
let app: FastifyInstance;
let cookie: string;

beforeEach(async () => {
  user = await createUser();
  ({ app, cookie } = await appFor(user));
});

afterEach(async () => {
  await app.close();
});

async function hit(times: number, inject: () => Promise<{ statusCode: number }>) {
  const codes: number[] = [];
  for (let i = 0; i < times; i++) codes.push((await inject()).statusCode);
  return codes;
}

describe('POST /chat', () => {
  it('allows a normal session and then throttles', async () => {
    scriptAgent();
    const codes = await hit(42, () => {
      scriptAgent({ text: 'Logged.' });
      return app.inject({
        method: 'POST',
        url: '/chat',
        headers: { cookie },
        payload: { text: 'a meal' },
      }) as never;
    });

    expect(codes.slice(0, 40).every((c) => c === 200)).toBe(true);
    expect(codes.slice(40)).toEqual([429, 429]);
  });

  it('says how long to wait', async () => {
    scriptAgent();
    for (let i = 0; i < 41; i++) {
      scriptAgent({ text: 'Logged.' });
      await app.inject({ method: 'POST', url: '/chat', headers: { cookie }, payload: { text: 'x' } });
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { cookie },
      payload: { text: 'x' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(String(blocked.headers['x-ratelimit-limit'])).toBe('40');
  });

  /** The limit is per account, not per process — one user cannot lock out another. */
  it('counts each account separately', async () => {
    scriptAgent();
    for (let i = 0; i < 41; i++) {
      scriptAgent({ text: 'Logged.' });
      await app.inject({ method: 'POST', url: '/chat', headers: { cookie }, payload: { text: 'x' } });
    }

    const second = await createUser();
    const { app: secondApp, cookie: secondCookie } = await appFor(second);
    try {
      scriptAgent({ text: 'Logged.' });
      const response = await secondApp.inject({
        method: 'POST',
        url: '/chat',
        headers: { cookie: secondCookie },
        payload: { text: 'x' },
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await secondApp.close();
    }
  });
});

describe('POST /reviews/run', () => {
  it('throttles the expensive manual trigger', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      scriptAgent({ text: 'A week.' });
      const response = await app.inject({
        method: 'POST',
        url: '/reviews/run',
        headers: { cookie },
        payload: {},
      });
      codes.push(response.statusCode);
    }
    expect(codes.filter((c) => c === 429)).toHaveLength(1);
  });
});

describe('password routes', () => {
  it('throttles login attempts by IP', async () => {
    const anon = await anonymousApp();
    try {
      const codes = await hit(11, () =>
        anon.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'nik@example.com', password: 'guess-guess' },
        }) as never,
      );
      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
      expect(codes.at(-1)).toBe(429);
    } finally {
      await anon.close();
    }
  });

  it('throttles signups by IP', async () => {
    const anon = await anonymousApp();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) {
        const response = await anon.inject({
          method: 'POST',
          url: '/auth/signup',
          payload: { email: `person${i}@example.com`, password: 'correct-horse' },
        });
        codes.push(response.statusCode);
      }
      expect(codes.at(-1)).toBe(429);
    } finally {
      await anon.close();
    }
  });
});

describe('everything else', () => {
  it('is not throttled, because the dashboard polls it', async () => {
    const codes = await hit(60, () =>
      app.inject({ method: 'GET', url: '/day', headers: { cookie } }) as never,
    );
    expect(codes.every((c) => c === 200)).toBe(true);
  });
});
