import { beforeEach, describe, expect, it } from 'vitest';
import type { ReviewStats } from '@ct/shared';
import { queryOne } from '../src/db.ts';
import { fallbackReview, generateWeeklyReview } from '../src/ai/review.ts';
import { listMessages } from '../src/services/chat.ts';
import { latestReview } from '../src/services/reviews.ts';
import { targetsForDate } from '../src/services/targets.ts';
import { agentCalls, scriptAgent, systemPromptOf } from './helpers/agent-mock.ts';
import {
  addMeal,
  createUser,
  seedAdaptiveWindow,
  setUserTargets,
  type TestUser,
} from './helpers/factories.ts';

/**
 * Publishing a weekly review. The order matters: the target moves first, so the
 * review explains a change that has already happened rather than proposing one.
 */

const MONDAY = '2026-03-16';
const WEEK = { start: '2026-03-09', end: '2026-03-15' };

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
});

describe('generateWeeklyReview', () => {
  it('publishes the review into the journal and stores it', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 2100 });
    scriptAgent({ text: 'You averaged 2,100 against a 2,200 target.', costUsd: 0.09 });

    const review = await generateWeeklyReview(user.id, { today: MONDAY });

    expect(review).toMatchObject({
      week_start: WEEK.start,
      week_end: WEEK.end,
      content: 'You averaged 2,100 against a 2,200 target.',
    });
    expect(review.stats.days_logged).toBe(1);

    const messages = await listMessages(user.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      content: 'You averaged 2,100 against a 2,200 target.',
    });
    expect(review.message_id).toBe(messages[0]!.id);
  });

  it('tags the message as a review in the tool trace', async () => {
    scriptAgent({ text: 'A quiet week.' });
    const review = await generateWeeklyReview(user.id, { today: MONDAY });

    const row = await queryOne<{ tool_trace: any }>(
      'SELECT tool_trace FROM chat_messages WHERE id = $1',
      [review.message_id],
    );
    expect(row!.tool_trace).toMatchObject({ kind: 'weekly_review', week_start: WEEK.start });
  });

  it('hands the model the computed numbers rather than asking it to recall them', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 2100, protein_g: 155 });
    scriptAgent({ text: 'Fine.' });
    await generateWeeklyReview(user.id, { today: MONDAY });

    const prompt = agentCalls[0]!.prompt as string;
    expect(prompt).toContain('"days_logged": 1');
    expect(prompt).toContain('"target_kcal": 2200');
    expect(systemPromptOf(agentCalls[0]!)).toContain('weekly review');
  });

  it('gives the review agent read tools only', async () => {
    scriptAgent({ text: 'Fine.' });
    await generateWeeklyReview(user.id, { today: MONDAY });

    const allowed: string[] = agentCalls[0]!.options.allowedTools;
    expect(allowed.map((n) => n.replace('mcp__nutrition__', '')).sort()).toEqual([
      'get_day',
      'get_progress',
      'search_food_history',
    ]);
  });

  it('runs in its own session, never resuming the journal’s', async () => {
    scriptAgent({ text: 'Fine.' });
    await generateWeeklyReview(user.id, { today: MONDAY });
    expect(agentCalls[0]!.resume).toBeUndefined();
  });

  it('moves the target before writing, and says so', async () => {
    await seedAdaptiveWindow(user, {
      endDate: '2026-03-15',
      kcalPerDay: 2200,
      startWeightKg: 85,
      kgPerWeek: -0.5,
    });
    scriptAgent({ text: 'Your target moved up to 2,250.' });

    const review = await generateWeeklyReview(user.id, { today: MONDAY });

    expect(review.stats.adaptive!.eligible).toBe(true);
    expect((await targetsForDate(user.id, MONDAY)).kcal).toBe(review.stats.adaptive!.proposed.kcal);
    // The model was told the change had already been made.
    expect(agentCalls[0]!.prompt).toContain('"eligible": true');
  });

  it('regenerating a week replaces it rather than adding a second', async () => {
    scriptAgent({ text: 'First.' });
    await generateWeeklyReview(user.id, { today: MONDAY });
    scriptAgent({ text: 'Second.' });
    await generateWeeklyReview(user.id, { today: MONDAY });

    expect((await latestReview(user.id))!.content).toBe('Second.');
  });

  it('stamps when the account was last reviewed', async () => {
    scriptAgent({ text: 'Fine.' });
    await generateWeeklyReview(user.id, { today: MONDAY });
    const row = await queryOne<{ last_review_at: Date }>(
      'SELECT last_review_at FROM users WHERE id = $1',
      [user.id],
    );
    expect(row!.last_review_at).not.toBeNull();
  });

  it('falls back to the computed numbers when the model returns nothing', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 2100, protein_g: 150 });
    scriptAgent({ chunksOnly: [] });

    const review = await generateWeeklyReview(user.id, { today: MONDAY });
    expect(review.content).toContain('1 of 7 days logged');
    expect(review.content).toContain('2200 target');
  });

  it('propagates a failed run rather than publishing a broken review', async () => {
    scriptAgent({ throws: 'the model exploded' });
    await expect(generateWeeklyReview(user.id, { today: MONDAY })).rejects.toThrow('the model exploded');
    expect(await latestReview(user.id)).toBeNull();
    expect(await listMessages(user.id)).toEqual([]);
  });
});

describe('fallbackReview', () => {
  const base: ReviewStats = {
    week_start: '2026-03-09',
    week_end: '2026-03-15',
    days_logged: 0,
    mean_kcal: null,
    mean_protein_g: null,
    target_kcal: 2200,
    target_protein_g: 160,
    days_on_target: 0,
    days_protein_hit: 0,
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
  };

  it('says plainly when nothing was logged', () => {
    expect(fallbackReview(base)).toBe('Nothing logged between 2026-03-09 and 2026-03-15.');
  });

  it('reports the averages when there is data', () => {
    expect(fallbackReview({ ...base, days_logged: 5, mean_kcal: 2100, mean_protein_g: 150 })).toContain(
      '5 of 7 days logged, averaging 2100 kcal',
    );
  });

  it.each([
    [-0.6, 'down 0.6 kg'],
    [0.4, 'up 0.4 kg'],
    [0, 'flat'],
  ])('describes a weight change of %s as "%s"', (change, expected) => {
    expect(fallbackReview({ ...base, weight_change_kg: change })).toContain(expected);
  });

  it('appends the target change when one was made', () => {
    const explanation = 'the target moves up 50 to 2250.';
    expect(
      fallbackReview({
        ...base,
        adaptive: {
          eligible: true,
          blocked_by: null,
          estimate: null,
          current: base.adaptive as never,
          proposed: base.adaptive as never,
          delta_kcal: 50,
          explanation,
        },
      }),
    ).toContain(explanation);
  });
});
