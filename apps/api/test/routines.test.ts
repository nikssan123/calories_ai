import { beforeEach, describe, expect, it } from 'vitest';
import { matchRoutine, nameFromMuscles, namingStyleOf, routineOverlap } from '@ct/shared';
import {
  deleteRoutine,
  matchSessionToRoutine,
  saveSchedule,
  weekSchedule,
  listRoutines,
  previousSetsFor,
  routineForWeekday,
  saveRoutine,
  suggestRoutineName,
} from '../src/services/routines.ts';
import { logWorkout, primeMetCache } from '../src/services/workouts.ts';
import { addWeight, appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * Saved workouts, and the week they fall into.
 *
 * The feature exists because people repeat themselves, so almost everything
 * below is about the app noticing that without being told: the list comes off a
 * session they already did, the numbers come off the last time they did each
 * exercise, and the weekday comes off the history rather than a setting.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await addWeight(user, '2026-03-01', 80);
  await primeMetCache();
});

const bench = (reps: number[], weight: number) => ({
  name: 'Bench press',
  sets: reps.map((r) => ({ reps: r, weight_kg: weight })),
});

const fly = (reps: number[], weight: number) => ({
  name: 'Chest fly',
  sets: reps.map((r) => ({ reps: r, weight_kg: weight })),
});

/** A session on a given date, so weekday habits can be built deliberately. */
async function session(date: string, exercises: any[], routineId?: string) {
  return logWorkout({
    userId: user.id,
    category: 'strength',
    exercises,
    routineId: routineId ?? null,
    performedAt: new Date(`${date}T10:00:00Z`),
    ctx: user.ctx,
  });
}

/**
 * The two vocabularies.
 *
 * Half the training world splits by muscle — chest day, back day — and half by
 * movement pattern — push, pull, legs. They describe the same exercises, and
 * an app that only knows one of them names the other's workouts wrongly.
 */
describe('naming a session', () => {
  describe('by muscle, for a body-part split', () => {
    it('names a day after the muscle that dominates it', () => {
      expect(nameFromMuscles(['chest', 'chest', 'chest', 'triceps'])).toBe('Chest day');
    });

    it('names a back day that never touched biceps', () => {
      expect(nameFromMuscles(['back', 'back', 'back'])).toBe('Back day');
    });

    /** Nobody has ever called it quads day. */
    it('collapses the four leg muscles into legs', () => {
      expect(nameFromMuscles(['quads', 'hamstrings', 'glutes', 'calves'])).toBe('Legs day');
    });

    it('pairs two muscles that share the work', () => {
      expect(nameFromMuscles(['chest', 'chest', 'triceps', 'triceps'])).toBe('Chest & Triceps');
    });
  });

  describe('by movement, for push/pull/legs', () => {
    /**
     * The case that muscle counting cannot reach: a push day is spread across
     * three muscles by design, so no muscle dominates and the old naming called
     * this "Shoulders & Triceps".
     */
    it('calls bench, overhead press, laterals, dips and pushdowns a push day', () => {
      expect(
        nameFromMuscles(['chest', 'shoulders', 'shoulders', 'triceps', 'triceps']),
      ).toBe('Push');
    });

    /**
     * Back and biceps and nothing else is the one genuinely ambiguous session:
     * "Pull" to one person, "Back & Biceps" to another. With only two muscles
     * in it the named version says more and is wrong for nobody, so that is the
     * default — and the vocabulary hint below moves it for anyone who thinks in
     * movements.
     */
    it('names a two-muscle pull session for its muscles until told otherwise', () => {
      expect(nameFromMuscles(['back', 'back', 'back', 'biceps', 'biceps'])).toBe('Back & Biceps');
      expect(nameFromMuscles(['back', 'back', 'back', 'biceps', 'biceps'], 'pattern')).toBe('Pull');
    });

    /** A rear-delt movement on a pull day must not make it a push day. */
    it('tolerates one exercise from the other side of the split', () => {
      expect(
        nameFromMuscles(['back', 'back', 'back', 'shoulders', 'biceps', 'biceps']),
      ).toBe('Pull');
    });

    it('calls press-and-pull with no legs an upper day', () => {
      expect(
        nameFromMuscles(['chest', 'shoulders', 'back', 'back', 'biceps', 'triceps']),
      ).toBe('Upper');
    });
  });

  describe('following the words they already use', () => {
    const backAndBiceps: Parameters<typeof nameFromMuscles>[0] = [
      'back',
      'back',
      'biceps',
      'biceps',
    ];

    it('says Pull to somebody whose routines are named for movements', () => {
      expect(nameFromMuscles(backAndBiceps, 'pattern')).toBe('Pull');
    });

    it('says Back & Biceps to somebody whose routines are named for muscles', () => {
      expect(nameFromMuscles(backAndBiceps, 'muscle')).toBe('Back & Biceps');
    });

    /** A whole session on one muscle is that muscle's day to everybody. */
    it('still names a single-muscle session for the muscle', () => {
      expect(nameFromMuscles(['shoulders', 'shoulders', 'shoulders'], 'pattern')).toBe(
        'Shoulders day',
      );
      expect(nameFromMuscles(['back', 'back', 'back'], 'pattern')).toBe('Back day');
    });

    /** Neither "Upper" nor "Push" describes an hour of curls and pushdowns. */
    it('calls an arms session arms in either vocabulary', () => {
      expect(nameFromMuscles(['biceps', 'biceps', 'triceps', 'triceps'])).toBe('Arms');
      expect(nameFromMuscles(['biceps', 'biceps', 'triceps', 'triceps'], 'pattern')).toBe('Arms');
    });

    it('reads the vocabulary off the routines they have named', () => {
      expect(namingStyleOf(['Push', 'Pull', 'Legs'])).toBe('pattern');
      expect(namingStyleOf(['Upper', 'Lower'])).toBe('pattern');
      expect(namingStyleOf(['Chest day', 'Back day', 'Shoulders'])).toBe('muscle');
    });

    /** "Leg day" is what both camps call it, so it is evidence of neither. */
    it('takes no view from a name the two systems share', () => {
      expect(namingStyleOf(['Leg day'])).toBeNull();
      expect(namingStyleOf([])).toBeNull();
    });
  });

  it('calls a session spread across everything full body', () => {
    expect(nameFromMuscles(['chest', 'back', 'shoulders', 'biceps', 'quads'])).toBe('Full body');
  });

  /** Abs get trained at the end of everything and must never name the session. */
  it('does not let core decide a day', () => {
    expect(nameFromMuscles(['chest', 'chest', 'chest', 'core'])).toBe('Chest day');
    expect(nameFromMuscles(['core', 'core'])).toBe('Core day');
  });

  it('has something to say about nothing', () => {
    expect(nameFromMuscles([])).toBe('Workout');
  });
});

