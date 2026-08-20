import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { registerRoutes } from './routes/index.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerAdminRoutes } from './routes/admin.ts';
import { bearerToken, resolveSession, SESSION_COOKIE } from './services/auth.ts';
import { isDisabled } from './services/admin.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the session hook; null when the request is anonymous. */
    userId: string | null;
  }
}

/**
 * Builds the server without starting it, so tests can drive it with
 * `app.inject()` and the entrypoint can own the listen/shutdown lifecycle.
 */
export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    // Meal photos arrive as base64 in the JSON body.
    bodyLimit: 25 * 1024 * 1024,
  });

  await app.register(cors, {
    // Credentials mode requires an explicit origin rather than a wildcard.
    origin: (origin, callback) => callback(null, origin ?? true),
    credentials: true,
  });
  await app.register(cookie);

  /**
   * Rate limiting is off by default and switched on per route. A blanket limit
   * would throttle the dashboard polling that the app does normally; what needs
   * a ceiling is the handful of routes that cost money or guard a password.
   */
  await app.register(rateLimit, {
    global: false,
    // A signed-in user is the real subject; fall back to IP for anonymous hits
    // so a login flood cannot be spread across a single shared account.
    keyGenerator: (request: FastifyRequest) => request.userId ?? request.ip,
    addHeaders: { 'retry-after': true, 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true },
  });

  app.decorateRequest('userId', null);

  /** Resolve the session on every request; route guards decide what to do with it. */
  app.addHook('onRequest', async (request) => {
    // Both transports carry the same kind of token and resolve identically, so
    // nothing downstream of here knows which one arrived. The header wins when
    // a request somehow has both, because a client attaches it deliberately
    // while a browser sends its cookie on every request whether it meant to or
    // not — the explicit credential is the one that expresses an intent.
    const token = bearerToken(request.headers.authorization) ?? request.cookies[SESSION_COOKIE];
    const userId = token ? await resolveSession(token) : null;
    // A suspended account is treated as signed out rather than having its
    // sessions merely revoked, so a cookie minted before the suspension — or
    // one from a device that never came back — stops working immediately.
    request.userId = userId && (await isDisabled(userId)) ? null : userId;
  });

  const PUBLIC_PREFIXES = ['/health', '/auth/'];

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') return;
    if (PUBLIC_PREFIXES.some((prefix) => request.url.startsWith(prefix))) return;
    if (request.userId === null) {
      return reply.status(401).send({ error: 'Not signed in.' });
    }
  });

  await registerAuthRoutes(app);
  await registerAdminRoutes(app);
  await registerRoutes(app);

  return app;
}
