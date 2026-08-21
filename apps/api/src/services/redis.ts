import Redis from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Redis, and only for the rate limiter.
 *
 * `@fastify/rate-limit` keeps its counters in process memory by default, which
 * is correct for one process and quietly wrong for two: N replicas each hold
 * their own count, so a limit of forty turns an hour is enforced as forty *per
 * replica*. Nothing errors and nothing looks broken — the ceiling is simply N
 * times higher than the one written down, which is the worst way for a limit to
 * fail, because the only symptom is a bill.
 *
 * It is optional, and unset is a supported configuration rather than a degraded
 * one. A personal install is one process, where in-process counters are exactly
 * right and a second container would be furniture. `REDIS_URL` is the switch,
 * and the deployment that needs it is the one running more than one replica.
 *
 * Nothing else in the product uses Redis, and that is deliberate. Sessions are
 * in Postgres, the per-account turn lease is a column, the scheduler takes an
 * advisory lock. A store with no durable copy behind it is a good place for
 * counters nobody would miss and a bad place for anything else.
 *
 * There is no module-level client here on purpose. The app that opens one owns
 * it and closes it, which is both simpler than a singleton and a truer model of
 * the thing being built: replicas share a Redis, not a connection.
 */

export function createRedis(url: string, logger?: FastifyBaseLogger): Redis {
  const client = new Redis(url, {
    /*
     * One attempt, then give up and let the request through.
     *
     * The default retries a command across reconnects indefinitely, which for a
     * rate limiter turns an unreachable Redis into hung requests rather than
     * into a failed check. Paired with `skipOnError` where this is registered,
     * the failure mode is a limiter that stops limiting — which is the right
     * way round. A limiter that cannot answer must not become an outage: it
     * guards spending and password guessing, and both survive a few unthrottled
     * minutes better than everyone surviving a 500.
     */
    maxRetriesPerRequest: 1,
    /*
     * The offline queue stays on, which is the default and took a failing test
     * to justify.
     *
     * Turning it off looked right — fail fast rather than bank commands for a
     * Redis that is not there. What it actually does is lose the first requests
     * after boot: the client is still opening its socket, the limiter's check
     * rejects instantly, `skipOnError` waves the request through, and it is
     * never counted. The ceiling silently starts a few requests late on every
     * deploy and every restart.
     *
     * Queueing is bounded anyway, which is what makes this safe: with
     * `maxRetriesPerRequest` above, a command against a Redis that stays down
     * rejects after one retry rather than waiting indefinitely. So a blip is
     * absorbed and a real outage still falls through to `skipOnError` — which
     * is the behaviour both cases wanted.
     */
    connectTimeout: 2_000,
    // Keep trying, but with a ceiling: a limiter is worth getting back, and
    // there is no point hammering a box that is being rebuilt.
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });

  /*
   * Logged, never thrown. An unhandled `error` event on an ioredis client is a
   * process-level crash, so this listener is not decoration — it is what stops
   * a Redis restart from taking the API down with it.
   */
  client.on('error', (error: Error) => {
    logger?.warn({ err: error }, 'redis unavailable; rate limits are per-process until it returns');
  });

  return client;
}

/**
 * Shuts a client down without letting the shutdown itself fail.
 *
 * `quit` waits for in-flight commands, which is what we want; `disconnect` is
 * the fallback for a client that never reached a server, where `quit` would
 * wait for a reply that is never coming.
 */
export async function closeRedis(client: Redis | null): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => client.disconnect());
}
