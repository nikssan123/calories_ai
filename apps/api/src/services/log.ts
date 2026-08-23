import type {
  Confidence,
  DietQuality,
  EntrySource,
  ExerciseEntry,
  FoodEntry,
  Meal,
  WeightEntry,
} from '@ct/shared';
import { query, queryOne, transaction } from '../db.ts';
import { markEntryRemoved } from './chat.ts';
import { type DayContext, localDateFor } from '../time.ts';

/**
 * Every write to the nutrition log goes through here. The chat layer calls these
 * via tools; the REST routes call them directly. Neither owns the invariants.
 */

export interface FoodItemInput {
  name: string;
  quantity_g?: number | null;
  quantity_desc?: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /**
   * The diet-quality panel, and optional in a way the macros are not: omitting
   * one writes NULL, which means "nobody estimated this" and is a different
   * claim from zero. Every path that has a figure passes it; nothing invents
   * one to avoid the null.
   */
  fiber_g?: number | null;
  sodium_mg?: number | null;
  sat_fat_g?: number | null;
  sugar_g?: number | null;
}

/** The column list and the values, kept together so the two INSERTs cannot drift. */
const ITEM_COLUMNS =
  'name, quantity_g, quantity_desc, kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, sat_fat_g, sugar_g, position';

function itemValues(item: FoodItemInput, position: number): unknown[] {
  return [
    item.name,
    item.quantity_g ?? null,
    item.quantity_desc ?? null,
    item.kcal,
    item.protein_g,
    item.carbs_g,
    item.fat_g,
    item.fiber_g ?? null,
    item.sodium_mg ?? null,
    item.sat_fat_g ?? null,
    item.sugar_g ?? null,
    position,
  ];
}

export interface CreateFoodInput {
  userId: string;
  meal: Meal;
  eatenAt: Date;
  description: string;
  note?: string | null;
  confidence: Confidence;
  source: EntrySource;
  photoId?: string | null;
  items: FoodItemInput[];
  /**
   * An id the client made up before it had a network — see OFFLINE.md §1.
   *
   * Its only job is to make this insert repeatable. An outbox resends the
   * request it never got an answer to, and "no answer" covers the case where
   * the row was written and the reply was lost, which is the common one on a
   * phone. With a key we recognise the second attempt; without one we log
   * breakfast twice and nothing ever tells the user which meal is the ghost.
   */
  clientId?: string | null;
  ctx: DayContext;
}

