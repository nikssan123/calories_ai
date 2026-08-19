import { buildApp } from './app.ts';
import { ensureDirectories, env } from './env.ts';
import { pool } from './db.ts';
import { startScheduler } from './scheduler.ts';
import { purgeExpiredSessions } from './services/auth.ts';
import { authDescription, AUTH_HELP, hasSubscriptionAuth } from './ai/client.ts';

await ensureDirectories();

const app = await buildApp();

// Expired rows are harmless but unbounded; clear them out periodically.
const purgeTimer = setInterval(() => void purgeExpiredSessions(), 6 * 60 * 60 * 1000);
purgeTimer.unref();

// Weekly reviews. The tick is hourly and asks each user's own clock whether
// their week has turned over, so one process serves every timezone.
const stopScheduler = startScheduler(app.log);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  clearInterval(purgeTimer);
  stopScheduler();
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
