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
 * A key is present so the `anthropic` lane can authenticate without one:
 * `subscriptionAuthError` accepts either credential, and with the login mocked
 * away below the key is the one left. Nothing reaches the network — `query` is
 * mocked above.
 */
process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used';

/**
 * Nobody in the suite is signed into Claude Code, whatever the machine says.
 *
 * Whether the developer happens to have `~/.claude/.credentials.json` must not
 * change what a single test asserts, and it now would: `unmeteredFor` lifts
 * every plan ceiling on a deployment whose lane is `anthropic` — which is the
 * suite's, by default — as soon as a login exists. Signed in, the whole of
 * `plans.test.ts` would assert against an account with no meters; in CI it
 * would pass. That is the worst available split.
 *
 * This used to fall out of the key above, back when a key in the environment
 * beat a login on disk everywhere. `subscriptionEnv` ended that, so the
 * guarantee has to be made rather than inherited. Tests about the credential
 * itself — `lanes.test.ts`, `wiring.test.ts` — mock or re-import over this.
 */
vi.mock('../../src/ai/client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/ai/client.ts')>()),
  hasSubscriptionAuth: () => false,
}));

/**
 * Reference data, carried across the truncate that would otherwise destroy it.
 *
 * `exercise_types` is a catalogue rather than user data — it ships with the app
 * and a fresh deployment gets it from `pnpm migrate` alone. But it references
 * `users`, and `TRUNCATE users CASCADE` empties the whole of a referencing
 * table rather than the rows that pointed at the deleted ones, so the built-ins
 * go with the custom ones. Dropping that foreign key would fix the tests and
 * lose real referential integrity, which is the wrong trade.
 *
 * So the rows are read out of the database once and put back after each reset.
 * Reading them rather than replaying the migration that inserted them is what
 * makes this maintain itself: a later migration adding fifty more exercises
 * needs no change here, because by the time the suite starts they are simply
 * rows in the table like any other. Only a brand-new reference *table* needs a
 * line below.
 */
const REFERENCE_TABLES: { table: string; where: string }[] = [
  { table: 'exercise_types', where: 'user_id IS NULL' },
];

/**
 * Captured before the first truncate of the run, when the schema is freshly
 * migrated and nothing has had a chance to touch it.
 */
let reference: Map<string, Record<string, unknown>[]> | null = null;

async function captureReferenceData(): Promise<void> {
  if (reference) return;
  reference = new Map();
  for (const { table, where } of REFERENCE_TABLES) {
    // Table and predicate are our own constants, never input.
    reference.set(table, await query(`SELECT * FROM ${table} WHERE ${where}`));
  }
}

async function restoreReferenceData(): Promise<void> {
  for (const [table, rows] of reference ?? []) {
    if (rows.length === 0) continue;
    const columns = Object.keys(rows[0]!);
    const params: unknown[] = [];
    const tuples = rows.map(
      (row) => `(${columns.map((c) => `$${params.push(row[c])}`).join(', ')})`,
    );
    await query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`, params);
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
  // Before the truncate, or there would be nothing left to capture.
  await captureReferenceData();
  await truncateAll();
  await restoreReferenceData();
});

afterAll(async () => {
  await pool.end();
});
