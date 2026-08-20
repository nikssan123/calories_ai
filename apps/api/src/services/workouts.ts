import type {
  ExerciseCategory,
  ExerciseEntry,
  ExerciseTracks,
  ExerciseType,
  WorkoutExercise,
} from '@ct/shared';
import { query, queryOne, transaction } from '../db.ts';
import { latestWeight } from './log.ts';
import { type DayContext, localDateFor } from '../time.ts';

/**
 * Workouts: the catalogue of exercises, and sessions counted rather than
 * described.
 *
 * The existing exercise path reads a sentence and estimates a burn, which is
 * right for "5km run". This one is for the other half — a gym session, where
 * the burn is the number nobody cares about and the load is the whole point.
 */

// ---- The catalogue ----------------------------------------------------------

/** Built-ins plus anything this account has invented, its own first. */
export async function listExerciseTypes(
  userId: string,
  category?: ExerciseCategory | null,
): Promise<ExerciseType[]> {
  const rows = await query<any>(
    `SELECT id, name, category, emoji, tracks, user_id
       FROM exercise_types
      WHERE (user_id IS NULL OR user_id = $1)
        AND ($2::text IS NULL OR category = $2)
   ORDER BY (user_id IS NOT NULL) DESC, name ASC`,
    [userId, category ?? null],
  );
  return rows.map(toType);
}

export async function findExerciseType(
  userId: string,
  name: string,
): Promise<ExerciseType | null> {
  const row = await queryOne<any>(
    `SELECT id, name, category, emoji, tracks, user_id
       FROM exercise_types
      WHERE lower(name) = lower($2) AND (user_id IS NULL OR user_id = $1)
   ORDER BY (user_id IS NOT NULL) DESC
      LIMIT 1`,
    [userId, name],
  );
  return row ? toType(row) : null;
}

export interface DefineExerciseInput {
  userId: string;
  name: string;
  category: ExerciseCategory;
  emoji: string;
  tracks: ExerciseTracks;
  met: number;
}

/**
 * Records an exercise this app had never heard of.
 *
 * Returns the existing one rather than failing when the name is already taken,
 * because the caller is usually the agent reacting to something the user said,
 * and "you have done that before" is not an error worth interrupting a
 * conversation with.
 */
export async function defineExerciseType(input: DefineExerciseInput): Promise<ExerciseType> {
  const existing = await findExerciseType(input.userId, input.name);
  if (existing) return existing;

  const row = await queryOne<any>(
    `INSERT INTO exercise_types (user_id, name, category, emoji, tracks, met)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, name, category, emoji, tracks, user_id`,
    [input.userId, input.name.trim(), input.category, input.emoji, input.tracks, input.met],
  );
  return toType(row);
}

// ---- Logging a session ------------------------------------------------------

export interface LogWorkoutInput {
  userId: string;
  category: ExerciseCategory;
  exercises: WorkoutExercise[];
  durationMin?: number | null;
  performedAt?: Date;
  ctx: DayContext;
}

/**
 * Writes a counted session: one entry, one row per set.
 *
 * The burn is computed here rather than asked for. A MET figure, the user's
 * bodyweight and a duration is the same arithmetic every tracker does, and
 * doing it in code rather than in the model means it is consistent between two
 * identical sessions logged a week apart — which an estimate never is, and
 * which matters more than either number being exactly right.
 */
export async function logWorkout(input: LogWorkoutInput): Promise<ExerciseEntry> {
  const performedAt = input.performedAt ?? new Date();
  const localDate = localDateFor(performedAt, input.ctx);

  const resolved = await Promise.all(
    input.exercises.map(async (exercise) => ({
      exercise,
      type: exercise.type_id
        ? await typeById(input.userId, exercise.type_id)
        : await findExerciseType(input.userId, exercise.name),
    })),
  );

  const minutes = input.durationMin ?? estimateMinutes(resolved);
  const weight = await latestWeight(input.userId);
  const kcal = estimateBurn(resolved, minutes, weight?.weight_kg ?? null, input.category);

  const entryId = await transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO exercise_entries
         (user_id, description, performed_at, local_date, duration_min,
          kcal_burned, confidence, source, category, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'workout',$8,'counted')
       RETURNING id`,
      [
        input.userId,
        describe(input.category, resolved.map((r) => r.exercise)),
        performedAt.toISOString(),
        localDate,
        minutes,
        kcal,
        // The sets were counted by a person; the burn is still a model of
        // effort, so this is honest rather than flattering.
        'medium',
        input.category,
      ],
    );
    const id = rows[0]!.id;

    for (const [position, { exercise, type }] of resolved.entries()) {
      for (const [index, set] of exercise.sets.entries()) {
        await client.query(
          `INSERT INTO exercise_sets
             (entry_id, type_id, name, position, set_number,
              reps, weight_kg, duration_sec, distance_m)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            id,
            type?.id ?? null,
            type?.name ?? exercise.name.trim(),
            position,
            index + 1,
            set.reps ?? null,
            set.weight_kg ?? null,
            set.duration_sec ?? null,
            set.distance_m ?? null,
          ],
        );
      }
    }
    return id;
  });

  const entry = await getExerciseEntry(input.userId, entryId);
  if (!entry) throw new Error('Workout vanished immediately after insert');
  return entry;
}

