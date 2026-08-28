import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { runTurn } from '../src/ai/run.ts';
import { listMessages } from '../src/services/chat.ts';
import { getUser } from '../src/services/user.ts';
import { saveReview } from '../src/services/reviews.ts';
import { agentCalls, scriptAgent, systemPromptOf, userTurnOf } from './helpers/agent-mock.ts';
import { MAX_SESSION_MESSAGES, MODELS } from '../src/ai/client.ts';
import type { StreamEvent } from '../src/ai/providers/types.ts';
import { addMeal, addWeight, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * One journal turn. The model is scripted; what is under test is everything
 * around it — the prompt it is handed, when messages are persisted, and how a
 * dead session recovers.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
  await addWeight(user, '2026-03-01', 85);
});

async function turn(text = 'two eggs and toast') {
  const profile = await getUser(user.id);
  return runTurn({ userId: user.id, ctx: user.ctx, profile, text });
}

/**
 * Backdates a prior turn so the next one lands on a different logging day. The
 * session is resumed for the life of the account, so this is the ordinary case
 * every morning — not an edge case.
 */
async function seedPriorTurn(daysAgo: number) {
  await queryOne(
    `INSERT INTO chat_messages (user_id, role, content, created_at)
     VALUES ($1, 'user', 'yesterday''s message', now() - ($2 || ' days')::interval)
     RETURNING id`,
    [user.id, String(daysAgo)],
  );
}

async function setSession(id: string | null) {
  await query('UPDATE users SET agent_session_id = $1 WHERE id = $2', [id, user.id]);
}

async function storedSession(): Promise<string | null> {
  const row = await queryOne<{ agent_session_id: string | null }>(
    'SELECT agent_session_id FROM users WHERE id = $1',
    [user.id],
  );
  return row?.agent_session_id ?? null;
}

describe('when the agent session is dropped', () => {
  it('resumes within the same day', async () => {
    scriptAgent({ text: 'a', sessionId: 'sess-1' }, { text: 'b', sessionId: 'sess-1' });

    await turn('first');
    await turn('second');

    expect(agentCalls.at(-1)!.resume).toBe('sess-1');
  });

  it('starts fresh once the day has rolled over', async () => {
    await seedPriorTurn(2);
    await setSession('sess-yesterday');
    scriptAgent({ text: 'Logged.', sessionId: 'sess-today' });

    await turn('Breakfast');

    // Yesterday's transcript is what made the model treat this morning's photo
    // as a correction to last night's entry. Dropping it is the actual fix; the
    // rollover marker only covers the providers that replay history anyway.
    expect(agentCalls.at(-1)!.resume).toBeUndefined();
    expect(await storedSession()).toBe('sess-today');
  });

  it('does not let a scan receipt stand in for a conversation', async () => {
    await seedPriorTurn(2);
    // What the barcode route writes: no model ran, so this is a receipt rather
    // than a turn. Counting it would make the first typed message of the day
    // look like a continuation of yesterday, and carry a whole day of
    // transcript into every model call of every turn to come.
    await query(
      `INSERT INTO chat_messages (user_id, role, content, tool_trace)
       VALUES ($1, 'assistant', 'Scanned — Hazelnut spread, 30 g.', '{"kind":"scan"}')`,
      [user.id],
    );
    await setSession('sess-yesterday');
    scriptAgent({ text: 'Logged.', sessionId: 'sess-today' });

    await turn('Breakfast');

    expect(agentCalls.at(-1)!.resume).toBeUndefined();
  });

  it('rotates a session that has run away inside a single day', async () => {
    // The guard against one very long day reaching the context window on its
    // own. Ordinary days are nowhere near this.
    await query(
      `INSERT INTO chat_messages (user_id, role, content)
       SELECT $1, 'user', 'chatter' FROM generate_series(1, $2)`,
      [user.id, MAX_SESSION_MESSAGES],
    );
    await setSession('sess-long');
    scriptAgent({ text: 'Logged.', sessionId: 'sess-rotated' });

    await turn('and another');

    expect(agentCalls.at(-1)!.resume).toBeUndefined();
  });

  it('keeps resuming while the day is merely busy', async () => {
    await query(
      `INSERT INTO chat_messages (user_id, role, content)
       SELECT $1, 'user', 'chatter' FROM generate_series(1, $2)`,
      [user.id, MAX_SESSION_MESSAGES - 10],
    );
    await setSession('sess-busy');
    scriptAgent({ text: 'Logged.' });

    await turn('one more');

    expect(agentCalls.at(-1)!.resume).toBe('sess-busy');
  });
});