/**
 * Recognising a session as a workout they already have a name for — however it
 * got logged. Without it, doing your push day without tapping the push day chip
 * leaves the session unlinked and the weekday habit unreadable.
 */
describe('matching a session to a routine', () => {
  const routines = [
    { name: 'Push', exercises: [{ type_id: 'a' }, { type_id: 'b' }, { type_id: 'c' }] },
    { name: 'Pull', exercises: [{ type_id: 'd' }, { type_id: 'e' }] },
  ];

  it('matches a session that is the routine', () => {
    expect(matchRoutine(['a', 'b', 'c'], routines)?.routine.name).toBe('Push');
  });

  it('matches when one exercise of a full routine was swapped', () => {
    const full = [
      { name: 'Push', exercises: 'abcd'.split('').map((t) => ({ type_id: t })) },
    ];
    expect(matchRoutine(['a', 'b', 'c', 'z'], full)?.routine.name).toBe('Push');
    expect(matchRoutine(['a', 'b', 'c'], full)?.routine.name).toBe('Push');
  });

  /**
   * The same one-exercise difference is a third of a three-move routine, and at
   * that size it is no longer the same workout. The threshold is proportional
   * on purpose rather than a fixed count.
   */
  it('is stricter about small routines, where one change is a bigger share', () => {
    expect(matchRoutine(['a', 'b', 'z'], routines)).toBeNull();
  });

  it('matches nothing when the work was different', () => {
    expect(matchRoutine(['x', 'y', 'z'], routines)).toBeNull();
  });

  /** Squats turn up in half of all routines; one exercise is a coincidence. */
  it('never matches on a single shared exercise', () => {
    expect(routineOverlap(['a'], ['a', 'b', 'c'])).toBe(0);
    expect(routineOverlap(['a', 'z'], ['a', 'b', 'c'])).toBe(0);
  });

  /** A subset must not score full marks just because it is contained. */
  it('is not fooled by a fragment of a big routine', () => {
    const big = [{ name: 'Everything', exercises: 'abcdefgh'.split('').map((t) => ({ type_id: t })) }];
    expect(matchRoutine(['a', 'b'], big)).toBeNull();
  });

  it('picks the closest when two routines overlap', () => {
    const overlapping = [
      { name: 'Push A', exercises: [{ type_id: 'a' }, { type_id: 'b' }, { type_id: 'c' }] },
      { name: 'Push B', exercises: [{ type_id: 'a' }, { type_id: 'b' }] },
    ];
    expect(matchRoutine(['a', 'b'], overlapping)?.routine.name).toBe('Push B');
  });
});

