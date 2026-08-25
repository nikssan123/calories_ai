import type {
  ExerciseCategory,
  ScheduledDay,
  WeekSchedule,
  ExerciseTracks,
  MuscleGroup,
  Routine,
  RoutineExercise,
  SetValues,
} from '@ct/shared';
import {
  ROUTINE_MATCH_CERTAIN,
  matchRoutine,
  nameFromMuscles,
  namingStyleOf,
  routineOnWeekday,
} from '@ct/shared';
import { query, queryOne, transaction } from '../db.ts';
import { findExerciseType } from './workouts.ts';

/**
 * Saved workouts, and the habit of doing them.
 *
 * A routine is a list of exercises with a name on it, and deliberately nothing
 * else. Every load in it would be stale within a fortnight, so the numbers come
 * from `exercise_sets` — the last time this person did this exercise — which
 * makes the routine true for as long as they keep doing it and means adding two
 * and a half kilos requires no maintenance at all.
 *
 * The second half of this file is the part no other tracker does: reading the
 * week out of the history. Nobody configures "Monday is chest day", but almost
 * everybody has one, and it is already written down in the entries.
 */

// ---- Reading them -----------------------------------------------------------

export interface ListRoutinesOptions {
  category?: ExerciseCategory | null;
  /** Fills in `previous` on every exercise. Off for the agent, on for the card. */
  withPrevious?: boolean;
}

/**
 * Everything this account has saved, most recently used first.
 *
 * Ordering is by use rather than by name because the picker is read in a gym:
 * the thing you did on Tuesday is the thing you are most likely to want on
 * Thursday, and alphabetical would put "Arms" above it forever.
 */
