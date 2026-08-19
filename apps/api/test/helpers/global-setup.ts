import pg from 'pg';
import { readEnv } from '../../src/env.ts';

/**
 * Creates the `_test` database once per run and brings its schema up to date.
 *
 * `readEnv` forces the `_test` suffix whenever NODE_ENV is test, so the name
 * used here is the same one the suite will later truncate — there is no path
 * through which this points at the development database.
 */
export default async function setup() {
  const env = readEnv({ ...process.env, NODE_ENV: 'test' });
  const url = new URL(env.databaseUrl);
  const database = url.pathname.slice(1);

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (rowCount === 0) {
      // Identifiers cannot be parameterised; the name is derived from our own
      // config, not from user input, and is quoted regardless.
      await admin.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }

  const { runMigrations } = await import('../../src/migrate.ts');
  const pool = new pg.Pool({ connectionString: env.databaseUrl });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
