import type { ChatAction, ChatResponse, Profile } from '@ct/shared';
import { queryOne, query as sql } from '../db.ts';
import type { DayContext } from '../time.ts';
import { localDateFor } from '../time.ts';
import { countMessagesSince, insertMessage, lastMessageAt, listMessages } from '../services/chat.ts';
import { listNotes } from '../services/notes.ts';
import { buildDaySummary } from '../services/summary.ts';
import { latestWeight } from '../services/log.ts';
import { latestReview } from '../services/reviews.ts';
import { missingProfileFields } from '../services/user.ts';
import { recordUsage } from '../services/usage.ts';
import { MAX_SESSION_MESSAGES, MAX_TURNS } from './client.ts';
import { createProvider, type AgentMessage, type AgentRequest } from './providers/index.ts';
import {
  dayContextPrompt,
  dayRolloverNotice,
  onboardingPrompt,
  recentReviewPrompt,
  STABLE_SYSTEM_PROMPT,
} from './prompt.ts';
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

  const notes = await listNotes(input.userId);
  const previousTurnAt = await lastMessageAt(input.userId);
  const previousDate = previousTurnAt ? localDateFor(previousTurnAt, input.ctx) : null;
  const rolledOver = previousDate !== null && previousDate !== today;

  // The rollover notice stays even though the session is dropped below, because
  // the two defend different things. Closing the session removes yesterday from
  // the model's context; the notice explains the discontinuity to a model that
  // may still be resuming — a same-day session that ran past midnight, or the
  // OpenAI provider, which replays 30 messages of history regardless of what we
  // do with the session id. Only the text sent to the model carries it; what
  // gets persisted as the user's message stays exactly what they typed.
  const promptText = rolledOver
    ? `${dayRolloverNotice(previousDate, today, input.profile, now)}\n\n${input.text}`
    : input.text;

  const request: AgentRequest = {
    // Photo first: a turn with an image needs a model that can see, whatever
    // else is going on. Setup outranks a plain log because it happens once and
    // is the first thing a new account experiences.
    kind: input.photo ? 'photo_log' : needsOnboarding ? 'setup' : 'text_log',
    // Kept apart all the way to the provider so the cache breakpoint can land
    // between them. Onboarding and the review recap sit on the volatile side:
    // both end, and a prefix that changes when they do is not a stable prefix.
    staticSystemPrompt: STABLE_SYSTEM_PROMPT,
    dynamicSystemPrompt: `${dayContextPrompt(input.profile, day, currentWeight, notes)}${onboarding}${reviewContext}`,
    text: promptText,
    photo: input.photo ? { mediaType: input.photo.mediaType, base64: input.photo.base64 } : null,
    tools,
    toolNames,
    // Providers that keep no session of their own get the transcript replayed.
    history: provider.needsHistory ? await loadHistory(input.userId) : [],
    readOnly: false,
    maxTurns: MAX_TURNS,
  };

  const sessionId = await shouldStartFreshSession(input, today, rolledOver)
    ? null
    : await loadSessionId(input.userId);

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
  const assistantMessage = await insertMessage(
    input.userId,
    'assistant',
    outcome.text,
    null,
    {
      session_id: outcome.sessionId,
      num_turns: outcome.numTurns,
      cost_usd: outcome.costUsd,
      model: outcome.model,
      kind: request.kind,
      tools: actions.map((a) => a.kind),
    },
    actions,
  );

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

/**
 * Whether this turn should start a new agent session instead of resuming.
 *
 * The session used to be resumed for the life of the account, which had two
 * costs. The visible one was confusion: on 2026-08-20 the model read a photo of
 * that morning's breakfast as a correction to the entry it had written the
 * evening before, because the transcript ran straight from one into the other.
 * The quieter one was the bill — the transcript grows about 450 tokens per turn
 * and is re-read on every model call inside every turn, so by week three a
 * conversation nobody had reason to keep was the largest thing in the prompt.
 *
 * Almost nothing is lost by dropping it. The day context rebuilds today's
 * numbers and entry ids every turn, `search_food_history` returns past meals
 * with their portions, the weekly review is re-injected for ten days, and
 * standing preferences live in `agent_notes`. What goes is the conversational
 * thread — and a day boundary is precisely where there is no thread to cut.
 */
async function shouldStartFreshSession(
  input: RunTurnInput,
  today: string,
  rolledOver: boolean,
): Promise<boolean> {
  if (rolledOver) return true;

  // A guard for the pathological single day, so one very long conversation
  // cannot reach the context window on its own. Counted rather than estimated:
  // a message count is exact and cheap, where a token estimate is neither.
  const turnsToday = await countMessagesSince(input.userId, startOfLocalDay(today, input.ctx));
  return turnsToday >= MAX_SESSION_MESSAGES;
}

/**
 * The instant `localDate` began for this user, so "messages today" is counted
 * against the same boundary everything else in the product uses.
 */
function startOfLocalDay(localDate: string, ctx: DayContext): Date {
  // Walk back from the first UTC instant of the date until the day-start rule
  // agrees, which is at most a day either side and avoids re-deriving offsets.
  let candidate = new Date(`${localDate}T00:00:00Z`);
  for (let hours = -24; hours <= 24; hours += 1) {
    const at = new Date(candidate.getTime() + hours * 60 * 60 * 1000);
    if (localDateFor(at, ctx) === localDate) return at;
  }
  return candidate;
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
