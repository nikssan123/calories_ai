import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { ChatAction, ChatCard } from '@ct/shared';
import { buildNutritionServer, SERVER_NAME, type ToolContext } from '../src/ai/tools.ts';
import { getFoodEntry, listExerciseEntries, listWeights } from '../src/services/log.ts';
import { currentLocalDate } from '../src/services/summary.ts';
import { targetsForDate } from '../src/services/targets.ts';
import { addDays } from '../src/time.ts';
import { getUser } from '../src/services/user.ts';
import { listNotes } from '../src/services/notes.ts';
import { addMeal, addWeight, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * The tools are the agent's entire surface on the database. They are called
 * here directly, without a model, because what needs testing is what they do to
 * the data — not whether Claude picks the right one.
 */

const NOW = new Date('2026-03-10T11:00:00Z'); // 13:00 in Sofia
const TODAY = '2026-03-10';

let user: TestUser;
let actions: ChatAction[];
let tools: Map<string, SdkMcpToolDefinition<any>>;

function build(overrides: Partial<ToolContext> = {}, readOnly = false) {
  actions = [];
  const tc: ToolContext = {
    userId: user.id,
    ctx: user.ctx,
    now: NOW,
    photoId: null,
    actions,
    units: 'metric',
    ...overrides,
  };
  const built = buildNutritionServer(tc, { readOnly });
  tools = new Map(built.tools.map((t) => [t.name, t]));
  return built;
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  const result = await tool.handler(args as never, {});
  const text = (result.content?.[0] as { text?: string })?.text ?? '';
  return {
    isError: result.isError === true,
    text,
    json: result.isError ? null : JSON.parse(text),
  };
}

const ITEM = {
  name: 'Chicken breast',
  quantity_g: 200,
  quantity_desc: '~200g',
  kcal: 330,
  protein_g: 62,
  carbs_g: 0,
  fat_g: 7.2,
};

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
  build();
});

describe('the tool set', () => {
  it('exposes reads and writes under a fully-qualified name', () => {
    const { toolNames } = build();
    expect(toolNames).toContain(`mcp__${SERVER_NAME}__log_food`);
    expect(toolNames.every((n) => n.startsWith(`mcp__${SERVER_NAME}__`))).toBe(true);
  });

  it('drops every write tool in read-only mode', () => {
    build({}, true);
    expect([...tools.keys()].sort()).toEqual(['get_day', 'get_progress', 'search_food_history']);
  });
});

describe('log_food', () => {
  it('writes an entry and reports the day it landed on', async () => {
    const { json } = await call('log_food', {
      description: 'Chicken and rice',
      meal: 'lunch',
      when: null,
      items: [ITEM],
      note: null,
      confidence: 'medium',
    });

    expect(json.logged).toEqual({ kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7 });
    expect(json.day_totals.kcal).toBe(330);
    expect(json.kcal_remaining).toBe(2200 - 330);
    expect(json.protein_remaining).toBe(160 - 62);

    const entry = await getFoodEntry(user.id, json.entry_id);
    expect(entry).toMatchObject({ meal: 'lunch', local_date: TODAY, source: 'text' });
  });

  it('infers the meal from the time when not told', async () => {
    const { json } = await call('log_food', {
      description: 'Something',
      meal: null,
      when: null,
      items: [ITEM],
      note: null,
      confidence: 'medium',
    });
    // 13:00 local is lunch.
    expect((await getFoodEntry(user.id, json.entry_id))!.meal).toBe('lunch');
  });

  it('resolves a plain-language time', async () => {
    const { json } = await call('log_food', {
      description: 'Breakfast',
      meal: null,
      when: 'yesterday 8am',
      items: [ITEM],
      note: null,
      confidence: 'medium',
    });
    const entry = await getFoodEntry(user.id, json.entry_id);
    expect(entry!.local_date).toBe('2026-03-09');
    expect(entry!.meal).toBe('breakfast');
  });

  it('marks the entry as a photo log and links it when the turn had one', async () => {
    build({ photoId: null });
    const { json: withoutPhoto } = await call('log_food', {
      description: 'No photo',
      meal: null, when: null, items: [ITEM], note: null, confidence: 'medium',
    });
    const plain = await getFoodEntry(user.id, withoutPhoto.entry_id);
    expect(plain).toMatchObject({ source: 'text', photo_id: null });

    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(user.id, 'image/png', 'iVBORw0KGgo=');
    build({ photoId: photo.id });

    const { json: withPhoto } = await call('log_food', {
      description: 'From a photo',
      meal: null, when: null, items: [ITEM], note: null, confidence: 'low',
    });
    expect(await getFoodEntry(user.id, withPhoto.entry_id)).toMatchObject({
      source: 'photo',
      photo_id: photo.id,
    });
  });

  it('records an action for the client to render', async () => {
    await call('log_food', {
      description: 'Chicken and rice',
      meal: 'lunch', when: null, items: [ITEM], note: 'tasty', confidence: 'high',
    });
    expect(actions).toEqual([
      {
        kind: 'food_logged',
        entry_id: expect.any(String),
        summary: expect.stringContaining('lunch'),
        card: expect.objectContaining({ type: 'food', meal: 'lunch' }),
      },
    ]);
    // The card carries what the database returned, not what the model asked for.
    const card = actions[0]!.card as Extract<ChatCard, { type: 'food' }>;
    expect(card.entry_id).toBe(actions[0]!.entry_id);
    expect(card.kcal).toBe(330);
    expect(card.items).toEqual([{ name: 'Chicken breast', quantity: '~200g' }]);
  });

  it('falls back to a weight the reader recognises when nothing described one', async () => {
    build({ units: 'imperial' });
    await call('log_food', {
      description: 'Chicken',
      meal: 'lunch',
      when: null,
      // No quantity_desc: the model weighed it and said nothing about it, so the
      // card has to write the amount itself — and it is read, not stored, so it
      // is written in ounces rather than in the grams the row keeps.
      items: [{ ...ITEM, quantity_desc: null }],
      note: null,
      confidence: 'high',
    });

    const card = actions[0]!.card as Extract<ChatCard, { type: 'food' }>;
    expect(card.items).toEqual([{ name: 'Chicken breast', quantity: '7.1 oz' }]);
  });

  /**
   * The bar the card draws, and the only reason it can draw one.
   *
   * A meal's calories mean nothing without the day around them, and asking the
   * user to subtract one figure from another to find out how they are doing is
   * exactly what the picture exists to stop. The day is read back *after* the
   * write, so `kcal_before` is this meal taken back out of it rather than a
   * second, racier reading of the same table.
   */
  it('carries the day it landed in, with this meal as its own band', async () => {
    await addMeal(user, { date: TODAY, kcal: 500 });

    await call('log_food', {
      description: 'Chicken and rice',
      meal: 'lunch', when: null, items: [ITEM], note: null, confidence: 'medium',
    });

    const card = actions[0]!.card as Extract<ChatCard, { type: 'food' }>;
    expect(card.day).toEqual({
      local_date: TODAY,
      kcal_before: 500,
      kcal_after: 830,
      target_kcal: 2200,
    });
  });
});

