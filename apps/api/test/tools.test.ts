import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      userId: user.id,
      kind: 'recipe',
      outcome: { text: 'x', sessionId: null, numTurns: 1, costUsd: 0.2, model: 'claude-opus-5' } as never,
    });

    build();
    await scriptKitchen();
    expect((await call('suggest_recipes', {})).isError).toBe(false);
  });
});