export async function createFoodEntry(input: CreateFoodInput): Promise<FoodEntry> {
  const localDate = localDateFor(input.eatenAt, input.ctx);

  const outcome = await transaction<{ id: string } | { spent: string | null }>(async (client) => {
    /*
     * The key is claimed before the entry is written, not after.
     *
     * Claiming first is what makes a concurrent duplicate wait rather than
     * race: `ON CONFLICT DO NOTHING` against an uncommitted row blocks on the
     * other transaction's speculative insertion, so by the time the loser sees
     * the conflict the winner has committed and `entry_id` is already set.
     * Claiming afterwards would leave both inserts free to write a meal each.
     */
    if (input.clientId) {
      const { rows: claimed } = await client.query<{ client_id: string }>(
        `INSERT INTO food_entry_client_keys (user_id, client_id)
         VALUES ($1,$2)
         ON CONFLICT (user_id, client_id) DO NOTHING
         RETURNING client_id`,
        [input.userId, input.clientId],
      );

      if (claimed.length === 0) {
        // Spent already. `entry_id` is the entry it bought, or null if that
        // entry has since been deleted — which is a refusal, not a re-insert.
        const { rows: existing } = await client.query<{ entry_id: string | null }>(
          'SELECT entry_id FROM food_entry_client_keys WHERE user_id = $1 AND client_id = $2',
          [input.userId, input.clientId],
        );
        return { spent: existing[0]?.entry_id ?? null };
      }
    }

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO food_entries
         (user_id, meal, eaten_at, local_date, description, note, confidence, source, photo_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        input.userId,
        input.meal,
        input.eatenAt.toISOString(),
        localDate,
        input.description,
        input.note ?? null,
        input.confidence,
        input.source,
        input.photoId ?? null,
      ],
    );
    const id = rows[0]!.id;

    for (const [index, item] of input.items.entries()) {
      await client.query(
        `INSERT INTO food_items (entry_id, ${ITEM_COLUMNS})
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [id, ...itemValues(item, index)],
      );
    }

    if (input.clientId) {
      await client.query(
        'UPDATE food_entry_client_keys SET entry_id = $3 WHERE user_id = $1 AND client_id = $2',
        [input.userId, input.clientId, id],
      );
    }
    return { id };
  });

  if ('spent' in outcome) {
    if (outcome.spent === null) {
      throw new DuplicateEntryError('That entry has already been logged and removed.');
    }
    const previous = await getFoodEntry(input.userId, outcome.spent);
    if (!previous) {
      throw new DuplicateEntryError('That entry has already been logged and removed.');
    }
    return previous;
  }

  const entry = await getFoodEntry(input.userId, outcome.id);
  if (!entry) throw new Error('Food entry vanished immediately after insert');
  return entry;
}

/**
 * A `client_id` that was spent on an entry no longer there.
 *
 * Its own type because the route has to tell it apart from a genuine failure.
 * This is a 409 the client should stop retrying: the meal was logged, the user
 * deleted it, and the queued copy that is still asking for it must be dropped
 * rather than backed off from and tried again forever.
 */
export class DuplicateEntryError extends Error {}

export async function getFoodEntry(userId: string, entryId: string): Promise<FoodEntry | null> {
  const entries = await listFoodEntries(userId, { entryId });
  return entries[0] ?? null;
}

interface ListFoodOptions {
  localDate?: string;
  from?: string;
  to?: string;
  entryId?: string;
  /** Fetch a specific set of entries, items and all, in one round trip. */
  entryIds?: string[];
  limit?: number;
}

export async function listFoodEntries(
  userId: string,
  options: ListFoodOptions = {},
): Promise<FoodEntry[]> {
  const conditions = ['e.user_id = $1'];
  const params: unknown[] = [userId];

  if (options.entryId) {
    params.push(options.entryId);
    conditions.push(`e.id = $${params.length}`);
  }
  if (options.entryIds) {
    if (options.entryIds.length === 0) return [];
    params.push(options.entryIds);
    conditions.push(`e.id = ANY($${params.length}::uuid[])`);
  }
  if (options.localDate) {
    params.push(options.localDate);
    conditions.push(`e.local_date = $${params.length}`);
  }
  if (options.from) {
    params.push(options.from);
    conditions.push(`e.local_date >= $${params.length}`);
  }
  if (options.to) {
    params.push(options.to);
    conditions.push(`e.local_date <= $${params.length}`);
  }

  const limit = options.limit ?? 500;
  params.push(limit);

  const rows = await query<any>(
    `SELECT e.id, e.meal, e.eaten_at, e.local_date, e.description, e.note,
            e.confidence, e.source, e.photo_id,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', i.id, 'entry_id', i.entry_id, 'name', i.name,
                  'quantity_g', i.quantity_g, 'quantity_desc', i.quantity_desc,
                  'kcal', i.kcal, 'protein_g', i.protein_g,
                  'carbs_g', i.carbs_g, 'fat_g', i.fat_g,
                  'fiber_g', i.fiber_g, 'sodium_mg', i.sodium_mg,
                  'sat_fat_g', i.sat_fat_g, 'sugar_g', i.sugar_g
                ) ORDER BY i.position
              ) FILTER (WHERE i.id IS NOT NULL),
              '[]'
            ) AS items,
            COALESCE(SUM(i.kcal), 0)      AS kcal,
            COALESCE(SUM(i.protein_g), 0) AS protein_g,
            COALESCE(SUM(i.carbs_g), 0)   AS carbs_g,
            COALESCE(SUM(i.fat_g), 0)     AS fat_g,
            -- No COALESCE on these four: SUM over nothing but NULLs is NULL,
            -- which is the answer. An entry logged before the columns existed
            -- has no fiber figure, and a zero would claim it had none.
            SUM(i.fiber_g)   AS fiber_g,
            SUM(i.sodium_mg) AS sodium_mg,
            SUM(i.sat_fat_g) AS sat_fat_g,
            SUM(i.sugar_g)   AS sugar_g
       FROM food_entries e
       LEFT JOIN food_items i ON i.entry_id = e.id
      WHERE ${conditions.join(' AND ')}
   GROUP BY e.id
   ORDER BY e.eaten_at ASC
      LIMIT $${params.length}`,
    params,
  );

  return rows.map(toFoodEntry);
}

function toFoodEntry(row: any): FoodEntry {
  return {
    id: row.id,
    meal: row.meal,
    eaten_at: new Date(row.eaten_at).toISOString(),
    local_date: row.local_date,
    description: row.description,
    note: row.note,
    confidence: row.confidence,
    source: row.source,
    photo_id: row.photo_id,
    items: (row.items as any[]).map((i) => ({
      id: i.id,
      entry_id: i.entry_id,
      name: i.name,
      quantity_g: i.quantity_g === null ? null : Number(i.quantity_g),
      quantity_desc: i.quantity_desc,
      kcal: Number(i.kcal),
      protein_g: Number(i.protein_g),
      carbs_g: Number(i.carbs_g),
      fat_g: Number(i.fat_g),
      ...quality(i),
    })),
    kcal: Number(row.kcal),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
    ...quality(row),
  };
}

/**
 * The quality panel off a row, preserving the null.
 *
 * `Number(null)` is 0, so the usual `Number(row.x)` would quietly turn every
 * un-estimated figure into a claim that the food had none of it.
 */
function quality(row: any): DietQuality {
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    fiber_g: num(row.fiber_g),
    sodium_mg: num(row.sodium_mg),
    sat_fat_g: num(row.sat_fat_g),
    sugar_g: num(row.sugar_g),
  };
}

export interface UpdateFoodInput {
  meal?: Meal;
  description?: string;
  note?: string | null;
  eatenAt?: Date;
  confidence?: Confidence;
  /** When present, replaces the item list wholesale. */
  items?: FoodItemInput[];
  ctx: DayContext;
}

/**
 * §"chat log ≠ data log": a correction mutates the existing entry. The original
 * estimate is replaced, not appended to.
 */
export async function updateFoodEntry(
  userId: string,
  entryId: string,
  input: UpdateFoodInput,
): Promise<FoodEntry | null> {
  const existing = await getFoodEntry(userId, entryId);
  if (!existing) return null;

  await transaction(async (client) => {
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    const push = (fragment: string, value: unknown) => {
      params.push(value);
      sets.push(`${fragment} = $${params.length}`);
    };

    if (input.meal) push('meal', input.meal);
    if (input.description !== undefined) push('description', input.description);
    if (input.note !== undefined) push('note', input.note);
    if (input.confidence) push('confidence', input.confidence);
    if (input.eatenAt) {
      push('eaten_at', input.eatenAt.toISOString());
      push('local_date', localDateFor(input.eatenAt, input.ctx));
    }

    params.push(entryId, userId);
    await client.query(
      `UPDATE food_entries SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
      params,
    );

    if (input.items) {
      await client.query('DELETE FROM food_items WHERE entry_id = $1', [entryId]);
      for (const [index, item] of input.items.entries()) {
        await client.query(
          `INSERT INTO food_items (entry_id, ${ITEM_COLUMNS})
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [entryId, ...itemValues(item, index)],
        );
      }
    }
  });

  return getFoodEntry(userId, entryId);
}

/*
 * The two deletes below reach into the conversation, which is the one direction
 * this module otherwise never travels.
 *
 * It is here rather than in the callers because there are three of them — the
 * REST route the apps use, the `delete_entry` tool, and whatever is written
 * next — and a journal that only sometimes notices a deletion is worse than one
 * that never does. This is the choke point every deletion already goes through.
 */
export async function deleteFoodEntry(userId: string, entryId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM food_entries WHERE id = $1 AND user_id = $2 RETURNING id',
    [entryId, userId],
  );
  if (rows.length === 0) return false;
  await markEntryRemoved(userId, entryId);
  return true;
}

export interface CreateExerciseInput {
  userId: string;
  description: string;
  performedAt: Date;
  durationMin?: number | null;
  distanceKm?: number | null;
  kcalBurned: number;
  confidence: Confidence;
  source: EntrySource;
  ctx: DayContext;
}

export async function createExerciseEntry(input: CreateExerciseInput): Promise<ExerciseEntry> {
  const row = await queryOne<any>(
    `INSERT INTO exercise_entries
       (user_id, description, performed_at, local_date, duration_min, distance_km, kcal_burned, confidence, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      input.userId,
      input.description,
      input.performedAt.toISOString(),
      localDateFor(input.performedAt, input.ctx),
      input.durationMin ?? null,
      input.distanceKm ?? null,
      input.kcalBurned,
      input.confidence,
      input.source,
    ],
  );
  return toExerciseEntry(row);
}

export async function listExerciseEntries(
  userId: string,
  options: { localDate?: string; from?: string; to?: string } = {},
): Promise<ExerciseEntry[]> {
  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];

  if (options.localDate) {
    params.push(options.localDate);
    conditions.push(`local_date = $${params.length}`);
  }
  if (options.from) {
    params.push(options.from);
    conditions.push(`local_date >= $${params.length}`);
  }
  if (options.to) {
    params.push(options.to);
    conditions.push(`local_date <= $${params.length}`);
  }

  const rows = await query<any>(
    `SELECT * FROM exercise_entries WHERE ${conditions.join(' AND ')} ORDER BY performed_at ASC`,
    params,
  );
  const entries = rows.map(toExerciseEntry);

  /*
   * Sets for the whole page in one query rather than one per entry. Most
   * entries have none — a run has nothing to put in them — so this is skipped
   * entirely unless something counted turns up in the range.
   */
  const ids = entries.map((e) => e.id);
  if (ids.length === 0) return entries;

  const sets = await query<any>(
    `SELECT entry_id, name, position, set_number, reps, weight_kg, duration_sec, distance_m
       FROM exercise_sets WHERE entry_id = ANY($1::uuid[])
   ORDER BY position, set_number`,
    [ids],
  );
  if (sets.length === 0) return entries;

  const byEntry = new Map<string, ExerciseEntry['sets']>();
  for (const row of sets) {
    const list = byEntry.get(row.entry_id) ?? [];
    list.push({
      name: row.name,
      position: Number(row.position),
      set_number: Number(row.set_number),
      reps: row.reps === null ? null : Number(row.reps),
      weight_kg: row.weight_kg === null ? null : Number(row.weight_kg),
      duration_sec: row.duration_sec === null ? null : Number(row.duration_sec),
      distance_m: row.distance_m === null ? null : Number(row.distance_m),
    });
    byEntry.set(row.entry_id, list);
  }
  return entries.map((e) => ({ ...e, sets: byEntry.get(e.id) ?? [] }));
}

