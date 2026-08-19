import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query } from '../src/db.ts';
import { getFoodEntry, listExerciseEntries } from '../src/services/log.ts';
import { insertMessage } from '../src/services/chat.ts';
import { targetsForDate } from '../src/services/targets.ts';
import { getUser } from '../src/services/user.ts';
import { localDateFor } from '../src/time.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import {
  addMeal,
  addWeight,
  appFor,
  anonymousApp,
  createUser,
  seedAdaptiveWindow,
  setUserTargets,
  type TestUser,
} from './helpers/factories.ts';

let user: TestUser;
let other: TestUser;
let app: FastifyInstance;
let cookie: string;
let today: string;

beforeEach(async () => {
  user = await createUser();
  other = await createUser();
  ({ app, cookie } = await appFor(user));
  today = localDateFor(new Date(), user.ctx);
  await setUserTargets(user, '2020-01-01', { kcal: 2200, protein_g: 160 });
});

afterEach(async () => {
  await app.close();
});

const auth = (extra: Record<string, unknown> = {}) => ({ headers: { cookie }, ...extra });

describe('GET /health', () => {
  it('is public and reports how the agent authenticates', async () => {
    const anon = await anonymousApp();
    const response = await anon.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, auth: expect.any(String) });
    await anon.close();
  });
});

describe('authentication guard', () => {
  it.each([
    ['GET', '/day'],
    ['GET', '/progress'],
    ['GET', '/profile'],
    ['GET', '/chat/history'],
    ['GET', '/history/meals'],
    ['GET', '/reviews'],
    ['GET', '/targets/adaptive'],
    ['POST', '/chat'],
    ['POST', '/weight'],
  ])('rejects an anonymous %s %s', async (method, url) => {
    const anon = await anonymousApp();
    const response = await anon.inject({ method: method as never, url });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Not signed in.' });
    await anon.close();
  });

  it('rejects a session token that is not real', async () => {
    const anon = await anonymousApp();
    const response = await anon.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: 'ct_session=made-up' },
    });
    expect(response.statusCode).toBe(401);
    await anon.close();
  });
});

describe('GET /day', () => {
  it('returns today by default', async () => {
    await addMeal(user, { date: today, kcal: 620 });
    const response = await app.inject({ method: 'GET', url: '/day', ...auth() });
    expect(response.json()).toMatchObject({ local_date: today, consumed: { kcal: 620 } });
  });

  it('accepts an explicit date', async () => {
    await addMeal(user, { date: '2026-03-08', kcal: 400 });
    const response = await app.inject({ method: 'GET', url: '/day?date=2026-03-08', ...auth() });
    expect(response.json().consumed.kcal).toBe(400);
  });
});

describe('GET /progress', () => {
  it('defaults to a 30-day window', async () => {
    const response = await app.inject({ method: 'GET', url: '/progress', ...auth() });
    expect(response.json().calories.series).toHaveLength(30);
  });

  it('clamps the window to between a week and a year', async () => {
    const short = await app.inject({ method: 'GET', url: '/progress?days=1', ...auth() });
    expect(short.json().calories.series).toHaveLength(7);

    const long = await app.inject({ method: 'GET', url: '/progress?days=9999', ...auth() });
    expect(long.json().calories.series).toHaveLength(365);
  });
});