describe('update_food_entry', () => {
  it('replaces the items and re-totals the day', async () => {
    const entry = await addMeal(user, { date: TODAY, kcal: 500 });

    const { json } = await call('update_food_entry', {
      entry_id: entry.id,
      description: null,
      meal: null,
      when: null,
      items: [{ ...ITEM, name: 'More rice', kcal: 700, protein_g: 12 }],
      confidence: null,
    });

    expect(json.updated.kcal).toBe(700);
    expect(json.day_totals.kcal).toBe(700);
    expect(actions[0]!.kind).toBe('food_updated');
  });

  /**
   * A correction redraws the band as what the entry is worth *now*, not as the
   * difference the correction made — otherwise "there was more rice" would draw
   * a card whose bright band was 400 kcal of rice nobody ate on its own.
   */
  it('draws the corrected entry as the band, not the change to it', async () => {
    await addMeal(user, { date: TODAY, kcal: 500, description: 'Breakfast' });
    const entry = await addMeal(user, { date: TODAY, kcal: 300 });

    await call('update_food_entry', {
      entry_id: entry.id,
      description: null,
      meal: null,
      when: null,
      items: [{ ...ITEM, name: 'More rice', kcal: 700, protein_g: 12 }],
      confidence: null,
    });

    const card = actions[0]!.card as Extract<ChatCard, { type: 'food' }>;
    expect(card.day).toMatchObject({ kcal_before: 500, kcal_after: 1200 });
  });

  it('changes description, meal, time and confidence', async () => {
    const entry = await addMeal(user, { date: TODAY, kcal: 500, meal: 'lunch' });
    await call('update_food_entry', {
      entry_id: entry.id,
      description: 'Actually a big one',
      meal: 'dinner',
      when: 'yesterday 7pm',
      items: null,
      confidence: 'low',
    });

    const updated = await getFoodEntry(user.id, entry.id);
    expect(updated).toMatchObject({
      description: 'Actually a big one',
      meal: 'dinner',
      confidence: 'low',
      local_date: '2026-03-09',
    });
    // Items were left alone.
    expect(updated!.kcal).toBe(500);
  });

  it('tells the model how to recover from a bad id', async () => {
    const result = await call('update_food_entry', {
      entry_id: '00000000-0000-0000-0000-000000000000',
      description: null, meal: null, when: null, items: null, confidence: null,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/get_day/);
  });

  it('says which day it wrote to', async () => {
    const entry = await addMeal(user, { date: TODAY, kcal: 500 });
    const { json } = await call('update_food_entry', {
      entry_id: entry.id,
      description: null, meal: null, when: null, items: null, confidence: null,
    });
    expect(json.local_date).toBe(TODAY);
    expect(json.moved_from_date).toBeUndefined();
  });

  it('flags a correction that silently moved the entry to another day', async () => {
    // The 2026-08-20 failure in miniature: totals come back for a day the model
    // is not thinking about, and nothing in the reply says so.
    const entry = await addMeal(user, { date: TODAY, kcal: 500 });

    const { json } = await call('update_food_entry', {
      entry_id: entry.id,
      description: null, meal: null, when: 'yesterday 7pm', items: null, confidence: null,
    });

    expect(json.local_date).toBe('2026-03-09');
    expect(json.moved_from_date).toBe(TODAY);
    expect(json.warning).toMatch(/moved from 2026-03-10 to 2026-03-09/);
  });
});

describe('the day every write landed on', () => {
  it('comes back from log_food', async () => {
    const { json } = await call('log_food', {
      description: 'Eggs', meal: null, when: null, note: null,
      confidence: 'medium', items: [ITEM],
    });
    expect(json.local_date).toBe(TODAY);
  });

  it('comes back from log_food even when "when" put it on another day', async () => {
    const { json } = await call('log_food', {
      description: 'Eggs', meal: null, when: 'yesterday 8pm', note: null,
      confidence: 'medium', items: [ITEM],
    });
    expect(json.local_date).toBe('2026-03-09');
  });

  it('comes back from log_exercise', async () => {
    const { json } = await call('log_exercise', {
      description: '5km run', duration_min: 30, distance_km: 5,
      kcal_burned: 300, when: null, confidence: 'low',
    });
    expect(json.local_date).toBe(TODAY);
  });

  it('comes back from delete_entry, so the model knows what it emptied', async () => {
    const entry = await addMeal(user, { date: '2026-03-09', kcal: 500 });
    const { json } = await call('delete_entry', { entry_id: entry.id, kind: 'food' });
    expect(json).toMatchObject({ deleted: true, local_date: '2026-03-09' });
  });
});

describe('log_exercise', () => {
  it('records the activity and its burn', async () => {
    const { json } = await call('log_exercise', {
      description: '5km run',
      duration_min: 28,
      kcal_burned: 310,
      when: null,
      confidence: 'low',
    });
    expect(json.kcal_burned).toBe(310);

    const entries = await listExerciseEntries(user.id, { localDate: TODAY });
    expect(entries[0]).toMatchObject({ description: '5km run', duration_min: 28 });
    expect(actions[0]!.kind).toBe('exercise_logged');
  });

  it('stores the distance the burn was estimated from', async () => {
    const { json } = await call('log_exercise', {
      description: 'Walk through town',
      duration_min: 45,
      distance_km: 3.6,
      kcal_burned: 150,
      when: null,
      confidence: 'low',
    });
    expect(json.distance_km).toBe(3.6);

    const entries = await listExerciseEntries(user.id, { localDate: TODAY });
    expect(entries[0]).toMatchObject({ distance_km: 3.6 });
  });

  it('leaves distance null for an activity that covers no ground', async () => {
    await call('log_exercise', {
      description: '45 min weight training',
      duration_min: 45,
      distance_km: null,
      kcal_burned: 200,
      when: null,
      confidence: 'low',
    });
    const entries = await listExerciseEntries(user.id, { localDate: TODAY });
    expect(entries[0]!.distance_km).toBeNull();
  });
});

describe('log_weight', () => {
  it('records a weigh-in against the right local day', async () => {
    const { json } = await call('log_weight', { weight_kg: 84.2, when: null });
    expect(json.weight_kg).toBe(84.2);
    expect(json.local_date).toBe(TODAY);
    expect(actions[0]!.kind).toBe('weight_logged');
  });

  it('replaces an earlier reading on the same day', async () => {
    await call('log_weight', { weight_kg: 84.2, when: null });
    await call('log_weight', { weight_kg: 83.9, when: null });
    expect(await listWeights(user.id)).toHaveLength(1);
  });
});

describe('delete_entry', () => {
  it('removes a food entry and names it in the action', async () => {
    const entry = await addMeal(user, { date: TODAY, kcal: 500, description: 'Mistake' });
    const { json } = await call('delete_entry', { entry_id: entry.id, kind: 'food' });

    expect(json.deleted).toBe(true);
    expect(actions[0]).toMatchObject({ kind: 'food_deleted', summary: 'Removed Mistake' });
    expect(await getFoodEntry(user.id, entry.id)).toBeNull();
  });

  it('removes an exercise entry', async () => {
    await call('log_exercise', {
      description: 'run', duration_min: 30, kcal_burned: 300, when: null, confidence: 'low',
    });
    const [entry] = await listExerciseEntries(user.id, { localDate: TODAY });
    const { json } = await call('delete_entry', { entry_id: entry!.id, kind: 'exercise' });
    expect(json.deleted).toBe(true);
  });

  it('reports a bad id as an error the model can act on', async () => {
    const result = await call('delete_entry', {
      entry_id: '00000000-0000-0000-0000-000000000000',
      kind: 'food',
    });
    expect(result.isError).toBe(true);
  });
});

describe('working on a day that is not today', () => {
  /**
   * The session is dropped at each rollover, so yesterday is never in context
   * any more — it is reached through the tools or not at all. These are the
   * paths a user takes when they say "I forgot to log Sunday's dinner" or
   * "yesterday's lunch was bigger than you thought".
   */
  const YESTERDAY = '2026-03-09';

  it('reads a past day, with the ids needed to change it', async () => {
    const entry = await addMeal(user, { date: YESTERDAY, kcal: 500, description: 'Sunday roast' });

    const { json } = await call('get_day', { date: YESTERDAY, days_ago: null });

    expect(json.local_date).toBe(YESTERDAY);
    expect(json.food.map((f: any) => f.id)).toContain(entry.id);
  });

  it('reaches a past day by days_ago as well as by date', async () => {
    await addMeal(user, { date: YESTERDAY, kcal: 500 });
    const { json } = await call('get_day', { date: null, days_ago: 1 });
    expect(json.local_date).toBe(YESTERDAY);
  });

  it('corrects an entry on a past day without disturbing its date', async () => {
    const entry = await addMeal(user, { date: YESTERDAY, kcal: 500 });

    const { json } = await call('update_food_entry', {
      entry_id: entry.id,
      description: null, meal: null, when: null,
      items: [{ ...ITEM, name: 'Bigger portion', kcal: 800 }],
      confidence: null,
    });

    expect(json.updated.kcal).toBe(800);
    expect(json.local_date).toBe(YESTERDAY);
    // Correcting a number is not moving a day.
    expect(json.moved_from_date).toBeUndefined();
    expect(json.day_totals.kcal).toBe(800);
  });

  it('logs a forgotten meal onto a past day from a bare date', async () => {
    const { json } = await call('log_food', {
      description: 'Forgotten dinner', meal: null, when: YESTERDAY, note: null,
      confidence: 'medium', items: [ITEM],
    });

    expect(json.local_date).toBe(YESTERDAY);
    const day = await call('get_day', { date: YESTERDAY, days_ago: null });
    expect(day.json.food.map((f: any) => f.description)).toContain('Forgotten dinner');
  });

  it('logs a forgotten meal from plain language', async () => {
    const { json } = await call('log_food', {
      description: 'Late dinner', meal: null, when: 'yesterday 8pm', note: null,
      confidence: 'medium', items: [ITEM],
    });
    expect(json.local_date).toBe(YESTERDAY);
    expect(json.meal).toBe('dinner');
  });

  it('backdates exercise and weight too', async () => {
    const ex = await call('log_exercise', {
      description: 'Sunday walk', duration_min: 40, distance_km: 3,
      kcal_burned: 150, when: YESTERDAY, confidence: 'low',
    });
    expect(ex.json.local_date).toBe(YESTERDAY);

    const wt = await call('log_weight', { weight_kg: 84, when: YESTERDAY });
    expect(wt.json.local_date).toBe(YESTERDAY);
  });

  it('deletes something logged on a past day', async () => {
    const entry = await addMeal(user, { date: YESTERDAY, kcal: 500 });
    const { json } = await call('delete_entry', { entry_id: entry.id, kind: 'food' });
    expect(json).toMatchObject({ deleted: true, local_date: YESTERDAY });
  });

  it('leaves today alone while a past day is being edited', async () => {
    const todayEntry = await addMeal(user, { date: TODAY, kcal: 600 });
    await call('log_food', {
      description: 'Forgotten dinner', meal: null, when: YESTERDAY, note: null,
      confidence: 'medium', items: [ITEM],
    });

    const today = await call('get_day', { date: null, days_ago: null });
    expect(today.json.local_date).toBe(TODAY);
    expect(today.json.food).toHaveLength(1);
    expect(today.json.food[0].id).toBe(todayEntry.id);
  });
});

describe('remember and forget', () => {
  it('keeps a standing instruction and reports it back', async () => {
    const { json } = await call('remember', { note: 'Do not log my commute walk' });
    expect(json.remembered).toBe('Do not log my commute walk');
    expect(await listNotes(user.id)).toHaveLength(1);
  });

  it('refuses an empty note rather than storing a blank', async () => {
    const result = await call('remember', { note: '   ' });
    expect(result.isError).toBe(true);
    expect(await listNotes(user.id)).toEqual([]);
  });

  it('drops one by the id the prompt showed', async () => {
    const { json } = await call('remember', { note: 'I use a small plate' });
    const gone = await call('forget', { note_id: json.note_id });
    expect(gone.json.forgotten).toBe(true);
    expect(await listNotes(user.id)).toEqual([]);
  });

  it('tells the model where to look after a bad id', async () => {
    const result = await call('forget', { note_id: '00000000-0000-0000-0000-000000000000' });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/context/);
  });

  it('is a write, so the read-only review agent cannot reach it', () => {
    build({}, true);
    expect([...tools.keys()]).not.toContain('remember');
    expect([...tools.keys()]).not.toContain('forget');
  });
});

