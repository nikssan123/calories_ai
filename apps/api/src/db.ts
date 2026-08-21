import pg from 'pg';
import { env } from './env.ts';

// Postgres returns NUMERIC as a string to preserve precision. Every numeric
// column here is a nutrition value well inside float range, so parse to number
// and keep the rest of the codebase free of string-vs-number bugs.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// DATE columns should stay 'YYYY-MM-DD' strings, not become local-midnight Dates.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

/**
 * Connections per process, stated rather than defaulted.
 *
 * `pg` defaults to ten, which reads as a global ceiling and is not one — it is
 * ten *per replica*, so the number Postgres actually sees is this times however
 * many API processes are running, plus the scheduler's. Leaving it implicit is
 * how a deployment that scaled out perfectly happily runs into
 * `max_connections` instead, and the error arrives at whichever query was
 * unlucky rather than at the thing that caused it.
 *
 * Ten is still the right number for one box. It is configuration because the
 * right number is a function of the deployment, and the deployment is the thing
 * that changes.
 */
const POOL_MAX = Number(process.env.DATABASE_POOL_MAX ?? 10);

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: Number.isFinite(POOL_MAX) && POOL_MAX > 0 ? POOL_MAX : 10,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params as never[]);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
