import type {
  ExerciseCategory,
  ExerciseEntry,
  ExerciseTracks,
  ExerciseType,
  LastWorkout,
  MuscleGroup,
  WorkoutExercise,
} from '@ct/shared';
import { matchRoutine } from '@ct/shared';
import type pg from 'pg';
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

/**
 * Built-ins plus anything this account has invented, its own first.
 *
 * `withPrevious` attaches the sets of the last session that recorded each
 * exercise, which is what lets tapping one open on real numbers rather than on
 * blanks. It is one extra query for the whole catalogue rather than one per
 * exercise — `previousSetsFor` already reads every type in a single pass for
 * the routine card — so the picker pays for history once and nothing else pays
 * for it at all.
 */
export async function listExerciseTypes(
  userId: string,
  category?: ExerciseCategory | null,
  options: { withPrevious?: boolean } = {},
): Promise<ExerciseType[]> {
  const rows = await query<any>(
    `SELECT id, name, category, emoji, tracks, muscles, aliases, user_id
       FROM exercise_types
      WHERE (user_id IS NULL OR user_id = $1)
        AND ($2::text IS NULL OR category = $2)
   ORDER BY (user_id IS NOT NULL) DESC, name ASC`,
    [userId, category ?? null],
  );
  const types = rows.map(toType);
  if (!options.withPrevious) return types;

  const { previousSetsFor } = await import('./routines.ts');
  const previous = await previousSetsFor(userId);
  for (const type of types) type.previous = previous.get(type.id) ?? [];
  return types;
}

/** The row with exactly this name, for deciding whether it is taken. */
async function exactExerciseType(userId: string, name: string): Promise<ExerciseType | null> {
  const row = await queryOne<any>(
    `SELECT id, name, category, emoji, tracks, muscles, aliases, user_id
       FROM exercise_types
      WHERE lower(name) = lower($2) AND (user_id IS NULL OR user_id = $1)
   ORDER BY (user_id IS NOT NULL) DESC
      LIMIT 1`,
    [userId, name.trim()],
  );
  return row ? toType(row) : null;
}

/**
 * The catalogue entry somebody meant, from what they called it.
 *
 * Three widenings past exact-name, in order of how much they cost:
 *
 * 1. **The aliases.** "RDL", "OHP", "pulldown" — the gap between the one name
 *    the catalogue keeps so history stays comparable, and what a gym says.
 * 2. **The plural.** People say "squats" and "lunges" and "dips", and the
 *    catalogue is singular throughout. A trailing "s" is not worth losing an
 *    exercise's whole identity over.
 * 3. Both together, so "RDLs" lands too.
 *
 * This is more load-bearing than it looks. A name that fails to match is not a
 * cosmetic miss: the set is written with a null `type_id`, which costs it its
 * MET, its muscles, its place in `previousSetsFor`, and its vote in matching
 * the session to a saved routine. "Squats" logged as free text is an exercise
 * the app can never offer back.
 *
 * Exact name wins over an alias, and this account's own wins over a built-in —
 * somebody who has defined their own "Squats" meant theirs.
 */
export async function findExerciseType(
  userId: string,
  name: string,
): Promise<ExerciseType | null> {
  const wanted = name.trim().toLowerCase();
  if (wanted.length === 0) return null;
  const singular = wanted.endsWith('s') ? wanted.slice(0, -1) : wanted;

  const row = await queryOne<any>(
    `SELECT id, name, category, emoji, tracks, muscles, aliases, user_id,
            (lower(name) = $2) AS exact
       FROM exercise_types
      WHERE (user_id IS NULL OR user_id = $1)
        AND (lower(name) = $2
             OR lower(name) = $3
             OR $2 = ANY(aliases)
             OR $3 = ANY(aliases))
   ORDER BY exact DESC, (user_id IS NOT NULL) DESC, length(name) ASC
      LIMIT 1`,
    [userId, wanted, singular],
  );
  return row ? toType(row) : null;
}