describe('get_day', () => {
  it('defaults to today and lists entry ids', async () => {
    const entry = await addMeal(user, { date: TODAY, kcal: 620, description: 'Lunch' });
    const { json } = await call('get_day', { date: null, days_ago: null });

    expect(json.local_date).toBe(TODAY);
    expect(json.food[0]).toMatchObject({ id: entry.id, description: 'Lunch', kcal: 620 });
    expect(json.targets.kcal).toBe(2200);
  });

  it('accepts an explicit date', async () => {
    await addMeal(user, { date: '2026-03-08', kcal: 400 });
    const { json } = await call('get_day', { date: '2026-03-08', days_ago: null });
    expect(json.local_date).toBe('2026-03-08');
    expect(json.consumed.kcal).toBe(400);
  });

  it('accepts days_ago as an alternative', async () => {
    const { json } = await call('get_day', { date: null, days_ago: 2 });
    expect(json.local_date).toBe('2026-03-08');
  });

  it('includes the weigh-in and exercise', async () => {
    await addWeight(user, TODAY, 84.2);
    await call('log_exercise', {
      description: 'run', duration_min: 30, kcal_burned: 300, when: null, confidence: 'low',
    });
    const { json } = await call('get_day', { date: null, days_ago: null });
    expect(json.weight_kg).toBe(84.2);
    expect(json.exercise).toHaveLength(1);
  });
});

describe('search_food_history', () => {
  beforeEach(async () => {
    await addMeal(user, { date: '2026-03-01', kcal: 500, description: 'Porridge and berries', meal: 'breakfast' });
    await addMeal(user, { date: '2026-03-05', kcal: 700, description: 'Chicken curry', meal: 'dinner' });
  });

  it('returns everything in the window when unfiltered', async () => {
    const { json } = await call('search_food_history', {
      query: null, meal: null, days_back: null, limit: null,
    });
    expect(json.matches).toHaveLength(2);
    expect(json.matches[0].date).toBe('2026-03-05'); // newest first
  });

  it('matches on the description', async () => {
    const { json } = await call('search_food_history', {
      query: 'porridge', meal: null, days_back: null, limit: null,
    });
    expect(json.matches.map((m: any) => m.description)).toEqual(['Porridge and berries']);
  });

  it('matches on an item name', async () => {
    const { json } = await call('search_food_history', {
      query: 'Chicken curry', meal: null, days_back: null, limit: null,
    });
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].items[0].name).toBe('Chicken curry');
  });

  it('filters by meal slot', async () => {
    const { json } = await call('search_food_history', {
      query: null, meal: 'breakfast', days_back: null, limit: null,
    });
    expect(json.matches).toHaveLength(1);
  });

  it('honours days_back and caps the limit at 30', async () => {
    const recent = await call('search_food_history', {
      query: null, meal: null, days_back: 3, limit: null,
    });
    expect(recent.json.matches).toHaveLength(0);

    const capped = await call('search_food_history', {
      query: null, meal: null, days_back: null, limit: 500,
    });
    expect(capped.json.matches).toHaveLength(2);
  });
});

describe('set_profile', () => {
  it('saves only the fields supplied and recalculates the target', async () => {
    const fresh = await createUser({ sex: null, height_cm: null, is_setup_complete: false });
    user = fresh;
    build();
    await addWeight(fresh, TODAY, 85);

    const { json } = await call('set_profile', {
      sex: 'male',
      birth_date: null,
      height_cm: 180,
      target_weight_kg: null,
      activity_level: null,
      goal: null,
      display_name: null,
      timezone: null,
      day_start_hour: null,
    });

    expect(json.saved.sort()).toEqual(['height_cm', 'sex']);
    const profile = await getUser(fresh.id);
    expect(profile).toMatchObject({ sex: 'male', height_cm: 180 });
    // Birth date and goal came from the fixture, so a real target is computable.
    expect(json.targets.kcal).toBeGreaterThan(1200);
  });

  it('reports what setup still needs, including the first weigh-in', async () => {
    const fresh = await createUser({ sex: null, goal: null, is_setup_complete: false });
    user = fresh;
    build();

    const { json } = await call('set_profile', {
      sex: null, birth_date: null, height_cm: null, target_weight_kg: null,
      activity_level: null, goal: null, display_name: 'Nik', timezone: null, day_start_hour: null,
    });

    expect(json.still_missing).toEqual(['sex', 'goal']);
    expect(json.needs_current_weight).toBe(true);
    expect(json.current_weight_kg).toBeNull();
  });

  it('marks the account onboarded once nothing is missing and a weight exists', async () => {
    const fresh = await createUser({ sex: null, is_setup_complete: false });
    user = fresh;
    build();
    await addWeight(fresh, TODAY, 85);

    await call('set_profile', {
      sex: 'male', birth_date: null, height_cm: null, target_weight_kg: null,
      activity_level: null, goal: null, display_name: null, timezone: null, day_start_hour: null,
    });

    expect((await getUser(fresh.id)).is_setup_complete).toBe(true);
  });

  it('leaves a manually set target alone', async () => {
    await setUserTargets(user, TODAY, { kcal: 1900, is_custom: true, source: 'manual' });
    await call('set_profile', {
      sex: 'male', birth_date: null, height_cm: 185, target_weight_kg: null,
      activity_level: null, goal: null, display_name: null, timezone: null, day_start_hour: null,
    });
    expect((await targetsForDate(user.id, TODAY)).kcal).toBe(1900);
  });
});

describe('get_progress', () => {
  it('returns aggregates without the per-day series', async () => {
    const { json } = await call('get_progress', { days: null });
    expect(json).toHaveProperty('weight');
    expect(json).toHaveProperty('calories.average_kcal');
    expect(json.calories).not.toHaveProperty('series');
    expect(json.weight).not.toHaveProperty('series');
  });

  it('caps the window at a year', async () => {
    const { json } = await call('get_progress', { days: 10_000 });
    expect(json.calories.target_kcal).toBe(2200);
  });
});

/**
 * The display tools. What matters is not that a card appears, but that the
 * numbers on it came from the database — the model supplies a choice of metric
 * and nothing else, so there is no path by which it draws a figure it made up.
 *
 * These windows end at the real today rather than the fixture's frozen clock,
 * because "the last 30 days" is anchored to now by definition. The tool context
 * is rebuilt on the same clock so a log with `when: null` lands inside the
 * window it is about to be plotted in.
 */
