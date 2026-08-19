import type { Confidence, EntrySource, ExerciseEntry, FoodEntry, Meal, WeightEntry } from '@ct/shared';
import { query, queryOne, transaction } from '../db.ts';
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
  ctx: DayContext;
}

export async function createFoodEntry(input: CreateFoodInput): Promise<FoodEntry> {
  const localDate = localDateFor(input.eatenAt, input.ctx);

  const entryId = await transaction(async (client) => {
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
        `INSERT INTO food_items
           (entry_id, name, quantity_g, quantity_desc, kcal, protein_g, carbs_g, fat_g, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          item.name,
          item.quantity_g ?? null,
          item.quantity_desc ?? null,
          item.kcal,
          item.protein_g,
          item.carbs_g,
          item.fat_g,
          index,
        ],
      );
    }
    return id;
  });

  const entry = await getFoodEntry(input.userId, entryId);
  if (!entry) throw new Error('Food entry vanished immediately after insert');
  return entry;
}

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
                  'carbs_g', i.carbs_g, 'fat_g', i.fat_g
                ) ORDER BY i.position
              ) FILTER (WHERE i.id IS NOT NULL),
              '[]'
            ) AS items,
            COALESCE(SUM(i.kcal), 0)      AS kcal,
            COALESCE(SUM(i.protein_g), 0) AS protein_g,
            COALESCE(SUM(i.carbs_g), 0)   AS carbs_g,
            COALESCE(SUM(i.fat_g), 0)     AS fat_g
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
    })),
    kcal: Number(row.kcal),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
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
          `INSERT INTO food_items
             (entry_id, name, quantity_g, quantity_desc, kcal, protein_g, carbs_g, fat_g, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            entryId,
            item.name,
            item.quantity_g ?? null,
            item.quantity_desc ?? null,
            item.kcal,
            item.protein_g,
            item.carbs_g,
            item.fat_g,
            index,
          ],
        );
      }
    }
  });

  return getFoodEntry(userId, entryId);
}

export async function deleteFoodEntry(userId: string, entryId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM food_entries WHERE id = $1 AND user_id = $2 RETURNING id',
    [entryId, userId],
  );
  return rows.length > 0;
}

export interface CreateExerciseInput {
  userId: string;
  description: string;
  performedAt: Date;
  durationMin?: number | null;
  kcalBurned: number;
  confidence: Confidence;
  source: EntrySource;
  ctx: DayContext;
}

export async function createExerciseEntry(input: CreateExerciseInput): Promise<ExerciseEntry> {
  const row = await queryOne<any>(
    `INSERT INTO exercise_entries
       (user_id, description, performed_at, local_date, duration_min, kcal_burned, confidence, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      input.userId,
      input.description,
      input.performedAt.toISOString(),
      localDateFor(input.performedAt, input.ctx),
      input.durationMin ?? null,
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
  return rows.map(toExerciseEntry);
}

function toExerciseEntry(row: any): ExerciseEntry {
  return {
    id: row.id,
    description: row.description,
    performed_at: new Date(row.performed_at).toISOString(),
    local_date: row.local_date,
    duration_min: row.duration_min === null ? null : Number(row.duration_min),
    kcal_burned: Number(row.kcal_burned),
    confidence: row.confidence,
    source: row.source,
  };
}

export async function deleteExerciseEntry(userId: string, entryId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM exercise_entries WHERE id = $1 AND user_id = $2 RETURNING id',
    [entryId, userId],
  );
  return rows.length > 0;
}

export async function logWeight(
  userId: string,
  weightKg: number,
  measuredAt: Date,
  ctx: DayContext,
): Promise<WeightEntry> {
  const row = await queryOne<any>(
    `INSERT INTO weight_entries (user_id, measured_at, local_date, weight_kg)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, local_date)
     DO UPDATE SET weight_kg = EXCLUDED.weight_kg, measured_at = EXCLUDED.measured_at
     RETURNING *`,
    [userId, measuredAt.toISOString(), localDateFor(measuredAt, ctx), weightKg],
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
