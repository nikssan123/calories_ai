import { describe, expect, it } from 'vitest';
import type { DaySummary, Profile, ReviewStats, WeeklyReview, WeightEntry } from '@ct/shared';
import {
  dayContextPrompt,
  dayRolloverNotice,
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

// The whole row, not the interesting half. This used to be a discipline nothing
// enforced — `tsconfig` covered `src` only, so a fixture silently missing a new
// column read to `dayContextPrompt` as a user who has none. `test` is in the
// project now, so the compiler keeps this honest instead of the comment.
const profile: Profile = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'nik@example.com',
  email_verified: true,
  units: 'metric',
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
};

const day: DaySummary = {
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

  /**
   * The first sentence a new account ever reads. It was the one place in the
   * product that described what the app is, and it described a food log.
   */
  it('opens with more than logging', () => {
    const prompt = onboardingPrompt(profile, ['sex'], null);
    expect(prompt).toMatch(/reach past logging/i);
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
  it('is warm without opening on a cheer, and still refuses to moralise', () => {
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/"Great week!" on its own is not/);
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/Do not moralise about food choices/);
  });

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
