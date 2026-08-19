import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { ReviewStats, WeeklyReview } from '@ct/shared';
import { query } from '../db.ts';
import { env } from '../env.ts';
import { insertMessage } from '../services/chat.ts';
import { applyAdaptiveTargets } from '../services/adaptive.ts';
import { buildReviewStats, reviewWeekFor, saveReview } from '../services/reviews.ts';
import { getUser, getUserContext } from '../services/user.ts';
import { localDateFor } from '../time.ts';
import { executeAgent } from './agent.ts';
import { AUTH_HELP, EFFORT, hasSubscriptionAuth, MAX_TURNS, MODEL } from './client.ts';
import { REVIEW_SYSTEM_PROMPT, reviewTaskPrompt } from './prompt.ts';
import { buildNutritionServer, SERVER_NAME } from './tools.ts';

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
  if (!hasSubscriptionAuth() && !process.env.ANTHROPIC_API_KEY) throw new Error(AUTH_HELP);

  const { userId: id, ...ctx } = await getUserContext(userId);
  const today = options.today ?? localDateFor(new Date(), ctx);
  const week = reviewWeekFor(today);

  const { proposal } = await applyAdaptiveTargets(id, ctx, today);
  const stats = await buildReviewStats(id, week, proposal);
  const profile = await getUser(id);

  // Read tools only. A review that could log food would eventually log food.
  const { server, toolNames } = buildNutritionServer(
    { userId: id, ctx, now: new Date(), photoId: null, actions: [] },
    { readOnly: true },
  );

  const agentOptions: Options = {
    systemPrompt: REVIEW_SYSTEM_PROMPT,
    mcpServers: { [SERVER_NAME]: server },
    allowedTools: toolNames,
    tools: [],
    settingSources: [],
    permissionMode: 'bypassPermissions',
    model: MODEL,
    effort: EFFORT,
    maxTurns: MAX_TURNS,
    cwd: env.agentCwd,
  };

  // Deliberately no `resume`: a review must not inherit — or pollute — the
  // journal's conversation. `recentReviewPrompt` carries it back the other way.
  const outcome = await executeAgent(reviewTaskPrompt(stats, profile), agentOptions, null);
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