export async function getExerciseEntry(
  userId: string,
  entryId: string,
): Promise<ExerciseEntry | null> {
  const row = await queryOne<any>(
    `SELECT id, description, performed_at, local_date, duration_min, distance_km,
            kcal_burned, confidence, source, category, detail
       FROM exercise_entries WHERE id = $1 AND user_id = $2`,
    [entryId, userId],
  );
  if (!row) return null;
  return { ...toEntry(row), sets: await listSets(entryId) };
}

export async function listSets(entryId: string) {
  const rows = await query<any>(
    `SELECT name, position, set_number, reps, weight_kg, duration_sec, distance_m
       FROM exercise_sets WHERE entry_id = $1
   ORDER BY position, set_number`,
    [entryId],
  );
  return rows.map((r) => ({
    name: r.name,
    position: Number(r.position),
    set_number: Number(r.set_number),
    reps: r.reps === null ? null : Number(r.reps),
    weight_kg: r.weight_kg === null ? null : Number(r.weight_kg),
    duration_sec: r.duration_sec === null ? null : Number(r.duration_sec),
    distance_m: r.distance_m === null ? null : Number(r.distance_m),
  }));
}

// ---- The arithmetic ---------------------------------------------------------

type Resolved = { exercise: WorkoutExercise; type: ExerciseType | null };

/**
 * How long a session took, when nobody said.
 *
 * Three minutes a set is the working figure — roughly a set plus the rest after
 * it — and a set whose own duration was recorded uses that instead. It is a
 * guess, and it is only ever used for the burn, which is the number here that
 * matters least.
 */
export function estimateMinutes(resolved: Resolved[]): number {
  let seconds = 0;
  for (const { exercise } of resolved) {
    for (const set of exercise.sets) {
      seconds += set.duration_sec ?? 180;
    }
  }
  return Math.max(1, Math.round(seconds / 60));
}

/**
 * Burn, from bodyweight and time at a MET.
 *
 * Falls back to the category's own rate when an exercise is not in the
 * catalogue, and to a 75kg body when there is no weigh-in yet — better a
 * figure with a stated confidence than a blank, and a new account has usually
 * not weighed in before its first session.
 */
export function estimateBurn(
  resolved: Resolved[],
  minutes: number,
  weightKg: number | null,
  category: ExerciseCategory,
): number {
  const mets = resolved.map((r) => metFor(r, category));
  const met = mets.length > 0 ? mets.reduce((a, b) => a + b, 0) / mets.length : CATEGORY_MET[category];
  const kcal = met * (weightKg ?? 75) * (minutes / 60);
  return Math.round(kcal * 10) / 10;
}

const CATEGORY_MET: Record<ExerciseCategory, number> = {
  strength: 5.0,
  cardio: 7.5,
  class: 7.5,
  sport: 7.0,
  flexibility: 2.5,
};

function metFor(resolved: Resolved, category: ExerciseCategory): number {
  return resolved.type ? (TYPE_MET.get(resolved.type.id) ?? CATEGORY_MET[category]) : CATEGORY_MET[category];
}

/**
 * MET by type id, filled lazily on first use.
 *
 * The catalogue is a few dozen rows that change only when a migration adds one,
 * so reading it per set would be a query per set to learn a constant.
 */
const TYPE_MET = new Map<string, number>();

export async function primeMetCache(): Promise<void> {
  const rows = await query<{ id: string; met: string }>('SELECT id, met FROM exercise_types');
  TYPE_MET.clear();
  for (const row of rows) TYPE_MET.set(row.id, Number(row.met));
}

/** A sentence for the entry, since every other screen shows one. */
export function describe(category: ExerciseCategory, exercises: WorkoutExercise[]): string {
  const names = exercises.map((e) => e.name.trim()).filter(Boolean);
  if (names.length === 0) return LABEL[category];
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

const LABEL: Record<ExerciseCategory, string> = {
  strength: 'Weight training',
  cardio: 'Cardio',
  class: 'Class',
  sport: 'Sport',
  flexibility: 'Mobility',
};

async function typeById(userId: string, id: string): Promise<ExerciseType | null> {
  const row = await queryOne<any>(
    `SELECT id, name, category, emoji, tracks, user_id
       FROM exercise_types WHERE id = $1 AND (user_id IS NULL OR user_id = $2)`,
    [id, userId],
  );
  return row ? toType(row) : null;
}

function toType(row: any): ExerciseType {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    emoji: row.emoji,
    tracks: row.tracks,
    custom: row.user_id !== null,
  };
}

function toEntry(row: any): Omit<ExerciseEntry, 'sets'> {
  return {
    id: row.id,
    description: row.description,
    performed_at: new Date(row.performed_at).toISOString(),
    local_date: String(row.local_date).slice(0, 10),
    duration_min: row.duration_min === null ? null : Number(row.duration_min),
    distance_km: row.distance_km === null ? null : Number(row.distance_km),
    kcal_burned: Number(row.kcal_burned),
    confidence: row.confidence,
    source: row.source,
    category: row.category,
    detail: row.detail,
  };
}