describe('the day rollover marker', () => {
  it('marks the boundary when the conversation resumes on a later day', async () => {
    await seedPriorTurn(2);
    scriptAgent({ text: 'Logged.' });

    await turn('Breakfast');

    const prompt = agentCalls.at(-1)!.prompt as string;
    expect(prompt).toContain('New day');
    expect(prompt).toContain('get_day');
    // The user's own words still end the turn, untouched.
    expect(prompt.endsWith('Breakfast')).toBe(true);
  });

  it('stays silent when the previous turn was earlier the same day', async () => {
    scriptAgent({ text: 'Logged.' }, { text: 'Logged.' });

    await turn('first');
    await turn('second');

    const prompt = agentCalls.at(-1)!.prompt as string;
    expect(prompt).not.toContain('New day');
    expect(prompt.endsWith('second')).toBe(true);
  });

  it('stays silent on the very first turn of a new account', async () => {
    scriptAgent({ text: 'Logged.' });
    await turn('two eggs and toast');
    const prompt = agentCalls.at(-1)!.prompt as string;
    expect(prompt).not.toContain('New day');
    expect(prompt.endsWith('two eggs and toast')).toBe(true);
  });

  it('keeps the marker out of the conversation that gets stored', async () => {
    await seedPriorTurn(2);
    scriptAgent({ text: 'Logged.' });

    await turn('Breakfast');

    // It steers this one turn; it is not part of what the user said, and it must
    // not come back as history on the next one.
    const messages = await listMessages(user.id);
    expect(messages.some((m) => m.content === 'Breakfast')).toBe(true);
    expect(messages.some((m) => m.content.includes('New day'))).toBe(false);
  });
});