describe('the display tools', () => {
  let realToday: string;

  beforeEach(async () => {
    build({ now: new Date() });
    realToday = await currentLocalDate(user.ctx);
  });

  describe('show_chart', () => {
    it('plots the calorie series that is actually logged', async () => {
      await addMeal(user, { date: realToday, kcal: 1800, protein_g: 120 });

      const { json } = await call('show_chart', { metric: 'calories', days: 30, caption: null });
      expect(json).toEqual({ shown: 'calories', days: 30 });

      const card = actions[0]!.card as Extract<ChatCard, { type: 'trend' }>;
      expect(actions[0]!.kind).toBe('card_shown');
      expect(card).toMatchObject({ type: 'trend', metric: 'calories', unit: 'kcal', target: 2200 });
      expect(card.series).toHaveLength(30);
      expect(card.series.at(-1)).toMatchObject({ local_date: realToday, value: 1800 });
    });

    it('gives every metric real points rather than an empty chart', async () => {
      await addMeal(user, { date: realToday, kcal: 1800, protein_g: 120 });
      await addWeight(user, realToday, 82);
      await call('log_exercise', {
        description: '5km run', duration_min: 30, distance_km: 5,
        kcal_burned: 300, when: null, confidence: 'low',
      });

      for (const metric of ['calories', 'protein', 'weight', 'exercise'] as const) {
        actions.length = 0;
        await call('show_chart', { metric, days: 30, caption: null });
        const card = actions[0]!.card as Extract<ChatCard, { type: 'trend' }>;
        expect(card.metric).toBe(metric);
        expect(card.series.some((p) => p.value !== null), `${metric} has no points`).toBe(true);
      }
    });

    it('carries the caption the model wrote, and null when it wrote none', async () => {
      await call('show_chart', { metric: 'weight', days: 30, caption: 'Down 1.2kg this month.' });
      expect(actions[0]!.card).toMatchObject({ caption: 'Down 1.2kg this month.' });

      actions.length = 0;
      await call('show_chart', { metric: 'weight', days: 30, caption: null });
      expect(actions[0]!.card).toMatchObject({ caption: null });
    });

    it('labels the weight chart in what the reader weighs in', async () => {
      await addWeight(user, realToday, 80);

      build({ units: 'imperial' });
      await call('show_chart', { metric: 'weight', days: 30, caption: null });
      const card = actions[0]!.card as Extract<ChatCard, { type: 'trend' }>;

      // The average is printed beside the line, so a kilogram figure under an
      // "lb" label would be a wrong number rather than an untranslated one.
      expect(card.unit).toBe('lb');
      expect(card.series.at(-1)!.value).toBeCloseTo(176.4, 1);
      expect(card.average).toBeCloseTo(176.4, 1);
    });

    it('clamps the window rather than trusting the model with it', async () => {
      await call('show_chart', { metric: 'calories', days: 10_000, caption: null });
      expect((actions[0]!.card as Extract<ChatCard, { type: 'trend' }>).series).toHaveLength(365);

      actions.length = 0;
      await call('show_chart', { metric: 'calories', days: 1, caption: null });
      expect((actions[0]!.card as Extract<ChatCard, { type: 'trend' }>).series).toHaveLength(7);
    });
  });

  describe('show_day', () => {
    it('draws the day from the log, defaulting to today', async () => {
      await addMeal(user, { date: realToday, kcal: 1450, protein_g: 96 });

      const { json } = await call('show_day', { date: null, caption: null });
      expect(json).toEqual({ shown: realToday });
      expect(actions[0]!.card).toMatchObject({
        type: 'day',
        local_date: realToday,
        consumed: expect.objectContaining({ kcal: 1450 }),
        targets: expect.objectContaining({ kcal: 2200 }),
        burned_kcal: 0,
      });
    });

    it('draws a past day when asked for one', async () => {
      await addMeal(user, { date: '2026-03-08', kcal: 900 });
      await call('show_day', { date: '2026-03-08', caption: 'Your lightest day.' });
      expect(actions[0]!.card).toMatchObject({
        local_date: '2026-03-08',
        caption: 'Your lightest day.',
        consumed: expect.objectContaining({ kcal: 900 }),
      });
    });

    it('rejects a date it cannot trust instead of guessing', async () => {
      const { isError, text } = await call('show_day', { date: 'last tuesday', caption: null });
      expect(isError).toBe(true);
      expect(text).toContain('YYYY-MM-DD');
      expect(actions).toHaveLength(0);
    });
  });
});

describe('cards on the logging tools', () => {
  it('draws the burn with the distance and duration it was based on', async () => {
    await call('log_exercise', {
      description: '5km run', duration_min: 28, distance_km: 5,
      kcal_burned: 320.4, when: null, confidence: 'low',
    });
    expect(actions[0]!.card).toMatchObject({
      type: 'exercise',
      description: '5km run',
      kcal_burned: 320,
      duration_min: 28,
      distance_km: 5,
      confidence: 'low',
    });
  });

  it('shows a weigh-in against its trend, not as a number on its own', async () => {
    build({ now: new Date() });
    const today = await currentLocalDate(user.ctx);
    await addWeight(user, addDays(today, -9), 84);
    await addWeight(user, addDays(today, -1), 82.6);
    await call('log_weight', { weight_kg: 82.1, when: null });

    const card = actions[0]!.card as Extract<ChatCard, { type: 'weight' }>;
    expect(card.type).toBe('weight');
    expect(card.weight_kg).toBe(82.1);
    expect(card.series.some((p) => p.value !== null)).toBe(true);
  });

  it('leaves a deletion with nothing to draw', async () => {
    const entry = await addMeal(user, { date: TODAY, kcal: 500 });
    await call('delete_entry', { entry_id: entry.id, kind: 'food' });
    expect(actions[0]).toMatchObject({ kind: 'food_deleted', card: null });
  });

  it('keeps the display tools out of the read-only set', () => {
    build({}, true);
    expect([...tools.keys()]).not.toContain('show_chart');
    expect([...tools.keys()]).not.toContain('show_day');
  });
});

/**
 * Answering "what can I cook?" inside the conversation.
 *
 * The tool runs a whole second agent, which is why the scripting below is
 * nested: the outer call is the journal's, the scripted run is the kitchen's.
 */
describe('suggest_recipes', () => {
  const RECIPE = {
    title: 'Chicken and rice',
    summary: null,
    portions: 1,
    minutes: 25,
    steps: ['Cook it.'],
    ingredients: [
      {
        name: 'Chicken breast',
        quantity_g: 200,
        quantity_desc: '1 breast',
        kcal: 330,
        protein_g: 62,
        carbs_g: 0,
        fat_g: 7,
        missing: false,
      },
    ],
    confidence: 'medium',
  };

  /** Scripts the kitchen run that happens inside the tool call. */
  async function scriptKitchen() {
    const toolsModule = await import('../src/ai/tools.ts');
    const spy = vi.spyOn(toolsModule, 'buildNutritionServer');
    const { scriptAgent } = await import('./helpers/agent-mock.ts');
    scriptAgent({
      text: 'Built around the chicken.',
      act: async () => {
        const built = spy.mock.results.at(-1)!.value as ReturnType<
          typeof toolsModule.buildNutritionServer
        >;
        await built.tools.find((t) => t.name === 'propose_recipe')!.handler(RECIPE as never, {});
      },
    });
  }

  it('is on the journal and nowhere near the review', () => {
    build();
    expect(tools.has('suggest_recipes')).toBe(true);
    build({}, true);
    expect(tools.has('suggest_recipes')).toBe(false);
  });

  it('draws the recipes as a card the user can act on', async () => {
    build();
    await scriptKitchen();

    const result = await call('suggest_recipes', { wants: 'something with the chicken' });

    expect(result.isError).toBe(false);
    expect(result.json.suggested).toEqual([
      { title: 'Chicken and rice', kcal: 330, protein_g: 62, minutes: 25, missing: [] },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      kind: 'recipes_suggested',
      summary: 'Chicken and rice',
      card: { type: 'recipes' },
    });
    // The whole recipe travels on the card, so the journal renders the same
    // thing the Cook tab does rather than a teaser.
    const card = actions[0]!.card as Extract<typeof actions[0]['card'], { type: 'recipes' }>;
    expect(card.recipes[0]).toMatchObject({ title: 'Chicken and rice', kcal: 330 });
  });

  /**
   * The hole this closes: the route limiter counts requests to
   * `/recipes/suggest`, and a run started from a journal tool never goes there.
   * Without a ceiling of its own, the chat box is an unmetered way to spend the
   * most expensive call in the product.
   */
  it('refuses once the day’s recipe budget is gone', async () => {
    const { limitsFor } = await import('../src/services/plans.ts');
    const { recordUsage } = await import('../src/services/usage.ts');
    const spent = limitsFor('free').recipeRunsPerDay;

    for (let i = 0; i < spent; i++) {
      await recordUsage({
        provider: 'anthropic-api',
        userId: user.id,
        kind: 'recipe',
        outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 0.2, model: 'claude-opus-5' } as never,
      });
    }

    build();
    const result = await call('suggest_recipes', {});

    expect(result.isError).toBe(true);
    expect(result.text).toContain(`all ${spent} recipe suggestions`);
    expect(actions).toEqual([]);
  });

  it('lets a paid account past the free ceiling', async () => {
    const { recordUsage } = await import('../src/services/usage.ts');
    const { query } = await import('../src/db.ts');
    await query('UPDATE users SET plan = $1 WHERE id = $2', ['pro', user.id]);
    await recordUsage({
      provider: 'anthropic-api',
      userId: user.id,
      kind: 'recipe',
      outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 0.2, model: 'claude-opus-5' } as never,
    });

    build();
    await scriptKitchen();
    expect((await call('suggest_recipes', {})).isError).toBe(false);
  });
});

