import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ensureDirectories, env } from './env.ts';
import { pool } from './db.ts';
import { registerRoutes } from './routes/index.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { purgeExpiredSessions, resolveSession, SESSION_COOKIE } from './services/auth.ts';
import { authDescription, AUTH_HELP, hasSubscriptionAuth } from './ai/client.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the session hook; null when the request is anonymous. */
    userId: string | null;
  }
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  // Meal photos arrive as base64 in the JSON body.
  bodyLimit: 25 * 1024 * 1024,
});

await ensureDirectories();

await app.register(cors, {
  // Credentials mode requires an explicit origin rather than a wildcard.
  origin: (origin, callback) => callback(null, origin ?? true),
  credentials: true,
});
await app.register(cookie);

app.decorateRequest('userId', null);

/** Resolve the session on every request; route guards decide what to do with it. */
app.addHook('onRequest', async (request) => {
  const token = request.cookies[SESSION_COOKIE];
  request.userId = token ? await resolveSession(token) : null;
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
await registerRoutes(app);

// Expired rows are harmless but unbounded; clear them out periodically.
const purgeTimer = setInterval(() => void purgeExpiredSessions(), 6 * 60 * 60 * 1000);
purgeTimer.unref();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  clearInterval(purgeTimer);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: env.port, host: '0.0.0.0' });

if (hasSubscriptionAuth() || process.env.ANTHROPIC_API_KEY) {
  app.log.info(`chat auth: ${authDescription()}`);
} else {
  app.log.warn(`${AUTH_HELP} /chat will return 503 until then.`);
}
