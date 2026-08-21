import type { ShoppingExtra, ShoppingExtraInput, ShoppingExtraUpdate } from '@ct/shared';
import { query, queryOne } from '../db.ts';

/**
 * The written half of the shopping list.
 *
 * `shoppingListFor` derives everything else from the planned week, and that
 * derivation is the reason the list is trustworthy — swap a Tuesday and the
 * list changes with it, because there was never a stored copy to disagree. It
 * is also the reason the list could not hold kitchen roll: a projection of
 * recipe ingredients contains ingredients and nothing else.
 *
 * So this is stored, and nothing else about the list is. Everything here is
 * built around keeping the two halves apart: a row in this table is never
 * derived from a plan, never invalidated by one, and never rewritten by a swap.
 */

/**
 * How many lines somebody may have waiting at once.
 *
 * Flat rather than per-plan, unlike the pantry cap. That one is a usability
 * ceiling on the main input to every recipe the app writes, and it is worth
 * more on Pro because a bigger kitchen genuinely produces better answers. This
 * costs nothing, improves nothing, and is here only so a runaway loop cannot
 * write a hundred thousand rows — which is not a thing to charge for.
 */
export const MAX_SHOPPING_EXTRAS = 100;

/**
 * The lines to show against a week.
 *
 * Two rules, and the asymmetry between them is deliberate. Anything still
 * pending shows on the week it was written for and on every week after it,
 * because needing something does not expire on a Sunday night. Anything ticked
 * off shows only on the week it was written for, because the single reason to
 * keep drawing a bought item is the shop it was ticked during — carrying it
 * forward would mean opening next week to a list of things already in a
 * cupboard.
 */
export async function listExtras(userId: string, weekStart: string): Promise<ShoppingExtra[]> {
  const rows = await query<any>(
    `SELECT id, name, quantity_desc, week_start, bought_at, created_at
       FROM shopping_extras
      WHERE user_id = $1
        AND week_start <= $2
        AND (bought_at IS NULL OR week_start = $2)
   ORDER BY lower(name) ASC`,
    [userId, weekStart],
  );
  return rows.map(toExtra);
}

/**
 * Writes lines, or refreshes ones already waiting.
 *
 * Upsert for the same reason the pantry upserts: the commonest way to write a
 * name is to write one already there, and two rows called "Milk" and "milk" is
 * how a list stops being read. An incoming quantity wins only when it says
 * something, so re-adding a bare "milk" does not erase "2 litres" typed last
 * week.
 *
 * A conflict also drags the row forward onto the newer week. Nothing visible
 * changes while it is pending — it was already carrying forward — but it means
 * a line rewritten in April and then ticked off is drawn against April rather
 * than against the March it was first thought of in.
 */
export async function addExtras(
  userId: string,
  weekStart: string,
  items: ShoppingExtraInput[],
): Promise<ShoppingExtra[]> {
  // Deduplicate within the batch: Postgres refuses to update one row twice in a
  // single INSERT ... ON CONFLICT, and "milk, bread, milk" is an ordinary thing
  // for somebody to type in one go.
  const seen = new Map<string, ShoppingExtraInput>();
  for (const item of items) {
    const name = item.name.trim();
    if (name) seen.set(name.toLowerCase(), { ...item, name });
  }
  const batch = [...seen.values()];
  if (batch.length === 0) return listExtras(userId, weekStart);

  // Only genuinely new names count against the cap, so re-confirming a full
  // list is never blocked. Ticked-off rows do not count at all — they are
  // history, and the cap is about what is waiting.
  const pending = await query<{ name: string }>(
    'SELECT name FROM shopping_extras WHERE user_id = $1 AND bought_at IS NULL',
    [userId],
  );
  const known = new Set(pending.map((row) => row.name.toLowerCase()));
  const additions = batch.filter((item) => !known.has(item.name.toLowerCase()));
  if (pending.length + additions.length > MAX_SHOPPING_EXTRAS) {
    throw new ShoppingListFullError(MAX_SHOPPING_EXTRAS);
  }

  const values: string[] = [];
  const params: unknown[] = [userId, weekStart];
  for (const item of batch) {
    const base = params.length;
    params.push(item.name, item.quantity_desc ?? null);
    values.push(`($1, $${base + 1}, $${base + 2}, $2)`);
  }

  await query(
    `INSERT INTO shopping_extras (user_id, name, quantity_desc, week_start)
     VALUES ${values.join(', ')}
     ON CONFLICT (user_id, lower(name)) WHERE bought_at IS NULL
     DO UPDATE
        SET quantity_desc = COALESCE(EXCLUDED.quantity_desc, shopping_extras.quantity_desc),
            week_start    = GREATEST(shopping_extras.week_start, EXCLUDED.week_start)`,
    params,
  );

  return listExtras(userId, weekStart);
}

export async function getExtra(userId: string, id: string): Promise<ShoppingExtra | null> {
  const row = await queryOne<any>(
    `SELECT id, name, quantity_desc, week_start, bought_at, created_at
       FROM shopping_extras WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return row ? toExtra(row) : null;
}

/** Ticking one off, putting it back, or correcting what it says. */
export async function updateExtra(
  userId: string,
  id: string,
  patch: ShoppingExtraUpdate,
): Promise<ShoppingExtra | null> {
  /*
   * Putting a line back on the list when the same name is already on it.
   *
   * Reachable in four taps — write "milk", tick it, write "milk" again, untick
   * the first — and the partial unique index would answer it with a 23505 and a
   * 500. There is nothing to reconcile: the pending row already says exactly
   * what the untick was asking for, so the ticked one is dropped and that row
   * is what comes back.
   */
  if (patch.bought === false) {
    const clash = await queryOne<{ id: string }>(
      `SELECT e.id FROM shopping_extras e
         WHERE e.user_id = $1 AND e.bought_at IS NULL AND e.id <> $2
           AND lower(e.name) = (SELECT lower(name) FROM shopping_extras WHERE id = $2 AND user_id = $1)`,
      [userId, id],
    );
    if (clash) {
      await deleteExtra(userId, id);
      return getExtra(userId, clash.id);
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.name !== undefined) push('name', patch.name.trim());
  if (patch.quantity_desc !== undefined) push('quantity_desc', patch.quantity_desc);
  if (patch.bought !== undefined) sets.push(`bought_at = ${patch.bought ? 'now()' : 'NULL'}`);

  if (sets.length === 0) return getExtra(userId, id);

  params.push(id, userId);
  const row = await queryOne<any>(
    `UPDATE shopping_extras SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND user_id = $${params.length}
  RETURNING id, name, quantity_desc, week_start, bought_at, created_at`,
    params,
  );
  return row ? toExtra(row) : null;
}

export async function deleteExtra(userId: string, id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    'DELETE FROM shopping_extras WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId],
  );
  return row !== null;
}

/** Raised rather than returned, because a full list is a 409 and not a list. */
export class ShoppingListFullError extends Error {
  constructor(readonly limit: number) {
    super(`Your shopping list is full at ${limit} written lines. Tick a few off to add more.`);
    this.name = 'ShoppingListFullError';
  }
}

function toExtra(row: any): ShoppingExtra {
  return {
    id: row.id,
    name: row.name,
    quantity_desc: row.quantity_desc,
    week_start: String(row.week_start).slice(0, 10),
    bought: row.bought_at !== null,
    created_at: new Date(row.created_at).toISOString(),
  };
}