// ---- The kitchen -----------------------------------------------------------

/**
 * The journal could cook out of a kitchen it was not allowed to look at.
 *
 * These cover the reach rather than the cleverness: the pantry, the recipes
 * already saved, the week ahead and the review are all things a user can do by
 * hand, and every one of them used to stop at the edge of the chat box.
 */

const INGREDIENT = {
  name: 'Chicken thighs',
  quantity_g: 400,
  quantity_desc: '4 thighs',
  kcal: 800,
  protein_g: 80,
  carbs_g: 0,
  fat_g: 50,
  fiber_g: 0,
  sodium_mg: 400,
  sat_fat_g: 14,
  sugar_g: 0,
  missing: false,
};

async function makeRecipe(title: string, overrides: Record<string, unknown> = {}) {
  const { saveRecipe } = await import('../src/services/recipes.ts');
  return saveRecipe({
    userId: user.id,
    title,
    summary: null,
    portions: 2,
    minutes: 25,
    steps: ['Cook it.'],
    ingredients: [INGREDIENT],
    confidence: 'medium',
    generatedFor: null,
    ...overrides,
  } as never);
}

async function stock(...names: string[]) {
  const { addPantryItems } = await import('../src/services/pantry.ts');
  return addPantryItems(user.id, 'free', names.map((name) => ({ name })));
}

describe('get_pantry', () => {
  it('is on the journal and nowhere near the review', () => {
    build();
    expect(tools.has('get_pantry')).toBe(true);
    build({}, true);
    expect(tools.has('get_pantry')).toBe(false);
  });

  it('lists what they said they have, with its age', async () => {
    await stock('Chicken thighs', 'Spinach');
    build();

    const { json } = await call('get_pantry');

    expect(json.count).toBe(2);
    expect(json.items.map((i: any) => i.name).sort()).toEqual(['Chicken thighs', 'Spinach']);
    expect(json.items[0].last_seen_days_ago).toBe(0);
    // The premise the model would otherwise get wrong in the expensive
    // direction: a confident recipe built on food that is long gone.
    expect(json.what_this_is).toContain('not a stocktake');
  });

  it('marks anything gone stale, and never a staple', async () => {
    const { addPantryItems } = await import('../src/services/pantry.ts');
    const { query } = await import('../src/db.ts');
    await addPantryItems(user.id, 'free', [{ name: 'Rice', is_staple: true }, { name: 'Milk' }]);
    // Absolute, not `now() - interval`: the turn's clock is NOW, and the
    // database's is whatever day the suite happens to run on.
    await query('UPDATE pantry_items SET last_seen_at = $1', ['2026-02-08T11:00:00Z']);
    build();

    const { json } = await call('get_pantry');
    const byName = new Map<string, any>(json.items.map((i: any) => [i.name, i]));

    expect(byName.get('Milk').stale).toBe(true);
    expect(byName.get('Rice').stale).toBeUndefined();
    expect(byName.get('Rice').last_seen_days_ago).toBe(0);
  });
});

describe('update_pantry', () => {
  it('adds what they bought', async () => {
    build();

    const { json } = await call('update_pantry', {
      add: [{ name: 'Spinach', quantity_desc: 'a bag', is_staple: false }],
    });

    expect(json.added).toEqual(['Spinach']);
    expect(json.pantry_size).toBe(1);
    const { listPantry } = await import('../src/services/pantry.ts');
    expect((await listPantry(user.id))[0]).toMatchObject({ name: 'Spinach', quantity_desc: 'a bag' });
  });

  /** Two rows called "Eggs" and "eggs" is what makes a pantry unusable. */
  it('refreshes a name it already has rather than duplicating it', async () => {
    await stock('Eggs');
    build();

    const { json } = await call('update_pantry', { add: [{ name: 'eggs', quantity_desc: 'half a box' }] });

    expect(json.added).toEqual([]);
    expect(json.refreshed).toEqual(['eggs']);
    expect(json.pantry_size).toBe(1);
  });

  it('removes what ran out', async () => {
    await stock('Eggs', 'Spinach');
    build();

    const { json } = await call('update_pantry', { remove: ['eggs'] });

    expect(json.removed).toEqual(['Eggs']);
    expect(json.pantry_size).toBe(1);
  });

  it('takes the shopping and the shortage in one call', async () => {
    await stock('Eggs');
    build();

    const { json } = await call('update_pantry', {
      add: [{ name: 'Chicken thighs' }],
      remove: ['Eggs'],
    });

    expect(json.added).toEqual(['Chicken thighs']);
    expect(json.removed).toEqual(['Eggs']);
  });

  /** Reporting a removal that did not happen is the failure worth catching. */
  it('says which names were not there to remove', async () => {
    build();

    const { json } = await call('update_pantry', { remove: ['Caviar'] });

    expect(json.removed).toEqual([]);
    expect(json.not_in_the_list).toEqual(['Caviar']);
    expect(json.note).toContain('Do not claim');
  });

  it('refuses a call that changes nothing', async () => {
    build();
    expect((await call('update_pantry', {})).isError).toBe(true);
  });

  it('reports a full kitchen rather than throwing', async () => {
    const { limitsFor } = await import('../src/services/plans.ts');
    const limit = limitsFor('free').pantryItems;
    await stock(...Array.from({ length: limit }, (_, i) => `Item ${i}`));
    build();

    const result = await call('update_pantry', { add: [{ name: 'One too many' }] });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('full');
  });
});

describe('find_recipes', () => {
  it('puts their own on screen as cards they can cook', async () => {
    await makeRecipe('Chicken traybake');
    build();

    const { json } = await call('find_recipes', { query: 'chicken' });

    expect(json.theirs).toHaveLength(1);
    expect(json.theirs[0]).toMatchObject({ title: 'Chicken traybake', portions: 2 });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: 'recipes_suggested', card: { type: 'recipes' } });
  });

  it('searches the built-in library too', async () => {
    const { seedLibrary } = await import('../src/seed-library.ts');
    await seedLibrary([
      {
        slug: 'lentil-soup',
        title: 'Lentil soup',
        summary: null,
        category: 'Soup',
        portions: 4,
        serving_size: '1 bowl',
        ingredients: [{ text: '1 cup lentils', note: null }],
        steps: ['Simmer.'],
        keywords: ['lentil'],
        kcal: 300,
        protein_g: 18,
        carbs_g: 45,
        fat_g: 4,
        food_groups: [],
        image_path: '/recipes/lentil-soup.jpg',
        source: 'USDA MyPlate Kitchen',
        source_url: 'https://example.test/lentil-soup',
        rating: 4,
        rating_count: 10,
      },
    ]);
    build();

    const { json } = await call('find_recipes', { query: 'lentil' });

    expect(json.library).toEqual([
      expect.objectContaining({ library_slug: 'lentil-soup', title: 'Lentil soup', kcal_per_portion: 300 }),
    ]);
    // A library recipe has measured macros per portion and no per-ingredient
    // split, so it cannot fill the card without inventing the missing half.
    expect(actions).toEqual([]);
  });

  it('says plainly when there is nothing, rather than drawing an empty card', async () => {
    build();

    const { json } = await call('find_recipes', { query: 'wellington' });

    expect(json.found).toBe(0);
    expect(json.note).toContain('wellington');
    expect(actions).toEqual([]);
  });

  it('narrows to what they deliberately kept', async () => {
    const kept = await makeRecipe('Kept one');
    await makeRecipe('Passing one');
    const { setRecipeSaved } = await import('../src/services/recipes.ts');
    await setRecipeSaved(user.id, kept.id, true);
    build();

    const { json } = await call('find_recipes', { saved_only: true });

    expect(json.theirs.map((r: any) => r.title)).toEqual(['Kept one']);
  });
});

