import type { ChatAction, ChatResponse, Profile } from '@ct/shared';
import { unitsOf } from '@ct/shared';
import { queryOne, query as sql } from '../db.ts';
import type { DayContext } from '../time.ts';
import { localDateFor } from '../time.ts';
import {
  countMessagesSince,
  insertMessage,
  lastMessageAt,
  listMessages,
  listReplayWindow,
} from '../services/chat.ts';
import { listNotes } from '../services/notes.ts';
import { buildDaySummary } from '../services/summary.ts';
import { latestWeight } from '../services/log.ts';
import { latestReview } from '../services/reviews.ts';
import { getUser, missingProfileFields } from '../services/user.ts';
import { recordUsage } from '../services/usage.ts';
import { withTurnLock } from '../services/turn-lock.ts';
import { checkWellbeing } from '../services/wellbeing.ts';
import { MAX_SESSION_MESSAGES, MAX_TURNS, TEXT_LOG_UNSUPPORTED_LANGUAGE } from './client.ts';
import { needsCapableModel } from './language.ts';
import {
  createProvider,
  laneFor,
  type AgentMessage,
  type AgentRequest,
  type AiProvider,
  type Outcome,
  type StreamSink,
} from './providers/index.ts';
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
 *
 * `emit`, when supplied, is where the turn narrates itself — see `StreamEvent`.
 * It is an argument rather than a second function because a streamed turn and
 * an unstreamed one must be the *same* turn: the same lease, the same day
 * context, the same persisted message and cards at the end. The only thing a
 * watcher changes is whether the twenty seconds in the middle are silent.
 */
export async function runTurn(input: RunTurnInput, emit?: StreamSink): Promise<ChatResponse> {
  return withTurnLock(input.userId, () => runLockedTurn(input, emit));
}

async function runLockedTurn(input: RunTurnInput, emit?: StreamSink): Promise<ChatResponse> {
  const now = new Date();
  const today = localDateFor(now, input.ctx);

  const actions: ChatAction[] = [];
  const toolContext: ToolContext = {
    userId: input.userId,
    ctx: input.ctx,
    now,
    photoId: input.photo?.id ?? null,
    actions,
    units: unitsOf(input.profile),
  };

  // Built before any database work so a misconfigured provider fails fast.
  const provider = createProvider(toolContext, laneFor(input.profile.email));
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
  /*
   * Names only — no exercises, no previous loads. The model needs to recognise
   * "my push day" and hand it to a tool; the tool reads the contents itself,
   * and putting eight exercises per routine on every single turn would be a
   * standing cost for something used on the turns that mention lifting.
   */
  const { listRoutines } = await import('../services/routines.ts');
  const routines = await listRoutines(input.userId).catch(() => []);

  const promptText = `${dayContextPrompt(input.profile, day, currentWeight, notes, wellbeing, routines)}\n\n---\n\n${rollover}${input.text}`;

  /*
   * Providers that keep no session of their own get the transcript replayed —
   * and get it cut at the same boundary a session is dropped at, rather than
   * always reaching back thirty messages.
   *
   * Without this, everything `shouldStartFreshSession` defends is defended only
   * for the Agent SDK. The two costs it exists to avoid are both properties of
   * the transcript, not of the session id: yesterday's meals running straight
   * into this morning's, which is how a breakfast photo came to be read as a
   * correction to the previous evening's entry, and a conversation nobody had
   * reason to keep becoming the largest thing in the prompt and being re-read
   * on every model call inside every turn.
   *
   * Hoisted out of the request because the language check below reads it too.
   */
  const history = provider.needsHistory && !fresh ? await loadHistory(input.userId) : [];

  // Photo first: a turn with an image needs a model that can see, whatever else
  // is going on. Setup outranks a plain log because it happens once and is the
  // first thing a new account experiences.
  const kind = input.photo ? 'photo_log' : needsOnboarding ? 'setup' : 'text_log';

  const request: AgentRequest = {
    kind,
    /*
     * Only the text log is routed by language, and only ever upward.
     *
     * The other kinds are already on models that write every language in the
     * product well, so there is nothing to fix and a check would just be a
     * chance to get it wrong. `text_log` is the one that runs on Haiku 4.5,
     * and it is where a Bulgarian meal log came back with invented words in it.
     *
     * Decided from the conversation rather than from this one message, because
     * a journal is made of fragments — "малко повече" is too short to identify
     * on its own, and would otherwise reset the decision every few turns and
     * flip the model back and forth mid-conversation.
     */
    model: kind === 'text_log' && (await escalateForLanguage(input, history))
      ? TEXT_LOG_UNSUPPORTED_LANGUAGE
      : undefined,
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
    history,
    readOnly: false,
    toolset: 'journal',
    maxTurns: MAX_TURNS,
  };

  const sessionId = fresh ? null : await loadSessionId(input.userId);

  let outcome = await drive(provider, request, sessionId, emit);
  if (outcome.staleSession) {
    // The stored session is gone (cleared cache, another machine). Start a new
    // one — the nutrition data lives in Postgres, so only chat continuity is lost.
    await saveSessionId(input.userId, null);
    // Anything already shown belongs to the run that just died. In practice a
    // resume fails before the model has said a word, so this almost never has
    // anything to undo — but "almost never" is not a reason to let someone
    // watch the answer be written twice.
    emit?.({ type: 'reset' });
    outcome = await drive(provider, request, null, emit);
  }

  // Before the error check: a turn that spent tokens and then failed is exactly
  // the turn the cost report must not lose.
  await recordUsage({ userId: input.userId, kind: request.kind, outcome, provider: provider.id });

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
  // have to make a second request to see the result. Same for the profile —
  // `set_profile` runs from inside a turn, and `input.profile` is the copy from
  // before it did.
  const [updatedDay, updatedProfile] = await Promise.all([
    buildDaySummary(input.userId, today),
    getUser(input.userId),
  ]);

  return { message: assistantMessage, actions, day: updatedDay, profile: updatedProfile };
}

