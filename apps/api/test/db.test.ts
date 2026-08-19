import { describe, expect, it } from 'vitest';
import { query, queryOne, transaction } from '../src/db.ts';

describe('query helpers', () => {
  it('returns rows and passes parameters', async () => {
    expect(await query<{ n: number }>('SELECT $1::int AS n', [7])).toEqual([{ n: 7 }]);
  });

  it('returns the first row, or null when there is none', async () => {
    expect(await queryOne<{ n: number }>('SELECT 1 AS n')).toEqual({ n: 1 });
    expect(await queryOne('SELECT 1 WHERE FALSE')).toBeNull();
  });

  /**
   * Postgres hands NUMERIC back as a string to preserve precision. Every numeric
   * column here is a nutrition value well inside float range, and a string
   * leaking into the totals would silently concatenate instead of adding.
   */
  it('parses NUMERIC to a number', async () => {
    const row = await queryOne<{ v: number }>("SELECT 12.5::numeric AS v");
    expect(row!.v).toBe(12.5);
    expect(typeof row!.v).toBe('number');
  });

  it('leaves DATE as a YYYY-MM-DD string rather than a local-midnight Date', async () => {
    const row = await queryOne<{ d: string }>("SELECT '2026-03-10'::date AS d");
    expect(row!.d).toBe('2026-03-10');
  });
});

describe('transaction', () => {
  it('commits when the callback resolves', async () => {
    await transaction(async (client) => {
      await client.query("CREATE TEMP TABLE tx_commit (v int)");
      await client.query('INSERT INTO tx_commit VALUES (1)');
    });
    // A temp table lives on the connection, so only its own client can see it —
    // the observable effect here is simply that nothing threw.
    await expect(transaction(async () => 'value')).resolves.toBe('value');
  });

  it('rolls back and rethrows when the callback fails', async () => {
    await query('CREATE TABLE IF NOT EXISTS tx_probe (v int)');
    await query('DELETE FROM tx_probe');

    await expect(
      transaction(async (client) => {
        await client.query('INSERT INTO tx_probe VALUES (1)');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await query('SELECT * FROM tx_probe')).toEqual([]);
    await query('DROP TABLE tx_probe');
  });
});
