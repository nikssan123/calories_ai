import type { ChatAction, ChatResponse, Profile } from '@ct/shared';
import { queryOne, query as sql } from '../db.ts';
import type { DayContext } from '../time.ts';
import { localDateFor } from '../time.ts';
import { insertMessage, listMessages } from '../services/chat.ts';
import { buildDaySummary } from '../services/summary.ts';
import { latestWeight } from '../services/log.ts';
import { latestReview } from '../services/reviews.ts';
import { missingProfileFields } from '../services/user.ts';
import { recordUsage } from '../services/usage.ts';
import { MAX_TURNS } from './client.ts';
import { createProvider, type AgentMessage, type AgentRequest } from './providers/index.ts';
import { dayContextPrompt, onboardingPrompt, recentReviewPrompt, STABLE_SYSTEM_PROMPT } from './prompt.ts';
import { buildNutritionServer, type ToolContext } from './tools.ts';

export interface RunTurnInput {
  userId: string;
  ctx: DayContext;
  profile: Profile;
  text: string;
  photo?: { id: string; mediaType: string; base64: string } | null;
}

export async function runTurn(input: RunTurnInput): Promise<ChatResponse> {
  const now = new Date();
  const today = localDateFor(now, input.ctx);

  const actions: ChatAction[] = [];
  const toolContext: ToolContext = {
    userId: input.userId,
    ctx: input.ctx,
    now,
    photoId: input.photo?.id ?? null,
    actions,
  };

  // Built before any database work so a misconfigured provider fails fast.
  const provider = createProvider(toolContext);
  const authError = provider.checkAuth();
  if (authError) throw new Error(authError);

  const day = await buildDaySummary(input.userId, today);
  const { tools, toolNames } = buildNutritionServer(toolContext);

  // Setup mode is additive: the agent keeps every logging capability while it
  // collects the missing profile values.
  const missing = missingProfileFields(input.profile);
  const currentWeight = await latestWeight(input.userId);
  const needsOnboarding = missing.length > 0 || currentWeight === null;
  const onboarding = needsOnboarding
    ? `\n\n---\n\n${onboardingPrompt(input.profile, missing, currentWeight)}`
    : '';

  // The weekly review is published in its own agent session, so without this the
  // journal would have no idea what it said when the user asks about it.
  const review = needsOnboarding ? null : await latestReview(input.userId);
  const reviewContext = review ? `\n\n---\n\n${recentReviewPrompt(review, today)}` : '';

  const request: AgentRequest = {
    // Photo first: a turn with an image needs a model that can see, whatever
    // else is going on. Setup outranks a plain log because it happens once and
    // is the first thing a new account experiences.
    kind: input.photo ? 'photo_log' : needsOnboarding ? 'setup' : 'text_log',
    // The stable half is the system prompt; the volatile half (today's numbers,
    // entry ids) is regenerated every turn.
    systemPrompt: `${STABLE_SYSTEM_PROMPT}\n\n---\n\n${dayContextPrompt(input.profile, day, currentWeight)}${onboarding}${reviewContext}`,
    text: input.text,
    photo: input.photo ? { mediaType: input.photo.mediaType, base64: input.photo.base64 } : null,
    tools,
    toolNames,
    // Providers that keep no session of their own get the transcript replayed.
    history: provider.needsHistory ? await loadHistory(input.userId) : [],
    readOnly: false,
    maxTurns: MAX_TURNS,
  };

  const sessionId = await loadSessionId(input.userId);

  let outcome = await provider.run(request, sessionId);
  if (outcome.staleSession) {
    // The stored session is gone (cleared cache, another machine). Start a new
    // one — the nutrition data lives in Postgres, so only chat continuity is lost.
    await saveSessionId(input.userId, null);
    outcome = await provider.run(request, null);
  }

  // Before the error check: a turn that spent tokens and then failed is exactly
  // the turn the cost report must not lose.
  await recordUsage({ userId: input.userId, kind: request.kind, outcome });

  if (outcome.error) throw new Error(outcome.error);
  if (!outcome.text) outcome.text = 'Logged.';

  if (outcome.sessionId && outcome.sessionId !== sessionId) {
    await saveSessionId(input.userId, outcome.sessionId);
  }

  // The user's message is persisted only now, so a failed turn doesn't leave a
  // dangling prompt in the conversation.
  await insertMessage(input.userId, 'user', input.text, input.photo?.id ?? null, null);
  const assistantMessage = await insertMessage(input.userId, 'assistant', outcome.text, null, {
    session_id: outcome.sessionId,
    num_turns: outcome.numTurns,
    cost_usd: outcome.costUsd,
    model: outcome.model,
    kind: request.kind,
    tools: actions.map((a) => a.kind),
  });

  // Re-read the day: tools may have written to it, and the client should not
  // have to make a second request to see the result.
  const updatedDay = await buildDaySummary(input.userId, today);

  return { message: assistantMessage, actions, day: updatedDay };
}

/** Prior turns for providers that cannot remember the conversation themselves. */
async function loadHistory(userId: string): Promise<AgentMessage[]> {
  const messages = await listMessages(userId, 30);
  return messages.map((m) => ({ role: m.role as AgentMessage['role'], content: m.content }));
}

async function loadSessionId(userId: string): Promise<string | null> {
  const row = await queryOne<{ agent_session_id: string | null }>(
    'SELECT agent_session_id FROM users WHERE id = $1',
    [userId],
  );
  return row?.agent_session_id ?? null;
}

async function saveSessionId(userId: string, sessionId: string | null): Promise<void> {
  await sql('UPDATE users SET agent_session_id = $1 WHERE id = $2', [sessionId, userId]);
}
