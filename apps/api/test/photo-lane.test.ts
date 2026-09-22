import type { FastifyInstance } from 'fastify';
import { SPOKEN_LOCALE_HEADER } from '@ct/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { agentCalls, scriptAgent, systemPromptOf, userTurnOf } from './helpers/agent-mock.ts';
import { appFor, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The photo-only lane. See `ai/photo.ts` and COACH.md §10.
 *
 * What is pinned: that a photograph with nothing under it lands as the same
 * two journal rows and the same food entry the journal's turn would have
 * written, that it spends the `photo` meter and nothing else, that the model
 * is handed one tool and no transcript, and that the three refusals arrive
 * in the right order.
 */

/** A one-pixel JPEG, which is all the mocked model ever looks at. */
const PIXEL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=';

let user: TestUser;
let app: FastifyInstance;
let cookie: string;

beforeEach(async () => {
  user = await createUser({ plan: 'plus' });
  ({ app, cookie } = await appFor(user));
});

afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
});

/** Scripts a run in which the model reads a plate and calls `log_food` once. */
async function scriptPlate(text = 'Logged the oats and kefir.') {
  const tools = await import('../src/ai/tools.ts');
  const spy = vi.spyOn(tools, 'buildNutritionServer');
  scriptAgent({
    text,
    costUsd: 0.012,
    act: async () => {
      const built = spy.mock.results.at(-1)!.value as ReturnType<typeof tools.buildNutritionServer>;
      const logFood = built.tools.find((t) => t.name === 'log_food')!;
      await logFood.handler(
        {
          description: 'Oats with kefir and banana',
          meal: null,
          when: null,
          note: null,
          confidence: 'medium',
          items: [
            { name: 'Rolled oats', quantity_g: 60, quantity_desc: null, kcal: 230, protein_g: 8, carbs_g: 40, fat_g: 4, fiber_g: null, sodium_mg: null, sat_fat_g: null, sugar_g: null },
            { name: 'Kefir', quantity_g: 200, quantity_desc: null, kcal: 110, protein_g: 7, carbs_g: 9, fat_g: 5, fiber_g: null, sodium_mg: null, sat_fat_g: null, sugar_g: null },
          ],
        } as never,
        {},
      );
    },
  });
  return spy;
}

const post = (payload: unknown) =>
  app.inject({ method: 'POST', url: '/entries/photo', headers: { cookie }, payload: payload as never });