describe('runTurn', () => {
  it('persists both messages and echoes the day back', async () => {
    scriptAgent({ text: 'Added to breakfast — ~400 kcal.', sessionId: 'sess-1' });

    const response = await turn();

    expect(response.message.content).toBe('Added to breakfast — ~400 kcal.');
    expect(response.day.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const messages = await listMessages(user.id);
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'two eggs and toast'],
      ['assistant', 'Added to breakfast — ~400 kcal.'],
    ]);
  });

  it('records the run metadata on the assistant message', async () => {
    scriptAgent({ text: 'Logged.', sessionId: 'sess-1', numTurns: 4, costUsd: 0.12 });
    const response = await turn();

    const row = await queryOne<{ tool_trace: any }>(
      'SELECT tool_trace FROM chat_messages WHERE id = $1',
      [response.message.id],
    );
    expect(row!.tool_trace).toMatchObject({ session_id: 'sess-1', num_turns: 4, cost_usd: 0.12 });
  });

  it('leaves no dangling user message when the turn fails', async () => {
    scriptAgent({ throws: 'the model exploded' });

    await expect(turn()).rejects.toThrow('the model exploded');
    expect(await listMessages(user.id)).toEqual([]);
  });

  it('substitutes a default when the model says nothing', async () => {
    scriptAgent({ chunksOnly: [] });
    expect((await turn()).message.content).toBe('Logged.');
  });

  it('stores the session id and resumes it next turn', async () => {
    scriptAgent({ text: 'One.', sessionId: 'sess-a' });
    await turn();

    const stored = await queryOne<{ agent_session_id: string }>(
      'SELECT agent_session_id FROM users WHERE id = $1',
      [user.id],
    );
    expect(stored!.agent_session_id).toBe('sess-a');

    scriptAgent({ text: 'Two.', sessionId: 'sess-a' });
    await turn('and a coffee');
    expect(agentCalls.at(-1)!.resume).toBe('sess-a');
  });

  it('starts a new session when the stored one is gone', async () => {
    scriptAgent({ text: 'One.', sessionId: 'sess-a' });
    await turn();

    // First attempt resumes and fails; the retry runs cold and succeeds.
    scriptAgent({ throws: 'session sess-a not found' }, { text: 'Recovered.', sessionId: 'sess-b' });
    const response = await turn('again');

    expect(response.message.content).toBe('Recovered.');
    expect(agentCalls.at(-1)!.resume).toBeUndefined();

    const stored = await queryOne<{ agent_session_id: string }>(
      'SELECT agent_session_id FROM users WHERE id = $1',
      [user.id],
    );
    expect(stored!.agent_session_id).toBe('sess-b');
  });

  /**
   * The retry re-runs the whole turn, so anything already streamed belongs to
   * the run that just died. In practice a resume fails before the model has
   * said a word — which is why the first scripted run below says something,
   * so the case is actually exercised rather than merely allowed for.
   */
  it('tells a watcher to discard the dead run before retrying', async () => {
    scriptAgent({ text: 'One.', sessionId: 'sess-a' });
    await turn();

    scriptAgent(
      { turns: [{ text: 'Half a thought' }], throwsLate: 'session sess-a not found' },
      { text: 'Recovered.', sessionId: 'sess-b' },
    );

    const events: StreamEvent[] = [];
    const profile = await getUser(user.id);
    const response = await runTurn(
      { userId: user.id, ctx: user.ctx, profile, text: 'again' },
      (e) => events.push(e),
    );

    expect(response.message.content).toBe('Recovered.');
    expect(events).toEqual([
      { type: 'text', text: 'Half a thought' },
      { type: 'reset' },
      { type: 'text', text: 'Recovered.' },
    ]);
  });

  it('reflects a tool’s writes in the day and the actions it returns', async () => {
    // The turn owns the tool context, so intercept it on the way in and call the
    // real handler from inside the scripted run — the same order the agent does.
    const tools = await import('../src/ai/tools.ts');
    const spy = vi.spyOn(tools, 'buildNutritionServer');

    scriptAgent({
      text: 'Added to lunch — ~640 kcal.',
      act: async () => {
        const built = spy.mock.results.at(-1)!.value as ReturnType<typeof tools.buildNutritionServer>;
        const logFood = built.tools.find((t) => t.name === 'log_food')!;
        await logFood.handler(
          {
            description: 'Chicken and rice',
            meal: 'lunch',
            when: null,
            items: [
              { name: 'Chicken', quantity_g: 200, quantity_desc: null, kcal: 640, protein_g: 62, carbs_g: 50, fat_g: 8 },
            ],
            note: null,
            confidence: 'medium',
          } as never,
          {},
        );
      },
    });

    const response = await turn();

    expect(response.day.consumed.kcal).toBe(640);
    expect(response.actions).toEqual([
      {
        kind: 'food_logged',
        entry_id: expect.any(String),
        summary: expect.stringContaining('lunch'),
        card: expect.objectContaining({ type: 'food', kcal: 640 }),
      },
    ]);
    // Same array on the message, which is what a reload will read back.
    expect(response.message.actions).toEqual(response.actions);

    // The tools that ran are recorded on the message for later debugging.
    const row = await queryOne<{ tool_trace: any }>(
      'SELECT tool_trace FROM chat_messages WHERE id = $1',
      [response.message.id],
    );
    expect(row!.tool_trace.tools).toEqual(['food_logged']);
    spy.mockRestore();
  });

  /**
   * Today's numbers ride on the user turn, and keeping them off the system
   * prompt is a billing constraint rather than a stylistic one: the system
   * prompt sits in front of the whole transcript, so anything there that
   * changes per-turn re-keys the cache for every message behind it and the
   * conversation is re-written at 2x input instead of read back at 0.1x. That
   * was 87% of the production bill. The `not.toContain` half is the guard.
   */
  it('puts today’s numbers and the entry ids on the user turn, not the system prompt', async () => {
    const { localDateFor } = await import('../src/time.ts');
    const today = localDateFor(new Date(), user.ctx);
    const entry = await addMeal(user, { date: today, kcal: 620, description: 'Chicken and rice' });

    scriptAgent({ text: 'Noted.' });
    await turn('what have I had today?');

    const prompt = agentCalls[0]!.prompt as string;
    expect(prompt).toContain('620 / 2200 kcal');
    expect(prompt).toContain(entry.id);
    expect(prompt).toContain('Chicken and rice');
    // The user's own words still end the turn.
    expect(prompt.endsWith('what have I had today?')).toBe(true);

    const system = systemPromptOf(agentCalls[0]!);
    expect(system).not.toContain('620 / 2200 kcal');
    expect(system).not.toContain(entry.id);
  });

  /**
   * The other half of the same constraint: two turns of one conversation must
   * hand the model a byte-identical system prompt, or the cache cannot hold it.
   */
  it('sends a byte-identical system prompt across turns of the same day', async () => {
    scriptAgent({ text: 'Logged.' }, { text: 'Logged.' });

    await turn('two eggs');
    await addMeal(user, {
      date: (await import('../src/time.ts')).localDateFor(new Date(), user.ctx),
      kcal: 620,
      description: 'Chicken and rice',
    });
    await turn('and a coffee');

    expect(systemPromptOf(agentCalls[1]!)).toBe(systemPromptOf(agentCalls[0]!));
  });

  /*
   * The brief this replaced was 1,500 tokens of instruction on how to collect
   * seven profile values by asking for them two at a time, injected on every
   * turn of a new account's first conversation. The form in the client collects
   * them instead, and the assertion is the inverse of the one that used to be
   * here: an incomplete profile must not put an interview back in the prompt.
   */
  it('never asks the model to run setup, however empty the profile is', async () => {
    const fresh = await createUser({ sex: null, is_setup_complete: false });
    user = fresh;
    scriptAgent({ text: 'Logged.' });
    await turn('two eggs and toast');
    expect(systemPromptOf(agentCalls.at(-1)!)).not.toContain('Setup mode');
  });

  /*
   * The mismatch that made this necessary: the app draws itself in the device's
   * language while `users.locale` is null, and the reply came back in English
   * underneath it. The client says what it is drawing in; the stored preference
   * still outranks it.
   */
  describe('the language a turn is answered in', () => {
    async function turnAs(
      overrides: Record<string, unknown>,
      spokenLocale: 'en' | 'bg' | 'de' | 'es' | 'fr' | null,
    ) {
      const account = await createUser(overrides);
      const profile = await getUser(account.id);
      scriptAgent({ text: 'Добре.' });
      await runTurn({
        userId: account.id,
        ctx: account.ctx,
        profile,
        text: 'две яйца',
        spokenLocale,
      });
      return agentCalls.at(-1)!;
    }

    it('follows the app when the account has never been asked', async () => {
      const call = await turnAs({ locale: null }, 'bg');
      expect(userTurnOf(call)).toContain('Bulgarian');
    });

    it('follows the stored preference over what the client claims', async () => {
      const call = await turnAs({ locale: 'de' }, 'bg');
      expect(userTurnOf(call)).toContain('German');
      expect(userTurnOf(call)).not.toContain('Bulgarian');
    });

    it('says nothing at all when both are English', async () => {
      const call = await turnAs({ locale: null }, 'en');
      expect(userTurnOf(call)).not.toContain('Language:');
    });

    /*
     * The trap in doing this at all. A guess off a device is not an answer, and
     * nothing may let it become one — the column stays null until somebody
     * says otherwise, which is what keeps the question askable. The turn is
     * still written in the guessed language, which is the whole point of the
     * guess.
     */
    it('writes in the guess without adopting it', async () => {
      const account = await createUser({ locale: null, sex: null, is_setup_complete: false });
      const profile = await getUser(account.id);
      scriptAgent({ text: 'Записано.' });
      await runTurn({ userId: account.id, ctx: account.ctx, profile, text: 'две яйца', spokenLocale: 'bg' });

      expect(userTurnOf(agentCalls.at(-1)!)).toContain('Bulgarian');
      expect((await getUser(account.id)).locale).toBeNull();
    });
  });

  it('carries a recent weekly review into the journal’s context', async () => {
    const { localDateFor, addDays } = await import('../src/time.ts');
    const today = localDateFor(new Date(), user.ctx);

    await saveReview(
      user.id,
      {
        week_start: addDays(today, -8),
        week_end: addDays(today, -2),
        days_logged: 6,
        mean_kcal: 2100,
        mean_protein_g: 150,
        target_kcal: 2200,
        target_protein_g: 160,
        days_on_target: 4,
        days_protein_hit: 3,
        days: [],
        previous_mean_kcal: null,
        previous_days_logged: 0,
        weight_start_kg: null,
        weight_end_kg: null,
        weight_change_kg: null,
        exercise_sessions: 0,
        exercise_kcal: 0,
        top_foods: [],
        highest_day: null,
        lowest_day: null,
        adaptive: null,
      },
      'You averaged 2,100 against a 2,200 target.',
      null,
    );

    scriptAgent({ text: 'Noted.' });
    await turn('how was last week?');
    expect(systemPromptOf(agentCalls[0]!)).toContain('You averaged 2,100');
  });

  it('locks the agent down: no built-ins, no inherited settings', async () => {
    scriptAgent({ text: 'Noted.' });
    await turn();

    const options = agentCalls[0]!.options;
    expect(options.tools).toEqual([]);
    expect(options.settingSources).toEqual([]);
    expect(options.allowedTools.every((n: string) => n.startsWith('mcp__nutrition__'))).toBe(true);
    expect(options.permissionMode).toBe('bypassPermissions');
  });

  it('attaches a photo to the prompt and to the user message', async () => {
    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(user.id, 'image/png', 'AAAA');

    scriptAgent({ text: 'Looks like ~700 kcal.' });
    const profile = await getUser(user.id);
    const response = await runTurn({
      userId: user.id,
      ctx: user.ctx,
      profile,
      text: 'what is this?',
      photo: { id: photo.id, mediaType: 'image/png', base64: 'AAAA' },
    });

    expect(response.message.role).toBe('assistant');
    // The image rides on the prompt, and the photo is linked to what they said.
    const prompt = agentCalls[0]!.prompt as AsyncIterable<any>;
    expect(typeof (prompt as any)[Symbol.asyncIterator]).toBe('function');

    const messages = await listMessages(user.id);
    expect(messages[0]!.photo_id).toBe(photo.id);
    expect(messages[1]!.photo_id).toBeNull();
  });
});

