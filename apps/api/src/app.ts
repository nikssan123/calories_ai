import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { EMAIL_UNVERIFIED, type PlanName } from '@ct/shared';
import { registerRoutes } from './routes/index.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerAdminRoutes } from './routes/admin.ts';
import { registerKitchenRoutes } from './routes/kitchen.ts';
import { env } from './env.ts';
import { bearerToken, resolveSession, SESSION_COOKIE } from './services/auth.ts';
import { closeRedis, createRedis } from './services/redis.ts';
import { accountGate } from './services/user.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the session hook; null when the request is anonymous. */
    userId: string | null;
    /**
     * Whether this account has proved its address. Resolved alongside the
     * session because the guard below runs on every request and the two
     * questions are one database read.
     */
    emailVerified: boolean;
    /**
     * What this account is entitled to, from the same read as the two above.
     *
     * It has to be resolved this early rather than in the handlers that care:
     * the per-plan rate limits are evaluated before a route body ever runs, so
     * a plan fetched inside the handler would arrive after the decision it was
     * meant to inform. Anonymous requests read `free`, which costs nothing —
     * every route that consults it demands a session anyway.
     */
    plan: PlanName;
    /**
     * Whether this account's turns run on the Claude Code subscription rather
     * than a metered key — and therefore whether the plan's ceilings apply to
     * it at all. From the same read as the three above.
     *
     * It sits on the request for the same reason `plan` does: the per-plan rate
     * limits are evaluated before any handler runs, so an answer fetched inside
     * one would arrive after the decision it was meant to inform. Anonymous
     * requests read `false`, which is the safe way round.
     */
    unmetered: boolean;
  }
}

/**
 * Builds the server without starting it, so tests can drive it with
 * `app.inject()` and the entrypoint can own the listen/shutdown lifecycle.
 */