describe('saving a routine', () => {
  it('reads the exercise list off a session that was just done', async () => {
    const entry = await session('2026-03-02', [bench([8, 8, 6], 80), fly([12, 12], 15)]);
    const routine = await saveRoutine({
      userId: user.id,
      name: 'Chest day',
      fromEntryId: entry.id,
    });

    expect(routine.name).toBe('Chest day');
    expect(routine.exercises.map((e) => e.name)).toEqual(['Bench press', 'Chest fly']);
    // The sets collapse to a count. Three sets of bench is the plan; 80 kg is not.
    expect(routine.exercises.map((e) => e.target_sets)).toEqual([3, 2]);
  });

  /**
   * The one decision the whole feature rests on: a routine that stored loads
   * would be wrong within a fortnight and would need maintaining.
   */
  it('stores no loads at all', async () => {
    const entry = await session('2026-03-02', [bench([8, 8, 6], 80)]);
    const routine = await saveRoutine({ userId: user.id, name: 'Push', fromEntryId: entry.id });

    const stored = JSON.stringify(routine.exercises.map((e) => e.target_sets));
    expect(stored).not.toContain('80');
  });

  it('takes an explicit list when there is no session to point at', async () => {
    const routine = await saveRoutine({
      userId: user.id,
      name: 'Legs',
      exercises: [
        { name: 'Squat', target_sets: 5 },
        { name: 'Leg curl', target_sets: 3 },
      ],
    });
    expect(routine.exercises.map((e) => e.name)).toEqual(['Squat', 'Leg curl']);
  });

  /** "Save this as my push day", said twice, is an edit. */
  it('replaces the routine that already has that name rather than failing', async () => {
    await saveRoutine({
      userId: user.id,
      name: 'Push',
      exercises: [{ name: 'Bench press', target_sets: 3 }],
    });
    await saveRoutine({
      userId: user.id,
      name: 'push',
      exercises: [
        { name: 'Overhead press', target_sets: 4 },
        { name: 'Dip', target_sets: 3 },
      ],
    });

    const all = await listRoutines(user.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.exercises.map((e) => e.name)).toEqual(['Overhead press', 'Dip']);
  });

  it('refuses a routine with nothing in it', async () => {
    await expect(saveRoutine({ userId: user.id, name: 'Empty', exercises: [] })).rejects.toThrow();
  });

  it('will not read a session belonging to somebody else', async () => {
    const other = await createUser();
    const entry = await session('2026-03-02', [bench([8], 80)]);
    await expect(
      saveRoutine({ userId: other.id, name: 'Theirs', fromEntryId: entry.id }),
    ).rejects.toThrow();
  });
});

/**
 * The workout that is a kind and a length.
 *
 * The card has always taken a bare duration as a complete answer — "cardio, 45
 * minutes" — and saving one used to be impossible, because a routine was
 * defined as its exercise list. That reserved the one-tap repeat for the people
 * already doing the most typing, and left the fast path with no way out of
 * itself. These are the tests that keep the other shape working.
 */