export interface DefineExerciseInput {
  userId: string;
  name: string;
  category: ExerciseCategory;
  /**
   * All three optional, and defaulted from the category when they are missing.
   *
   * The agent fills them in because it has read a sentence and has an opinion.
   * The picker does not: somebody who has just failed to find their exercise
   * wants it to exist, and asking them for a metabolic equivalent to get it is
   * how a two-second fix becomes an abandoned form.
   */
  emoji?: string | null;
  tracks?: ExerciseTracks | null;
  met?: number | null;
  /** Primary first. Empty for anything that is not lifting. */
  muscles?: MuscleGroup[] | null;
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
  /*
   * Exact name, deliberately, and not the forgiving lookup above.
   *
   * "Is this name taken" and "what did they mean" are different questions.
   * Asking the forgiving one here would have this quietly hand back "Squat" to
   * somebody defining "Squats", and worse, hand back whatever an alias happened
   * to catch to an agent defining something genuinely new.
   */
  const existing = await exactExerciseType(input.userId, input.name);
  if (existing) return existing;

  const row = await queryOne<any>(
    `INSERT INTO exercise_types (user_id, name, category, emoji, tracks, met, muscles)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, name, category, emoji, tracks, muscles, aliases, user_id`,
    [
      input.userId,
      input.name.trim(),
      input.category,
      input.emoji ?? CATEGORY_EMOJI[input.category],
      input.tracks ?? CATEGORY_TRACKS[input.category],
      input.met ?? CATEGORY_MET[input.category],
      input.muscles ?? [],
    ],
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
  /** The saved routine this session was, when it came from one. */
  routineId?: string | null;
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
  const priced = await priceSession(input);

  const entryId = await transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO exercise_entries
         (user_id, description, performed_at, local_date, duration_min,
          kcal_burned, confidence, source, category, detail, routine_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'workout',$8,'counted',$9)
       RETURNING id`,
      [
        input.userId,
        priced.description,
        priced.performedAt.toISOString(),
        priced.localDate,
        priced.minutes,
        priced.kcal,
        // The sets were counted by a person; the burn is still a model of
        // effort, so this is honest rather than flattering.
        'medium',
        input.category,
        priced.routine?.id ?? null,
      ],
    );
    const id = rows[0]!.id;
    await writeSets(client, id, priced.resolved);
    return id;
  });

  // Ordering for the picker: the routine done on Tuesday should be near the top
  // on Thursday. Deliberately after the transaction — a failure to reorder a
  // picker is not a reason to lose a logged session.
  if (priced.routine) {
    const { touchRoutine } = await import('./routines.ts');
    await touchRoutine(input.userId, priced.routine.id, priced.performedAt);
  }

  const entry = await getExerciseEntry(input.userId, entryId);
  if (!entry) throw new Error('Workout vanished immediately after insert');
  return entry;
}

/**
 * The same session, counted again.
 *
 * A workout card is submitted from memory, usually while still catching your
 * breath, and the set you mistyped is not discoverable until it is already a
 * receipt. Deleting it and logging it again would work and is what people
 * currently do, but it loses the entry id — and with it the card in the
 * journal, the routine link, and anything else that ever pointed at this
 * session.
 *
 * So this rewrites in place. The burn is recomputed rather than kept: it was
 * derived from the sets and the duration, and a correction that moved either of
 * those leaves the old figure describing a session nobody did. Same for the
 * description, which is why an edit that drops the last two exercises off a
 * routine can quietly stop calling itself "Push day" — it is not one any more.
 *
 * Returns null when the entry is not theirs or does not exist, so the route can
 * answer 404 rather than silently writing nothing.
 */
export async function updateWorkout(
  input: LogWorkoutInput & { entryId: string },
): Promise<ExerciseEntry | null> {
  const existing = await getExerciseEntry(input.userId, input.entryId);
  if (!existing) return null;

  /*
   * A correction that says nothing about when leaves the session where it is.
   *
   * `priceSession` falls through to now, which is right for a log and wrong
   * here: a client fixing a rep count has no reason to echo back a timestamp it
   * is not changing, and defaulting to now would silently move Tuesday's
   * session onto today — off the day whose totals it belongs to.
   */
  const priced = await priceSession({
    ...input,
    performedAt: input.performedAt ?? new Date(existing.performed_at),
  });

  await transaction(async (client) => {
    await client.query(
      `UPDATE exercise_entries
          SET description = $1, performed_at = $2, local_date = $3, duration_min = $4,
              kcal_burned = $5, category = $6, routine_id = $7, detail = 'counted'
        WHERE id = $8 AND user_id = $9`,
      [
        priced.description,
        priced.performedAt.toISOString(),
        priced.localDate,
        priced.minutes,
        priced.kcal,
        input.category,
        priced.routine?.id ?? null,
        input.entryId,
        input.userId,
      ],
    );
    // Replaced wholesale rather than diffed. A set has no identity of its own —
    // it is the third set of the second exercise — so matching old rows to new
    // ones is guesswork the moment an exercise is inserted or removed.
    await client.query('DELETE FROM exercise_sets WHERE entry_id = $1', [input.entryId]);
    await writeSets(client, input.entryId, priced.resolved);
  });

  if (priced.routine) {
    const { touchRoutine } = await import('./routines.ts');
    await touchRoutine(input.userId, priced.routine.id, priced.performedAt);
  }

  return getExerciseEntry(input.userId, input.entryId);
}

/**
 * Everything a session is worth, worked out before a row is written.
 *
 * Shared by the log and the edit so the two can never disagree: a session
 * corrected back to exactly what it was must come out with the number it
 * started with, and it only does if both paths run the same arithmetic.
 */
async function priceSession(input: LogWorkoutInput): Promise<{
  performedAt: Date;
  localDate: string;
  minutes: number;
  kcal: number;
  description: string;
  resolved: Resolved[];
  routine: { id: string; name: string } | null;
}> {
  const performedAt = input.performedAt ?? new Date();

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

  /*
   * A session that came from a routine is called by its name.
   *
   * "Chest day" is what the person calls it and what they will look for in
   * their history; "Bench press, Chest fly and 9 more" is a list of the first
   * two things they did. The name is only trusted when the routine is actually
   * theirs, which the lookup enforces.
   *
   * When no routine was named, the exercises are asked whether this *is* one.
   * Somebody who does their push day and types it into the chat rather than
   * tapping the push day chip has still done their push day, and without this
   * the session would be called after its first two exercises and would never
   * count toward the habit that makes the card useful on a Monday.
   */
  const routine = await routineFor(input, resolved);

  return {
    performedAt,
    localDate: localDateFor(performedAt, input.ctx),
    minutes,
    kcal: estimateBurn(resolved, minutes, weight?.weight_kg ?? null, input.category),
    description: routine?.name ?? describe(input.category, resolved.map((r) => r.exercise)),
    resolved,
    routine,
  };
}

/** One row per set, in the order they were done. Assumes the entry has none. */
async function writeSets(
  client: pg.PoolClient,
  entryId: string,
  resolved: Resolved[],
): Promise<void> {
  for (const [position, { exercise, type }] of resolved.entries()) {
    for (const [index, set] of exercise.sets.entries()) {
      await client.query(
        `INSERT INTO exercise_sets
           (entry_id, type_id, name, position, set_number,
            reps, weight_kg, duration_sec, distance_m)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          entryId,
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
}

/**
 * Which routine this session is — the one they named, or the one it plainly is.
 *
 * An explicitly chosen routine is taken at its word and only checked for
 * ownership. A session with no routine on it is matched against theirs by
 * exercise overlap, at a deliberately high bar: mislabelling a workout and
 * teaching the app the wrong weekday is a worse outcome than leaving a session
 * unlinked, and an unlinked session still records everything that happened.
 */
async function routineFor(
  input: LogWorkoutInput,
  resolved: Resolved[],
): Promise<{ id: string; name: string } | null> {
  if (input.routineId) {
    const row = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM routines WHERE id = $1 AND user_id = $2`,
      [input.routineId, input.userId],
    );
    return row ?? null;
  }

  const typeIds = resolved
    .map((r) => r.type?.id)
    .filter((id): id is string => id !== undefined);
  if (typeIds.length === 0) return null;

  const { listRoutines } = await import('./routines.ts');
  const routines = await listRoutines(input.userId, { category: input.category });
  const match = matchRoutine(typeIds, routines);
  return match ? { id: match.routine.id, name: match.routine.name } : null;
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

/**
 * The most recent counted session of a kind, ready to be offered back.
 *
 * Only sessions that actually recorded sets qualify: a duration-only log is a
 * perfectly good entry and a useless template, and offering "same as last time"
 * for one would hand back an empty grid.
 *
 * `emoji` and `tracks` come from the catalogue where the set was matched to it,
 * and fall back to the category's own where it was not — a set typed as free
 * text still deserves to come back with the right fields around it.
 */
export async function lastWorkout(
  userId: string,
  category: ExerciseCategory,
): Promise<LastWorkout | null> {
  const entry = await queryOne<any>(
    `SELECT e.id, e.local_date, e.duration_min
       FROM exercise_entries e
      WHERE e.user_id = $1 AND e.category = $2 AND e.detail = 'counted'
        AND EXISTS (SELECT 1 FROM exercise_sets s WHERE s.entry_id = e.id)
   ORDER BY e.performed_at DESC
      LIMIT 1`,
    [userId, category],
  );
  if (!entry) return null;

  const rows = await query<any>(
    `SELECT s.name, s.position, s.set_number, s.reps, s.weight_kg,
            s.duration_sec, s.distance_m, s.type_id, t.emoji, t.tracks
       FROM exercise_sets s
       LEFT JOIN exercise_types t ON t.id = s.type_id
      WHERE s.entry_id = $1
   ORDER BY s.position, s.set_number`,
    [entry.id],
  );

  const byPosition = new Map<number, LastWorkout['exercises'][number]>();
  for (const row of rows) {
    const position = Number(row.position);
    let exercise = byPosition.get(position);
    if (!exercise) {
      exercise = {
        name: row.name,
        type_id: row.type_id ?? null,
        tracks: (row.tracks as ExerciseTracks) ?? CATEGORY_TRACKS[category],
        emoji: row.emoji ?? CATEGORY_EMOJI[category],
        sets: [],
      };
      byPosition.set(position, exercise);
    }
    exercise.sets.push({
      reps: row.reps === null ? null : Number(row.reps),
      weight_kg: row.weight_kg === null ? null : Number(row.weight_kg),
      duration_sec: row.duration_sec === null ? null : Number(row.duration_sec),
      distance_m: row.distance_m === null ? null : Number(row.distance_m),
    });
  }

  return {
    entry_id: entry.id,
    local_date: entry.local_date,
    duration_min: entry.duration_min === null ? null : Number(entry.duration_min),
    category,
    exercises: [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => e),
  };
}

/** What a set of this kind is measured in, when the catalogue cannot say. */
const CATEGORY_TRACKS: Record<ExerciseCategory, ExerciseTracks> = {
  strength: 'reps',
  cardio: 'duration',
  class: 'duration',
  sport: 'duration',
  flexibility: 'duration',
};

const CATEGORY_EMOJI: Record<ExerciseCategory, string> = {
  strength: '🏋️',
  cardio: '🏃',
  class: '🤸',
  sport: '⚽',
  flexibility: '🧘',
};

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
    `SELECT id, name, category, emoji, tracks, muscles, aliases, user_id
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
    muscles: row.muscles ?? [],
    aliases: row.aliases ?? [],
    custom: row.user_id !== null,
    // Filled in by `listExerciseTypes` when asked for, and left empty
    // everywhere else — most callers want a catalogue, not a history.
    previous: [],
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
