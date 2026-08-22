import { describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { env } from '../src/env.ts';
import { main, runMigrations } from '../src/migrate.ts';
import { query } from '../src/db.ts';

describe('runMigrations', () => {
  it('is idempotent — a second run applies nothing', async () => {
    const result = await runMigrations();
    expect(result.applied).toEqual([]);
    expect(result.alreadyApplied).toBeGreaterThan(0);
  });

  it('has recorded every migration file in the ledger', async () => {
    const { readdir } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const rows = await query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(files);
  });

  it('builds the whole schema from empty', async () => {
    const url = new URL(env.databaseUrl);
    const database = `${url.pathname.slice(1)}_scratch`;

    const adminUrl = new URL(url.toString());
    adminUrl.pathname = '/postgres';
    const admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.query(`CREATE DATABASE "${database}"`);
    await admin.end();

    const scratchUrl = new URL(url.toString());
    scratchUrl.pathname = `/${database}`;
    const pool = new pg.Pool({ connectionString: scratchUrl.toString() });
    try {
      const result = await runMigrations(pool);
      expect(result.applied.length).toBeGreaterThan(0);
      expect(result.alreadyApplied).toBe(0);

      const { rows } = await pool.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      );
      expect(rows.map((r) => r.tablename)).toEqual(
        expect.arrayContaining([
          'auth_sessions',
          'chat_messages',
          'exercise_entries',
          'food_entries',
          'food_items',
          'photos',
          'targets',
          'users',
          'weekly_reviews',
          'weight_entries',
        ]),
      );

      // Migration 001 seeds the placeholder row the first signup adopts.
      const users = await pool.query('SELECT * FROM users');
      expect(users.rowCount).toBe(1);

      // A second run over the same database is a no-op.
      expect((await runMigrations(pool)).applied).toEqual([]);
    } finally {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: adminUrl.toString() });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS "${database}"`);
      await cleanup.end();
    }
  });

  it('lets two replicas boot at once — one migrates, the other waits and finds nothing', async () => {
    const url = new URL(env.databaseUrl);
    const database = `${url.pathname.slice(1)}_concurrent`;

    const adminUrl = new URL(url.toString());
    adminUrl.pathname = '/postgres';
    const admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.query(`CREATE DATABASE "${database}"`);
    await admin.end();

    const scratchUrl = new URL(url.toString());
    scratchUrl.pathname = `/${database}`;

    // Two pools rather than one, because two replicas are two processes: an
    // advisory lock is held by a session, so sharing a pool would not be the
    // thing being tested.
    const first = new pg.Pool({ connectionString: scratchUrl.toString() });
    const second = new pg.Pool({ connectionString: scratchUrl.toString() });

    try {
      // Started together and neither awaited first — before the lock this threw
      // from whichever one lost, which on a real host is a replica exiting its
      // boot chain and restarting.
      const [a, b] = await Promise.all([runMigrations(first), runMigrations(second)]);

      const [winner, loser] = a.applied.length > 0 ? [a, b] : [b, a];
      expect(winner.applied.length).toBeGreaterThan(0);
      expect(winner.alreadyApplied).toBe(0);

      // The waiter read the ledger after the lock, so it saw the finished work.
      expect(loser.applied).toEqual([]);
      expect(loser.alreadyApplied).toBe(winner.applied.length);

      // Applied once each, not twice: the ledger is the proof.
      const { rows } = await first.query<{ name: string; n: string }>(
        'SELECT name, count(*) AS n FROM schema_migrations GROUP BY name HAVING count(*) > 1',
      );
      expect(rows).toEqual([]);

      // And the lock was handed back — a third run must not block on a
      // connection that went home to the pool still holding it.
      expect((await runMigrations(first)).applied).toEqual([]);
    } finally {
      await first.end();
      await second.end();
      const cleanup = new pg.Client({ connectionString: adminUrl.toString() });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS "${database}"`);
      await cleanup.end();
    }
  });
});

describe('failure handling', () => {
  it('rolls back and names the migration that failed', async () => {
    const { writeFile, rm } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');

    // A deliberately broken migration, named so it sorts last, run against a
    // throwaway database and deleted again afterwards.
    const { fileURLToPath } = await import('node:url');
    const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
    const broken = join(migrations, '999_broken.sql');
    await writeFile(broken, 'CREATE TABLE ok_before_failure (v int); SELECT * FROM nope;');

    const url = new URL(env.databaseUrl);
    const database = `${url.pathname.slice(1)}_broken`;
    const adminUrl = new URL(url.toString());
    adminUrl.pathname = '/postgres';

    const admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.query(`CREATE DATABASE "${database}"`);
    await admin.end();

    const scratchUrl = new URL(url.toString());
    scratchUrl.pathname = `/${database}`;
    const pool = new pg.Pool({ connectionString: scratchUrl.toString() });

    try {
      await expect(runMigrations(pool)).rejects.toThrow(/Migration 999_broken\.sql failed/);

      // The whole file was one transaction, so its earlier statement is gone too.
      const { rows } = await pool.query(
        "SELECT tablename FROM pg_tables WHERE tablename = 'ok_before_failure'",
      );
      expect(rows).toEqual([]);

      // And it was not recorded as applied, so a fixed version will run.
      const ledger = await pool.query("SELECT name FROM schema_migrations WHERE name = '999_broken.sql'");
      expect(ledger.rowCount).toBe(0);
    } finally {
      await rm(broken, { force: true });
      await pool.end();
      const cleanup = new pg.Client({ connectionString: adminUrl.toString() });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS "${database}"`);
      await cleanup.end();
    }
  });
});

describe('the CLI body', () => {
  it('reports that the database is already up to date', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await main();
      expect(log).toHaveBeenCalledWith('database already up to date');
    } finally {
      log.mockRestore();
    }
  });
});