describe('a routine that is only a length', () => {
  /** A session with no sets in it: the whole answer is a kind and a duration. */
  async function timedSession(date: string, minutes: number) {
    return logWorkout({
      userId: user.id,
      category: 'cardio',
      exercises: [],
      durationMin: minutes,
      performedAt: new Date(`${date}T10:00:00Z`),
      ctx: user.ctx,
    });
  }

  it('saves off a session that recorded no exercises, keeping its length', async () => {
    const entry = await timedSession('2026-03-02', 45);
    const routine = await saveRoutine({
      userId: user.id,
      name: 'Morning swim',
      fromEntryId: entry.id,
    });

    expect(routine.exercises).toEqual([]);
    expect(routine.duration_min).toBe(45);
    // The kind comes off the session too, so the chip lands under the right
    // category rather than defaulting to weights.
    expect(routine.category).toBe('cardio');
  });

  it('takes the length directly, for a routine built without a session', async () => {
    const routine = await saveRoutine({
      userId: user.id,
      name: 'Sauna',
      category: 'flexibility',
      durationMin: 30,
    });
    expect(routine.duration_min).toBe(30);
  });

  it('still refuses one with neither exercises nor a length', async () => {
    await expect(
      saveRoutine({ userId: user.id, name: 'Nothing', exercises: [], durationMin: null }),
    ).rejects.toThrow();
  });

  it('leaves the length off a routine that has exercises', async () => {
    const entry = await session('2026-03-02', [bench([8], 80), fly([12], 20)]);
    const routine = await saveRoutine({
      userId: user.id,
      name: 'Push',
      fromEntryId: entry.id,
      // Sent anyway. The grid says how long the workout is and a second number
      // beside it could only disagree with it later.
      durationMin: 90,
    });
    expect(routine.exercises).toHaveLength(2);
    expect(routine.duration_min).toBeNull();
  });

  it('is never matched to a session, having no exercises to match on', async () => {
    const entry = await timedSession('2026-03-02', 45);
    await saveRoutine({ userId: user.id, name: 'Morning swim', fromEntryId: entry.id });

    // A lifting session must not be swallowed by the timed routine just because
    // that routine names nothing: an empty overlap is not a total one.
    const lifting = await session('2026-03-03', [bench([8], 80), fly([12], 20)]);
    expect(await matchSessionToRoutine(user.id, lifting.id)).toBeNull();

    // Nor another timed session, which has no exercises either.
    const swim = await timedSession('2026-03-04', 45);
    expect(await matchSessionToRoutine(user.id, swim.id)).toBeNull();
  });

  it('is replaced rather than duplicated when saved again at a new length', async () => {
    const first = await timedSession('2026-03-02', 45);
    await saveRoutine({ userId: user.id, name: 'Morning swim', fromEntryId: first.id });

    const longer = await timedSession('2026-03-09', 60);
    await saveRoutine({ userId: user.id, name: 'Morning swim', fromEntryId: longer.id });

    const all = await listRoutines(user.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.duration_min).toBe(60);
  });

  it('reads back through listRoutines, so the card can prefill the duration', async () => {
    const entry = await timedSession('2026-03-02', 60);
    await saveRoutine({ userId: user.id, name: 'Long ride', fromEntryId: entry.id });

    const [routine] = await listRoutines(user.id, { category: 'cardio', withPrevious: true });
    expect(routine!.duration_min).toBe(60);
    expect(routine!.exercises).toEqual([]);
  });
});

describe('the numbers a routine puts in front of you', () => {
  /**
   * The load comes from history, which is what lets the routine stay a list.
   */
  it('offers the last session’s sets for each exercise', async () => {
    await session('2026-03-02', [bench([8, 8, 6], 80)]);
    await session('2026-03-09', [bench([8, 8, 8], 82.5)]);

    const routine = await saveRoutine({
      userId: user.id,
      name: 'Push',
      exercises: [{ name: 'Bench press', target_sets: 3 }],
    });
    // saveRoutine resolves names against the catalogue only when an id is
    // given, so read it back through the list, which fills previous in.
    const [stored] = await listRoutines(user.id, { withPrevious: true });
    expect(stored!.id).toBe(routine.id);

    const previous = stored!.exercises[0]!.previous;
    expect(previous.map((s) => s.weight_kg)).toEqual([82.5, 82.5, 82.5]);
    expect(previous.map((s) => s.reps)).toEqual([8, 8, 8]);
  });

  /**
   * A whole session's worth, not the last three rows — slicing mid-session
   * would offer back three sets of something that was done for five.
   */
  it('returns every set of the most recent session, not a fixed number', async () => {
    await session('2026-03-02', [bench([8, 8, 8, 8, 8], 70)]);
    const previous = await previousSetsFor(user.id);
    const [typeId] = [...previous.keys()];
    expect(previous.get(typeId!)).toHaveLength(5);
  });

  it('is empty for an exercise never performed', async () => {
    await saveRoutine({
      userId: user.id,
      name: 'New',
      exercises: [{ name: 'Deadlift', target_sets: 3 }],
    });
    const [routine] = await listRoutines(user.id, { withPrevious: true });
    expect(routine!.exercises[0]!.previous).toEqual([]);
  });

  it('does not leak another account’s numbers', async () => {
    await session('2026-03-02', [bench([8, 8], 80)]);
    const other = await createUser();
    expect((await previousSetsFor(other.id)).size).toBe(0);
  });
});

/**
 * "Monday is chest day" — read out of the history rather than configured,
 * because nobody sets that up and almost everybody has one.
 */