/**
 * The model a journal turn runs on is decided by the language it is written in.
 * `language.test.ts` covers which languages land where; what is under test here
 * is only that `runTurn` acts on the answer — the detector could be perfect and
 * the turn still run on the wrong model.
 */
/**
 * The cooking half of the request, decided by the plan rather than by the
 * message.
 *
 * Ten tools and the prompt that governs them are nearly a fifth of the cached
 * prefix, written on every turn of every account — and on a tier where the
 * kitchen is not granted, every one of those tools already answers 402. So the
 * plan decides before the request is built, and the answer the person gets is
 * supposed to be the one they got before: the kitchen is part of Coach.
 *
 * Both halves are asserted together on purpose. The provider that runs these
 * turns builds its own tool server, so the first version of this shipped a
 * prompt saying the kitchen was absent beside ten tools that were still there —
 * which is a worse turn than either state on its own.
 */
describe('what a plan puts in the request', () => {
  const toolsOf = (call: (typeof agentCalls)[number]): string[] =>
    (call.options?.allowedTools ?? []).map((n: string) => n.split('__').at(-1));

  it('withholds the cooking tools and their prompt from a plan without a kitchen', async () => {
    scriptAgent({ text: 'Both in.' });
    await turn();

    expect(toolsOf(agentCalls[0]!)).not.toContain('suggest_recipes');
    expect(toolsOf(agentCalls[0]!)).not.toContain('plan_week');
    expect(systemPromptOf(agentCalls[0]!)).toMatch(/part of Coach/);
  });

  it('keeps the tools every tier is granted', async () => {
    scriptAgent({ text: 'Both in.' });
    await turn();

    expect(toolsOf(agentCalls[0]!)).toContain('log_food');
    expect(toolsOf(agentCalls[0]!)).toContain('update_pantry');
    expect(toolsOf(agentCalls[0]!)).toContain('update_shopping_list');
  });

  it('gives the whole kitchen to an account whose plan holds one', async () => {
    await query('UPDATE users SET plan = $1 WHERE id = $2', ['coach', user.id]);
    scriptAgent({ text: 'Both in.' });
    await turn();

    expect(toolsOf(agentCalls[0]!)).toContain('suggest_recipes');
    expect(toolsOf(agentCalls[0]!)).toContain('plan_week');
    expect(systemPromptOf(agentCalls[0]!)).not.toMatch(/part of Coach/);
  });
});

