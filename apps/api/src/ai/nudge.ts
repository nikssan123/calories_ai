import type { Nudge, NudgeStats } from '@ct/shared';
import { localeOf } from '@ct/shared';
import { insertMessage, recentUserTexts } from '../services/chat.ts';
import { dueNudge, saveNudge, type NudgeTrigger } from '../services/nudges.ts';
import { getUser, getUserContext } from '../services/user.ts';
import { recordUsage } from '../services/usage.ts';
import { localDateFor } from '../time.ts';
import { MAX_TURNS } from './client.ts';
import { LANGUAGE_LOOKBACK, replyLanguage } from './language.ts';
import { createProvider, laneFor, type AgentRequest } from './providers/index.ts';
import { NUDGE_SYSTEM_PROMPT, nudgeTaskPrompt } from './prompt.ts';
import { buildNutritionServer } from './tools.ts';

/**
 * Writes one nudge and publishes it into the journal.
 *
 * The same shape as `generateWeeklyReview` and deliberately so: an assistant
 * message written by a read-only agent run, recorded against a row that makes
 * a second attempt a no-op. What differs is the size of it, and that the
 * trigger was decided in SQL before the model was ever called.
 */

export interface NudgeOptions {
  today?: string;
  /** A trigger already computed by the caller — the scheduler has one in hand. */
  trigger?: NudgeTrigger;
}

export async function generateNudge(
  userId: string,
  options: NudgeOptions = {},
): Promise<Nudge | null> {
  const { userId: id, units, ...ctx } = await getUserContext(userId);
  const today = options.today ?? localDateFor(new Date(), ctx);

  const trigger = options.trigger ?? (await dueNudge(id, ctx, today));
  if (!trigger) return null;

  const profile = await getUser(id);

  // Read tools only, like the review. A nudge that could log food would
  // eventually log food, on a schedule, without anybody asking it to.
  const toolContext = { userId: id, ctx, now: new Date(), photoId: null, actions: [], units };
  const { tools, toolNames } = buildNutritionServer(toolContext, { readOnly: true });

  const provider = createProvider(toolContext, laneFor(profile.email));
  const authError = provider.checkAuth();
  if (authError) throw new Error(authError);

  // Same as the review: nothing in this request is prose, so the language comes
  // off the journal, and the stored locale answers only for the account that
  // has not written anything yet.
  const language = replyLanguage(
    await recentUserTexts(id, LANGUAGE_LOOKBACK),
    localeOf(profile),
  ).name;

  const request: AgentRequest = {
    kind: 'nudge',
    // Whole prompt stable; the numbers ride in the user turn, so there is
    // nothing volatile to keep out of the cache.
    staticSystemPrompt: NUDGE_SYSTEM_PROMPT,
    dynamicSystemPrompt: '',
    text: nudgeTaskPrompt(trigger.stats, profile, language),
    photo: null,
    tools,
    toolNames,
    history: [],
    readOnly: true,
    toolset: 'journal',
    maxTurns: MAX_TURNS,
  };

  // No `resume`, for the same reason a review does not: this must not inherit
  // the journal's conversation, and it must not pollute it either.
  const outcome = await provider.run(request, null);
  await recordUsage({ userId: id, kind: 'nudge', outcome, provider: provider.id });
  if (outcome.error) throw new Error(outcome.error);

  const content = outcome.text?.trim() || fallbackNudge(trigger.stats);

  /*
   * The row first, the message second — the opposite order from the review, and
   * for a reason. The unique index on (user, kind, date) is what stops a second
   * tick sending this twice, so claiming it before anything is visible means a
   * crash in between leaves a recorded nudge with no message rather than a
   * message that will be written again an hour later.
   */
  const nudge = await saveNudge(id, trigger.kind, today, content, null);
  if (!nudge) return null;

  const message = await insertMessage(id, 'assistant', content, null, {
    kind: 'nudge',
    nudge_kind: trigger.kind,
    cost_usd: outcome.costUsd,
  });
  return attachMessage(nudge, message.id);
}

/**
 * If the model fails us the nudge still has to say something true and kind.
 *
 * Shorter and blander than the written version, which is the correct trade: an
 * unprompted message that reads like a template is forgettable, and one that
 * reads like a system error is worse than silence.
 */
export function fallbackNudge(stats: NudgeStats): string {
  switch (stats.kind) {
    case 'dormant':
      return 'Your log has been quiet for a few days. Whenever you fancy picking it back up, one meal is plenty — there is nothing to catch up on.';
    case 'stalled':
      return 'The scale has been flat for a couple of weeks. That is ordinary and usually just means maintenance has shifted — ask me about it and I will look at the numbers with you.';
    case 'protein_short':
      return `Protein has been running under target this week — around ${stats.mean_protein_g}g a day against ${stats.target_protein_g}g. Adding one protein-heavy thing you already like would close most of it.`;
    case 'quality_short':
      return `Fiber has been sitting around ${stats.mean_fiber_g}g a day, under the ${stats.target_fiber_g}g mark. A tin of beans or some fruit in the day is usually the easiest fix.`;
  }
}

async function attachMessage(nudge: Nudge, messageId: string): Promise<Nudge> {
  const { query } = await import('../db.ts');
  await query('UPDATE nudges SET message_id = $1 WHERE id = $2', [messageId, nudge.id]);
  return { ...nudge, message_id: messageId };
}
