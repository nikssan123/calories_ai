import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/**
 * Reference data that a migration inserted, restored after each truncate.
 *
 * `exercise_types` is a catalogue, not user data — it ships with the app and a
 * fresh deployment gets it from `pnpm migrate` alone. But `TRUNCATE users
 * CASCADE` empties the whole of any table referencing users, not just the rows
 * that pointed at them, so the built-ins go with the custom ones.
 *
 * Re-running the migration's own INSERT keeps one source of truth: a catalogue
 * added to in a later migration turns up here without anyone remembering to
 * copy it.
 */
const REFERENCE_MIGRATIONS = ['015_exercise_catalogue.sql'];

async function restoreReferenceData(): Promise<void> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
  for (const file of REFERENCE_MIGRATIONS) {
    await query(await readFile(join(dir, file), 'utf8'));
  }
}

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
  await restoreReferenceData();
});

afterAll(async () => {
  await pool.end();
});
