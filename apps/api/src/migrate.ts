import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from './db.ts';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name),
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
      ran += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  console.log(ran === 0 ? 'database already up to date' : `applied ${ran} migration(s)`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
