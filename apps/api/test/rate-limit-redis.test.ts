import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { buildApp } from '../src/app.ts';
import { readEnv } from '../src/env.ts';
import { createSession } from '../src/services/auth.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

/**
 * Rate-limit counters in Redis rather than in process.
 *
 * The property under test is invisible from inside a single process, which is
 * exactly why it is worth a test of its own: with in-process counters two
 * replicas each enforce the whole ceiling by themselves, so the limit written
 * down is not the limit applied and nothing anywhere says so. The only way to
 * see it is to stand up two apps and watch whether one's requests count against
 * the other's.
 *
 * These need a real Redis — `docker compose up -d redis` — and skip without
 * one. Skipping rather than failing is deliberate: the store is optional in the
 * product, so a checkout with no Redis is a supported configuration and should
 * not report a red suite. `rate-limit.test.ts` covers the in-process path that
 * such a checkout actually runs.
 */

const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380';

/**
 * Probed at module load rather than in `beforeAll`, so `describe.skipIf` can
 * see the answer and the run reports these as skipped rather than as passing
 * without having asserted anything.
 */
const reachable = await (async () => {
  const probe = new Redis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 500,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
})();

let user: TestUser;
let cookie: string;
const apps: FastifyInstance[] = [];

beforeEach(async () => {
  user = await createUser();
  const { token } = await createSession(user.id);
  cookie = `ct_session=${token}`;

  // Counters outlive the truncate that resets Postgres between cases, and they
  // are keyed on the user id — so a fresh user each case would usually be
  // enough, but a flushed store makes that "usually" into "always".
  if (reachable) {
    const client = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
    await client.flushdb();
    await client.quit();
  }
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

/** An app whose limiter counts into Redis, tracked so it is closed after. */
async function replica(): Promise<FastifyInstance> {
  const app = await buildApp({ logger: false, redisUrl: REDIS_URL });
  await app.ready();
  apps.push(app);
  return app;
}

/** The cheapest limited route to exercise: it spends nothing and counts. */
const deleteAttempt = (app: FastifyInstance, as = cookie) =>
  app.inject({
    method: 'DELETE',
    url: '/account',
    headers: { cookie: as },
    payload: { password: 'wrong-on-purpose' },
  });

describe.skipIf(!reachable)('counters in Redis', () => {
  it('shares one ceiling across two replicas, rather than one each', async () => {
    const a = await replica();
    const b = await replica();

    // DELETE_ACCOUNT_LIMIT is five in fifteen minutes. Split across the two
    // instances: on in-process counters this is three and two, both under the
    // ceiling, and every one of them succeeds.
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await deleteAttempt(a)).statusCode);
    for (let i = 0; i < 3; i++) codes.push((await deleteAttempt(b)).statusCode);

    expect(codes.filter((c) => c === 429)).toHaveLength(1);
    // And it is the sixth that is refused, wherever it was sent.
    expect(codes.at(-1)).toBe(429);
  });

  it('counts one replica against itself the same way', async () => {
    const a = await replica();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await deleteAttempt(a)).statusCode);

    expect(codes.at(-1)).toBe(429);
  });

  it('keeps one account out of another account bucket', async () => {
    const a = await replica();
    for (let i = 0; i < 6; i++) await deleteAttempt(a);

    const other = await createUser();
    const { token } = await createSession(other.id);
    const response = await deleteAttempt(a, `ct_session=${token}`);
    expect(response.statusCode).not.toBe(429);
  });

  /**
   * The failure mode that matters most, because it is the one that turns a
   * cache outage into a product outage. `skipOnError` means a store that cannot
   * answer lets the request through instead of raising a 500 — a limiter that
   * stops limiting for a few minutes beats an API that refuses everyone.
   */
  it('serves requests unthrottled when Redis is unreachable, rather than failing them', async () => {
    const app = await buildApp({ logger: false, redisUrl: 'redis://127.0.0.1:6399' });
    await app.ready();
    apps.push(app);

    const response = await deleteAttempt(app);
    expect(response.statusCode).not.toBe(429);
    expect(response.statusCode).toBeLessThan(500);
  });
});

describe('configuration', () => {
  it('reads REDIS_URL, and treats blank as unset', () => {
    const base = { DATABASE_URL: 'postgres://ct:ct@localhost:5433/ct' } as never;
    expect(readEnv({ ...base, REDIS_URL: 'redis://localhost:6380' }).redisUrl).toBe(
      'redis://localhost:6380',
    );
    expect(readEnv({ ...base, REDIS_URL: '   ' }).redisUrl).toBeNull();
    expect(readEnv(base).redisUrl).toBeNull();
  });

  /**
   * Forced off under test for the reason the email key and the Google client
   * are: a developer with REDIS_URL in their own .env must not get a different
   * suite from everyone else. Here it would not merely differ — the cases that
   * assert a ceiling is reached count on a counter that starts empty, and a
   * real Redis carries the last run's counts into this one.
   */
  it('ignores a developer REDIS_URL under test', () => {
    const env = readEnv({
      DATABASE_URL: 'postgres://ct:ct@localhost:5433/ct',
      REDIS_URL: 'redis://localhost:6380',
      NODE_ENV: 'test',
    } as never);
    expect(env.redisUrl).toBeNull();
  });
});
