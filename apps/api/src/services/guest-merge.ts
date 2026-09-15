import type pg from 'pg';
import { queryOne, transaction } from '../db.ts';

/**
 * Pours a guest's journal into an account that already existed (GUEST-ACCOUNTS.md).
 *
 * A guest who saves with a Google account or an address that already has an
 * account is signed in to that account, not the guest. Before this, what the
 * guest logged stayed on the guest row, unreachable from the phone that logged
 * it. Now it moves: the meals, the conversation they came from, their photos,
 * weigh-ins, workouts, step counts, and whatever the guest set up in the kitchen.
 *
 * What does not move, on purpose:
 *
 * - **The profile, the targets and the plan.** The existing account already has
 *   a body, a goal and a history of targets worked out from it; a day of guest
 *   answers is not a reason to overwrite them.
 * - **What is derived or about the guest as a separate person** — achievements,
 *   alerts, nudges, weekly reviews, the assistant's notes, coach links. They are
 *   recomputed or re-earned against the merged history, or were never the
 *   account's.
 * - **The cost ledger.** `ai_usage` rows keep their cost but lose the guest's id
 *   when the row is deleted (`ON DELETE SET NULL`), so a guest's four messages
 *   are not counted against the account's own allowance.
 *
 * Where the account already has something the guest also has — a weigh-in on
 * the same day, a routine or pantry item of the same name, a step count from the
 * same source — the account's copy wins and the guest's is dropped. Everything
 * runs in one transaction, and the guest row is deleted at the end, taking its
 * sessions and everything that did not move with it.
 */
export interface MergeSummary {
  food_entries: number;
  exercise_entries: number;
  weight_entries: number;
  photos: number;
}

export async function absorbGuest(guestId: string, accountId: string): Promise<MergeSummary | null> {
  if (guestId === accountId) return null;
  const guest = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE id = $1 AND guest_since IS NOT NULL',
    [guestId],
  );
  if (!guest) return null;

  return transaction(async (client) => {
    const move = (sql: string) => client.query(sql, [guestId, accountId]);
    const count = async (sql: string) => (await client.query(sql, [guestId, accountId])).rowCount ?? 0;

    // Custom exercise types first: a name the account already has is folded into
    // the account's type, so the sets and routine lines that pointed at the
    // guest's copy keep a type rather than losing it to ON DELETE SET NULL.
    await move(
      `UPDATE exercise_sets s SET type_id = mine.id
         FROM exercise_types theirs
         JOIN exercise_types mine ON mine.user_id = $2 AND lower(mine.name) = lower(theirs.name)
        WHERE theirs.user_id = $1 AND s.type_id = theirs.id`,
    );
    await move(
      `UPDATE routine_exercises r SET type_id = mine.id
         FROM exercise_types theirs
         JOIN exercise_types mine ON mine.user_id = $2 AND lower(mine.name) = lower(theirs.name)
        WHERE theirs.user_id = $1 AND r.type_id = theirs.id`,
    );
    await moveUnlessTaken(client, guestId, accountId, 'exercise_types', 'lower(t.name) = lower(o.name)');

    // Routines by name, and the weekday schedule only where the account has none.
    await moveUnlessTaken(client, guestId, accountId, 'routines', 'lower(t.name) = lower(o.name)');
    await moveUnlessTaken(client, guestId, accountId, 'routine_days', 't.weekday = o.weekday');

    const food = await count('UPDATE food_entries SET user_id = $2 WHERE user_id = $1');
    await moveUnlessTaken(client, guestId, accountId, 'food_entry_client_keys', 't.client_id = o.client_id');
    await move('UPDATE chat_messages SET user_id = $2 WHERE user_id = $1');
    const photos = await count('UPDATE photos SET user_id = $2 WHERE user_id = $1');
    const exercise = await count('UPDATE exercise_entries SET user_id = $2 WHERE user_id = $1');

    const weights = await moveUnlessTaken(client, guestId, accountId, 'weight_entries', 't.local_date = o.local_date');
    await moveUnlessTaken(
      client,
      guestId,
      accountId,
      'daily_metrics',
      't.local_date = o.local_date AND t.source = o.source',
    );

    await moveUnlessTaken(client, guestId, accountId, 'pantry_items', 'lower(t.name) = lower(o.name)');
    await moveUnlessTaken(
      client,
      guestId,
      accountId,
      'shopping_extras',
      'lower(t.name) = lower(o.name) AND t.bought_at IS NULL AND o.bought_at IS NULL',
    );
    await moveUnlessTaken(client, guestId, accountId, 'saved_library_recipes', 't.slug = o.slug');
    await move('UPDATE recipes SET user_id = $2 WHERE user_id = $1');
    await moveUnlessTaken(client, guestId, accountId, 'meal_plans', 't.week_start = o.week_start');

    await client.query('DELETE FROM users WHERE id = $1', [guestId]);
    return { food_entries: food, exercise_entries: exercise, weight_entries: weights, photos };
  });
}

/**
 * Moves a table's guest rows to the account, except those that collide with a
 * row the account already has (`o` is the account's row, `t` the guest's). The
 * colliding guest rows are left behind and go with the guest row. Returns how
 * many moved.
 */
async function moveUnlessTaken(
  client: pg.PoolClient,
  guestId: string,
  accountId: string,
  table: string,
  collision: string,
): Promise<number> {
  // Table and predicate are this file's own constants, never input.
  const result = await client.query(
    `UPDATE ${table} t SET user_id = $2
      WHERE t.user_id = $1
        AND NOT EXISTS (SELECT 1 FROM ${table} o WHERE o.user_id = $2 AND ${collision})`,
    [guestId, accountId],
  );
  return result.rowCount ?? 0;
}