export async function listRoutines(
  userId: string,
  options: ListRoutinesOptions = {},
): Promise<Routine[]> {
  const rows = await query<any>(
    `SELECT r.id, r.name, r.emoji, r.category, r.last_used_at, r.duration_min
       FROM routines r
      WHERE r.user_id = $1 AND ($2::text IS NULL OR r.category = $2)
   ORDER BY r.last_used_at DESC NULLS LAST, r.created_at DESC`,
    [userId, options.category ?? null],
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [exercises, habits, previous, declared] = await Promise.all([
    exercisesFor(ids),
    habitsFor(userId, ids),
    options.withPrevious ? previousSetsFor(userId) : Promise.resolve(new Map<string, SetValues[]>()),
    declaredDays(userId),
  ]);

  return rows.map((row) => {
    const habit = habits.get(row.id);
    return {
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      category: row.category as ExerciseCategory,
      last_used_at: row.last_used_at === null ? null : new Date(row.last_used_at).toISOString(),
      duration_min: row.duration_min === null ? null : Number(row.duration_min),
      times_done: habit?.total ?? 0,
      usual_weekday: habit?.weekday ?? null,
      scheduled_weekdays: declared.get(row.id) ?? [],
      exercises: (exercises.get(row.id) ?? []).map((exercise) => ({
        ...exercise,
        // Keyed on the catalogue id: an exercise typed as free text has no
        // history to look up, and an empty list is the honest answer for it.
        previous: exercise.type_id ? (previous.get(exercise.type_id) ?? []) : [],
      })),
    };
  });
}

export async function getRoutine(userId: string, id: string): Promise<Routine | null> {
  const all = await listRoutines(userId, { withPrevious: true });
  return all.find((routine) => routine.id === id) ?? null;
}

type BareExercise = Omit<RoutineExercise, 'previous'>;

/** Every routine's exercises in one read, so a list of four is not four queries. */
async function exercisesFor(routineIds: string[]): Promise<Map<string, BareExercise[]>> {
  const rows = await query<any>(
    `SELECT re.routine_id, re.name, re.type_id, re.target_sets, re.position,
            t.tracks, t.emoji, t.muscles
       FROM routine_exercises re
       LEFT JOIN exercise_types t ON t.id = re.type_id
      WHERE re.routine_id = ANY($1::uuid[])
   ORDER BY re.routine_id, re.position`,
    [routineIds],
  );

  const byRoutine = new Map<string, BareExercise[]>();
  for (const row of rows) {
    const list = byRoutine.get(row.routine_id) ?? [];
    list.push({
      name: row.name,
      type_id: row.type_id ?? null,
      // A routine exercise whose catalogue row was deleted still has to draw
      // something; reps is what a lifter means by an exercise nine times in ten.
      tracks: (row.tracks as ExerciseTracks) ?? 'reps',
      emoji: row.emoji ?? '🏋️',
      muscles: (row.muscles as MuscleGroup[]) ?? [],
      target_sets: row.target_sets === null ? null : Number(row.target_sets),
    });
    byRoutine.set(row.routine_id, list);
  }
  return byRoutine;
}

/**
 * The last recorded numbers for every exercise this account has ever done.
 *
 * One query for the lot rather than one per exercise: a routine has eight
 * exercises and the card wants them all before it draws anything.
 *
 * "Last" means the most recent *session* that recorded this exercise, and all
 * of that session's sets — not the last few rows, which would slice a session
 * in half and offer back three sets of an exercise that was done for five.
 */
export async function previousSetsFor(userId: string): Promise<Map<string, SetValues[]>> {
  const rows = await query<any>(
    `WITH latest AS (
       SELECT DISTINCT ON (s.type_id) s.type_id, s.entry_id
         FROM exercise_sets s
         JOIN exercise_entries e ON e.id = s.entry_id
        WHERE e.user_id = $1 AND s.type_id IS NOT NULL
     ORDER BY s.type_id, e.performed_at DESC
     )
     SELECT s.type_id, s.reps, s.weight_kg, s.duration_sec, s.distance_m
       FROM exercise_sets s
       JOIN latest ON latest.type_id = s.type_id AND latest.entry_id = s.entry_id
   ORDER BY s.type_id, s.set_number`,
    [userId],
  );

  const byType = new Map<string, SetValues[]>();
  for (const row of rows) {
    const list = byType.get(row.type_id) ?? [];
    list.push({
      reps: row.reps === null ? null : Number(row.reps),
      weight_kg: row.weight_kg === null ? null : Number(row.weight_kg),
      duration_sec: row.duration_sec === null ? null : Number(row.duration_sec),
      distance_m: row.distance_m === null ? null : Number(row.distance_m),
    });
    byType.set(row.type_id, list);
  }
  return byType;
}

// ---- The week ---------------------------------------------------------------

interface Habit {
  total: number;
  weekday: number | null;
}

/**
 * Which weekday each routine tends to land on.
 *
 * Read from `local_date` rather than `performed_at`, so a session logged at one
 * in the morning counts toward the evening it belonged to — the same rule the
 * rest of the app uses for a day, and the reason a late Monday session is not
 * quietly recorded as a Tuesday habit.
 *
 * The bar for claiming a habit is deliberately not one session. Two on the same
 * weekday, and more than half of all the times that routine has been done — so
 * a routine done four times, twice on Monday and once each on Wednesday and
 * Friday, has no usual day, which is the truth about it.
 */
async function habitsFor(userId: string, routineIds: string[]): Promise<Map<string, Habit>> {
  const rows = await query<any>(
    `SELECT routine_id,
            EXTRACT(DOW FROM local_date)::int AS weekday,
            COUNT(*)::int AS on_that_day,
            SUM(COUNT(*)) OVER (PARTITION BY routine_id)::int AS total
       FROM exercise_entries
      WHERE user_id = $1 AND routine_id = ANY($2::uuid[])
   GROUP BY routine_id, weekday
   ORDER BY routine_id, on_that_day DESC, weekday`,
    [userId, routineIds],
  );

  const habits = new Map<string, Habit>();
  for (const row of rows) {
    // Rows arrive best-day-first per routine, so the first one wins and the
    // rest only contribute their totals, which the window function already did.
    if (habits.has(row.routine_id)) continue;
    const onThatDay = Number(row.on_that_day);
    const total = Number(row.total);
    habits.set(row.routine_id, {
      total,
      weekday: onThatDay >= 2 && onThatDay * 2 > total ? Number(row.weekday) : null,
    });
  }
  return habits;
}

// ---- The declared week ------------------------------------------------------

/** Which days each routine has been put on, keyed by routine. */
async function declaredDays(userId: string): Promise<Map<string, number[]>> {
  const rows = await query<{ routine_id: string; weekday: number }>(
    `SELECT routine_id, weekday FROM routine_days WHERE user_id = $1 ORDER BY weekday`,
    [userId],
  );
  const byRoutine = new Map<string, number[]>();
  for (const row of rows) {
    const list = byRoutine.get(row.routine_id) ?? [];
    list.push(Number(row.weekday));
    byRoutine.set(row.routine_id, list);
  }
  return byRoutine;
}

/**
 * The training week: what they said, with what the app worked out filling the gaps.
 *
 * Declared beats learned on any day that has both, and the two are never
 * merged — a day carries its source so the screen can say which it is. That
 * distinction is the whole reason both halves exist: a day somebody set is a
 * decision and must not drift, while a day the app inferred is an observation
 * and should quietly follow the training as it changes.
 */
export async function weekSchedule(userId: string): Promise<WeekSchedule> {
  const routines = await listRoutines(userId);
  const byId = new Map(routines.map((routine) => [routine.id, routine]));

  const declared = await query<{ weekday: number; routine_id: string }>(
    `SELECT weekday, routine_id FROM routine_days WHERE user_id = $1`,
    [userId],
  );
  const set = new Map(declared.map((row) => [Number(row.weekday), row.routine_id]));

  return Array.from({ length: 7 }, (_, weekday): ScheduledDay => {
    const chosen = set.get(weekday);
    const routine =
      (chosen ? byId.get(chosen) : undefined) ??
      // Only ever one learned routine per weekday: habitsFor already requires a
      // routine to own more than half its own sessions on that day, so two
      // routines cannot both claim it.
      routines.find((r) => r.usual_weekday === weekday);

    if (!routine) {
      return { weekday, routine_id: null, routine_name: null, routine_emoji: null, source: null };
    }
    return {
      weekday,
      routine_id: routine.id,
      routine_name: routine.name,
      routine_emoji: routine.emoji,
      source: chosen && byId.has(chosen) ? 'declared' : 'learned',
    };
  });
}

/**
 * Writes the days they set. A day given `null` is cleared rather than pinned to
 * nothing, so it falls back to whatever the history says — which is what makes
 * a half-filled schedule useful instead of a set of holes.
 */
export async function saveSchedule(
  userId: string,
  days: { weekday: number; routine_id: string | null }[],
): Promise<WeekSchedule> {
  await transaction(async (client) => {
    for (const day of days) {
      if (day.routine_id === null) {
        await client.query(`DELETE FROM routine_days WHERE user_id = $1 AND weekday = $2`, [
          userId,
          day.weekday,
        ]);
        continue;
      }
      // The subquery is the ownership check: a routine id from another account
      // inserts nothing rather than scheduling somebody else's workout.
      await client.query(
        `INSERT INTO routine_days (user_id, weekday, routine_id)
         SELECT $1, $2, id FROM routines WHERE id = $3 AND user_id = $1
         ON CONFLICT (user_id, weekday) DO UPDATE SET routine_id = EXCLUDED.routine_id`,
        [userId, day.weekday, day.routine_id],
      );
    }
  });
  return weekSchedule(userId);
}

/**
 * The routine to open the card on, given what day it is.
 *
 * Only ever a suggestion, and only when the history actually supports one — the
 * cost of guessing wrong is somebody logging the wrong workout, so this returns
 * null far more readily than it returns a routine.
 */
export async function routineForWeekday(
  userId: string,
  weekday: number,
  category?: ExerciseCategory | null,
): Promise<Routine | null> {
  // What they said first, then what they do — the shared rule, so that this and
  // the card and the week screen cannot drift into disagreeing. The category
  // filter still applies to both: a declared leg day is not the answer on a
  // cardio card.
  const routines = await listRoutines(userId, { category });
  return routineOnWeekday(routines, weekday);
}

// ---- Writing them -----------------------------------------------------------

export interface SaveRoutineInput {
  userId: string;
  name: string;
  emoji?: string | null;
  category?: ExerciseCategory | null;
  /** Read the exercise list off a session they have just done. */
  fromEntryId?: string | null;
  exercises?: { name: string; type_id?: string | null; target_sets?: number | null }[] | null;
  /**
   * The length of a routine that has no exercises in it. Ignored when there
   * are any: a grid already says how long the workout is, and a second number
   * beside it could only disagree.
   */
  durationMin?: number | null;
}

/**
 * Creates a routine, or replaces the one that already has this name.
 *
 * Replacing rather than failing, because "save this as my push day" said twice
 * is somebody updating their push day. The alternative is an error message
 * about a unique constraint in the middle of a conversation about lifting.
 */
export async function saveRoutine(input: SaveRoutineInput): Promise<Routine> {
  /*
   * Names get resolved against the catalogue on the way in.
   *
   * The caller that matters here is the agent, which knows what the user called
   * an exercise and not what its id is — and a routine holding a bare name is a
   * routine with no history behind it and no muscles on it, which quietly
   * costs it both the prefilled loads and its share of naming the day. Unmatched
   * names still store fine; they just carry nothing extra.
   */
  const exercises = input.fromEntryId
    ? await exercisesFromEntry(input.userId, input.fromEntryId)
    : await Promise.all(
        (input.exercises ?? []).map(async (e) => {
          const name = e.name.trim();
          const type = e.type_id
            ? null
            : await findExerciseType(input.userId, name);
          return {
            name: type?.name ?? name,
            type_id: e.type_id ?? type?.id ?? null,
            target_sets: e.target_sets ?? null,
          };
        }),
      );

  /*
   * A routine with no exercises is saved on its length instead.
   *
   * This is the duration-only session — "cardio, 45 minutes" — which is a
   * complete answer on the card and used to be an unsaveable one, so the people
   * logging the fast way were the only ones who could never earn the one-tap
   * repeat that saving is for. Read off the session when one was named, since
   * that is the caller that matters and it already knows the number.
   */
  const durationMin =
    exercises.length > 0
      ? null
      : (input.durationMin ??
        (input.fromEntryId ? await durationOfEntry(input.userId, input.fromEntryId) : null));

  if (exercises.length === 0 && durationMin === null) {
    throw new Error('A routine needs exercises in it, or a length');
  }

  const category =
    input.category ??
    (input.fromEntryId ? await categoryOfEntry(input.userId, input.fromEntryId) : null) ??
    'strength';

  const id = await transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO routines (user_id, name, emoji, category, duration_min)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, lower(name))
       DO UPDATE SET emoji = EXCLUDED.emoji, category = EXCLUDED.category,
                     duration_min = EXCLUDED.duration_min
       RETURNING id`,
      [input.userId, input.name.trim(), input.emoji || '🏋️', category, durationMin],
    );
    const routineId = rows[0]!.id;

    // Replacing the list wholesale, so an update is "this is what it is now"
    // rather than an append that quietly doubles every exercise.
    await client.query(`DELETE FROM routine_exercises WHERE routine_id = $1`, [routineId]);
    for (const [position, exercise] of exercises.entries()) {
      await client.query(
        `INSERT INTO routine_exercises (routine_id, type_id, name, position, target_sets)
         VALUES ($1,$2,$3,$4,$5)`,
        [routineId, exercise.type_id, exercise.name, position, exercise.target_sets],
      );
    }
    return routineId;
  });

  const saved = await getRoutine(input.userId, id);
  if (!saved) throw new Error('Routine vanished immediately after insert');
  return saved;
}

export async function deleteRoutine(userId: string, id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM routines WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );
  return row !== null;
}

/** Called when a session is logged against a routine, for the picker's ordering. */
export async function touchRoutine(userId: string, id: string, at: Date): Promise<void> {
  await query(
    `UPDATE routines SET last_used_at = GREATEST($3, COALESCE(last_used_at, $3))
      WHERE id = $1 AND user_id = $2`,
    [id, userId, at.toISOString()],
  );
}

/**
 * The exercise list of a session, as a routine would hold it.
 *
 * Collapses the sets into a count: three rows of bench press become one
 * exercise with `target_sets: 3`, because the plan is "three sets of bench" and
 * the weight is not the plan.
 */
async function exercisesFromEntry(userId: string, entryId: string) {
  const rows = await query<any>(
    `SELECT s.name, s.type_id, s.position, COUNT(*)::int AS sets
       FROM exercise_sets s
       JOIN exercise_entries e ON e.id = s.entry_id
      WHERE s.entry_id = $1 AND e.user_id = $2
   GROUP BY s.name, s.type_id, s.position
   ORDER BY s.position`,
    [entryId, userId],
  );
  return rows.map((row) => ({
    name: row.name as string,
    type_id: (row.type_id as string | null) ?? null,
    target_sets: Number(row.sets),
  }));
}

/** How long a session ran, for a routine being saved off one with no sets. */
async function durationOfEntry(userId: string, entryId: string): Promise<number | null> {
  const row = await queryOne<{ duration_min: string | null }>(
    `SELECT duration_min FROM exercise_entries WHERE id = $1 AND user_id = $2`,
    [entryId, userId],
  );
  return row?.duration_min == null ? null : Math.round(Number(row.duration_min));
}

async function categoryOfEntry(userId: string, entryId: string): Promise<ExerciseCategory | null> {
  const row = await queryOne<{ category: string | null }>(
    `SELECT category FROM exercise_entries WHERE id = $1 AND user_id = $2`,
    [entryId, userId],
  );
  return (row?.category as ExerciseCategory | null) ?? null;
}

/** The distinct exercises of a session, in the order they were done. */
async function sessionExercises(
  userId: string,
  entryId: string,
): Promise<{ typeIds: string[]; primaries: MuscleGroup[] }> {
  const rows = await query<{ type_id: string | null; muscles: MuscleGroup[] | null }>(
    `SELECT s.type_id, t.muscles
       FROM exercise_sets s
       JOIN exercise_entries e ON e.id = s.entry_id
       LEFT JOIN exercise_types t ON t.id = s.type_id
      WHERE s.entry_id = $1 AND e.user_id = $2
   GROUP BY s.position, s.type_id, t.muscles
   ORDER BY s.position`,
    [entryId, userId],
  );
  return {
    typeIds: rows.map((row) => row.type_id).filter((id): id is string => id !== null),
    primaries: rows
      .map((row) => row.muscles?.[0])
      .filter((muscle): muscle is MuscleGroup => muscle !== undefined),
  };
}

/**
 * The routine a session already is, if they have one.
 *
 * Matched on the exercises rather than on anything the user said, so it works
 * for a session typed into the chat as readily as one built in the card. This
 * is what keeps the weekday habit readable when somebody does their push day
 * without tapping the push day chip.
 */
export async function matchSessionToRoutine(
  userId: string,
  entryId: string,
  threshold: number = ROUTINE_MATCH_CERTAIN,
): Promise<Routine | null> {
  const { typeIds } = await sessionExercises(userId, entryId);
  if (typeIds.length === 0) return null;
  const routines = await listRoutines(userId);
  return matchRoutine(typeIds, routines, threshold)?.routine ?? null;
}

/**
 * What to call a session nobody has named yet.
 *
 * Offered as the pre-filled name on the save button, so accepting it is a tap
 * and disagreeing with it is a correction rather than a blank field.
 *
 * Two things decide it. If the session is plainly a workout they have already
 * named, that name wins outright — suggesting "Chest day" to somebody whose
 * routine is called "Push" would be the app arguing with its own user about
 * what they call their own training. Otherwise the muscles decide, in the
 * vocabulary of the routines they have already named.
 */
export async function suggestRoutineName(userId: string, entryId: string): Promise<string> {
  const { typeIds, primaries } = await sessionExercises(userId, entryId);
  const routines = await listRoutines(userId);

  const match = matchRoutine(typeIds, routines);
  if (match) return match.routine.name;

  return nameFromMuscles(primaries, namingStyleOf(routines.map((r) => r.name)));
}