describe('cook_recipe', () => {
  it('logs one of theirs against the day, priced as it was written', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    build();

    const { json } = await call('cook_recipe', { recipe_id: recipe.id });

    // Two portions in the recipe, one eaten: half the ingredients.
    expect(json.logged).toEqual({ kcal: 400, protein_g: 40, carbs_g: 0, fat_g: 25 });
    expect(json.local_date).toBe(TODAY);
    expect(json.day_totals.kcal).toBe(400);
    expect(actions[0]).toMatchObject({ kind: 'food_logged', card: { type: 'food' } });

    const entry = await getFoodEntry(user.id, json.entry_id);
    expect(entry!.description).toBe('Chicken traybake');
    expect(entry!.source).toBe('quick');
  });

  it('scales to what actually went on the plate', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    build();

    const { json } = await call('cook_recipe', { recipe_id: recipe.id, portions: 2 });

    expect(json.logged.kcal).toBe(800);
  });

  it('logs a library recipe by slug', async () => {
    const { seedLibrary } = await import('../src/seed-library.ts');
    await seedLibrary([
      {
        slug: 'lentil-soup',
        title: 'Lentil soup',
        summary: null,
        category: 'Soup',
        portions: 4,
        serving_size: '1 bowl',
        ingredients: [{ text: '1 cup lentils', note: null }],
        steps: ['Simmer.'],
        keywords: ['lentil'],
        kcal: 300,
        protein_g: 18,
        carbs_g: 45,
        fat_g: 4,
        food_groups: [],
        image_path: '/recipes/lentil-soup.jpg',
        source: 'USDA MyPlate Kitchen',
        source_url: 'https://example.test/lentil-soup',
        rating: 4,
        rating_count: 10,
      },
    ]);
    build();

    const { json } = await call('cook_recipe', { library_slug: 'lentil-soup' });

    expect(json.logged.kcal).toBe(300);
    const entry = await getFoodEntry(user.id, json.entry_id);
    expect(entry!.description).toBe('Lentil soup');
  });

  it('insists on exactly one kind of id', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    build();

    expect((await call('cook_recipe', {})).isError).toBe(true);
    expect(
      (await call('cook_recipe', { recipe_id: recipe.id, library_slug: 'lentil-soup' })).isError,
    ).toBe(true);
  });

  it('fails rather than logging nothing quietly', async () => {
    build();
    const result = await call('cook_recipe', { recipe_id: '11111111-1111-1111-1111-111111111111' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('find_recipes');
  });
});

describe('save_recipe', () => {
  it('keeps one of theirs, and stops keeping it', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    build();

    expect((await call('save_recipe', { recipe_id: recipe.id, saved: true })).json.saved).toBe(true);
    const { getRecipe } = await import('../src/services/recipes.ts');
    expect((await getRecipe(user.id, recipe.id))!.saved).toBe(true);

    await call('save_recipe', { recipe_id: recipe.id, saved: false });
    expect((await getRecipe(user.id, recipe.id))!.saved).toBe(false);
  });

  it('fails on an id that is not theirs', async () => {
    build();
    expect(
      (await call('save_recipe', { recipe_id: '11111111-1111-1111-1111-111111111111' })).isError,
    ).toBe(true);
  });
});

// ---- The week ahead --------------------------------------------------------

/** Tuesday 10 March 2026 belongs to the plan week starting Monday the 9th. */
const WEEK_START = '2026-03-09';

async function planWith(slots: Array<{ date: string; recipeId: string | null; portions?: number }>) {
  const { saveMealPlan } = await import('../src/services/mealPlans.ts');
  return saveMealPlan(
    user.id,
    WEEK_START,
    null,
    slots.map((s) => ({ local_date: s.date, recipeId: s.recipeId, portions: s.portions ?? 1 })),
  );
}

describe('get_meal_plan', () => {
  it('draws the week and hands back the id of every night', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    await planWith([
      { date: '2026-03-10', recipeId: recipe.id },
      { date: '2026-03-11', recipeId: null },
    ]);
    build();

    const { json } = await call('get_meal_plan');

    expect(json.week_start).toBe(WEEK_START);
    expect(json.today).toBe(TODAY);
    expect(json.nights).toHaveLength(2);
    expect(json.nights[0]).toMatchObject({ weekday: 'Tuesday', title: 'Chicken traybake', cooked: false });
    expect(json.nights[1].title).toBeNull();
    expect(json.nights[0].slot_id).toEqual(expect.any(String));

    expect(actions[0]).toMatchObject({ kind: 'plan_shown', card: { type: 'plan' } });
    const card = actions[0]!.card as Extract<ChatCard, { type: 'plan' }>;
    expect(card.nights[0]).toMatchObject({ title: 'Chicken traybake', kcal: 400, weekday: 'Tuesday' });
    expect(card.nights[1]!.title).toBeNull();
  });

  it('says there is no plan rather than failing', async () => {
    build();

    const { json } = await call('get_meal_plan');

    expect(json.plan).toBeNull();
    expect(json.week_start).toBe(WEEK_START);
    expect(actions).toEqual([]);
  });
});

describe('update_plan_night', () => {
  it('swaps one night for another recipe', async () => {
    const first = await makeRecipe('Chicken traybake');
    const second = await makeRecipe('Lentil stew');
    const plan = await planWith([{ date: '2026-03-10', recipeId: first.id }]);
    build();

    const { json } = await call('update_plan_night', {
      slot_id: plan.slots[0]!.id,
      recipe_id: second.id,
    });

    expect(json.night).toMatchObject({ date: '2026-03-10', title: 'Lentil stew' });
  });

  it('clears a night they are eating out', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    const plan = await planWith([{ date: '2026-03-10', recipeId: recipe.id }]);
    build();

    const { json } = await call('update_plan_night', { slot_id: plan.slots[0]!.id, clear: true });

    expect(json.night.title).toBeNull();
  });

  it('will not clear and fill the same night', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    const plan = await planWith([{ date: '2026-03-10', recipeId: recipe.id }]);
    build();

    const result = await call('update_plan_night', {
      slot_id: plan.slots[0]!.id,
      recipe_id: recipe.id,
      clear: true,
    });
    expect(result.isError).toBe(true);
  });

  /** An id in a tool call is otherwise a way to read somebody else's recipe. */
  it('refuses a recipe that is not theirs', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    const plan = await planWith([{ date: '2026-03-10', recipeId: recipe.id }]);
    const stranger = await createUser();
    const { saveRecipe } = await import('../src/services/recipes.ts');
    const theirs = await saveRecipe({
      userId: stranger.id,
      title: 'Not yours',
      summary: null,
      portions: 1,
      minutes: 10,
      steps: ['Cook it.'],
      ingredients: [INGREDIENT],
      confidence: 'medium',
      generatedFor: null,
    } as never);
    build();

    const result = await call('update_plan_night', {
      slot_id: plan.slots[0]!.id,
      recipe_id: theirs.id,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('not one of their recipes');
  });

  it('fails on a night that does not exist', async () => {
    build();
    const result = await call('update_plan_night', {
      slot_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.isError).toBe(true);
  });
});

describe('cook_planned_night', () => {
  /** A batch is what the pot makes, not what went on the plate. */
  it('logs one portion however many the cook makes', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    const plan = await planWith([{ date: '2026-03-10', recipeId: recipe.id, portions: 4 }]);
    build();

    const { json } = await call('cook_planned_night', { slot_id: plan.slots[0]!.id });

    expect(json.logged.kcal).toBe(400);
    expect(actions[0]).toMatchObject({ kind: 'food_logged', card: { type: 'food' } });

    const { getMealPlan } = await import('../src/services/mealPlans.ts');
    expect((await getMealPlan(user.id, WEEK_START))!.slots[0]!.cooked_at).not.toBeNull();
  });

  it('fails on a night with nothing planned', async () => {
    const plan = await planWith([{ date: '2026-03-10', recipeId: null }]);
    build();

    const result = await call('cook_planned_night', { slot_id: plan.slots[0]!.id });
    expect(result.isError).toBe(true);
  });
});

describe('get_shopping_list', () => {
  it('drops what the kitchen already holds, and names what it dropped', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    await planWith([{ date: '2026-03-10', recipeId: recipe.id }]);
    await stock('Chicken thighs');
    build();

    const { json } = await call('get_shopping_list');

    expect(json.week_start).toBe(WEEK_START);
    expect(json.already_have).toEqual(['Chicken thighs']);
    expect(json.to_buy).toEqual([]);
  });

  it('says an empty list is empty rather than failing', async () => {
    build();
    const { json } = await call('get_shopping_list');
    // Not an error any more. The list is no longer only a projection of the
    // plan, so "nothing on it yet" is a state to describe and offer to fix.
    expect(json.to_buy).toEqual([]);
    expect(json.note).toContain('update_shopping_list');
  });

  it('marks which lines they wrote themselves', async () => {
    await written([{ name: 'Kitchen roll' }]);
    build();

    const { json } = await call('get_shopping_list');
    expect(json.to_buy).toEqual([
      {
        name: 'Kitchen roll',
        quantity_g: null,
        quantity: [],
        for_dates: [],
        they_wrote_this: true,
        ticked_off: false,
      },
    ]);
  });

  it('says nothing about authorship on an ordinary ingredient', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    await planWith([{ date: '2026-03-10', recipeId: recipe.id }]);
    build();

    const { json } = await call('get_shopping_list');
    expect(json.to_buy[0]).not.toHaveProperty('they_wrote_this');
  });
});

/** Writes a line straight into the list, without going through the tool. */
async function written(items: Array<{ name: string; quantity_desc?: string | null }>) {
  const { addExtras } = await import('../src/services/shopping.ts');
  return addExtras(user.id, WEEK_START, items);
}

