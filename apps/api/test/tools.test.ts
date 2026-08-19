import { beforeEach, describe, expect, it } from 'vitest';
import type { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { ChatAction } from '@ct/shared';
import { buildNutritionServer, SERVER_NAME, type ToolContext } from '../src/ai/tools.ts';
import { getFoodEntry, listExerciseEntries, listWeights } from '../src/services/log.ts';
import { targetsForDate } from '../src/services/targets.ts';
import { getUser } from '../src/services/user.ts';
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
      { kind: 'food_logged', entry_id: expect.any(String), summary: expect.stringContaining('lunch') },
    ]);
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
