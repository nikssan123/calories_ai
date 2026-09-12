import { buildApp } from './app.ts';
import { ensureDirectories, env } from './env.ts';
import { pool } from './db.ts';
import { startScheduler } from './scheduler.ts';
import { purgeExpiredSessions } from './services/auth.ts';
import { purgeExpiredTokens } from './services/tokens.ts';
import { authDescription, AUTH_HELP, hasSubscriptionAuth } from './ai/client.ts';
import { reconcileAbandonedJobs } from './services/content.ts';

await ensureDirectories();

const app = await buildApp();

/*
 * A content batch still marked running is a lie left by the previous process —
 * a deploy or a crash killed the loop between languages. The posts it had
 * already written are safe, because each commits on its own; it is the row that
 * is stale, and left alone it would tell the panel a run was in flight forever.
 */
const abandoned = await reconcileAbandonedJobs();
if (abandoned > 0) app.log.warn(`marked ${abandoned} interrupted content batch(es) as failed`);

// Expired rows are harmless but unbounded; clear them out periodically. Spent
// reset and confirmation links go the same way, on the same schedule.
const purgeTimer = setInterval(() => {
  void purgeExpiredSessions();
  void purgeExpiredTokens();
}, 6 * 60 * 60 * 1000);
purgeTimer.unref();

// Weekly reviews. The tick is hourly and asks each user's own clock whether
// their week has turned over, so one process serves every timezone.
//
// Started only where speaking unasked is the job. See `env.schedulerEnabled`:
// a laptop pointed at a seed database would otherwise write and mail a weekly
// review, every Monday, for eight people who are not real.
const stopScheduler = env.schedulerEnabled ? startScheduler(app.log) : () => {};
if (!env.schedulerEnabled) {
  app.log.info('scheduler off (SCHEDULER=on to run reviews, nudges and alerts here)');
}

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
