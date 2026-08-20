import type { ReviewStats, WeeklyReview } from '@ct/shared';
import { query } from '../db.ts';
import { insertMessage } from '../services/chat.ts';
import { applyAdaptiveTargets } from '../services/adaptive.ts';
import { buildReviewStats, reviewWeekFor, saveReview } from '../services/reviews.ts';
import { getUser, getUserContext } from '../services/user.ts';
import { recordUsage } from '../services/usage.ts';
import { localDateFor } from '../time.ts';
import { MAX_TURNS } from './client.ts';
import { createProvider, type AgentRequest } from './providers/index.ts';
import { REVIEW_SYSTEM_PROMPT, reviewTaskPrompt } from './prompt.ts';
import { buildNutritionServer } from './tools.ts';

/**
 * Generates one weekly review and publishes it into the journal.
 *
 * Order matters: the adaptive pass runs *before* the model is asked to write,
 * so the review explains a target that has already changed rather than
 * proposing one that might not stick.
 */

export interface GenerateOptions {
  /** Overrides "now" for the day calculation. Tests and backfills use it. */
  today?: string;
}

export async function generateWeeklyReview(
  userId: string,
  options: GenerateOptions = {},
): Promise<WeeklyReview> {
  const { userId: id, ...ctx } = await getUserContext(userId);
  const today = options.today ?? localDateFor(new Date(), ctx);
  const week = reviewWeekFor(today);

  const { proposal } = await applyAdaptiveTargets(id, ctx, today);
  const stats = await buildReviewStats(id, week, proposal);
  const profile = await getUser(id);

  // Read tools only. A review that could log food would eventually log food.
  const toolContext = { userId: id, ctx, now: new Date(), photoId: null, actions: [] };
  const { tools, toolNames } = buildNutritionServer(toolContext, { readOnly: true });

  const provider = createProvider(toolContext);
  const authError = provider.checkAuth();
  if (authError) throw new Error(authError);

  const request: AgentRequest = {
    kind: 'review',
    // The review's whole prompt is stable; the week's numbers ride in the user
    // turn, so there is nothing volatile to keep out of the cache.
    staticSystemPrompt: REVIEW_SYSTEM_PROMPT,
    dynamicSystemPrompt: '',
    text: reviewTaskPrompt(stats, profile),
    photo: null,
    tools,
    toolNames,
    // A review is a single self-contained question; there is no thread to replay.
    history: [],
    readOnly: true,
    toolset: 'journal',
    maxTurns: MAX_TURNS,
  };

  // Deliberately no `resume`: a review must not inherit — or pollute — the
  // journal's conversation. `recentReviewPrompt` carries it back the other way.
  const outcome = await provider.run(request, null);
  await recordUsage({ userId: id, kind: 'review', outcome });
  if (outcome.error) throw new Error(outcome.error);

  const content = outcome.text || fallbackReview(stats);
  const message = await insertMessage(id, 'assistant', content, null, {
    kind: 'weekly_review',
    week_start: week.start,
    cost_usd: outcome.costUsd,
  });

  await markReviewed(id);
  return saveReview(id, stats, content, message.id);
}

/**
 * If the model fails us the review still has to say something true, because the
 * target may already have moved and an unexplained target is worse than a plain
 * one. The numbers were computed here anyway.
 */
export function fallbackReview(stats: ReviewStats): string {
  const parts: string[] = [];
  parts.push(
    stats.days_logged === 0
      ? `Nothing logged between ${stats.week_start} and ${stats.week_end}.`
      : `${stats.days_logged} of 7 days logged, averaging ${stats.mean_kcal} kcal against a ${stats.target_kcal} target and ${stats.mean_protein_g}g protein.`,
  );
  if (stats.weight_change_kg !== null) {
    const direction = stats.weight_change_kg === 0 ? 'flat' : stats.weight_change_kg > 0 ? 'up' : 'down';
    parts.push(`Weight ${direction}${stats.weight_change_kg === 0 ? '' : ` ${Math.abs(stats.weight_change_kg)} kg`} across the week.`);
  }
  if (stats.adaptive?.eligible) parts.push(stats.adaptive.explanation);
  return parts.join(' ');
}

async function markReviewed(userId: string): Promise<void> {
  await query('UPDATE users SET last_review_at = now() WHERE id = $1', [userId]);
}