describe('the weekday habit', () => {
  async function pushDay() {
    return saveRoutine({
      userId: user.id,
      name: 'Push',
      exercises: [{ name: 'Bench press', target_sets: 3 }],
    });
  }

  it('spots the day a routine keeps landing on', async () => {
    const routine = await pushDay();
    // 2026-03-02, -09 and -16 are all Mondays.
    await session('2026-03-02', [bench([8], 80)], routine.id);
    await session('2026-03-09', [bench([8], 80)], routine.id);
    await session('2026-03-16', [bench([8], 80)], routine.id);

    const [stored] = await listRoutines(user.id);
    expect(stored!.usual_weekday).toBe(1);
    expect(stored!.times_done).toBe(3);
  });

  /** One session is a session, not a habit. */
  it('claims nothing from a single occurrence', async () => {
    const routine = await pushDay();
    await session('2026-03-02', [bench([8], 80)], routine.id);

    const [stored] = await listRoutines(user.id);
    expect(stored!.usual_weekday).toBeNull();
    expect(stored!.times_done).toBe(1);
  });

  /**
   * Twice on a Monday out of five sessions is not a Monday habit, and saying it
   * is would put the wrong workout in front of somebody every Monday.
   */
  it('claims nothing when the routine is scattered across the week', async () => {
    const routine = await pushDay();
    await session('2026-03-02', [bench([8], 80)], routine.id); // Monday
    await session('2026-03-09', [bench([8], 80)], routine.id); // Monday
    await session('2026-03-04', [bench([8], 80)], routine.id); // Wednesday
    await session('2026-03-06', [bench([8], 80)], routine.id); // Friday
    await session('2026-03-07', [bench([8], 80)], routine.id); // Saturday

    const [stored] = await listRoutines(user.id);
    expect(stored!.usual_weekday).toBeNull();
  });

  it('answers which routine belongs to a given weekday', async () => {
    const routine = await pushDay();
    await session('2026-03-02', [bench([8], 80)], routine.id);
    await session('2026-03-09', [bench([8], 80)], routine.id);

    expect((await routineForWeekday(user.id, 1))?.name).toBe('Push');
    expect(await routineForWeekday(user.id, 4)).toBeNull();
  });
});

describe('logging against a routine', () => {
  it('calls the session by the routine’s name', async () => {
    const routine = await saveRoutine({
      userId: user.id,
      name: 'Chest day',
      exercises: [{ name: 'Bench press', target_sets: 3 }],
    });
    const entry = await session('2026-03-02', [bench([8, 8, 6], 80)], routine.id);
    expect(entry.description).toBe('Chest day');
  });

  it('moves the routine to the front of the picker', async () => {
    const first = await saveRoutine({
      userId: user.id,
      name: 'A',
      exercises: [{ name: 'Squat', target_sets: 3 }],
    });
    await saveRoutine({ userId: user.id, name: 'B', exercises: [{ name: 'Dip', target_sets: 3 }] });

    await session('2026-03-02', [bench([8], 80)], first.id);
    const all = await listRoutines(user.id);
    expect(all[0]!.name).toBe('A');
  });

  /** A name from another account must not become this session's description. */
  it('ignores a routine id that is not theirs', async () => {
    const other = await createUser();
    const theirs = await saveRoutine({
      userId: other.id,
      name: 'Theirs',
      exercises: [{ name: 'Squat', target_sets: 3 }],
    });
    const entry = await session('2026-03-02', [bench([8], 80)], theirs.id);
    expect(entry.description).toBe('Bench press');
  });

  /**
   * Deleting a routine you have stopped doing must not delete the months you
   * spent doing it.
   */
  it('leaves the history behind when the routine is deleted', async () => {
    const routine = await saveRoutine({
      userId: user.id,
      name: 'Old',
      exercises: [{ name: 'Squat', target_sets: 3 }],
    });
    const entry = await session('2026-03-02', [bench([8], 80)], routine.id);

    expect(await deleteRoutine(user.id, routine.id)).toBe(true);
    const { getExerciseEntry } = await import('../src/services/workouts.ts');
    const still = await getExerciseEntry(user.id, entry.id);
    expect(still?.sets).toHaveLength(1);
  });

  it('will not delete another account’s routine', async () => {
    const other = await createUser();
    const theirs = await saveRoutine({
      userId: other.id,
      name: 'Theirs',
      exercises: [{ name: 'Squat', target_sets: 3 }],
    });
    expect(await deleteRoutine(user.id, theirs.id)).toBe(false);
  });
});