export async function buildApp(
  options: {
    logger?: boolean;
    /**
     * Overrides `REDIS_URL` for this instance. The suite uses it to stand up
     * two apps against one Redis, which is the only way to actually observe the
     * property the store exists for — a shared counter is invisible from inside
     * a single process.
     */
    redisUrl?: string | null;
  } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    // Meal photos arrive as base64 in the JSON body.
    bodyLimit: 25 * 1024 * 1024,
    /**
     * Behind a reverse proxy, the socket address is the proxy's. Without this
     * every anonymous request in the world shares one rate-limit bucket, which
     * both removes the ceiling on password guessing and lets one person's typo
     * lock out everyone else.
     */
    trustProxy: env.trustProxy,
  });

  await app.register(cors, {
    /**
     * An allowlist rather than a mirror. `credentials: true` means a browser
     * will attach the session cookie, so reflecting whatever Origin turns up
     * would let any page on the internet make signed-in requests on a visitor's
     * behalf as soon as this API answers on a public hostname.
     *
     * A request with no Origin is allowed through: that is a native app, curl,
     * or a server — none of which CORS governs, and all of which still have to
     * present a session like everyone else.
     */
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      callback(null, env.webOrigins.includes(origin.replace(/\/+$/, '')));
    },
    credentials: true,
  });
  await app.register(cookie);

  /**
   * Rate limiting is off by default and switched on per route. A blanket limit
   * would throttle the dashboard polling that the app does normally; what needs
   * a ceiling is the handful of routes that cost money or guard a password.
   */
  /*
   * Counters go to Redis when there is one, and stay in this process when there
   * is not.
   *
   * Where they live is the whole difference between a limit and a suggestion
   * once the API runs more than once. In-process counters mean each replica
   * enforces the full ceiling on its own, so three replicas serve three times
   * the turns the plan says an account gets — with nothing in any log to say
   * so, because from each process's point of view the limit is being applied
   * exactly as written.
   *
   * Unset stays the right answer for a single-process install, which is what a
   * personal one is. See `services/redis.ts`.
   */
  const redisUrl = options.redisUrl !== undefined ? options.redisUrl : env.redisUrl;
  const redis = redisUrl ? createRedis(redisUrl, app.log) : null;

  await app.register(rateLimit, {
    global: false,
    // A signed-in user is the real subject; fall back to IP for anonymous hits
    // so a login flood cannot be spread across a single shared account.
    keyGenerator: (request: FastifyRequest) => request.userId ?? request.ip,
    addHeaders: { 'retry-after': true, 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true },
    ...(redis ? { redis } : {}),
    /*
     * Fail open. If the store cannot answer, the request goes through
     * unthrottled rather than becoming a 500.
     *
     * This is a deliberate choice about which failure is worse. These limits
     * guard spending and password guessing, and both are better served by a few
     * unthrottled minutes than by an API that refuses everyone because a cache
     * restarted. The plan's other ceilings are not affected either way: the
     * recipe budget is counted off the cost ledger in Postgres, and the
     * per-account turn lease is a column, so neither has a Redis to lose.
     */
    skipOnError: true,
  });

  // Closed with the app so a test, a reload or a shutdown leaves no socket open.
  app.addHook('onClose', async () => {
    await closeRedis(redis);
  });

  /**
   * One-click unsubscribe arrives as a form post.
   *
   * RFC 8058 has the mail client POST `List-Unsubscribe=One-Click` as
   * `application/x-www-form-urlencoded`, and Fastify rejects a content type it
   * has no parser for with a 415 — so without this, Gmail's unsubscribe button
   * fails silently and the recipient reaches for "report spam" instead. The
   * body is discarded on purpose: the signature that authorises the request is
   * in the query string, and nothing a mail client puts in the body is trusted.
   */
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, _body, done) => done(null, {}),
  );

  app.decorateRequest('userId', null);
  app.decorateRequest('emailVerified', false);
  app.decorateRequest('plan', 'free');
  app.decorateRequest('unmetered', false);

  /** Resolve the session on every request; route guards decide what to do with it. */
  app.addHook('onRequest', async (request) => {
    // Both transports carry the same kind of token and resolve identically, so
    // nothing downstream of here knows which one arrived. The header wins when
    // a request somehow has both, because a client attaches it deliberately
    // while a browser sends its cookie on every request whether it meant to or
    // not — the explicit credential is the one that expresses an intent.
    const token = bearerToken(request.headers.authorization) ?? request.cookies[SESSION_COOKIE];
    const userId = token ? await resolveSession(token) : null;
    const gate = userId ? await accountGate(userId) : null;
    // A suspended account is treated as signed out rather than having its
    // sessions merely revoked, so a cookie minted before the suspension — or
    // one from a device that never came back — stops working immediately.
    request.userId = gate?.disabled ? null : userId;
    request.emailVerified = gate?.verified ?? false;
    request.plan = gate?.plan ?? 'free';
    request.unmetered = gate?.unmetered ?? false;
  });

  // `/photos/` is public because a signed URL carries its own authorisation and
  // an <img> cannot send a session — the route checks the signature itself, and
  // still demands a session when there isn't one. `/email/` is public for the
  // same reason and more sharply: an unsubscribe link is followed from a mail
  // client by someone who wants *less* from us, and making them sign in first
  // to be left alone is how a sender earns a spam complaint.
  //
  // The billing entry is the full route rather than a `/billing/` prefix, and
  // deliberately so: a store's webhook has to arrive without a session, but
  // anything else under `/billing` — what a person is paying, when it renews —
  // is theirs and must stay behind one. A prefix here would make the next route
  // added to that namespace public by default, which is the wrong way round for
  // the part of the product that touches money.
  const PUBLIC_PREFIXES = [
    '/health',
    '/auth/',
    '/photos/',
    '/email/',
    '/billing/revenuecat',
  ];

  /**
   * The one thing an unconfirmed account may still do: leave.
   *
   * Everything else waits for the code, but refusing this would strand someone
   * with an account they can neither use nor be rid of — over a typo in their
   * own address, which is the likeliest reason the code never arrived. Both
   * app stores also require deletion to be reachable from inside the product,
   * and "reachable unless you mistyped your email" is not that.
   *
   * It is safe to allow because it proves who is asking on its own terms: the
   * route re-checks the password before it destroys anything.
   */
  function escapeHatch(request: FastifyRequest): boolean {
    return request.method === 'DELETE' && request.url.split('?')[0] === '/account';
  }

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') return;
    if (PUBLIC_PREFIXES.some((prefix) => request.url.startsWith(prefix))) return;
    if (request.userId === null) {
      return reply.status(401).send({ error: 'Not signed in.' });
    }

    /*
     * A session, but an address nobody has proved.
     *
     * The account exists and is signed in — it has to be, or there would be no
     * way to scope the six-digit code to it — but nothing else in the product
     * opens until the code is entered. Everything needed to *get past* this
     * lives under `/auth/`, which is public and so never reaches here: reading
     * the session, submitting the code, asking for another, signing out.
     *
     * 403 with a machine-readable `code`, not a bare 401. The client has a
     * perfectly good session and must not throw it away and bounce to the sign-
     * in screen — it needs to show the verification screen instead, and it can
     * only tell the two apart if this says which one it is.
     */
    if (!request.emailVerified && !escapeHatch(request)) {
      return reply.status(403).send({
        error: 'Confirm your email address to continue.',
        code: EMAIL_UNVERIFIED,
      });
    }
  });

  await registerAuthRoutes(app);
  await registerAdminRoutes(app);
  await registerKitchenRoutes(app);
  await registerRoutes(app);

  return app;
}
