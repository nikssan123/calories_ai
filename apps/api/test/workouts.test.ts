import { beforeEach, describe, expect, it } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import {
  defineExerciseType,
  describe as describeWorkout,
  estimateBurn,
  estimateMinutes,
  findExerciseType,
  getExerciseEntry,
  lastWorkout,
  listExerciseTypes,
  logWorkout,
  primeMetCache,
} from '../src/services/workouts.ts';
import { listExerciseEntries } from '../src/services/log.ts';
import { addWeight, appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * Counted sessions.
 *
 * The distinction this whole model exists for: a run is a sentence and a burn,
 * and a gym session is a load that either went up or did not. Almost everything
 * below is about not losing that load.
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

describe('the catalogue', () => {
  it('ships with exercises across every category', async () => {
    const types = await listExerciseTypes(user.id);
    expect(types.length).toBeGreaterThan(40);
    const categories = new Set(types.map((t) => t.category));
    expect([...categories].sort()).toEqual([
      'cardio',
      'class',
      'flexibility',
      'sport',
      'strength',
    ]);
    // Every one is drawable and says what a set of it looks like.
    for (const t of types) {
      expect(t.emoji, t.name).toBeTruthy();
      expect(['reps', 'duration', 'distance']).toContain(t.tracks);
    }
  });

  it('filters to a category', async () => {
    const strength = await listExerciseTypes(user.id, 'strength');
    expect(strength.every((t) => t.category === 'strength')).toBe(true);
  });

  it('finds a built-in however it is capitalised', async () => {
    expect((await findExerciseType(user.id, 'bench PRESS'))?.name).toBe('Bench press');
  });

  describe('custom exercises', () => {
    it('records one nobody had heard of', async () => {
      const type = await defineExerciseType({
        userId: user.id,
        name: 'Jefferson curl',
        category: 'strength',
        emoji: '🏋️',
        tracks: 'reps',
        met: 4,
      });

      expect(type).toMatchObject({ name: 'Jefferson curl', custom: true });
      // Its own account's picker, and its own account's only.
      expect((await listExerciseTypes(user.id)).some((t) => t.name === 'Jefferson curl')).toBe(true);
      const other = await createUser();
      expect((await listExerciseTypes(other.id)).some((t) => t.name === 'Jefferson curl')).toBe(false);
    });

    /**
     * The caller is usually the agent reacting to something said in passing,
     * and "you have done that before" is not an error worth interrupting a
     * conversation with.
     */
    it('returns the existing one instead of failing on a repeat', async () => {
      const first = await defineExerciseType({
        userId: user.id, name: 'Jefferson curl', category: 'strength', emoji: '🏋️', tracks: 'reps', met: 4,
      });
      const again = await defineExerciseType({
        userId: user.id, name: 'jefferson CURL', category: 'cardio', emoji: '🏃', tracks: 'duration', met: 9,
      });
      expect(again.id).toBe(first.id);
      expect(again.category).toBe('strength');
    });

    it('never shadows a built-in with a duplicate', async () => {
      const type = await defineExerciseType({
        userId: user.id, name: 'Bench press', category: 'strength', emoji: '💪', tracks: 'reps', met: 9,
      });
      expect(type.custom).toBe(false);
    });
  });
});

describe('logWorkout', () => {
  it('writes one row per set, in order', async () => {
    const entry = await logWorkout({
      userId: user.id,
      category: 'strength',
      exercises: [bench([8, 8, 6], 80), { name: 'Squat', sets: [{ reps: 5, weight_kg: 100 }] }],
      ctx: user.ctx,
    });

    expect(entry.sets).toHaveLength(4);
    expect(entry.sets.map((s) => [s.name, s.set_number, s.reps, s.weight_kg])).toEqual([
      ['Bench press', 1, 8, 80],
      ['Bench press', 2, 8, 80],
      ['Bench press', 3, 6, 80],
      ['Squat', 1, 5, 100],
    ]);
  });

  /** The whole point of storing sets rather than a count. */
  it('keeps the set where the reps dropped', async () => {
    const entry = await logWorkout({
      userId: user.id,
      category: 'strength',
      exercises: [bench([8, 8, 5], 80)],
      ctx: user.ctx,
    });
    expect(entry.sets.map((s) => s.reps)).toEqual([8, 8, 5]);
  });

  it('links a known exercise to the catalogue and keeps the name for an unknown one', async () => {
    const entry = await logWorkout({
      userId: user.id,
      category: 'strength',
      exercises: [bench([5], 60), { name: 'Something nobody named', sets: [{ reps: 10 }] }],
      ctx: user.ctx,
    });

    const rows = await query<{ name: string; type_id: string | null }>(
      'SELECT name, type_id FROM exercise_sets WHERE entry_id = $1 ORDER BY position',
      [entry.id],
    );
    expect(rows[0]!.type_id).not.toBeNull();
    expect(rows[1]!.type_id).toBeNull();
    expect(rows[1]!.name).toBe('Something nobody named');
  });

  it('marks the entry as counted rather than estimated', async () => {
    const entry = await logWorkout({
      userId: user.id, category: 'strength', exercises: [bench([5], 60)], ctx: user.ctx,
    });
    expect(entry).toMatchObject({ detail: 'counted', source: 'workout', category: 'strength' });
  });

  it('shows up on the day with its sets', async () => {
    const entry = await logWorkout({
      userId: user.id, category: 'strength', exercises: [bench([8, 8], 80)], ctx: user.ctx,
    });
    const [listed] = await listExerciseEntries(user.id, { localDate: entry.local_date });
    expect(listed!.sets).toHaveLength(2);
  });

  /** A described run has none, and must not pay for a query to find that out. */
  it('leaves an ordinary exercise entry with an empty set list', async () => {
    const { createExerciseEntry } = await import('../src/services/log.ts');
    const run = await createExerciseEntry({
      userId: user.id,
      description: '5km run',
      performedAt: new Date(),
      durationMin: 30,
      distanceKm: 5,
      kcalBurned: 350,
      confidence: 'low',
      source: 'text',
      ctx: user.ctx,
    });
    const [listed] = await listExerciseEntries(user.id, { localDate: run.local_date });
    expect(listed!.sets).toEqual([]);
  });

  it('will not hand another account’s session over', async () => {
    const entry = await logWorkout({
      userId: user.id, category: 'strength', exercises: [bench([5], 60)], ctx: user.ctx,
    });
    const other = await createUser();
    expect(await getExerciseEntry(other.id, entry.id)).toBeNull();
  });

  it('takes the sets with the session when it is deleted', async () => {
    const entry = await logWorkout({
      userId: user.id, category: 'strength', exercises: [bench([5, 5], 60)], ctx: user.ctx,
    });
    await query('DELETE FROM exercise_entries WHERE id = $1', [entry.id]);
    const row = await queryOne<{ n: string }>(
      'SELECT count(*) AS n FROM exercise_sets WHERE entry_id = $1',
      [entry.id],
    );
    expect(Number(row!.n)).toBe(0);
  });
});

describe('the arithmetic', () => {
  /** Three minutes a set — a set plus the rest after it. */
  it('estimates a session length from the sets when nobody said', () => {
    const minutes = estimateMinutes([{ exercise: bench([8, 8, 8], 80), type: null }]);
    expect(minutes).toBe(9);
  });

  it('prefers a recorded duration to the guess', () => {
    const minutes = estimateMinutes([
      { exercise: { name: 'Plank', sets: [{ duration_sec: 60 }, { duration_sec: 60 }] }, type: null },
    ]);
    expect(minutes).toBe(2);
  });

  /**
   * Burn is bodyweight × time × MET. Consistency between two identical sessions
   * matters more here than either figure being exactly right, which is the
   * argument for doing it in code rather than asking the model.
   */
  it('computes burn from bodyweight and time', () => {
    // 5 MET × 80kg × 1h
    expect(estimateBurn([], 60, 80, 'strength')).toBe(400);
    expect(estimateBurn([], 30, 80, 'strength')).toBe(200);
  });

  it('is the same twice for the same session', async () => {
    const one = await logWorkout({
      userId: user.id, category: 'strength', exercises: [bench([8, 8, 8], 80)], ctx: user.ctx,
    });
    const two = await logWorkout({
      userId: user.id, category: 'strength', exercises: [bench([8, 8, 8], 80)], ctx: user.ctx,
    });
    expect(one.kcal_burned).toBe(two.kcal_burned);
  });

  /** A new account has usually not weighed in before its first session. */
  it('falls back to a default body rather than a blank', () => {
    expect(estimateBurn([], 60, null, 'strength')).toBe(375);
  });

  it('rates a stretch far below a session of weights', () => {
    expect(estimateBurn([], 60, 80, 'flexibility')).toBeLessThan(
      estimateBurn([], 60, 80, 'strength'),
    );
  });
});

describe('describe', () => {
  it('names the exercises when there are few enough to read', () => {
    expect(describeWorkout('strength', [bench([5], 60), { name: 'Squat', sets: [{ reps: 5 }] }]))
      .toBe('Bench press, Squat');
  });

  it('summarises a long session rather than listing it', () => {
    const names = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ name: n, sets: [{ reps: 1 }] }));
    expect(describeWorkout('strength', names)).toBe('A, B and 3 more');
  });

  it('falls back to the category when nothing is named', () => {
    expect(describeWorkout('cardio', [])).toBe('Cardio');
  });
});