describe('food entry routes', () => {
  it('reads one entry, and 404s on another account’s', async () => {
    const mine = await addMeal(user, { date: today, kcal: 500 });
    const theirs = await addMeal(other, { date: today, kcal: 500 });

    expect((await app.inject({ method: 'GET', url: `/entries/food/${mine.id}`, ...auth() })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/entries/food/${theirs.id}`, ...auth() })).statusCode).toBe(404);
  });

  it('patches meal, description and time', async () => {
    const entry = await addMeal(user, { date: today, kcal: 500, meal: 'lunch' });
    const response = await app.inject({
      method: 'PATCH',
      url: `/entries/food/${entry.id}`,
      ...auth({ payload: { meal: 'dinner', description: 'Renamed' } }),
    });
    expect(response.json()).toMatchObject({ meal: 'dinner', description: 'Renamed' });
  });

  it('rejects an invalid patch', async () => {
    const entry = await addMeal(user, { date: today, kcal: 500 });
    const response = await app.inject({
      method: 'PATCH',
      url: `/entries/food/${entry.id}`,
      ...auth({ payload: { meal: 'brunch' } }),
    });
    expect(response.statusCode).toBe(400);
  });

  it('404s when patching an entry that is not yours', async () => {
    const theirs = await addMeal(other, { date: today, kcal: 500 });
    const response = await app.inject({
      method: 'PATCH',
      url: `/entries/food/${theirs.id}`,
      ...auth({ payload: { description: 'Hijacked' } }),
    });
    expect(response.statusCode).toBe(404);
  });

  it('deletes food and exercise, and 404s the second time', async () => {
    const entry = await addMeal(user, { date: today, kcal: 500 });
    expect((await app.inject({ method: 'DELETE', url: `/entries/food/${entry.id}`, ...auth() })).json())
      .toEqual({ ok: true });
    expect((await app.inject({ method: 'DELETE', url: `/entries/food/${entry.id}`, ...auth() })).statusCode)
      .toBe(404);

    const { createExerciseEntry } = await import('../src/services/log.ts');
    const exercise = await createExerciseEntry({
      userId: user.id,
      description: 'run',
      performedAt: new Date(),
      durationMin: 30,
      kcalBurned: 300,
      confidence: 'low',
      source: 'text',
      ctx: user.ctx,
    });
    expect((await app.inject({ method: 'DELETE', url: `/entries/exercise/${exercise.id}`, ...auth() })).statusCode)
      .toBe(200);
    expect(await listExerciseEntries(user.id)).toEqual([]);
  });
});

describe('repeat a meal', () => {
  it('lists the meals this account actually eats', async () => {
    await addMeal(user, { date: '2026-03-01', kcal: 500, description: 'Porridge' });
    await addMeal(user, { date: '2026-03-02', kcal: 500, description: 'Porridge' });

    const response = await app.inject({ method: 'GET', url: '/history/meals?days=365', ...auth() });
    expect(response.json().meals[0]).toMatchObject({ description: 'Porridge', times: 2 });
  });

  it('passes the filters through, ignoring a nonsense meal slot', async () => {
    await addMeal(user, { date: '2026-03-01', kcal: 500, description: 'Porridge', meal: 'breakfast' });
    await addMeal(user, { date: '2026-03-02', kcal: 700, description: 'Curry', meal: 'dinner' });

    const filtered = await app.inject({
      method: 'GET',
      url: '/history/meals?days=365&meal=dinner&query=cur&limit=5',
      ...auth(),
    });
    expect(filtered.json().meals.map((m: any) => m.description)).toEqual(['Curry']);

    const bogus = await app.inject({ method: 'GET', url: '/history/meals?days=365&meal=brunch', ...auth() });
    expect(bogus.json().meals).toHaveLength(2);
  });

  it('falls back to defaults for unparseable numbers', async () => {
    const response = await app.inject({ method: 'GET', url: '/history/meals?days=abc&limit=xyz', ...auth() });
    expect(response.statusCode).toBe(200);
  });

  it('clones an entry to now', async () => {
    const source = await addMeal(user, { date: '2026-03-01', kcal: 620, description: 'Porridge' });

    const response = await app.inject({
      method: 'POST',
      url: `/entries/food/${source.id}/repeat`,
      ...auth({ payload: {} }),
    });

    expect(response.statusCode).toBe(201);
    const copy = response.json();
    expect(copy.id).not.toBe(source.id);
    expect(copy).toMatchObject({ description: 'Porridge', kcal: 620, source: 'quick', local_date: today });
    expect(await getFoodEntry(user.id, source.id)).not.toBeNull();
  });

  it('accepts an explicit meal and time', async () => {
    const source = await addMeal(user, { date: '2026-03-01', kcal: 620 });
    const response = await app.inject({
      method: 'POST',
      url: `/entries/food/${source.id}/repeat`,
      ...auth({ payload: { meal: 'snack', eaten_at: '2026-03-05T15:00:00Z' } }),
    });
    expect(response.json()).toMatchObject({ meal: 'snack', local_date: '2026-03-05' });
  });

  it('rejects an invalid body and 404s an unknown entry', async () => {
    const source = await addMeal(user, { date: '2026-03-01', kcal: 620 });
    expect(
      (await app.inject({
        method: 'POST',
        url: `/entries/food/${source.id}/repeat`,
        ...auth({ payload: { meal: 'brunch' } }),
      })).statusCode,
    ).toBe(400);

    const theirs = await addMeal(other, { date: '2026-03-01', kcal: 620 });
    expect(
      (await app.inject({ method: 'POST', url: `/entries/food/${theirs.id}/repeat`, ...auth({ payload: {} }) })).statusCode,
    ).toBe(404);
  });
});

describe('POST /weight', () => {
  it('records a weigh-in', async () => {
    const response = await app.inject({ method: 'POST', url: '/weight', ...auth({ payload: { weight_kg: 84.2 } }) });
    expect(response.json()).toMatchObject({ weight_kg: 84.2, local_date: today });
  });

  it('accepts an explicit measurement time', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/weight',
      ...auth({ payload: { weight_kg: 84.2, measured_at: '2026-03-05T09:00:00Z' } }),
    });
    expect(response.json().local_date).toBe('2026-03-05');
  });

  it.each([{ weight_kg: -1 }, { weight_kg: 900 }, { weight_kg: 'heavy' }, {}])(
    'rejects %j',
    async (payload) => {
      const response = await app.inject({ method: 'POST', url: '/weight', ...auth({ payload }) });
      expect(response.statusCode).toBe(400);
    },
  );
});

describe('profile routes', () => {
  it('returns the profile', async () => {
    const response = await app.inject({ method: 'GET', url: '/profile', ...auth() });
    expect(response.json()).toMatchObject({ id: user.id, email: user.email });
  });

  it('patches it and recalculates the target', async () => {
    await addWeight(user, today, 85);
    const response = await app.inject({
      method: 'PATCH',
      url: '/profile',
      ...auth({ payload: { height_cm: 185, goal: 'gain' } }),
    });

    expect(response.json()).toMatchObject({ height_cm: 185, goal: 'gain' });
    const targets = await targetsForDate(user.id, today);
    expect(targets.kcal).not.toBe(2200);
    expect(targets.source).toBe('calculated');
  });

  it('leaves a manually set target alone', async () => {
    await setUserTargets(user, today, { kcal: 1900, is_custom: true, source: 'manual' });
    await app.inject({ method: 'PATCH', url: '/profile', ...auth({ payload: { height_cm: 185 } }) });
    expect((await targetsForDate(user.id, today)).kcal).toBe(1900);
  });

  it('rejects an invalid patch', async () => {
    const response = await app.inject({ method: 'PATCH', url: '/profile', ...auth({ payload: { sex: 'yes' } }) });
    expect(response.statusCode).toBe(400);
  });

  it('marks an account onboarded once the required fields land', async () => {
    const fresh = await createUser({
      sex: null, birth_date: null, height_cm: null, goal: null, is_setup_complete: false,
    });
    const { app: freshApp, cookie: freshCookie } = await appFor(fresh);
    try {
      await freshApp.inject({
        method: 'PATCH',
        url: '/profile',
        headers: { cookie: freshCookie },
        payload: { sex: 'male', birth_date: '1990-01-01', height_cm: 180, goal: 'lose' },
      });
      expect((await getUser(fresh.id)).is_setup_complete).toBe(true);
    } finally {
      await freshApp.close();
    }
  });

  it('reports what onboarding still needs', async () => {
    const fresh = await createUser({ sex: null, goal: null, is_setup_complete: false });
    const { app: freshApp, cookie: freshCookie } = await appFor(fresh);
    try {
      const response = await freshApp.inject({
        method: 'GET',
        url: '/onboarding',
        headers: { cookie: freshCookie },
      });
      expect(response.json()).toEqual({ complete: false, missing: ['sex', 'goal'] });
    } finally {
      await freshApp.close();
    }

    expect((await app.inject({ method: 'GET', url: '/onboarding', ...auth() })).json()).toEqual({
      complete: true,
      missing: [],
    });
  });
});

describe('GET /targets/adaptive', () => {
  it('explains why it cannot act yet', async () => {
    const response = await app.inject({ method: 'GET', url: '/targets/adaptive', ...auth() });
    expect(response.json()).toMatchObject({
      eligible: false,
      blocked_by: 'not_enough_logged_days',
      delta_kcal: 0,
    });
  });

  it('previews a change without making it', async () => {
    await seedAdaptiveWindow(user, {
      endDate: today,
      kcalPerDay: 2200,
      startWeightKg: 85,
      kgPerWeek: -0.5,
    });
    const response = await app.inject({ method: 'GET', url: '/targets/adaptive', ...auth() });
    const body = response.json();

    expect(body.eligible).toBe(true);
    expect(body.proposed.kcal).not.toBe(body.current.kcal);
    // Nothing was written.
    expect((await targetsForDate(user.id, today)).kcal).toBe(2200);
  });
});

describe('chat', () => {
  it('runs a turn and returns the day with it', async () => {
    scriptAgent({ text: 'Added to lunch — ~620 kcal.' });
    const response = await app.inject({ method: 'POST', url: '/chat', ...auth({ payload: { text: 'chicken and rice' } }) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: { role: 'assistant', content: 'Added to lunch — ~620 kcal.' },
      actions: [],
      day: { local_date: today },
    });
  });

  it.each([{}, { text: '' }, { text: 'x'.repeat(4001) }])('rejects %j', async (payload) => {
    const response = await app.inject({ method: 'POST', url: '/chat', ...auth({ payload }) });
    expect(response.statusCode).toBe(400);
  });

  it('reports a failed turn as a bad gateway, not a crash', async () => {
    scriptAgent({ throws: 'the model exploded' });
    const response = await app.inject({ method: 'POST', url: '/chat', ...auth({ payload: { text: 'hi' } }) });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toBe('the model exploded');
  });

  it('stores an attached photo and links it to the message', async () => {
    scriptAgent({ text: 'Looks like ~700 kcal.' });
    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      ...auth({
        payload: {
          text: 'what is this?',
          photo_base64:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          photo_media_type: 'image/png',
        },
      }),
    });

    expect(response.statusCode).toBe(200);
    const photos = await query<{ id: string }>('SELECT id FROM photos WHERE user_id = $1', [user.id]);
    expect(photos).toHaveLength(1);
  });

  it('returns 503 rather than failing obscurely without credentials', async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const client = await import('../src/ai/client.ts');
    const spy = vi.spyOn(client, 'hasSubscriptionAuth').mockReturnValue(false);
    try {
      const response = await app.inject({ method: 'POST', url: '/chat', ...auth({ payload: { text: 'hi' } }) });
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toMatch(/No Claude credentials/);
    } finally {
      spy.mockRestore();
      process.env.ANTHROPIC_API_KEY = key;
    }
  });

  it('returns the recent conversation oldest-first', async () => {
    await insertMessage(user.id, 'user', 'first');
    await insertMessage(user.id, 'assistant', 'second');

    const response = await app.inject({ method: 'GET', url: '/chat/history?limit=10', ...auth() });
    expect(response.json().messages.map((m: any) => m.content)).toEqual(['first', 'second']);
  });

  it('falls back to a sane limit when given nonsense', async () => {
    await insertMessage(user.id, 'user', 'only');
    const response = await app.inject({ method: 'GET', url: '/chat/history?limit=abc', ...auth() });
    expect(response.json().messages).toHaveLength(1);
  });
});

describe('review routes', () => {
  it('404s the latest review before there is one', async () => {
    const response = await app.inject({ method: 'GET', url: '/reviews/latest', ...auth() });
    expect(response.statusCode).toBe(404);
  });

  it('previews the numbers without calling the model', async () => {
    await addMeal(user, { date: today, kcal: 2100 });
    const response = await app.inject({ method: 'GET', url: '/reviews/preview', ...auth() });
    expect(response.json()).toMatchObject({ week_start: expect.any(String), days_logged: expect.any(Number) });
  });

  it('generates on demand, then lists and returns it', async () => {
    scriptAgent({ text: 'A steady week.' });
    const created = await app.inject({ method: 'POST', url: '/reviews/run', ...auth({ payload: {} }) });
    expect(created.statusCode).toBe(200);
    expect(created.json().content).toBe('A steady week.');

    expect((await app.inject({ method: 'GET', url: '/reviews', ...auth() })).json().reviews).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/reviews/latest', ...auth() })).json().content).toBe(
      'A steady week.',
    );
  });

  it('reports a failed generation as a bad gateway', async () => {
    scriptAgent({ throws: 'the model exploded' });
    const response = await app.inject({ method: 'POST', url: '/reviews/run', ...auth({ payload: {} }) });
    expect(response.statusCode).toBe(502);
  });

  it('returns 503 without credentials', async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const client = await import('../src/ai/client.ts');
    const spy = vi.spyOn(client, 'hasSubscriptionAuth').mockReturnValue(false);
    try {
      const response = await app.inject({ method: 'POST', url: '/reviews/run', ...auth({ payload: {} }) });
      expect(response.statusCode).toBe(503);
    } finally {
      spy.mockRestore();
      process.env.ANTHROPIC_API_KEY = key;
    }
  });
});

describe('GET /photos/:id', () => {
  it('serves an owner’s photo with its media type', async () => {
    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(user.id, 'image/png', 'iVBORw0KGgo=');

    const response = await app.inject({ method: 'GET', url: `/photos/${photo.id}`, ...auth() });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
  });

  it('404s another account’s photo', async () => {
    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(other.id, 'image/png', 'iVBORw0KGgo=');
    expect((await app.inject({ method: 'GET', url: `/photos/${photo.id}`, ...auth() })).statusCode).toBe(404);
  });
});