describe('routing a turn by its language', () => {
  it('keeps an English meal log on the cheap model', async () => {
    scriptAgent({ text: 'Logged.' });
    await turn('two eggs and a slice of toast with butter');

    expect(agentCalls[0]!.options.model).toBe('claude-haiku-4-5');
    // Haiku 4.5 rejects `effort` with a 400 — the key must be absent, not undefined.
    expect('effort' in agentCalls[0]!.options).toBe(false);
  });

  it('escalates a Bulgarian meal log to the capable model', async () => {
    scriptAgent({ text: 'Записано.' });
    await turn('две яйца и филия хляб с масло');

    expect(agentCalls[0]!.options.model).toBe('claude-sonnet-5');
    expect(agentCalls[0]!.options.effort).toBe('low');
  });

  /*
   * The fragment case, end to end. "ок" says nothing on its own, and on its own
   * it would drop the conversation back onto Haiku — a worse reply mid-thread,
   * and a model change under a warm cache for the sake of one word.
   */
  it('stays escalated across a reply too short to identify', async () => {
    scriptAgent({ text: 'Записано.' }, { text: 'Добре.' });
    await turn('две яйца и филия хляб с масло');
    await turn('ок');

    expect(agentCalls[1]!.options.model).toBe('claude-sonnet-5');
  });

  /*
   * The other half of the same problem, and the one the detector cannot see:
   * the language being *written* is not always the language in front of it.
   * An account reading Bulgarian is owed a Bulgarian reply to "ok" — and to a
   * photo with no caption — and Haiku writes Bulgarian with invented words in
   * it whatever prompted the reply.
   */
  it('escalates for the language it must answer in, not just the one it was asked in', async () => {
    const bulgarian = await createUser({ locale: 'bg' });
    // Weighed, so this is a `text_log` and not `setup` — the other kinds are on
    // capable models already and this decision never reaches them.
    await addWeight(bulgarian, '2026-03-01', 85);
    const profile = await getUser(bulgarian.id);
    scriptAgent({ text: 'Добре.' });
    await runTurn({ userId: bulgarian.id, ctx: bulgarian.ctx, profile, text: 'ok' });

    expect(agentCalls[0]!.options.model).toBe('claude-sonnet-5');
  });

  it('leaves the cheap model alone for the four languages it writes well', async () => {
    const german = await createUser({ locale: 'de' });
    await addWeight(german, '2026-03-01', 85);
    const profile = await getUser(german.id);
    scriptAgent({ text: 'Notiert.' });
    await runTurn({ userId: german.id, ctx: german.ctx, profile, text: 'two eggs and toast' });

    expect(agentCalls[0]!.options.model).toBe('claude-haiku-4-5');
  });

  /*
   * A photo is a `photo_log`, and the language check must not reach it: that
   * check only ever routes *upward*, out of Haiku, and `photo_log` is not on
   * Haiku. Asserted against `MODELS` rather than a literal so it keeps testing
   * the thing it is named for — that the photo kept its own routing — rather
   * than re-pinning whichever model that happens to be. It was Opus when this
   * was written and is Sonnet now, and neither is the point.
   */
  it('leaves a photo turn on its own model whatever language it is captioned in', async () => {
    scriptAgent({ text: 'Записано.' });
    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(user.id, 'image/png', 'AAAA');
    const profile = await getUser(user.id);
    await runTurn({
      userId: user.id,
      ctx: user.ctx,
      profile,
      text: 'това е обядът ми',
      photo: { id: photo.id, mediaType: 'image/png', base64: 'AAAA' },
    });

    expect(agentCalls[0]!.options.model).toBe(MODELS.photo_log.model);
  });
});