describe('update_shopping_list', () => {
  it('is on the journal and nowhere near the review', () => {
    build();
    expect(tools.has('update_shopping_list')).toBe(true);
    build({}, true);
    expect(tools.has('update_shopping_list')).toBe(false);
  });

  it('writes what no recipe would ever produce', async () => {
    build();
    const { json } = await call('update_shopping_list', {
      add: [
        { name: 'Kitchen roll', quantity_desc: '2 rolls' },
        { name: 'Bin bags', quantity_desc: null },
      ],
    });

    expect(json.written).toEqual(['Kitchen roll', 'Bin bags']);
    expect(json.still_to_buy).toBe(2);

    const { json: list } = await call('get_shopping_list');
    expect(list.to_buy.map((i: { name: string }) => i.name)).toEqual(['Bin bags', 'Kitchen roll']);
  });

  it('says a name already on the list was refreshed, not written', async () => {
    await written([{ name: 'Milk', quantity_desc: '2 litres' }]);
    build();

    const { json } = await call('update_shopping_list', { add: [{ name: 'milk' }] });
    expect(json.written).toEqual([]);
    expect(json.refreshed).toEqual(['milk']);
  });

  it('ticks a line off without deleting it', async () => {
    await written([{ name: 'Kitchen roll' }]);
    build();

    const { json } = await call('update_shopping_list', { bought: ['kitchen roll'] });
    expect(json.ticked_off).toEqual(['Kitchen roll']);
    expect(json.still_to_buy).toBe(0);

    // Still drawn, so a shop in progress can see what is in the trolley.
    const { json: list } = await call('get_shopping_list');
    expect(list.to_buy[0]).toMatchObject({ name: 'Kitchen roll', ticked_off: true });
  });

  it('puts one back when they did not actually get it', async () => {
    await written([{ name: 'Kitchen roll' }]);
    build();
    await call('update_shopping_list', { bought: ['Kitchen roll'] });

    const { json } = await call('update_shopping_list', { still_needed: ['Kitchen roll'] });
    expect(json.back_on_the_list).toEqual(['Kitchen roll']);
    expect(json.still_to_buy).toBe(1);
  });

  it('takes one off entirely, which is not the same as buying it', async () => {
    await written([{ name: 'Wine' }]);
    build();

    const { json } = await call('update_shopping_list', { remove: ['Wine'] });
    expect(json.removed).toEqual(['Wine']);
    expect((await call('get_shopping_list')).json.to_buy).toEqual([]);
  });

  it('writes and ticks off in one call', async () => {
    build();
    // "Grab some kitchen roll — actually, I already got it." The tick resolves
    // against the list as it stands after the write, or this would silently
    // half-work.
    const { json } = await call('update_shopping_list', {
      add: [{ name: 'Kitchen roll' }],
      bought: ['Kitchen roll'],
    });
    expect(json.written).toEqual(['Kitchen roll']);
    expect(json.ticked_off).toEqual(['Kitchen roll']);
  });

  it('will not pretend it ticked off an ingredient the plan put there', async () => {
    const recipe = await makeRecipe('Chicken traybake');
    await planWith([{ date: '2026-03-10', recipeId: recipe.id }]);
    build();

    const { json } = await call('update_shopping_list', { bought: ['Chicken thighs'] });
    expect(json.ticked_off).toEqual([]);
    expect(json.not_written_by_them).toEqual(['Chicken thighs']);
    // And it is told where that actually goes, so the turn is not wasted.
    expect(json.note).toContain('update_pantry');
    // The ingredient is untouched.
    expect((await call('get_shopping_list')).json.to_buy).toHaveLength(1);
  });

  it('refuses a call that changes nothing', async () => {
    build();
    const result = await call('update_shopping_list');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Say what changed');
  });

  it('refuses to write past the ceiling', async () => {
    const { MAX_SHOPPING_EXTRAS } = await import('../src/services/shopping.ts');
    await written(Array.from({ length: MAX_SHOPPING_EXTRAS }, (_, i) => ({ name: `Thing ${i}` })));
    build();

    const result = await call('update_shopping_list', { add: [{ name: 'One more' }] });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(String(MAX_SHOPPING_EXTRAS));
  });
});

// ---- Repeating, and what they will not eat ---------------------------------

describe('repeat_meal', () => {
  /**
   * The reason this exists rather than search-then-log: the search returns each
   * item's calories and none of its macros, so re-logging from it is a fresh
   * estimate wearing an old meal's name.
   */
  it('copies the entry as it was priced the first time', async () => {
    const original = await addMeal(user, {
      date: addDays(TODAY, -1),
      meal: 'breakfast',
      description: 'Porridge and berries',
      kcal: 430,
      protein_g: 18,
      carbs_g: 62,
      fat_g: 11,
    });
    build();

    const { json } = await call('repeat_meal', { entry_id: original.id, meal: 'breakfast' });

    expect(json.local_date).toBe(TODAY);
    expect(json.logged).toEqual({ kcal: 430, protein_g: 18, carbs_g: 62, fat_g: 11 });
    expect(json.entry_id).not.toBe(original.id);
    expect(actions[0]).toMatchObject({ kind: 'food_logged', card: { type: 'food' } });

    const copy = await getFoodEntry(user.id, json.entry_id);
    expect(copy!.description).toBe('Porridge and berries');
    // A different meal that happens to match, so it does not inherit the photo.
    expect(copy!.photo_id).toBeNull();
  });

  it('fails on an id it cannot find', async () => {
    build();
    const result = await call('repeat_meal', { entry_id: '11111111-1111-1111-1111-111111111111' });
    expect(result.isError).toBe(true);
  });
});

describe('set_profile and what they will not eat', () => {
  /**
   * The gap this closes: `diet` and `avoids` are read by the recipe engine as
   * hard limits, and the journal could only ever file them as a standing note —
   * which the kitchen never reads.
   */
  it('stores a dietary pattern and the list of things to avoid', async () => {
    build();

    const { json } = await call('set_profile', { diet: 'vegetarian', avoids: ['shellfish', 'peanuts'] });

    expect(json.saved).toEqual(expect.arrayContaining(['diet', 'avoids']));
    const profile = await getUser(user.id);
    expect(profile.diet).toBe('vegetarian');
    expect(profile.avoids).toEqual(['shellfish', 'peanuts']);
  });

  /** The list is replaced, not appended to — so an empty one clears it. */
  it('clears the list when given an empty one', async () => {
    build();
    await call('set_profile', { avoids: ['peanuts'] });

    await call('set_profile', { avoids: [] });

    expect((await getUser(user.id)).avoids).toEqual([]);
  });

  it('leaves both alone when the turn was about something else', async () => {
    build();
    await call('set_profile', { diet: 'vegan', avoids: ['peanuts'] });

    await call('set_profile', { height_cm: 180 });

    const profile = await getUser(user.id);
    expect(profile.diet).toBe('vegan');
    expect(profile.avoids).toEqual(['peanuts']);
  });
});