/**
 * The end-to-end version: a session typed into the chat, never linked to a
 * routine by hand, still recognised as the workout it is.
 */
describe('recognising a session as a routine they already have', () => {
  const row = (name: string) => ({ name, sets: [{ reps: 10, weight_kg: 40 }] });

  async function pushRoutine() {
    return saveRoutine({
      userId: user.id,
      name: 'Push',
      exercises: [
        { name: 'Bench press', target_sets: 3 },
        { name: 'Overhead press', target_sets: 3 },
        { name: 'Lateral raise', target_sets: 3 },
        { name: 'Tricep extension', target_sets: 3 },
      ],
    });
  }

  it('names and links a matching session logged without one', async () => {
    const routine = await pushRoutine();
    const entry = await session('2026-03-02', [
      row('Bench press'),
      row('Overhead press'),
      row('Lateral raise'),
      row('Tricep extension'),
    ]);

    expect(entry.description).toBe('Push');
    expect(await matchSessionToRoutine(user.id, entry.id)).toMatchObject({ id: routine.id });
  });

  /** Which is what makes the weekday habit readable at all. */
  it('counts toward that routine’s weekday habit', async () => {
    await pushRoutine();
    // Two Mondays, neither logged against the routine by hand.
    for (const date of ['2026-03-02', '2026-03-09']) {
      await session(date, [row('Bench press'), row('Overhead press'), row('Lateral raise')]);
    }

    const [stored] = await listRoutines(user.id);
    expect(stored!.name).toBe('Push');
    expect(stored!.times_done).toBe(2);
    expect(stored!.usual_weekday).toBe(1);
  });

  it('leaves a genuinely different session alone', async () => {
    await pushRoutine();
    const entry = await session('2026-03-02', [
      row('Squat'),
      row('Leg press'),
      row('Leg curl'),
    ]);
    expect(entry.description).toBe('Squat, Leg press, Leg curl');
    expect(await matchSessionToRoutine(user.id, entry.id)).toBeNull();
  });

  /** An explicit choice is never second-guessed by the matcher. */
  it('does not override a routine they picked themselves', async () => {
    await pushRoutine();
    const legs = await saveRoutine({
      userId: user.id,
      name: 'Legs',
      exercises: [{ name: 'Squat', target_sets: 3 }],
    });
    const entry = await session(
      '2026-03-02',
      [row('Bench press'), row('Overhead press'), row('Lateral raise')],
      legs.id,
    );
    expect(entry.description).toBe('Legs');
  });

  it('does not reach into another account’s routines', async () => {
    const other = await createUser();
    await saveRoutine({
      userId: other.id,
      name: 'Theirs',
      exercises: [
        { name: 'Bench press', target_sets: 3 },
        { name: 'Overhead press', target_sets: 3 },
      ],
    });
    const entry = await session('2026-03-02', [row('Bench press'), row('Overhead press')]);
    expect(entry.description).not.toBe('Theirs');
  });
});

describe('suggesting a name for a session', () => {
  it('reads the primary muscles off the catalogue', async () => {
    const entry = await session('2026-03-02', [bench([8, 8], 80), fly([12], 15)]);
    expect(await suggestRoutineName(user.id, entry.id)).toBe('Chest day');
  });

  /** Arguing with somebody about what they call their own training is a bug. */
  it('offers back the name they already gave this workout', async () => {
    await saveRoutine({
      userId: user.id,
      name: 'Push',
      exercises: [
        { name: 'Bench press', target_sets: 3 },
        { name: 'Chest fly', target_sets: 3 },
        { name: 'Tricep extension', target_sets: 3 },
      ],
    });
    const entry = await session('2026-03-02', [
      bench([8], 80),
      fly([12], 15),
      { name: 'Tricep extension', sets: [{ reps: 12, weight_kg: 25 }] },
    ]);
    expect(await suggestRoutineName(user.id, entry.id)).toBe('Push');
  });

  it('names a new workout in the vocabulary of their existing ones', async () => {
    await saveRoutine({
      userId: user.id,
      name: 'Pull',
      exercises: [{ name: 'Barbell row', target_sets: 3 }, { name: 'Bicep curl', target_sets: 3 }],
    });
    // Chest and triceps only: "Chest & Triceps" by default, "Push" to someone
    // who has already told the app they think in movements.
    const entry = await session('2026-03-03', [
      bench([8], 80),
      fly([12], 15),
      { name: 'Dip', sets: [{ reps: 10 }] },
      { name: 'Tricep extension', sets: [{ reps: 12, weight_kg: 25 }] },
    ]);
    expect(await suggestRoutineName(user.id, entry.id)).toBe('Push');
  });

  it('falls back to a workout when nothing is tagged', async () => {
    const entry = await logWorkout({
      userId: user.id,
      category: 'strength',
      exercises: [{ name: 'Something the app has never heard of', sets: [{ reps: 8 }] }],
      ctx: user.ctx,
    });
    expect(await suggestRoutineName(user.id, entry.id)).toBe('Workout');
  });
});

