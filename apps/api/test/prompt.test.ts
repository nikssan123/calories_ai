import { describe, expect, it } from 'vitest';
import type { DaySummary, Profile, ReviewStats, WeeklyReview, WeightEntry } from '@ct/shared';
import {
  dayContextPrompt,
  dayRolloverNotice,
  recentReviewPrompt,
  REVIEW_SYSTEM_PROMPT,
  reviewTaskPrompt,
  scannedProductsPrompt,
  STABLE_SYSTEM_PROMPT,
  STABLE_SYSTEM_PROMPT_NO_KITCHEN,
} from '../src/ai/prompt.ts';
import type { ScannedProduct } from '../src/services/barcode.ts';

/**
 * The prompt is the product. These assert the facts the model must be given —
 * not the wording, which is free to change.
 */

// The whole row, not the interesting half. This used to be a discipline nothing
// enforced — `tsconfig` covered `src` only, so a fixture silently missing a new
// column read to `dayContextPrompt` as a user who has none. `test` is in the
// project now, so the compiler keeps this honest instead of the comment.
const profile: Profile = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'nik@example.com',
  email_verified: true,
  units: 'metric',
  locale: 'en',
  display_name: 'Nik',
  sex: 'male',
  birth_date: '1990-01-01',
  height_cm: 180,
  target_weight_kg: 78,
  activity_level: 'moderate',
  goal: 'lose',
  timezone: 'Europe/Sofia',
  day_start_hour: 4,
  is_setup_complete: true,
  plan: 'free',
  diet: 'none',
  avoids: [],
  notify_weekly_review: true,
  notify_nudges: false,
  notify_milestones: true,
  notify_daily_recap: false,
};

const day: DaySummary = {
  // The prompt says nothing about streaks, so this is the shape a fixture takes
  // for a day that is not the reader's today.
  streak: null,
  local_date: '2026-03-10',
  consumed: { kcal: 1840, protein_g: 120, carbs_g: 180, fat_g: 60 },
  quality: {
    fiber_g: 19,
    sodium_mg: 1400,
    sat_fat_g: 18,
    sugar_g: 44,
    coverage: 1,
    targets: {
      fiber_g: { value: 31, direction: 'floor' },
      sodium_mg: { value: 2300, direction: 'ceiling' },
      sat_fat_g: { value: 24, direction: 'ceiling' },
      sugar_g: { value: 55, direction: 'ceiling' },
    },
  },
  burned_kcal: 300,
  net_kcal: 1540,
  targets: { kcal: 2200, protein_g: 160, carbs_g: 220, fat_g: 70, is_custom: false, source: 'calculated' },
  food_entries: [
    {
      id: '22222222-2222-2222-2222-222222222222',
      meal: 'lunch',
      eaten_at: '2026-03-10T11:00:00.000Z',
      local_date: '2026-03-10',
      description: 'Chicken and rice',
      note: null,
      confidence: 'medium',
      source: 'text',
      photo_id: null,
      items: [],
      kcal: 620,
      protein_g: 42,
      carbs_g: 60,
      fat_g: 20,
      fiber_g: 6,
      sodium_mg: 480,
      sat_fat_g: 5,
      sugar_g: 3,
    },
  ],
  exercise_entries: [
    {
      id: '33333333-3333-3333-3333-333333333333',
      description: '5km run',
      performed_at: '2026-03-10T16:00:00.000Z',
      local_date: '2026-03-10',
      duration_min: 28,
      distance_km: 5,
      category: 'cardio',
      detail: 'estimated',
      sets: [],
      kcal_burned: 300,
      confidence: 'low',
      source: 'text',
    },
  ],
  weight: null,
};

const weight: WeightEntry = {
  id: '44444444-4444-4444-4444-444444444444',
  measured_at: '2026-03-08T06:00:00.000Z',
  local_date: '2026-03-08',
  weight_kg: 84.2,
};

