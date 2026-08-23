import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query } from '../src/db.ts';
import { limitsFor } from '../src/services/plans.ts';
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

/**
 * The journal's burst guard, which is no longer the journal's *allowance*.
 *
 * Since the plan rework the number sold is a meter counted off the cost ledger;
 * what is left here is the loop guard, and it sits deliberately below the meter
 * so that it can still fire. These tests read it from the table rather than
 * hardcoding it, because it is now a number that moves with pricing.
 */
const BURST = limitsFor('free').chatTurnsPerHour;

describe('POST /chat', () => {
  it('allows a normal session and then throttles', async () => {
    scriptAgent();
    const codes = await hit(BURST + 2, () => {
      scriptAgent({ text: 'Logged.' });
      return app.inject({
        method: 'POST',
        url: '/chat',
        headers: { cookie },
        payload: { text: 'a meal' },
      }) as never;
    });

    expect(codes.slice(0, BURST).every((c) => c === 200)).toBe(true);
    expect(codes.slice(BURST)).toEqual([429, 429]);
  });

  it('says how long to wait', async () => {
    scriptAgent();
    for (let i = 0; i < BURST + 1; i++) {
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
    expect(String(blocked.headers['x-ratelimit-limit'])).toBe(String(BURST));
  });

  /**
   * One ceiling, not one per route.
   *
   * @fastify/rate-limit counts per route config, so giving `/chat` and
   * `/chat/stream` a `CHAT_LIMIT` each would hand every account two buckets of
   * forty — eighty turns an hour for a client that alternated, with nothing in
   * any log to say so, because each route would be enforcing exactly the number
   * it was given. They share one limiter instead, and this is what says so.
   */
  it('shares its ceiling with the streaming route', async () => {
    scriptAgent();
    for (let i = 0; i < BURST; i++) {
      scriptAgent({ text: 'Logged.' });
      await app.inject({ method: 'POST', url: '/chat', headers: { cookie }, payload: { text: 'x' } });
    }

    scriptAgent({ text: 'Logged.' });
    const streamed = await app.inject({
      method: 'POST',
      url: '/chat/stream',
      headers: { cookie },
      payload: { text: 'x' },
    });
    expect(streamed.statusCode).toBe(429);
  });

  /** And the other direction, since a client may only ever use the new route. */
  it('is spent by the streaming route too', async () => {
    scriptAgent();
    for (let i = 0; i < BURST; i++) {
      scriptAgent({ text: 'Logged.' });
      await app.inject({
        method: 'POST',
        url: '/chat/stream',
        headers: { cookie },
        payload: { text: 'x' },
      });
    }

    scriptAgent({ text: 'Logged.' });
    const plain = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { cookie },
      payload: { text: 'x' },
    });
    expect(plain.statusCode).toBe(429);
  });

  /** The limit is per account, not per process — one user cannot lock out another. */
  it('counts each account separately', async () => {
    scriptAgent();
    for (let i = 0; i < BURST + 1; i++) {
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
  /**
   * Two different refusals on one route, and they must not be confused.
   *
   * `free` does not carry reviews at all, which is 402 — a paywall, decided in
   * the handler because a rate limiter cannot express "not included" (a ceiling
   * of zero comes out as "come back later", for a thing that never comes back).
   * A paid account that asks too fast gets the burst guard's 429.
   */
  it('refuses a free account with a paywall rather than a throttle', async () => {
    scriptAgent({ text: 'A week.' });
    const response = await app.inject({
      method: 'POST',
      url: '/reviews/run',
      headers: { cookie },
      payload: {},
    });
    expect(response.statusCode).toBe(402);
  });

  it('throttles the expensive manual trigger', async () => {
    await query('UPDATE users SET plan = $1 WHERE id = $2', ['plus', user.id]);
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
    // Three through the burst guard, then it bites for the rest of the minute.
    expect(codes.slice(0, 3).every((c) => c === 200)).toBe(true);
    expect(codes.slice(3).every((c) => c === 429)).toBe(true);
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