/**
 * The declared week, and how it sits beside the inferred one.
 *
 * Inference needs no setup and knows nothing for a fortnight; declaring needs
 * ten seconds and works immediately. Neither is sufficient alone, which is why
 * both are here and why a day always says which it is.
 */
describe('the schedule', () => {
  async function push() {
    return saveRoutine({
      userId: user.id,
      name: 'Push',
      exercises: [{ name: 'Bench press', target_sets: 3 }],
    });
  }
  async function pull() {
    return saveRoutine({
      userId: user.id,
      name: 'Pull',
      exercises: [{ name: 'Barbell row', target_sets: 3 }],
    });
  }

  it('is seven days whether or not anything is in it', async () => {
    const week = await weekSchedule(user.id);
    expect(week).toHaveLength(7);
    expect(week.every((day) => day.routine_id === null && day.source === null)).toBe(true);
  });

  it('records the days they set', async () => {
    const routine = await push();
    const week = await saveSchedule(user.id, [
      { weekday: 1, routine_id: routine.id },
      { weekday: 4, routine_id: routine.id },
    ]);

    expect(week[1]).toMatchObject({ routine_name: 'Push', source: 'declared' });
    // The same routine twice in a week — which is exactly why the schedule is a
    // table of days rather than a column on the routine.
    expect(week[4]).toMatchObject({ routine_name: 'Push', source: 'declared' });
    expect(week[2]!.routine_id).toBeNull();
  });

  it('reports both days back on the routine itself', async () => {
    const routine = await push();
    await saveSchedule(user.id, [
      { weekday: 1, routine_id: routine.id },
      { weekday: 4, routine_id: routine.id },
    ]);
    const [stored] = await listRoutines(user.id);
    expect(stored!.scheduled_weekdays).toEqual([1, 4]);
  });

  it('replaces whatever was on that day', async () => {
    const a = await push();
    const b = await pull();
    await saveSchedule(user.id, [{ weekday: 1, routine_id: a.id }]);
    const week = await saveSchedule(user.id, [{ weekday: 1, routine_id: b.id }]);
    expect(week[1]).toMatchObject({ routine_name: 'Pull', source: 'declared' });
  });

  /** The point of the whole arrangement. */
  it('lets what they said outrank what the app inferred', async () => {
    const a = await push();
    const b = await pull();
    // Two Mondays of Pull, which is a habit the app would otherwise report.
    await session('2026-03-02', [{ name: 'Barbell row', sets: [{ reps: 8 }] }], b.id);
    await session('2026-03-09', [{ name: 'Barbell row', sets: [{ reps: 8 }] }], b.id);
    expect((await weekSchedule(user.id))[1]).toMatchObject({
      routine_name: 'Pull',
      source: 'learned',
    });

    await saveSchedule(user.id, [{ weekday: 1, routine_id: a.id }]);
    expect((await weekSchedule(user.id))[1]).toMatchObject({
      routine_name: 'Push',
      source: 'declared',
    });
  });

  /** Clearing a day hands it back to the history rather than blanking it. */
  it('falls back to the inference when a day is cleared', async () => {
    const a = await push();
    const b = await pull();
    await session('2026-03-02', [{ name: 'Barbell row', sets: [{ reps: 8 }] }], b.id);
    await session('2026-03-09', [{ name: 'Barbell row', sets: [{ reps: 8 }] }], b.id);
    await saveSchedule(user.id, [{ weekday: 1, routine_id: a.id }]);

    const week = await saveSchedule(user.id, [{ weekday: 1, routine_id: null }]);
    expect(week[1]).toMatchObject({ routine_name: 'Pull', source: 'learned' });
  });

  it('is what the card asks for when it wants today’s workout', async () => {
    const routine = await push();
    await saveSchedule(user.id, [{ weekday: 3, routine_id: routine.id }]);
    expect((await routineForWeekday(user.id, 3))?.name).toBe('Push');
    expect(await routineForWeekday(user.id, 5)).toBeNull();
  });

  it('will not schedule another account’s routine', async () => {
    const other = await createUser();
    const theirs = await saveRoutine({
      userId: other.id,
      name: 'Theirs',
      exercises: [{ name: 'Squat', target_sets: 3 }],
    });
    const week = await saveSchedule(user.id, [{ weekday: 1, routine_id: theirs.id }]);
    expect(week[1]!.routine_id).toBeNull();
  });

  /** A plan to do a workout that no longer exists is not worth keeping. */
  it('drops the day when the routine is deleted', async () => {
    const routine = await push();
    await saveSchedule(user.id, [{ weekday: 1, routine_id: routine.id }]);
    await deleteRoutine(user.id, routine.id);
    expect((await weekSchedule(user.id))[1]!.routine_id).toBeNull();
  });

  describe('the route', () => {
    it('serves and sets the week', async () => {
      const routine = await push();
      const { app, cookie } = await appFor(user);
      try {
        const set = await app.inject({
          method: 'PUT',
          url: '/routines/schedule',
          headers: { cookie },
          payload: { days: [{ weekday: 2, routine_id: routine.id }] },
        });
        expect(set.statusCode).toBe(200);
        expect(set.json().week[2]).toMatchObject({ routine_name: 'Push', source: 'declared' });

        const read = await app.inject({
          method: 'GET',
          url: '/routines/schedule',
          headers: { cookie },
        });
        expect(read.json().week).toHaveLength(7);
        expect(read.json().week[2].routine_name).toBe('Push');
      } finally {
        await app.close();
      }
    });

    /** "schedule" must never be read as a routine id by the delete route. */
    it('does not collide with the routine id routes', async () => {
      const { app, cookie } = await appFor(user);
      try {
        const response = await app.inject({
          method: 'GET',
          url: '/routines/schedule',
          headers: { cookie },
        });
        expect(response.statusCode).toBe(200);
      } finally {
        await app.close();
      }
    });

    it('refuses a weekday outside the week', async () => {
      const { app, cookie } = await appFor(user);
      try {
        const response = await app.inject({
          method: 'PUT',
          url: '/routines/schedule',
          headers: { cookie },
          payload: { days: [{ weekday: 9, routine_id: null }] },
        });
        expect(response.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    });
  });
});

describe('the routes', () => {
  it('lists routines with their previous numbers', async () => {
    await session('2026-03-02', [bench([8, 8, 6], 80)]);
    await saveRoutine({
      userId: user.id,
      name: 'Push',
      exercises: [{ name: 'Bench press', target_sets: 3 }],
    });

    const { app, cookie } = await appFor(user);
    try {
      const response = await app.inject({ method: 'GET', url: '/routines', headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const [routine] = response.json().routines;
      expect(routine.name).toBe('Push');
      expect(routine.exercises[0].previous).toHaveLength(3);
    } finally {
      await app.close();
    }
  });

  it('saves one from a logged session', async () => {
    const entry = await session('2026-03-02', [bench([8, 8], 80), fly([12], 15)]);
    const { app, cookie } = await appFor(user);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/routines',
        headers: { cookie },
        payload: { name: 'Chest day', from_entry_id: entry.id },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().exercises).toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  it('refuses a routine with neither a session nor a list', async () => {
    const { app, cookie } = await appFor(user);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/routines',
        headers: { cookie },
        payload: { name: 'Nothing' },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('logs a session against a routine through the card', async () => {
    const routine = await saveRoutine({
      userId: user.id,
      name: 'Chest day',
      exercises: [{ name: 'Bench press', target_sets: 3 }],
    });

    const { app, cookie } = await appFor(user);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/exercise/workout',
        headers: { cookie },
        payload: {
          category: 'strength',
          routine_id: routine.id,
          exercises: [bench([8, 8, 6], 80)],
        },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().description).toBe('Chest day');
    } finally {
      await app.close();
    }
  });

  it('deletes one, and only its owner’s', async () => {
    const routine = await saveRoutine({
      userId: user.id,
      name: 'Push',
      exercises: [{ name: 'Dip', target_sets: 3 }],
    });
    const { app, cookie } = await appFor(user);
    try {
      const gone = await app.inject({
        method: 'DELETE',
        url: `/routines/${routine.id}`,
        headers: { cookie },
      });
      expect(gone.statusCode).toBe(204);

      const again = await app.inject({
        method: 'DELETE',
        url: `/routines/${routine.id}`,
        headers: { cookie },
      });
      expect(again.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