describe('STABLE_SYSTEM_PROMPT', () => {
  it('makes logging for a past day routine rather than exceptional', () => {
    // Every other line about other days is a caution. Without this the model
    // can read the section as "avoid", and start asking which day was meant
    // instead of just backdating it.
    expect(STABLE_SYSTEM_PROMPT).toContain('Days other than today');
    expect(STABLE_SYSTEM_PROMPT).toMatch(/ordinary, not an exception/);
    expect(STABLE_SYSTEM_PROMPT).toContain('days_ago');
  });

  it('says null and zero are different answers for the quality panel', () => {
    // The one instruction the whole feature rests on. Without it the model
    // fills the fields in to be helpful and every day total becomes a fiction
    // that looks exactly like a fact.
    expect(STABLE_SYSTEM_PROMPT).toContain('Diet quality');
    expect(STABLE_SYSTEM_PROMPT).toMatch(/null means "not estimated"/i);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/fiber is a floor/i);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/ceilings/i);
    // And restated here specifically, because a salty dinner is where a
    // no-judgement rule stated once, far above, quietly stops applying.
    expect(STABLE_SYSTEM_PROMPT).toMatch(/no-judgement rule applies here/i);
  });

  /**
   * The gap that shipped to production.
   *
   * 917 lines of prompt, and the only instruction anywhere about describing
   * itself was the setup-mode line telling it to introduce what it does in a
   * sentence. The only material for that sentence was the opening "personal
   * nutrition assistant", so the kitchen — half the product — was invisible to
   * anyone who asked what the app was for. Sonnet inferred its way past it from
   * the tool list. The cheaper model the text path moved to did not, and told a
   * real user it could only give nutrition information.
   */
  it('knows it is more than a calorie logger', () => {
    expect(STABLE_SYSTEM_PROMPT).toMatch(/# When they ask what you can do/);
    // Answered from the tools rather than from the first line of the prompt.
    expect(STABLE_SYSTEM_PROMPT).toMatch(/not the edge of what you are/i);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/if a tool does something, you do it/i);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/Never answer that you only do nutrition/);
    // With a shape, or the fix trades one bad answer for a brochure.
    expect(STABLE_SYSTEM_PROMPT).toMatch(/three or four real things/i);
  });

  it('says where it stops, and does not stop working', () => {
    expect(STABLE_SYSTEM_PROMPT).toContain('Where you stop');
    expect(STABLE_SYSTEM_PROMPT).toMatch(/not a clinician/i);
    // The conditions where population arithmetic is the wrong tool.
    expect(STABLE_SYSTEM_PROMPT).toMatch(/pregnan/i);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/diabetes/i);
    // The three refusals, which are refusals of a request rather than of work.
    expect(STABLE_SYSTEM_PROMPT).toMatch(/Never encourage a larger deficit/);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/Never validate a very low intake as discipline/);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/Never suggest skipping a meal/);
    // Distress drops the numbers entirely rather than adding a caveat to them.
    expect(STABLE_SYSTEM_PROMPT).toMatch(/purging/i);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/drop the numbers entirely/i);
    // And the whole section must not turn into a disclaimer on every reply.
    expect(STABLE_SYSTEM_PROMPT).toMatch(/never as a disclaimer stapled/i);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/do not refuse to work/i);
  });

  it('is warm about the person and silent about the food', () => {
    // The one line that must survive any future edit to the voice: warmth is
    // aimed at the user, never at what they ate. A judged user starts editing
    // what they report, and the log stops being worth keeping.
    expect(STABLE_SYSTEM_PROMPT).toMatch(/Encourage the person; never judge the food/);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/beer or a dessert/);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/Anxiety is not a motivator/);
  });

  it('keeps warmth from turning into length', () => {
    expect(STABLE_SYSTEM_PROMPT).toMatch(/Warmth lives in the wording, not in extra length/);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/not a licence to pad/);
  });

  it('states the rules the product depends on', () => {
    expect(STABLE_SYSTEM_PROMPT).toContain('assume, don’t interrogate'.replace('’', "'"));
    expect(STABLE_SYSTEM_PROMPT).toMatch(/update_food_entry/);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/Never invent a number/);
  });

  it('tells the agent how to handle an activity it has to estimate', () => {
    expect(STABLE_SYSTEM_PROMPT).toMatch(/# Exercise/);
    // Burn scales with bodyweight and distance; both must be named, or the
    // model falls back to a generic body and a route it never states.
    expect(STABLE_SYSTEM_PROMPT).toMatch(/bodyweight/);
    expect(STABLE_SYSTEM_PROMPT).toMatch(/distance_km/);
    // It has no map — `tools: []` strips every built-in, web search included.
    expect(STABLE_SYSTEM_PROMPT).toMatch(/no map and cannot look it up/);
  });

  it('is a constant, so it stays in the prompt cache', () => {
    expect(STABLE_SYSTEM_PROMPT).toBe(STABLE_SYSTEM_PROMPT);
    expect(STABLE_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

/**
 * The same prompt for an account whose plan holds no kitchen.
 *
 * It exists because prompt about a tool that is not in the request is not
 * neutral — it is an instruction to call something that is not there. So the
 * cooking sections travel with the cooking tools, and what replaces them has
 * to carry the two things that do *not* travel with them: the pantry and the
 * shopping list, which every tier is granted.
 */
describe('STABLE_SYSTEM_PROMPT_NO_KITCHEN', () => {
  const KITCHEN_TOOLS = [
    'suggest_recipes',
    'find_recipes',
    'adapt_recipe',
    'cook_recipe',
    'save_recipe',
    'import_recipe',
    'plan_week',
    'update_plan_night',
    'cook_planned_night',
    'get_meal_plan',
  ];

  it('names no tool the request will not carry', () => {
    for (const tool of KITCHEN_TOOLS) {
      expect(STABLE_SYSTEM_PROMPT_NO_KITCHEN).not.toContain(tool);
    }
  });

  it('keeps the rules for the two tools that stay', () => {
    // Withholding the guidance while keeping the tool is the one way this
    // change could quietly make the product worse.
    expect(STABLE_SYSTEM_PROMPT_NO_KITCHEN).toContain('update_pantry');
    expect(STABLE_SYSTEM_PROMPT_NO_KITCHEN).toContain('get_pantry');
    expect(STABLE_SYSTEM_PROMPT_NO_KITCHEN).toContain('update_shopping_list');
    expect(STABLE_SYSTEM_PROMPT_NO_KITCHEN).toMatch(/memory, not a stocktake/);
    expect(STABLE_SYSTEM_PROMPT_NO_KITCHEN).toMatch(/add batteries to the shopping list/i);
  });

  it('answers the cooking question the way the paywall does', () => {
    expect(STABLE_SYSTEM_PROMPT_NO_KITCHEN).toMatch(/part of Coach/);
    // The failure this paragraph exists to prevent: improvising in prose the
    // thing they would be paying for.
    expect(STABLE_SYSTEM_PROMPT_NO_KITCHEN).toMatch(/Do not write the recipe out yourself/);
  });

  it('is the same prompt either side of the split', () => {
    // Everything that is not about cooking is byte-identical, so the two
    // variants cannot drift into two different products.
    const cut = (p: string) => p.slice(0, p.indexOf('# Cooking'));
    expect(cut(STABLE_SYSTEM_PROMPT_NO_KITCHEN)).toBe(cut(STABLE_SYSTEM_PROMPT));
    const tail = (p: string) => p.slice(p.indexOf('# Showing rather than telling'));
    expect(tail(STABLE_SYSTEM_PROMPT_NO_KITCHEN)).toBe(tail(STABLE_SYSTEM_PROMPT));
  });

  it('is shorter, which is the whole point', () => {
    expect(STABLE_SYSTEM_PROMPT_NO_KITCHEN.length).toBeLessThan(STABLE_SYSTEM_PROMPT.length);
  });
});

describe('dayContextPrompt', () => {
  it('gives the numbers and the remaining budget', () => {
    const prompt = dayContextPrompt(profile, day, weight);
    expect(prompt).toContain('1840 / 2200 kcal (360 left)');
    expect(prompt).toContain('120 / 160 g (40 short)');
    expect(prompt).toContain('Europe/Sofia');
    expect(prompt).toContain('04:00');
  });

  it('says "over" once the target is passed', () => {
    const over = dayContextPrompt(profile, { ...day, consumed: { ...day.consumed, kcal: 2500 } }, weight);
    expect(over).toContain('(300 over)');
  });

  it('drops the protein hint once the target is met', () => {
    const met = dayContextPrompt(profile, { ...day, consumed: { ...day.consumed, protein_g: 170 } }, weight);
    expect(met).not.toContain('short');
  });

  it('lists the entry ids the agent needs to correct anything', () => {
    const prompt = dayContextPrompt(profile, day, weight);
    expect(prompt).toContain('[22222222-2222-2222-2222-222222222222] lunch: Chicken and rice');
    expect(prompt).toContain('[33333333-3333-3333-3333-333333333333] exercise: 5km run');
  });

  it('gives the body stats that exercise burn is estimated from', () => {
    const prompt = dayContextPrompt(profile, day, weight);
    expect(prompt).toContain('84.2 kg (weighed 2026-03-08)');
    expect(prompt).toContain('180 cm');
  });

  it('omits the body line while the stats are still unknown', () => {
    const bare = dayContextPrompt({ ...profile, height_cm: null }, day, null);
    expect(bare).not.toContain('Their body');
  });

  it('shows the distance and duration behind a burn, so both can be corrected', () => {
    const prompt = dayContextPrompt(profile, day, weight);
    expect(prompt).toContain('exercise: 5km run (5 km, 28 min) — 300 kcal');
  });

  it('gives the quality panel with its direction and its coverage', () => {
    const prompt = dayContextPrompt(profile, day, weight);
    expect(prompt).toContain('fiber 19 / 31 g (floor)');
    expect(prompt).toContain('sodium 1400 / 2300 mg (ceiling)');
  });

  it('warns when the panel only speaks for part of the day', () => {
    const partial = dayContextPrompt(
      profile,
      { ...day, quality: { ...day.quality, coverage: 0.4 } },
      weight,
    );
    expect(partial).toContain("40% of today's calories");
    expect(partial).toContain('partial');
  });

  it('says nothing at all about quality when nothing was estimated', () => {
    // Not a zeroed line: "fiber 0g" is a false premise the model would then
    // comment on, and the comment would be about missing data.
    const none = dayContextPrompt(
      profile,
      { ...day, quality: { ...day.quality, fiber_g: null } },
      weight,
    );
    expect(none).not.toContain('Diet quality');
  });

  it('says nothing about wellbeing when there is nothing to say', () => {
    const prompt = dayContextPrompt(profile, day, weight, [], {
      intake_below_floor: false,
      losing_too_fast: false,
      mean_intake_kcal: 2100,
      days_logged: 7,
      loss_pct_per_week: -0.5,
    });
    expect(prompt).not.toMatch(/do not encourage/i);
    expect(prompt).not.toMatch(/bodyweight a week/i);
  });

  it('tells the model outright when the week has been under the floor', () => {
    // As an instruction rather than a statistic: a mean intake figure is
    // something a model folds into an optimisation, and "do not encourage them
    // to eat less" is not.
    const prompt = dayContextPrompt(profile, day, weight, [], {
      intake_below_floor: true,
      losing_too_fast: false,
      mean_intake_kcal: 950,
      days_logged: 6,
      loss_pct_per_week: null,
    });
    expect(prompt).toContain('950 kcal a day');
    expect(prompt).toMatch(/do not encourage them to eat less/i);
    expect(prompt).toMatch(/not logging everything/i);
    // Never an instruction to stop logging — the journal keeps working.
    expect(prompt).not.toMatch(/refuse to log/i);
  });

  it('names a loss that is running too fast, without calling it good news', () => {
    const prompt = dayContextPrompt(profile, day, weight, [], {
      intake_below_floor: false,
      losing_too_fast: true,
      mean_intake_kcal: 1900,
      days_logged: 7,
      loss_pct_per_week: -1.8,
    });
    expect(prompt).toContain('1.8%');
    expect(prompt).toMatch(/do not treat this as good news/i);
  });

  it('lists exercise ids even on a day with no food logged', () => {
    const prompt = dayContextPrompt(profile, { ...day, food_entries: [] }, weight);
    expect(prompt).toContain('use these ids');
    expect(prompt).toContain('[33333333-3333-3333-3333-333333333333]');
  });

  it('says so plainly when nothing has been logged', () => {
    const empty = dayContextPrompt(profile, {
      ...day,
      consumed: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      quality: {
        ...day.quality,
        fiber_g: null,
        sodium_mg: null,
        sat_fat_g: null,
        sugar_g: null,
      },
      burned_kcal: 0,
      food_entries: [],
      exercise_entries: [],
    }, weight);
    expect(empty).toContain('none logged');
    expect(empty).not.toContain('use these ids');
    // An empty day has to say it is empty. Left silent, the model fills the gap
    // from the conversation, and the conversation is full of yesterday.
    expect(empty).toContain('Nothing is logged for 2026-03-10 yet');
    expect(empty).toContain('belongs to an earlier day');
  });
});

describe('standing notes in the day context', () => {
  const notes = [
    { id: 'aaaaaaaa-0000-0000-0000-000000000001', note: 'Do not log my commute walk', created_at: '2026-03-01T00:00:00Z' },
  ];

  it('carries them into every turn, with the id needed to drop one', () => {
    const prompt = dayContextPrompt(profile, day, weight, notes);
    expect(prompt).toContain('Do not log my commute walk');
    expect(prompt).toContain('aaaaaaaa-0000-0000-0000-000000000001');
  });

  it('says nothing at all when there are none', () => {
    expect(dayContextPrompt(profile, day, weight, [])).not.toContain('Standing instructions');
  });
});

describe('dayRolloverNotice', () => {
  const now = new Date('2026-03-10T14:00:00Z'); // 16:00 Sofia

  it('names both the day that ended and the day that started', () => {
    const notice = dayRolloverNotice('2026-03-09', '2026-03-10', profile, now);
    expect(notice).toContain('2026-03-09');
    expect(notice).toContain('2026-03-10');
    expect(notice).toContain('Europe/Sofia');
  });

  it('points at the tool rather than at memory for the closed day', () => {
    const notice = dayRolloverNotice('2026-03-09', '2026-03-10', profile, now);
    expect(notice).toContain('get_day');
    // It must not claim a conversation the model can no longer see: after the
    // rollover the session is dropped, so there is no previous message to cite.
    expect(notice).not.toContain('previous message');
  });

  it('leaves the door open to a day the user names', () => {
    const notice = dayRolloverNotice('2026-03-09', '2026-03-10', profile, now);
    expect(notice).toContain('unless they name another day');
  });

  it('reports the wall clock separately from the logging day', () => {
    // 01:00 Sofia on the 11th still counts toward the 10th under a 04:00 start,
    // and the notice must not collapse the two into one date.
    const notice = dayRolloverNotice('2026-03-09', '2026-03-10', profile, new Date('2026-03-10T23:00:00Z'));
    expect(notice).toContain('01:00 on 2026-03-11');
    expect(notice).toContain('counts toward 2026-03-10');
  });
});
