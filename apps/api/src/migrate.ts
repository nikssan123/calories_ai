import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { isEntrypoint, runAsScript } from './cli.ts';
import { pool } from './db.ts';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export interface MigrationResult {
  applied: string[];
  alreadyApplied: number;
}

/**
 * Applies every unapplied migration, each in its own transaction. Exported so
 * the test suite can build a schema without shelling out.
 */
export async function runMigrations(target: pg.Pool = pool): Promise<MigrationResult> {
  await target.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await target.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await target.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  return { applied: ran, alreadyApplied: applied.size };
}

/**
 * The CLI body. It does not close the pool — that belongs to the entrypoint
 * below, so importing this module from a test stays inert.
 */
export async function main(): Promise<void> {
  const { applied } = await runMigrations();
  for (const file of applied) console.log(`applied ${file}`);
  console.log(
    applied.length === 0 ? 'database already up to date' : `applied ${applied.length} migration(s)`,
  );
}

if (isEntrypoint(import.meta.url)) void runAsScript(main, () => pool.end());