describe('the routes', () => {
  it('serves the catalogue, filtered', async () => {
    const { app, cookie } = await appFor(user);
    try {
      const all = await app.inject({ method: 'GET', url: '/exercise/types', headers: { cookie } });
      expect(all.json().types.length).toBeGreaterThan(40);

      const cardio = await app.inject({
        method: 'GET',
        url: '/exercise/types?category=cardio',
        headers: { cookie },
      });
      expect(cardio.json().types.every((t: any) => t.category === 'cardio')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('logs a session and answers with it', async () => {
    const { app, cookie } = await appFor(user);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/exercise/workout',
        headers: { cookie },
        payload: { category: 'strength', exercises: [bench([8, 8, 6], 80)] },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ detail: 'counted', description: 'Bench press' });
      expect(response.json().sets).toHaveLength(3);
    } finally {
      await app.close();
    }
  });

  it('refuses a session with nothing in it', async () => {
    const { app, cookie } = await appFor(user);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/exercise/workout',
        headers: { cookie },
        payload: { category: 'strength', exercises: [] },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  /**
   * A question is a thing that stops being one. Without this the card would log
   * the session and then sit in the conversation forever, reappearing on every
   * reopen and inviting the user to log it a second time.
   */
  it('turns the question it answers into a receipt', async () => {
    const { insertMessage, listMessages } = await import('../src/services/chat.ts');
    const message = await insertMessage(user.id, 'assistant', 'What did you get through?', null, null, [
      {
        kind: 'workout_asked',
        entry_id: null,
        summary: 'Gym session',
        card: {
          type: 'workout_prompt',
          suggested_category: 'strength',
          performed_at: new Date().toISOString(),
          heard: 'Gym session',
        },
      },
    ]);

    const { app, cookie } = await appFor(user);
    try {
      await app.inject({
        method: 'POST',
        url: '/exercise/workout',
        headers: { cookie },
        payload: {
          category: 'strength',
          exercises: [bench([8, 8], 80)],
          message_id: message.id,
        },
      });

      const [stored] = await listMessages(user.id);
      expect(stored!.actions[0]!.kind).toBe('exercise_logged');
      expect(stored!.actions[0]!.card).toMatchObject({ type: 'exercise', category: 'strength' });
      expect((stored!.actions[0]!.card as any).sets).toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  it('logs the session even when the message it answers is gone', async () => {
    const { app, cookie } = await appFor(user);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/exercise/workout',
        headers: { cookie },
        payload: {
          category: 'strength',
          exercises: [bench([5], 60)],
          message_id: '00000000-0000-0000-0000-000000000000',
        },
      });
      expect(response.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  it('will not rewrite another account’s message', async () => {
    const { insertMessage, listMessages } = await import('../src/services/chat.ts');
    const other = await createUser();
    const theirs = await insertMessage(other.id, 'assistant', 'Theirs', null, null, [
      {
        kind: 'workout_asked',
        entry_id: null,
        summary: 'Gym',
        card: {
          type: 'workout_prompt',
          suggested_category: null,
          performed_at: new Date().toISOString(),
          heard: null,
        },
      },
    ]);

    const { app, cookie } = await appFor(user);
    try {
      await app.inject({
        method: 'POST',
        url: '/exercise/workout',
        headers: { cookie },
        payload: { category: 'strength', exercises: [bench([5], 60)], message_id: theirs.id },
      });
      const [stored] = await listMessages(other.id);
      expect(stored!.actions[0]!.card!.type).toBe('workout_prompt');
    } finally {
      await app.close();
    }
  });
});

/**
 * A session with no sets in it.
 *
 * The burn is category, bodyweight and time, and the sets contribute nothing to
 * it — so a kind and a duration is a complete session, and the card no longer
 * has to extract fifty-six numbers from somebody who has just finished
 * training to accept one.
 */
describe('a session logged by duration alone', () => {
  it('writes an entry with the category’s own name and a burn from the clock', async () => {
    const entry = await logWorkout({
      userId: user.id,
      category: 'strength',
      exercises: [],
      durationMin: 60,
      ctx: user.ctx,
    });

    expect(entry.description).toBe('Weight training');
    expect(entry.duration_min).toBe(60);
    expect(entry.sets).toHaveLength(0);
    // 5.0 MET × 80 kg × 1 h. Nothing here was estimated by a model.
    expect(entry.kcal_burned).toBeCloseTo(400, 0);
  });

  it('is accepted by the route', async () => {
    const { app, cookie } = await appFor(user);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/exercise/workout',
        headers: { cookie },
        payload: { category: 'cardio', duration_min: 45 },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ description: 'Cardio', duration_min: 45 });
    } finally {
      await app.close();
    }
  });

  /** Neither half given is still nothing to log. */
  it('is refused with neither a duration nor a set', async () => {
    const { app, cookie } = await appFor(user);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/exercise/workout',
        headers: { cookie },
        payload: { category: 'strength' },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

/**
 * "Same as last time".
 *
 * The second push day of somebody's life is the first one with five kilos on
 * it, and retyping eleven exercises to say so is the friction that stops people
 * keeping a log at all.
 */
describe('lastWorkout', () => {
  it('offers the most recent counted session of that kind back', async () => {
    await logWorkout({
      userId: user.id,
      category: 'strength',
      exercises: [bench([8, 8], 70)],
      performedAt: new Date('2026-03-01T10:00:00Z'),
      ctx: user.ctx,
    });
    await logWorkout({
      userId: user.id,
      category: 'strength',
      exercises: [bench([8, 8, 6], 80), { name: 'Squat', sets: [{ reps: 5, weight_kg: 100 }] }],
      performedAt: new Date('2026-03-08T10:00:00Z'),
      ctx: user.ctx,
    });

    const last = await lastWorkout(user.id, 'strength');
    expect(last!.local_date).toBe('2026-03-08');
    expect(last!.exercises.map((e) => e.name)).toEqual(['Bench press', 'Squat']);
    // The load comes back in kilograms, and the card converts at the edge.
    expect(last!.exercises[0]!.sets).toEqual([
      { reps: 8, weight_kg: 80, duration_sec: null, distance_m: null },
      { reps: 8, weight_kg: 80, duration_sec: null, distance_m: null },
      { reps: 6, weight_kg: 80, duration_sec: null, distance_m: null },
    ]);
  });

  /** So the card can draw a plank's clock and a bench's two number fields. */
  it('carries the catalogue’s tracks and emoji for each exercise', async () => {
    await logWorkout({
      userId: user.id,
      category: 'strength',
      exercises: [bench([8], 80), { name: 'Plank', sets: [{ duration_sec: 60 }] }],
      ctx: user.ctx,
    });

    const last = await lastWorkout(user.id, 'strength');
    expect(last!.exercises.map((e) => e.tracks)).toEqual(['reps', 'duration']);
    expect(last!.exercises.every((e) => e.emoji.length > 0)).toBe(true);
  });

  /** A duration-only log is a fine entry and a useless template. */
  it('ignores sessions that recorded no sets', async () => {
    await logWorkout({
      userId: user.id,
      category: 'cardio',
      exercises: [],
      durationMin: 40,
      ctx: user.ctx,
    });
    expect(await lastWorkout(user.id, 'cardio')).toBeNull();
  });

  it('does not reach across kinds, or across accounts', async () => {
    await logWorkout({
      userId: user.id,
      category: 'strength',
      exercises: [bench([8], 80)],
      ctx: user.ctx,
    });
    expect(await lastWorkout(user.id, 'cardio')).toBeNull();

    const other = await createUser();
    expect(await lastWorkout(other.id, 'strength')).toBeNull();
  });

  describe('the route', () => {
    it('answers with null rather than a 404 when there is nothing to offer', async () => {
      const { app, cookie } = await appFor(user);
      try {
        const response = await app.inject({
          method: 'GET',
          url: '/exercise/last?category=strength',
          headers: { cookie },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().workout).toBeNull();
      } finally {
        await app.close();
      }
    });

    it('refuses a category it does not have', async () => {
      const { app, cookie } = await appFor(user);
      try {
        const response = await app.inject({
          method: 'GET',
          url: '/exercise/last?category=interpretive-dance',
          headers: { cookie },
        });
        expect(response.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    });
  });
});
