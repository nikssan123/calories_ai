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
import { withTurnLock } from '../services/turn-lock.ts';
import { checkWellbeing } from '../services/wellbeing.ts';
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

/**
 * One journal turn, with the account's turn lease held for the whole of it.
 *
 * The lease is taken here rather than in the route so that every entry point
 * gets it — the turn's read-modify-write of the day is what needs defending,
 * and it does not care which door the request came through.
 */
export async function runTurn(input: RunTurnInput): Promise<ChatResponse> {
  return withTurnLock(input.userId, () => runLockedTurn(input));
}

async function runLockedTurn(input: RunTurnInput): Promise<ChatResponse> {
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
    ? onboardingPrompt(input.profile, missing, currentWeight)
    : null;

  // The weekly review is published in its own agent session, so without this the
  // journal would have no idea what it said when the user asks about it.
  const review = needsOnboarding ? null : await latestReview(input.userId);
  const reviewContext = review ? recentReviewPrompt(review, today) : null;

  const notes = await listNotes(input.userId);

  // Skipped during onboarding: a brand new account has nothing logged, and both
  // checks read an empty week as no answer rather than a worrying one — but
  // paying for two queries to be told nothing on every turn of setup is waste.
  const wellbeing = needsOnboarding ? null : await checkWellbeing(input.userId, input.ctx, today);
  const previousTurnAt = await lastMessageAt(input.userId);
  const previousDate = previousTurnAt ? localDateFor(previousTurnAt, input.ctx) : null;
  const rolledOver = previousDate !== null && previousDate !== today;

  // Decided once and used twice: it governs both whether a session is resumed
  // and how far back the replayed transcript reaches, which are the same
  // decision expressed in the two ways a provider can remember a conversation.
  const fresh = await shouldStartFreshSession(input, today, rolledOver);

  // The rollover notice stays even though the transcript is cut below, because
  // the two defend different things. Dropping the session removes yesterday
  // from the model's context; the notice explains the discontinuity to a model
  // that may still be resuming — a same-day session that ran past midnight, or
  // a mid-day rotation that cut the history without a day having ended. Only
  // the text sent to the model carries it; what gets persisted as the user's
  // message stays exactly what they typed.
  const rollover = rolledOver ? `${dayRolloverNotice(previousDate, today, input.profile, now)}\n\n` : '';

  /*
   * The turn as the model sees it: where the day stands, then what they said.
   *
   * The day context leads rather than trails so their sentence is the last
   * thing in the turn, which is where a model's attention is sharpest and where
   * it was before this block existed. What gets persisted as their message is
   * still exactly what they typed — see `insertMessage` below.
   *
   * This is the cache fix. The block changes every turn, and in the system
   * prompt that put it in front of the whole transcript, invalidating it; here
   * it is just more conversation, and the prefix in front of it never moves.
   */
  const promptText = `${dayContextPrompt(input.profile, day, currentWeight, notes, wellbeing)}\n\n---\n\n${rollover}${input.text}`;

  const request: AgentRequest = {
    // Photo first: a turn with an image needs a model that can see, whatever
    // else is going on. Setup outranks a plain log because it happens once and
    // is the first thing a new account experiences.
    kind: input.photo ? 'photo_log' : needsOnboarding ? 'setup' : 'text_log',
    // What is left on the dynamic side is only what is stable *within* a
    // session: onboarding ends once, the review recap changes weekly. Both are
    // still barred from the cross-session prefix — a deployment-wide cache hit
    // needs bytes that are the same for every user, and these are per-account —
    // but neither moves between two turns of the same conversation, so neither
    // costs the transcript its cache.
    staticSystemPrompt: STABLE_SYSTEM_PROMPT,
    dynamicSystemPrompt:
      [onboarding, reviewContext].filter((part): part is string => part !== null).join('\n\n---\n\n') ||
      undefined,
    text: promptText,
    photo: input.photo ? { mediaType: input.photo.mediaType, base64: input.photo.base64 } : null,
    tools,
    toolNames,
    /*
     * Providers that keep no session of their own get the transcript replayed —
     * and get it cut at the same boundary a session is dropped at, rather than
     * always reaching back thirty messages.
     *
     * Without this, everything `shouldStartFreshSession` defends is defended
     * only for the Agent SDK. The two costs it exists to avoid are both
     * properties of the transcript, not of the session id: yesterday's meals
     * running straight into this morning's, which is how a breakfast photo came
     * to be read as a correction to the previous evening's entry, and a
     * conversation nobody had reason to keep becoming the largest thing in the
     * prompt and being re-read on every model call inside every turn.
     */
    history: provider.needsHistory && !fresh ? await loadHistory(input.userId) : [],
    readOnly: false,
    toolset: 'journal',
    maxTurns: MAX_TURNS,
  };

  const sessionId = fresh ? null : await loadSessionId(input.userId);

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
