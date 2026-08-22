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
 * The lock every booting process queues on before it touches the schema.
 *
 * Migrations run on container boot — see `docker/api.Dockerfile` — so with two
 * replicas the same image starts twice at once and both processes read an empty
 * `schema_migrations`, both decide migration N is unapplied, and both run it.
 * One commits; the other fails, takes the CMD's `&&` chain down with it and
 * restarts. It recovers on the retry, which is precisely what makes it worth
 * fixing now: the symptom is a replica that flaps once per deploy rather than
 * one that stays down, and that is the kind of thing a deploy learns to ignore.
 *
 * Blocking rather than `pg_try_advisory_lock`, which is the opposite of the
 * choice `job-lock.ts` makes, for the opposite reason: a background pass that
 * is already running wants skipping, but a replica that skipped its migrations
 * would go on to serve traffic against a schema it does not know is current.
 * The second replica waits the length of the migration and then finds nothing
 * to do.
 *
 * `hashtext` matches how `job-lock.ts` derives its keys — advisory locks share
 * one bigint namespace per database, so the two must not collide by accident.
 */
const MIGRATION_LOCK = 'schema-migrations';

/**
 * Applies every unapplied migration, each in its own transaction. Exported so
 * the test suite can build a schema without shelling out.
 *
 * Everything after the lock is inside it, the read of `schema_migrations`
 * included: reading which migrations are applied *before* waiting would answer
 * the question with the state from before the other replica's work, which is
 * the race this is here to close. Even the `CREATE TABLE IF NOT EXISTS` belongs
 * inside — run concurrently it does not merely no-op, it can fail on a
 * duplicate-key error against the system catalogue.
 */
export async function runMigrations(target: pg.Pool = pool): Promise<MigrationResult> {
  const lock = await target.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(hashtext($1)::bigint)', [MIGRATION_LOCK]);
    try {
      return await applyMigrations(target);
    } finally {
      // An advisory lock is held by the session, so a connection returned to
      // the pool still holding one would keep every other replica waiting until
      // the pool happened to discard it.
      await lock.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [MIGRATION_LOCK]);
    }
  } finally {
    lock.release();
  }
}

/** The migration run itself, with `MIGRATION_LOCK` already held. */
async function applyMigrations(target: pg.Pool): Promise<MigrationResult> {
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