/**
 * Runs the turn on whichever entry point this provider offers.
 *
 * `runStream` is optional at the seam, and the fallback is the whole reason it
 * can be: a provider that cannot narrate itself still answers correctly, it
 * just answers all at once. That is exactly what every provider did before
 * this, so nothing regresses on the lane that has not implemented it — the
 * OpenAI one, today — and no caller has to ask which lane it is on.
 */
function drive(
  provider: AiProvider,
  request: AgentRequest,
  state: string | null,
  emit?: StreamSink,
): Promise<Outcome> {
  if (emit && provider.runStream) return provider.runStream(request, state, emit);
  return provider.run(request, state);
}

/**
 * How much transcript a provider that replays gets, and how the window moves.
 *
 * `HISTORY_KEEP` is the floor and `HISTORY_CHUNK` is the stride: the window
 * runs between twenty and thirty-nine messages, and its *start* only moves once
 * every twenty messages — ten turns — rather than on every one. The average is
 * about thirty, which is what a plain sliding window held, so nothing is lost
 * from what the model can see; what is gained is that the front of the prefix
 * stands still long enough for the cache breakpoint at the end of it to be read
 * back nine turns out of ten instead of never.
 *
 * They are equal on purpose. The stride is what buys the reads and the floor is
 * what guarantees the context, and there is no reason here to want more of one
 * than the other — a longer stride would earn slightly more reads per write and
 * pay for it by carrying a wider window every turn, which very nearly cancels.
 */
export const HISTORY_KEEP = 20;
export const HISTORY_CHUNK = 20;

/**
 * Prior turns for providers that cannot remember the conversation themselves.
 *
 * The window is chunked rather than sliding — see `listReplayWindow`. That
 * matters here and nowhere else in this file: this is the only transcript that
 * is sent to a model, so it is the only one whose stability is worth anything.
 */
async function loadHistory(userId: string): Promise<AgentMessage[]> {
  const messages = await listReplayWindow(userId, HISTORY_KEEP, HISTORY_CHUNK);
  return messages.map((m) => ({ role: m.role as AgentMessage['role'], content: m.content }));
}

/**
 * The last few messages, plainly, for a caller that only wants to read them.
 *
 * The language check is not sent to a model and has no prefix to protect, so it
 * takes the simple query and the exact number of rows it asked for.
 */
async function loadRecent(userId: string, limit: number): Promise<AgentMessage[]> {
  const messages = await listMessages(userId, limit);
  return messages.map((m) => ({ role: m.role as AgentMessage['role'], content: m.content }));
}

/**
 * Turns of conversation the language check may look back over when the
 * transcript was not loaded for the model.
 *
 * Small on purpose. This is a second query on the hot path for the session-
 * based provider, and it buys only what a fragment cannot say on its own —
 * three or four sentences is already more than the detector needs, and a wider
 * window would mostly re-read a conversation the model is not being sent.
 */
const LANGUAGE_LOOKBACK = 6;

/**
 * Whether this turn should run on the capable model because of the language it
 * is written in.
 *
 * The current message leads, and prior *user* turns stand behind it. The
 * assistant's own replies are deliberately excluded: a turn that wrongly
 * answered a Bulgarian message in English would otherwise be evidence that this
 * is an English conversation, and the mistake would keep itself alive.
 *
 * Providers with `needsHistory` have already paid for the transcript, so the
 * common case reads no extra rows. The session-based provider has not, and a
 * fresh session has none to read — hence the fallback, which is also why it is
 * allowed to reach back past a day boundary: nobody changes language at
 * midnight, and the first message of a new day is exactly the one with no
 * conversation behind it.
 */
async function escalateForLanguage(
  input: RunTurnInput,
  history: AgentMessage[],
): Promise<boolean> {
  const prior = history.length > 0 ? history : await loadRecent(input.userId, LANGUAGE_LOOKBACK);
  const userTexts = prior.filter((m) => m.role === 'user').map((m) => m.content);
  return needsCapableModel([input.text, ...userTexts.reverse()]);
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