describe('POST /entries/photo', () => {
  it('logs the plate as the journal would, and answers like a turn', async () => {
    const spy = await scriptPlate();

    const response = await post({ photo_base64: PIXEL, photo_media_type: 'image/jpeg' });
    expect(response.statusCode).toBe(200);
    const body = response.json();

    // The entry: photo-sourced, with the photo on it.
    const entry = await queryOne<any>('SELECT description, source, photo_id FROM food_entries WHERE user_id = $1', [user.id]);
    expect(entry).toMatchObject({ description: 'Oats with kefir and banana', source: 'photo' });
    expect(entry.photo_id).not.toBeNull();

    // The two journal rows, the way the turn writes them.
    const rows = await query<any>('SELECT role, content, photo_id, actions FROM chat_messages WHERE user_id = $1 ORDER BY created_at', [user.id]);
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(rows[0]!.content).toBe('');
    expect(rows[0]!.photo_id).toBe(entry.photo_id);
    expect(rows[1]!.content).toBe('Logged the oats and kefir.');

    // The answer carries what the phone draws: the card, the day, the meter.
    expect(body.message.content).toBe('Logged the oats and kefir.');
    expect(body.user_message.photo_url).toMatch(/^\/photos\//);
    expect(body.actions[0]).toMatchObject({ kind: 'food_logged', card: { type: 'food', description: 'Oats with kefir and banana' } });
    expect(body.day.consumed.kcal).toBe(340);
    expect(body.allowance).toMatchObject({ meter: 'photo', used: 1 });

    // The model was handed one tool and no transcript, under the plate prompt.
    expect(spy.mock.calls.at(-1)![1]).toMatchObject({ toolset: 'photo' });
    const built = spy.mock.results.at(-1)!.value as { tools: { name: string }[] };
    expect(built.tools.map((t) => t.name)).toEqual(['log_food']);
    const call = agentCalls.at(-1)!;
    expect(systemPromptOf(call)).toContain('Reading a plate');
    expect(systemPromptOf(call)).toContain('You are reading one photograph');
    expect(systemPromptOf(call)).not.toContain('search_food_history');

    // And it was billed as a photo, not as a message.
    const usage = await query<any>('SELECT kind FROM ai_usage WHERE user_id = $1', [user.id]);
    expect(usage.map((u) => u.kind)).toEqual(['photo_log']);
  });

  it('spends the photo meter, and refuses with 402 once it is gone', async () => {
    const spent = await createUser({ email: 'spent@example.com', plan: 'free' });
    const { app: theirs, cookie: theirCookie } = await appFor(spent);
    try {
      await scriptPlate();
      const first = await theirs.inject({ method: 'POST', url: '/entries/photo', headers: { cookie: theirCookie }, payload: { photo_base64: PIXEL } });
      expect(first.statusCode).toBe(200);

      const second = await theirs.inject({ method: 'POST', url: '/entries/photo', headers: { cookie: theirCookie }, payload: { photo_base64: PIXEL } });
      expect(second.statusCode).toBe(402);
      expect(second.json().allowance).toMatchObject({ meter: 'photo', allowed: 1, used: 1 });
      // Refused before the photo was stored or the model asked.
      expect(await query('SELECT id FROM photos WHERE user_id = $1', [spent.id])).toHaveLength(1);
    } finally {
      await theirs.close();
    }
  });

  /**
   * A photo sent while another is still being read waits its turn rather than
   * reading the same unspent count — or a one-scan grant pays for several.
   */
  it('refuses a second photo while one is still being read', async () => {
    await query(`UPDATE users SET turn_lock_until = now() + interval '60 seconds' WHERE id = $1`, [user.id]);
    const response = await post({ photo_base64: PIXEL });
    expect(response.statusCode).toBe(429);
    expect(await query('SELECT id FROM photos WHERE user_id = $1', [user.id])).toHaveLength(0);
  });

  it('wants a photo, and says nothing was read when the model logs nothing', async () => {
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ photo_media_type: 'image/jpeg' })).statusCode).toBe(400);

    scriptAgent({ text: '' });
    const response = await post({ photo_base64: PIXEL });
    expect(response.statusCode).toBe(200);
    expect(response.json().message.content).toBe('Nothing on the plate could be read.');
    expect(response.json().actions).toEqual([]);
    expect(await query('SELECT id FROM food_entries WHERE user_id = $1', [user.id])).toHaveLength(0);
  });

  /**
   * The regression from 2026-09-22: a `bg` account sent a captionless photo and
   * was answered in English.
   *
   * The two turns behind it were nouns in Cyrillic, which `readCyrillic` cannot
   * split from Russian, so the reading came back unnamed — and an unnamed
   * reading withholds the name deliberately, to leave the sentence to the
   * model. There is no sentence here: one plate, one tool, an empty history,
   * and an English prompt around it. The column answers instead.
   */
  it('names the language off the column when the journal cannot be read', async () => {
    const speaker = await createUser({ email: 'bg@example.com', plan: 'plus', locale: 'bg' });
    const { app: theirs, cookie: theirCookie } = await appFor(speaker);
    try {
      // Word for word what the account had written before the photo. All nouns.
      for (const content of ['Калмари панирани', 'Крем с маскарпоне и захар']) {
        await query(`INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'user', $2)`, [speaker.id, content]);
      }

      await scriptPlate();
      const response = await theirs.inject({ method: 'POST', url: '/entries/photo', headers: { cookie: theirCookie }, payload: { photo_base64: PIXEL } });
      expect(response.statusCode).toBe(200);
      expect(userTurnOf(agentCalls.at(-1)!)).toContain('write to this person in Bulgarian');
    } finally {
      await theirs.close();
    }
  });

  /**
   * The other half of the same hole: an account nobody has ever asked what
   * language it reads.
   *
   * `users.locale` is null for those, `localeOf` resolves null to English, and
   * this route had no way to hear otherwise — `/chat` takes the client's guess
   * in its body and nothing else did. So a Bulgarian phone with a fresh account
   * was answered in English on every captionless photo. Every request carries
   * the guess now; see `SPOKEN_LOCALE_HEADER`.
   */
  it('takes the language off the header for an account that has never said', async () => {
    const fresh = await createUser({ email: 'nolocale@example.com', plan: 'plus', locale: null });
    const { app: theirs, cookie: theirCookie } = await appFor(fresh);
    try {
      await scriptPlate();
      const response = await theirs.inject({
        method: 'POST',
        url: '/entries/photo',
        headers: { cookie: theirCookie, [SPOKEN_LOCALE_HEADER]: 'bg' },
        payload: { photo_base64: PIXEL },
      });
      expect(response.statusCode).toBe(200);
      expect(userTurnOf(agentCalls.at(-1)!)).toContain('write to this person in Bulgarian');

      // And nothing was stored: a guess about what they are reading must not
      // write itself into the column that records what they chose.
      const row = await queryOne<any>('SELECT locale FROM users WHERE id = $1', [fresh.id]);
      expect(row.locale).toBeNull();
    } finally {
      await theirs.close();
    }
  });

  it('lets the stored answer beat the header', async () => {
    // A phone drawn in Bulgarian, an account that chose French. The column is
    // an answer somebody gave; the header is what the app happens to look like.
    const chose = await createUser({ email: 'chose@example.com', plan: 'plus', locale: 'fr' });
    const { app: theirs, cookie: theirCookie } = await appFor(chose);
    try {
      await scriptPlate();
      const response = await theirs.inject({
        method: 'POST',
        url: '/entries/photo',
        headers: { cookie: theirCookie, [SPOKEN_LOCALE_HEADER]: 'bg' },
        payload: { photo_base64: PIXEL },
      });
      expect(response.statusCode).toBe(200);
      expect(userTurnOf(agentCalls.at(-1)!)).toContain('write to this person in French');
    } finally {
      await theirs.close();
    }
  });

  it('turns a failed run into a 502 and still counts it', async () => {
    scriptAgent({ throws: 'model fell over' });
    const response = await post({ photo_base64: PIXEL });
    expect(response.statusCode).toBe(502);
    expect(await query('SELECT id FROM ai_usage WHERE user_id = $1', [user.id])).toHaveLength(1);
    expect(await query('SELECT id FROM chat_messages WHERE user_id = $1', [user.id])).toHaveLength(0);
  });
});
