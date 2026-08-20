import { afterAll, beforeEach, vi } from 'vitest';
import { pool, query } from '../../src/db.ts';
import { resetAgent } from './agent-mock.ts';
import { resetMailbox } from './email.ts';
import { forgetSecrets } from '../../src/services/secrets.ts';

/**
 * The Agent SDK is replaced everywhere. `tool` and `createSdkMcpServer` stay
 * real so the in-process MCP server under test is the one that ships; only the
 * call that would spawn `claude` is scripted.
 */
vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/claude-agent-sdk')>();
  const { runScripted } = await import('./agent-mock.ts');
  return { ...actual, query: (args: any) => runScripted(args) };
});

/**
 * A key is present so `hasSubscriptionAuth()` is not consulted: whether the
 * developer happens to be signed into Claude Code must not change what the
 * suite asserts. Nothing reaches the network — `query` is mocked above.
 */
process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used';

/** Everything except the migration ledger. Discovered so new tables are covered. */
async function truncateAll(): Promise<void> {
  const tables = await query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

beforeEach(async () => {
  resetAgent();
  resetMailbox();
  // `app_secrets` is truncated with everything else, so a cached signing key
  // would outlive the row it came from — harmless until a test asserts that a
  // signature made in one case is rejected in the next.
  forgetSecrets();
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});
