import type { PantryItem, PantryItemInput, PantryUpdate, PlanName } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { limitsFor } from './plans.ts';

/**
 * The pantry: what the user says is in their kitchen.
 *
 * Everything here is built around one decision, which is that this is a memory
 * rather than an inventory. Nothing decrements when a recipe is cooked, no
 * quantity is tracked as a number, and an item's age is carried to the screen
 * instead of being cleaned up behind it. A pantry that presents three-week-old
 * data as current is worse than no pantry at all: it puts a meal together out
 * of something that was thrown out, confidently.
 */

/** Past this, an item is old enough that the model should treat it as a maybe. */
export const STALE_AFTER_DAYS = 10;

export async function listPantry(userId: string): Promise<PantryItem[]> {
  const rows = await query<any>(
    `SELECT id, name, quantity_desc, is_staple, last_seen_at, source
       FROM pantry_items
      WHERE user_id = $1
   ORDER BY is_staple ASC, last_seen_at DESC, lower(name) ASC`,
    [userId],
  );
  return rows.map(toItem);
}

/**
 * Adds or refreshes items in one statement.
 *
 * Upsert rather than insert because the commonest path into this function is a
 * fridge scan, and a fridge scanned twice in a fortnight reads the same eggs
 * both times. Two rows called "Eggs" and "eggs" is the failure that makes a
 * pantry unusable within a month, so the unique index is on `lower(name)` and
 * a second sighting refreshes `last_seen_at` instead of stacking up.
 *
 * On a conflict the incoming `quantity_desc` wins only when it says something:
 * a scan that can see there is a carton but not how full it is should not
 * erase "about half a dozen left" that the user typed last week.
 */
export async function addPantryItems(
  userId: string,
  plan: PlanName,
  items: PantryItemInput[],
  unmetered = false,
): Promise<PantryItem[]> {
  if (items.length === 0) return listPantry(userId);

  // Deduplicate within the batch too. Postgres refuses to update the same row
  // twice in one INSERT ... ON CONFLICT, and a model listing "peppers" twice
  // for two shelves is an ordinary thing for it to do — not an error worth
  // failing someone's scan over.
  const seen = new Map<string, PantryItemInput>();
  for (const item of items) {
    const name = item.name.trim();
    if (name) seen.set(name.toLowerCase(), { ...item, name });
  }
  const batch = [...seen.values()];

  // Only genuinely new names count against the cap, so re-confirming a full
  // pantry — which is most of what a second scan does — is never blocked.
  const existing = await listPantry(userId);
  const known = new Set(existing.map((i) => i.name.toLowerCase()));
  const additions = batch.filter((i) => !known.has(i.name.toLowerCase()));

  const limit = limitsFor(plan, unmetered).pantryItems;
  if (existing.length + additions.length > limit) throw new PantryFullError(limit);

  const values: string[] = [];
  const params: unknown[] = [userId];
  for (const item of batch) {
    const base = params.length;
    params.push(item.name, item.quantity_desc ?? null, item.is_staple ?? false, item.source ?? 'typed');
    values.push(`($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
  }

  await query(
    `INSERT INTO pantry_items (user_id, name, quantity_desc, is_staple, source)
     VALUES ${values.join(', ')}
     ON CONFLICT (user_id, lower(name)) DO UPDATE
        SET quantity_desc = COALESCE(EXCLUDED.quantity_desc, pantry_items.quantity_desc),
            is_staple     = pantry_items.is_staple OR EXCLUDED.is_staple,
            last_seen_at  = now()`,
    params,
  );

  return listPantry(userId);
}

export async function updatePantryItem(
  userId: string,
  itemId: string,
  patch: PantryUpdate,
): Promise<PantryItem | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  const push = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.name !== undefined) push('name', patch.name.trim());
  if (patch.quantity_desc !== undefined) push('quantity_desc', patch.quantity_desc);
  if (patch.is_staple !== undefined) push('is_staple', patch.is_staple);
  // "Yes, still there" — the cheapest possible way to keep an item alive, and
  // the reason the list shows ages at all.
  if (patch.seen) sets.push('last_seen_at = now()');

  if (sets.length === 0) return getPantryItem(userId, itemId);

  params.push(itemId, userId);
  const row = await queryOne<any>(
    `UPDATE pantry_items SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND user_id = $${params.length}
  RETURNING id, name, quantity_desc, is_staple, last_seen_at, source`,
    params,
  );
  return row ? toItem(row) : null;
}

export async function deletePantryItem(userId: string, itemId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    'DELETE FROM pantry_items WHERE id = $1 AND user_id = $2 RETURNING id',
    [itemId, userId],
  );
  return row !== null;
}

export async function getPantryItem(userId: string, itemId: string): Promise<PantryItem | null> {
  const row = await queryOne<any>(
    `SELECT id, name, quantity_desc, is_staple, last_seen_at, source
       FROM pantry_items WHERE id = $1 AND user_id = $2`,
    [itemId, userId],
  );
  return row ? toItem(row) : null;
}

export async function pantryCount(userId: string): Promise<{ count: number }> {
  const row = await queryOne<{ n: string }>(
    'SELECT count(*) AS n FROM pantry_items WHERE user_id = $1',
    [userId],
  );
  return { count: Number(row?.n ?? 0) };
}

/** Raised rather than returned, because a full pantry is a 409 and not a list. */
export class PantryFullError extends Error {
  constructor(readonly limit: number) {
    super(`Your kitchen list is full at ${limit} items. Remove a few to add more.`);
    this.name = 'PantryFullError';
  }
}

/**
 * How old an item is, in whole days. Staples always read as fresh: asking
 * someone to re-confirm they still own salt is exactly the friction that makes
 * a pantry feature not worth opening.
 */
export function ageInDays(item: PantryItem, now = new Date()): number {
  if (item.is_staple) return 0;
  const seen = new Date(item.last_seen_at).getTime();
  return Math.max(0, Math.floor((now.getTime() - seen) / (24 * 60 * 60 * 1000)));
}

function toItem(row: any): PantryItem {
  return {
    id: row.id,
    name: row.name,
    quantity_desc: row.quantity_desc,
    is_staple: row.is_staple,
    last_seen_at: new Date(row.last_seen_at).toISOString(),
    source: row.source,
  };
}
