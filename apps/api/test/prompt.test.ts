import { describe, expect, it } from 'vitest';
import type { DaySummary, Profile, ReviewStats, WeeklyReview, WeightEntry } from '@ct/shared';
import {
  dayContextPrompt,
  onboardingPrompt,
  recentReviewPrompt,
  REVIEW_SYSTEM_PROMPT,
  reviewTaskPrompt,
  STABLE_SYSTEM_PROMPT,
} from '../src/ai/prompt.ts';

/**
 * The prompt is the product. These assert the facts the model must be given —
 * not the wording, which is free to change.
 */

const profile: Profile = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'nik@example.com',
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
};

const day: DaySummary = {
  local_date: '2026-03-10',
  consumed: { kcal: 1840, protein_g: 120, carbs_g: 180, fat_g: 60 },
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

  it('lists exercise ids even on a day with no food logged', () => {
    const prompt = dayContextPrompt(profile, { ...day, food_entries: [] }, weight);
    expect(prompt).toContain('use these ids');
    expect(prompt).toContain('[33333333-3333-3333-3333-333333333333]');
  });

  it('says so plainly when nothing has been logged', () => {
    const empty = dayContextPrompt(profile, {
      ...day,
      consumed: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      burned_kcal: 0,
      food_entries: [],
      exercise_entries: [],
    }, weight);
    expect(empty).toContain('none logged');
    expect(empty).not.toContain('use these ids');
  });
});

describe('onboardingPrompt', () => {
  it('lists what is still needed, weight included', () => {
    const prompt = onboardingPrompt(profile, ['sex', 'height'], null);
    expect(prompt).toContain('Still needed: sex, height, current weight.');
  });

  it('omits weight once it is known', () => {
    const prompt = onboardingPrompt(profile, ['sex'], {
      id: '4',
      measured_at: '2026-03-10T07:00:00.000Z',
      local_date: '2026-03-10',
      weight_kg: 85,
    });
    expect(prompt).toContain('Still needed: sex.');
  });

  it('mentions the name only when there is one', () => {
    expect(onboardingPrompt(profile, ['sex'], null)).toContain('Their name is Nik');
    expect(onboardingPrompt({ ...profile, display_name: null }, ['sex'], null)).not.toContain('Their name is');
  });
});

describe('recentReviewPrompt', () => {
  const stats = { adaptive: null } as unknown as ReviewStats;
  const review: WeeklyReview = {
    id: '55555555-5555-5555-5555-555555555555',
    week_start: '2026-03-02',
    week_end: '2026-03-08',
    content: 'You averaged 2,100 against a 2,200 target.',
    stats,
    message_id: null,
    created_at: '2026-03-09T06:00:00.000Z',
  };

  it('carries the review text into the journal’s context', () => {
    const prompt = recentReviewPrompt(review, '2026-03-10')!;
    expect(prompt).toContain('You averaged 2,100 against a 2,200 target.');
    expect(prompt).toContain('2026-03-02 to 2026-03-08');
  });

  it('explains a target change so "why did it go up?" has an answer', () => {
    const prompt = recentReviewPrompt(
      {
        ...review,
        stats: {
          ...stats,
          adaptive: {
            eligible: true,
            blocked_by: null,
            estimate: null,
            current: { kcal: 2200, protein_g: 160, carbs_g: 220, fat_g: 70, is_custom: false, source: 'calculated' },
            proposed: { kcal: 2250, protein_g: 165, carbs_g: 225, fat_g: 70, is_custom: false, source: 'adaptive' },
            delta_kcal: 50,
            explanation: 'the target moves up 50 to 2250.',
          },
        },
      },
      '2026-03-10',
    )!;
    expect(prompt).toContain('from 2200 to 2250');
    expect(prompt).toContain('the target moves up 50 to 2250.');
  });

  it('goes quiet once the review is stale', () => {
    expect(recentReviewPrompt(review, '2026-03-25')).toBeNull();
  });
});

describe('the review agent’s prompts', () => {
  it('forbids inventing numbers and caps the length', () => {
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/Never estimate/);
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/150 words/);
  });

  it('hands over the computed stats verbatim', () => {
    const stats = {
      week_start: '2026-03-09',
      week_end: '2026-03-15',
      days_logged: 6,
      mean_kcal: 2100,
      adaptive: null,
    } as unknown as ReviewStats;

    const prompt = reviewTaskPrompt(stats, profile);
    expect(prompt).toContain('2026-03-09 to 2026-03-15');
    expect(prompt).toContain('"mean_kcal": 2100');
    expect(prompt).toContain('Their name is Nik');
  });

  it('omits the name when there is none', () => {
    const stats = { week_start: 'a', week_end: 'b' } as unknown as ReviewStats;
    expect(reviewTaskPrompt(stats, { ...profile, display_name: null })).not.toContain('Their name is');
  });
});