describe('plan_week', () => {
  /** One plan run, with the scripted model proposing the given dinners in order. */
  async function scriptPlan(titles: string[]) {
    const toolsModule = await import('../src/ai/tools.ts');
    const spy = vi.spyOn(toolsModule, 'buildNutritionServer');
    const { scriptAgent } = await import('./helpers/agent-mock.ts');
    scriptAgent({
      text: 'A week built around the chicken.',
      act: async () => {
        const built = spy.mock.results.at(-1)!.value as ReturnType<
          typeof toolsModule.buildNutritionServer
        >;
        const propose = built.tools.find((t) => t.name === 'propose_recipe')!;
        for (const title of titles) {
          await propose.handler(
            {
              title,
              summary: null,
              portions: 1,
              minutes: 30,
              steps: ['Cook it.'],
              ingredients: [INGREDIENT],
              confidence: 'medium',
            } as never,
            {},
          );
        }
      },
    });
  }

  it('is on the journal and nowhere near the review', () => {
    build();
    expect(tools.has('plan_week')).toBe(true);
    build({}, true);
    expect(tools.has('plan_week')).toBe(false);
  });

  it('fills the nights still ahead and draws them', async () => {
    // Tuesday: six nights left in the week that started on the 9th.
    await scriptPlan(['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    build();

    const { json } = await call('plan_week', { wants: 'nothing fiddly' });

    expect(json.week_start).toBe(WEEK_START);
    expect(json.nights_planned).toBe(6);
    expect(actions[0]).toMatchObject({ kind: 'plan_made', card: { type: 'plan' } });

    const card = actions[0]!.card as Extract<ChatCard, { type: 'plan' }>;
    expect(card.nights[0]).toMatchObject({ local_date: TODAY, weekday: 'Tuesday', title: 'Tuesday' });

    const { getMealPlan } = await import('../src/services/mealPlans.ts');
    expect((await getMealPlan(user.id, WEEK_START))!.slots).toHaveLength(6);
  });

  /**
   * The same hole `suggest_recipes` has: the route limiter counts requests to
   * `/plan`, and a run started from a journal tool never goes there.
   */
  it('refuses once the week’s plan allowance is gone', async () => {
    const { recordUsage } = await import('../src/services/usage.ts');
    await recordUsage({
      provider: 'anthropic-api',
      userId: user.id,
      kind: 'meal_plan',
      outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 1, model: 'claude-opus-5' } as never,
    });
    build();

    const result = await call('plan_week', {});

    expect(result.isError).toBe(true);
    expect(result.text).toContain('all 1 meal plans');
    expect(actions).toEqual([]);
  });
});

describe('run_weekly_review', () => {
  it('is a write, so a review can never run itself', () => {
    build();
    expect(tools.has('run_weekly_review')).toBe(true);
    build({}, true);
    expect(tools.has('run_weekly_review')).toBe(false);
  });

  it('publishes the week and tells the model not to repeat it', async () => {
    await addMeal(user, { date: addDays(TODAY, -2), kcal: 2000 });
    const { scriptAgent } = await import('./helpers/agent-mock.ts');
    scriptAgent({ text: 'You averaged 2,000 against a 2,200 target.' });
    build();

    const { json } = await call('run_weekly_review');

    expect(json.published).toBe(true);
    expect(json.note).toContain('Never restate it');

    // It posts itself into the journal, which is why the tool returns so little.
    const { query } = await import('../src/db.ts');
    const messages = await query<{ content: string }>(
      'SELECT content FROM chat_messages WHERE user_id = $1',
      [user.id],
    );
    expect(messages.some((m) => m.content.includes('averaged 2,000'))).toBe(true);
  });
});

describe('adapt_recipe', () => {
  async function seedOne() {
    const { seedLibrary } = await import('../src/seed-library.ts');
    await seedLibrary([
      {
        slug: 'creamy-pasta',
        title: 'Creamy pasta',
        summary: null,
        category: 'Main dish',
        portions: 4,
        serving_size: '1 bowl',
        ingredients: [{ text: '200ml cream', note: null }],
        steps: ['Stir.'],
        keywords: ['pasta'],
        kcal: 600,
        protein_g: 20,
        carbs_g: 70,
        fat_g: 25,
        food_groups: [],
        image_path: '/recipes/creamy-pasta.jpg',
        source: 'USDA MyPlate Kitchen',
        source_url: 'https://example.test/creamy-pasta',
        rating: 4,
        rating_count: 10,
      },
    ]);
  }

  /** The same scripted kitchen run the other recipe tools use. */
  async function scriptAdaptation(title: string) {
    const toolsModule = await import('../src/ai/tools.ts');
    const spy = vi.spyOn(toolsModule, 'buildNutritionServer');
    const { scriptAgent } = await import('./helpers/agent-mock.ts');
    scriptAgent({
      text: 'Swapped the cream for yoghurt.',
      act: async () => {
        const built = spy.mock.results.at(-1)!.value as ReturnType<
          typeof toolsModule.buildNutritionServer
        >;
        await built.tools.find((t) => t.name === 'propose_recipe')!.handler(
          {
            title,
            summary: null,
            portions: 1,
            minutes: 20,
            steps: ['Stir.'],
            ingredients: [INGREDIENT],
            confidence: 'medium',
          } as never,
          {},
        );
      },
    });
  }

  it('reworks a library recipe and draws the result', async () => {
    await seedOne();
    await scriptAdaptation('Pasta without the cream');
    build();

    const { json } = await call('adapt_recipe', {
      library_slug: 'creamy-pasta',
      wants: 'without the cream',
    });

    expect(json.adapted).toMatchObject({ title: 'Pasta without the cream', kcal_per_portion: 800 });
    expect(actions[0]).toMatchObject({ kind: 'recipes_suggested', card: { type: 'recipes' } });
  });

  it('says so rather than throwing when the slug is not a library recipe', async () => {
    build();
    const result = await call('adapt_recipe', { library_slug: 'not-a-recipe' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('find_recipes');
  });

  /** One budget with suggest_recipes, not a fourth door to the same spend. */
  it('shares the daily recipe ceiling', async () => {
    await seedOne();
    const { recordUsage } = await import('../src/services/usage.ts');
    await recordUsage({
      provider: 'anthropic-api',
      userId: user.id,
      kind: 'recipe',
      outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 0.2, model: 'claude-opus-5' } as never,
    });
    build();

    const result = await call('adapt_recipe', { library_slug: 'creamy-pasta' });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('recipe runs for today');
  });
});

/**
 * The scanner's fallback, for the portions a picker cannot express.
 *
 * `fetch` is stubbed here as it is in `barcode.test.ts` — what these cases are
 * about is the seam between the two tools, and specifically that the model is
 * never the thing doing the multiplication.
 */
describe('the barcode tools', () => {
  const CODE = '3017620422003';

  const SPREAD = {
    status: 1,
    product: {
      code: CODE,
      product_name: 'Hazelnut spread',
      brands: 'Ferrero',
      nutriments: {
        'energy-kcal_100g': 500,
        proteins_100g: 6,
        carbohydrates_100g: 57,
        fat_100g: 31,
      },
      serving_size: '15 g',
      serving_quantity: 15,
    },
  };

  function stubOff(body: unknown, status = 200) {
    vi.stubGlobal('fetch', async () => ({
      ok: status < 400,
      status,
      json: async () => body,
    }));
  }

  // The only cases in this file that touch the network, so the stub is put back
  // rather than left standing for whatever runs next.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the lookup on the journal and away from the review', () => {
    build();
    expect(tools.has('lookup_barcode')).toBe(true);
    expect(tools.has('log_barcode')).toBe(true);
    // A read that leaves the building, and a review agent has no business
    // making an outbound request to anybody.
    build({}, true);
    expect(tools.has('lookup_barcode')).toBe(false);
    expect(tools.has('log_barcode')).toBe(false);
  });

  it('reads the packet without logging anything', async () => {
    stubOff(SPREAD);
    build();

    const { json } = await call('lookup_barcode', { barcode: CODE });

    expect(json).toMatchObject({
      name: 'Hazelnut spread',
      brand: 'Ferrero',
      per_100g: { kcal: 500, protein_g: 6 },
      serving_g: 15,
      source: 'Open Food Facts',
    });
    // The whole point of the tool being a read: it says what the food is and
    // leaves the amount to a conversation.
    expect(json.what_this_is).toContain('not what they ate');
    expect(actions).toHaveLength(0);
  });

  it('sends the model to the label when nobody has catalogued it', async () => {
    stubOff(null, 404);
    build();

    const result = await call('lookup_barcode', { barcode: CODE });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('photograph the nutrition panel');
  });

  it('does not report an outage as a missing product', async () => {
    stubOff(null, 503);
    build();

    const result = await call('lookup_barcode', { barcode: CODE });

    expect(result.isError).toBe(true);
    // Otherwise someone gets sent to photograph a label for a product that is
    // in the catalogue and will be back in a minute.
    expect(result.text).not.toContain('catalogued');
    expect(result.text).toContain('try again');
  });

  it('logs an awkward portion in grams, priced here rather than by the model', async () => {
    stubOff(SPREAD);
    build();

    const { json } = await call('log_barcode', { barcode: CODE, grams: 250, meal: 'snack' });

    expect(json.logged.kcal).toBe(1250);
    const entry = await getFoodEntry(user.id, json.entry_id);
    expect(entry).toMatchObject({ source: 'barcode', confidence: 'high', meal: 'snack' });
    expect(entry!.items[0]).toMatchObject({ quantity_g: 250 });
  });

  it('logs servings against the label that named them', async () => {
    stubOff(SPREAD);
    build();

    const { json } = await call('log_barcode', { barcode: CODE, servings: 2 });

    expect(json.logged.kcal).toBe(150);
    const entry = await getFoodEntry(user.id, json.entry_id);
    expect(entry!.items[0]!.quantity_desc).toContain('2 servings');
  });

  it('draws a card, like every other way of logging a meal', async () => {
    stubOff(SPREAD);
    build();

    await call('log_barcode', { barcode: CODE, grams: 30 });

    expect(actions[0]).toMatchObject({ kind: 'food_logged' });
    expect((actions[0]!.card as Extract<ChatCard, { type: 'food' }>).type).toBe('food');
  });

  it('refuses a portion said two ways at once, or not at all', async () => {
    stubOff(SPREAD);
    build();

    expect((await call('log_barcode', { barcode: CODE, grams: 30, servings: 1 })).isError).toBe(true);
    expect((await call('log_barcode', { barcode: CODE })).isError).toBe(true);
  });

  it('refuses servings against a label that never named one', async () => {
    stubOff({ ...SPREAD, product: { ...SPREAD.product, serving_quantity: null, serving_size: '' } });
    build();

    const result = await call('log_barcode', { barcode: CODE, servings: 2 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('grams');
  });

  it('rejects a code that did not scan cleanly before asking anyone', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      throw new Error('should not be reached');
    });
    build();

    expect((await call('lookup_barcode', { barcode: '3017620422004' })).isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