function toExerciseEntry(row: any): ExerciseEntry {
  return {
    id: row.id,
    description: row.description,
    performed_at: new Date(row.performed_at).toISOString(),
    local_date: row.local_date,
    duration_min: row.duration_min === null ? null : Number(row.duration_min),
    distance_km: row.distance_km === null ? null : Number(row.distance_km),
    kcal_burned: Number(row.kcal_burned),
    confidence: row.confidence,
    source: row.source,
    category: row.category ?? null,
    detail: row.detail ?? 'estimated',
    // Filled by the caller above where there are any; a described run has none.
    sets: [],
  };
}

export async function deleteExerciseEntry(userId: string, entryId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM exercise_entries WHERE id = $1 AND user_id = $2 RETURNING id',
    [entryId, userId],
  );
  if (rows.length === 0) return false;
  await markEntryRemoved(userId, entryId);
  return true;
}

/**
 * A weigh-in, filed under the day it belongs to.
 *
 * The upsert on `(user_id, local_date)` is what makes a correction free: one
 * weight per day is the rule, so writing the same day twice replaces rather
 * than accumulates, and the row keeps its id — which is what lets the journal
 * card that announced it be redrawn rather than orphaned.
 */
export async function logWeight(
  userId: string,
  weightKg: number,
  measuredAt: Date,
  ctx: DayContext,
  /**
   * The day this belongs to, when the caller already knows it.
   *
   * A correction targets a day, not an instant: the card being edited says
   * "Tuesday", and asking the client to invent a timestamp that the server
   * derives Tuesday back from means reproducing the user's timezone and
   * `day_start_hour` on the client — exactly the arithmetic that lands a
   * correction on the wrong day. Given it, the upsert hits the row the reader
   * was actually looking at.
   */
  localDate?: string,
): Promise<WeightEntry> {
  const row = await queryOne<any>(
    `INSERT INTO weight_entries (user_id, measured_at, local_date, weight_kg)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, local_date)
     DO UPDATE SET weight_kg = EXCLUDED.weight_kg, measured_at = EXCLUDED.measured_at
     RETURNING *`,
    [userId, measuredAt.toISOString(), localDate ?? localDateFor(measuredAt, ctx), weightKg],
  );
  return toWeightEntry(row);
}

export async function listWeights(
  userId: string,
  options: { from?: string; to?: string; limit?: number } = {},
): Promise<WeightEntry[]> {
  const conditions = ['user_id = $1'];
  const params: unknown[] = [userId];

  if (options.from) {
    params.push(options.from);
    conditions.push(`local_date >= $${params.length}`);
  }
  if (options.to) {
    params.push(options.to);
    conditions.push(`local_date <= $${params.length}`);
  }
  params.push(options.limit ?? 400);

  const rows = await query<any>(
    `SELECT * FROM weight_entries WHERE ${conditions.join(' AND ')}
      ORDER BY local_date ASC LIMIT $${params.length}`,
    params,
  );
  return rows.map(toWeightEntry);
}

export async function latestWeight(userId: string): Promise<WeightEntry | null> {
  const row = await queryOne<any>(
    'SELECT * FROM weight_entries WHERE user_id = $1 ORDER BY local_date DESC LIMIT 1',
    [userId],
  );
  return row ? toWeightEntry(row) : null;
}

function toWeightEntry(row: any): WeightEntry {
  return {
    id: row.id,
    measured_at: new Date(row.measured_at).toISOString(),
    local_date: row.local_date,
    weight_kg: Number(row.weight_kg),
  };
}