describe('packets scanned into the message', () => {
  const tortillas = {
    barcode: '5000112637922',
    brand: 'Old El Paso',
    name: 'Soft Tortillas Original',
    kcal_100g: 312,
    protein_100g: 8.1,
    carbs_100g: 51.4,
    fat_100g: 7.2,
    serving_g: 62,
    serving_desc: '1 tortilla',
    source: 'off' as const,
    source_url: null,
  };

  async function scannedTurn(text: string, scanned: unknown[], misses = 0) {
    const profile = await getUser(user.id);
    return runTurn({
      userId: user.id,
      ctx: user.ctx,
      profile,
      text,
      scanned: scanned as never,
      scannedMisses: misses,
    });
  }

  it('puts the label figures in the turn, after the day and before the message', async () => {
    scriptAgent({ text: 'Logged.' });
    await scannedTurn('burrito I made — two tortillas', [{ product: tortillas }]);

    const turnText = userTurnOf(agentCalls[0]!);
    expect(turnText).toContain('312 kcal');
    expect(turnText).toContain('Old El Paso Soft Tortillas Original');

    /*
     * The person's own sentence stays the last thing in the turn — the place a
     * model's attention is sharpest, and where it was before any of this
     * existed. A block of panels after it would be the feature quietly making
     * every scanned meal read worse than an unscanned one.
     */
    expect(turnText.indexOf('312 kcal')).toBeLessThan(turnText.indexOf('burrito I made'));
    expect(turnText.trim().endsWith('burrito I made — two tortillas')).toBe(true);
  });

  /*
   * The same discipline the day context and the rollover notice keep: what the
   * turn shows the model and what the journal shows the person are two
   * different strings, and only one of them is theirs.
   */
  it('leaves the persisted message exactly what they typed', async () => {
    scriptAgent({ text: 'Logged.' });
    await scannedTurn('burrito I made — two tortillas', [{ product: tortillas }]);

    const messages = await listMessages(user.id);
    const mine = messages.find((m) => m.role === 'user');
    expect(mine?.content).toBe('burrito I made — two tortillas');
    expect(mine?.content).not.toContain('312');
  });

  it('adds nothing to a turn that scanned nothing', async () => {
    scriptAgent({ text: 'Logged.' });
    await turn('two eggs and toast');
    expect(userTurnOf(agentCalls[0]!)).not.toContain('Packets they scanned');
  });

  it('tells the model about the scans that could not be looked up', async () => {
    scriptAgent({ text: 'Logged.' });
    await scannedTurn('burrito', [{ product: tortillas }], 2);
    expect(userTurnOf(agentCalls[0]!)).toContain('2 packets were also scanned');
  });
});
