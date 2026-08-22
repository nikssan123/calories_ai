import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query } from '../src/db.ts';
import { env } from '../src/env.ts';
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
    ['POST', '/chat/stream'],
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

describe('GET /progress/exercise', () => {
  it('defaults to a 30-day window and clamps like /progress', async () => {
    const response = await app.inject({ method: 'GET', url: '/progress/exercise', ...auth() });
    expect(response.statusCode).toBe(200);
    expect(response.json().series).toHaveLength(30);
    expect(response.json()).toMatchObject({ days: 30, sessions: 0, total_kcal: 0 });

    const long = await app.inject({ method: 'GET', url: '/progress/exercise?days=9999', ...auth() });
    expect(long.json().series).toHaveLength(365);
  });

  it('needs a session', async () => {
    const anon = await anonymousApp();
    expect((await anon.inject({ method: 'GET', url: '/progress/exercise' })).statusCode).toBe(401);
    await anon.close();
  });
});

describe('GET /calendar', () => {
  it('defaults to the five weeks ending today', async () => {
    const response = await app.inject({ method: 'GET', url: '/calendar', ...auth() });
    expect(response.statusCode).toBe(200);
    expect(response.json().days).toHaveLength(35);
    expect(response.json().to).toBe(today);
  });

  it('returns the range it was asked for', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 1900 });
    const response = await app.inject({
      method: 'GET',
      url: '/calendar?from=2026-03-01&to=2026-03-31',
      ...auth(),
    });
    const body = response.json();
    expect(body).toMatchObject({ from: '2026-03-01', to: '2026-03-31' });
    expect(body.days).toHaveLength(31);
    expect(body.days.find((d: any) => d.local_date === '2026-03-10')).toMatchObject({
      kcal: 1900,
      logged: true,
    });
  });

  it('ignores bounds that are not plain dates rather than passing them to SQL', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/calendar?from=${encodeURIComponent("2026-03-01'; DROP TABLE users; --")}`,
      ...auth(),
    });
    expect(response.statusCode).toBe(200);
    // Fell back to the default window rather than honouring the input.
    expect(response.json().days).toHaveLength(35);
  });

  it('rejects a backwards range', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/calendar?from=2026-03-31&to=2026-03-01',
      ...auth(),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('after');
  });

  it('refuses a range longer than a year', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/calendar?from=2020-01-01&to=2026-01-01',
      ...auth(),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('year');
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

  /**
   * The streamed twin of the route above.
   *
   * What is actually under test is the seam between HTTP and the turn: that the
   * frames arrive as frames, that the last one carries exactly what `/chat`
   * would have returned, and — the part that is easy to lose — that a failure
   * arriving *before* any bytes went out is still an honest status code rather
   * than an apology inside a 200.
   */
  const framesOf = (payload: string) =>
    payload
      .split('\n\n')
      .map((frame) => frame.split('\n').find((line) => line.startsWith('data:')))
      .filter((line): line is string => line !== undefined)
      .map((line) => JSON.parse(line.slice('data:'.length)));

  it('streams the turn and ends with the same response /chat would have given', async () => {
    scriptAgent({ turns: [{ text: 'One moment.' }], text: 'Added to lunch — ~620 kcal.' });
    const response = await app.inject({
      method: 'POST',
      url: '/chat/stream',
      ...auth({ payload: { text: 'chicken and rice' } }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/event-stream/);
    // Nothing about one turn is worth keeping, and the URL is the same every
    // time — a cached stream would replay somebody else's lunch.
    expect(response.headers['cache-control']).toBe('no-store');

    const frames = framesOf(response.payload);
    expect(frames).toContainEqual({ type: 'text', text: 'One moment.' });

    const last = frames.at(-1);
    expect(last.type).toBe('done');
    expect(last.response).toMatchObject({
      message: { role: 'assistant', content: 'Added to lunch — ~620 kcal.' },
      actions: [],
      day: { local_date: today },
    });
  });

  it('persists exactly one turn, however it was delivered', async () => {
    scriptAgent({ text: 'Logged.' });
    await app.inject({
      method: 'POST',
      url: '/chat/stream',
      ...auth({ payload: { text: 'two eggs' } }),
    });

    const messages = await query<{ role: string }>(
      'SELECT role FROM chat_messages WHERE user_id = $1',
      [user.id],
    );
    // Sorted rather than relying on the order rows happen to come back in: the
    // claim is that a streamed turn wrote one of each, not what an unordered
    // SELECT decided today.
    expect(messages.map((m) => m.role).sort()).toEqual(['assistant', 'user']);
  });

  /**
   * The reason the head is written late rather than up front. A double-tapped
   * send is answered by the turn lease before the model is ever called, and
   * that answer is a 429 — which stops being available the instant a 200 and a
   * content type are on the wire.
   */
  it('still answers a turn already in flight with a real 429', async () => {
    await query("UPDATE users SET turn_lock_until = now() + interval '60 seconds' WHERE id = $1", [
      user.id,
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/chat/stream',
      ...auth({ payload: { text: 'two eggs' } }),
    });

    expect(response.statusCode).toBe(429);
    expect(response.json().error).toMatch(/already have a message/);
  });

  it.each([{}, { text: '' }])('rejects %j before opening a stream', async (payload) => {
    const response = await app.inject({ method: 'POST', url: '/chat/stream', ...auth({ payload }) });
    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  it('reports a turn that failed before it spoke as a bad gateway', async () => {
    scriptAgent({ throws: 'the model exploded' });
    const response = await app.inject({
      method: 'POST',
      url: '/chat/stream',
      ...auth({ payload: { text: 'hi' } }),
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toBe('the model exploded');
  });

  /**
   * And the other half of that: once frames have gone out the status line is
   * spent, so the failure has to travel inside the stream. A client cannot be
   * left resolving with nothing.
   */
  it('reports a failure after the first frame as an error frame', async () => {
    scriptAgent({ turns: [{ text: 'Working on it.' }], throwsLate: 'the model exploded' });
    const response = await app.inject({
      method: 'POST',
      url: '/chat/stream',
      ...auth({ payload: { text: 'hi' } }),
    });

    expect(response.statusCode).toBe(200);
    const frames = framesOf(response.payload);
    expect(frames[0]).toEqual({ type: 'text', text: 'Working on it.' });
    expect(frames.at(-1)).toEqual({ type: 'error', error: 'the model exploded' });
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

  /**
   * With a bucket configured the route stops being a pipe and becomes a
   * turnstile: it still decides whether this caller may have the photo, and
   * then lets the bucket do the transfer. Proxying the bytes would spend our
   * bandwidth on a file R2 serves for free, which is most of the point.
   */
  describe('with object storage configured', () => {
    const original = globalThis.fetch;

    beforeEach(() => {
      (env as any).storage = {
        endpoint: 'https://acct123.r2.cloudflarestorage.com',
        bucket: 'meals',
        accessKeyId: 'AKIAEXAMPLE',
        secretAccessKey: 'secret',
        region: 'auto',
      };
      globalThis.fetch = vi.fn(async () => new Response('bytes', { status: 200 })) as typeof fetch;
    });

    afterEach(() => {
      (env as any).storage = null;
      globalThis.fetch = original;
    });

    it('redirects the owner to a presigned URL instead of proxying the bytes', async () => {
      const { savePhoto } = await import('../src/services/photos.ts');
      const photo = await savePhoto(user.id, 'image/png', 'iVBORw0KGgo=');

      const response = await app.inject({ method: 'GET', url: `/photos/${photo.id}`, ...auth() });
      expect(response.statusCode).toBe(302);
      const location = new URL(response.headers.location as string);
      expect(location.pathname).toBe(`/meals/${photo.storageKey}`);
      expect(location.searchParams.get('X-Amz-Signature')).toBeTruthy();
    });

    /**
     * The presigned URL inside expires in minutes; the photo does not. A cached
     * 302 would become a broken image long before the link that produced it
     * went stale.
     */
    it('forbids caching the redirect, which outlives the URL it carries', async () => {
      const { savePhoto } = await import('../src/services/photos.ts');
      const photo = await savePhoto(user.id, 'image/png', 'iVBORw0KGgo=');

      const response = await app.inject({ method: 'GET', url: `/photos/${photo.id}`, ...auth() });
      expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('still refuses another account’s photo before any redirect', async () => {
      const { savePhoto } = await import('../src/services/photos.ts');
      const photo = await savePhoto(other.id, 'image/png', 'iVBORw0KGgo=');

      const response = await app.inject({ method: 'GET', url: `/photos/${photo.id}`, ...auth() });
      expect(response.statusCode).toBe(404);
      expect(response.headers.location).toBeUndefined();
    });
  });
});

/**
 * The path React Native depends on. `<Image>` fetches on its own and cannot be
 * given an Authorization header, so a photo has to be reachable with the proof
 * carried in the URL — and must stay unreachable without it.
 */
describe('GET /photos/:id — signed links', () => {
  async function signedUrlFor(userId: string): Promise<string> {
    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(userId, 'image/png', 'iVBORw0KGgo=');
    await insertMessage(userId, 'user', 'here it is', photo.id);

    const history = await app.inject({ method: 'GET', url: '/chat/history', ...auth() });
    const message = history.json().messages.find((m: any) => m.photo_id === photo.id);
    return message.photo_url;
  }

  it('hands the conversation a link that works with no session', async () => {
    const url = await signedUrlFor(user.id);
    expect(url).toMatch(/^\/photos\/[\w-]+\?exp=\d+&sig=[\w-]+$/);

    // Deliberately no cookie and no bearer: this is what the phone sends.
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
  });

  it('still refuses an unsigned request from nobody', async () => {
    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(user.id, 'image/png', 'iVBORw0KGgo=');
    const response = await app.inject({ method: 'GET', url: `/photos/${photo.id}` });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a tampered signature', async () => {
    const url = await signedUrlFor(user.id);
    const response = await app.inject({ method: 'GET', url: `${url}x` });
    expect(response.statusCode).toBe(403);
  });

  it('refuses a link whose expiry has been pushed out', async () => {
    const url = await signedUrlFor(user.id);
    const stretched = url.replace(/exp=(\d+)/, (_m, exp) => `exp=${Number(exp) + 86_400}`);
    const response = await app.inject({ method: 'GET', url: stretched });
    expect(response.statusCode).toBe(403);
  });

  it('leaves a message without a photo unsigned', async () => {
    await insertMessage(user.id, 'assistant', 'no photo here');
    const history = await app.inject({ method: 'GET', url: '/chat/history', ...auth() });
    const message = history.json().messages.at(-1);
    expect(message.photo_id).toBeNull();
    expect(message.photo_url).toBeNull();
  });
});

/**
 * Closing your own account. Both stores require this to exist inside the app,
 * and it is the one route where getting the authorisation wrong is unrecoverable
 * — so the password check gets more attention here than the happy path does.
 */
describe('DELETE /account', () => {
  const PASSWORD = 'correct-horse';

  /** A real account with a real password hash, which `createUser` does not make. */
  async function accountWithPassword(email: string): Promise<{ id: string; cookie: string }> {
    const { createAccount } = await import('../src/services/user.ts');
    const { createSession } = await import('../src/services/auth.ts');
    const id = await createAccount(email, PASSWORD, 'Test', 'Europe/Sofia');
    const { token } = await createSession(id);
    return { id, cookie: `ct_session=${token}` };
  }

  it('erases the account and everything it owned', async () => {
    const account = await accountWithPassword('closing@example.com');
    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(account.id, 'image/png', 'iVBORw0KGgo=');
    await insertMessage(account.id, 'user', 'a meal', photo.id);

    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: account.cookie },
      payload: { password: PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ chat_messages: 1, photos: 1 });
    expect(await query('SELECT * FROM users WHERE id = $1', [account.id])).toEqual([]);
  });

  it('signs out every other device, because sessions go with the row', async () => {
    const account = await accountWithPassword('sessions@example.com');
    const { createSession } = await import('../src/services/auth.ts');
    const elsewhere = await createSession(account.id);

    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: account.cookie },
      payload: { password: PASSWORD },
    });

    const after = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { authorization: `Bearer ${elsewhere.token}` },
    });
    expect(after.statusCode).toBe(401);
  });

  it('refuses the wrong password and keeps the account', async () => {
    const account = await accountWithPassword('safe@example.com');
    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: account.cookie },
      payload: { password: 'wrong-horse' },
    });

    expect(response.statusCode).toBe(403);
    expect(await query('SELECT id FROM users WHERE id = $1', [account.id])).toHaveLength(1);
  });

  it('refuses a request with no password at all', async () => {
    const account = await accountWithPassword('nopass@example.com');
    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: account.cookie },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(await query('SELECT id FROM users WHERE id = $1', [account.id])).toHaveLength(1);
  });

  it('refuses an anonymous caller', async () => {
    const anon = await anonymousApp();
    try {
      const response = await anon.inject({
        method: 'DELETE',
        url: '/account',
        payload: { password: PASSWORD },
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await anon.close();
    }
  });

  /** Someone else's correct password must not delete the caller's account, nor
      theirs — the check is that the credential belongs to *this* session. */
  it('refuses another account’s password', async () => {
    const mine = await accountWithPassword('mine@example.com');
    await accountWithPassword('theirs@example.com');

    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: mine.cookie },
      payload: { password: 'a-different-password' },
    });

    expect(response.statusCode).toBe(403);
    expect(await query('SELECT id FROM users')).toHaveLength(4);
  });
});
