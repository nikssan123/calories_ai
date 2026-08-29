import type { ChatAction, ChatResponse, Locale, Profile } from '@ct/shared';
import { localeOf, unitsOf } from '@ct/shared';
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
import { latestWeight } from '../services/log.ts';
import { listNotes } from '../services/notes.ts';
import { buildDaySummary } from '../services/summary.ts';
import { latestReview } from '../services/reviews.ts';
import { getUser } from '../services/user.ts';
import { recordUsage } from '../services/usage.ts';
import { hasKitchen } from '../services/plans.ts';
import { withTurnLock } from '../services/turn-lock.ts';
import { checkWellbeing } from '../services/wellbeing.ts';
import { MAX_SESSION_MESSAGES, MAX_TURNS, TEXT_LOG_UNSUPPORTED_LANGUAGE } from './client.ts';
import { needsCapableModel, writingNeedsCapableModel } from './language.ts';
import {
  createProvider,
  laneFor,
  unmeteredFor,
  type AgentMessage,
  type AgentRequest,
  type AiProvider,
  type Outcome,
  type PhotoSource,
  type StreamSink,
} from './providers/index.ts';
import {
  dayContextPrompt,
  dayRolloverNotice,
  PHOTO_ESTIMATION_PROMPT,
  journalSystemPrompt,
  recentReviewPrompt,
  scannedProductsPrompt,
} from './prompt.ts';
import type { ScannedProduct } from '../services/barcode.ts';
import { buildNutritionServer, type ToolContext } from './tools.ts';

export interface RunTurnInput {
  userId: string;
  ctx: DayContext;
  profile: Profile;
  text: string;
  photo?: ({ id: string } & PhotoSource) | null;
  /**
   * The language the client says it is drawing the app in, for an account whose
   * profile has none of its own.
   *
   * Absent from every server-initiated turn — a review, a nudge — because there
   * is no client in the room to ask. Those are written from the stored
   * preference or, failing that, in English.
   */
  spokenLocale?: Locale | null;
  /**
   * Packets scanned into this message, already resolved to their panels.
   *
   * Looked up by the route rather than by the model's own `lookup_barcode`
   * tool, which could have done it: that would be a tool round-trip per packet,
   * each one a model call, for figures the process can fetch in parallel off a
   * cache that already holds most of them. The tool stays for what it was
   * written for — a barcode somebody reads aloud mid-conversation.
   */
  scanned?: ScannedProduct[];
  /**
   * How many attached codes the catalogue could not answer for.
   *
   * Carried separately rather than folded into the list, because "we dropped
   * two" is something the reply has to be able to say. A turn that silently
   * shortened the list would produce an estimate wearing a scan's confidence.
   */
  scannedMisses?: number;
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
    scanned: input.scanned ?? [],
  };

  // Built before any database work so a misconfigured provider fails fast.
  const provider = createProvider(toolContext, laneFor(input.profile.email));
  const authError = provider.checkAuth();
  if (authError) throw new Error(authError);

  const day = await buildDaySummary(input.userId, today, today);
  /*
   * Whether this turn carries the cooking half at all.
   *
   * Off the plan rather than off the message, and that is the whole of the
   * safety argument: nothing here reads what they typed, guesses an intent, or
   * asks the model to request more tools — three things that would each be a
   * chance to withhold a tool a turn actually needed. A tier either can cook or
   * it cannot, it is the same answer for every turn of that account, and on the
   * tier where the answer is no every one of these tools already fails with a
   * 402 the moment it is called.
   *
   * The prompt follows the tools. `journalSystemPrompt` swaps the sections that
   * name them for one that says the kitchen is Coach's — because prompt about a
   * tool that is not in the request is not neutral, it is an instruction to
   * call something that is not there.
   */
  const kitchen = hasKitchen(input.profile.plan, unmeteredFor(input.profile.email));
  const { tools, toolNames } = buildNutritionServer(toolContext, { kitchen });

  /*
   * Which language to write this turn in, resolved once.
   *
   * The stored preference is an answer and wins. A null column is not English —
   * it is nobody having been asked — and while it stays null the client has
   * been drawing the entire app in the device's language. Answering such a turn
   * in English puts an English reply under a Bulgarian interface, which reads
   * worse than either language would on its own.
   *
   * Applied to the profile the *prompts* are built from and to nothing else.
   * Nothing stored moves with it: what the client is drawing in is a guess
   * until the person says otherwise, and a guess must not be able to write
   * itself into the column that records their answer.
   */
  const speaking: Profile = input.profile.locale
    ? input.profile
    : { ...input.profile, locale: input.spokenLocale ?? null };

  /*
   * There is no setup mode any more.
   *
   * The agent used to be handed a brief telling it to collect sex, age, height,
   * goal, activity, units and language by asking for them two at a time — about
   * 1,500 tokens of instruction on every turn of a new account's first
   * conversation, plus a model turn for each answer. That job belongs to
   * `apps/mobile/app/onboarding.tsx` now: seven values from small known sets,
   * collected by a form the client will not let anybody past. By the time a
   * turn reaches here the profile is complete, so the branch that existed for
   * the incomplete case has nothing left to be true about.
   */
  // The weekly review is published in its own agent session, so without this the
  // journal would have no idea what it said when the user asks about it.
  const review = await latestReview(input.userId);
  const reviewContext = review ? recentReviewPrompt(review, today) : null;

  const notes = await listNotes(input.userId);

  const wellbeing = await checkWellbeing(input.userId, input.ctx, today);
  // The scale's last word, for the "where things stand" block. Read here rather
  // than inside `dayContextPrompt` so the prompt builder stays synchronous.
  const currentWeight = await latestWeight(input.userId);
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

  /*
   * Portion technique, and only when there is a photograph to apply it to.
   *
   * It goes in the turn rather than in `STABLE_SYSTEM_PROMPT` for the reason
   * that block is cached at all: the prefix is written and read back on every
   * turn, so two hundred tokens of advice about reading a plate would be billed
   * to every text log that has no plate to read. Here it is paid for by the
   * turns that use it.
   *
   * Ahead of the day context rather than after it, so the person's own message
   * stays the last thing in the turn — the same ordering, and the same reason,
   * as the block below.
   */
  const photoGuidance = input.photo ? `${PHOTO_ESTIMATION_PROMPT}\n\n---\n\n` : '';

  /*
   * The packets, as close to their sentence as the ordering allows.
   *
   * After the day context rather than beside the photo guidance, and the two
   * are not the same kind of thing: the photo block is technique, stable and
   * about how to read any plate, while this is data about this turn. Data
   * belongs next to the words it is about, so it sits in the last position
   * anything but the message itself may occupy.
   */
  const scannedBlock = scannedProductsPrompt(input.scanned ?? [], input.scannedMisses ?? 0);
  const scanned = scannedBlock ? `${scannedBlock}\n\n---\n\n` : '';

  const promptText = `${photoGuidance}${dayContextPrompt(speaking, day, currentWeight, notes, wellbeing, routines)}\n\n---\n\n${scanned}${rollover}${input.text}`;

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

  // A turn with an image needs a model that can see; everything else is a text
  // log. There was a third kind here — `setup`, routed to the most capable
  // model because the profile questions happened once and were the first thing
  // a new account experienced — and it went with the conversation that asked
  // them. See `TurnKind`, which keeps the name for the rows already written
  // under it.
  const kind = input.photo ? 'photo_log' : 'text_log';

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
    model: kind === 'text_log' && (await escalateForLanguage(input, history, speaking))
      ? TEXT_LOG_UNSUPPORTED_LANGUAGE
      : undefined,
    // What is left on the dynamic side is only what is stable *within* a
    // session: the review recap changes weekly. It is still barred from the
    // cross-session prefix — a deployment-wide cache hit needs bytes that are
    // the same for every user, and this is per-account — but it does not move
    // between two turns of the same conversation, so it costs the transcript
    // nothing.
    staticSystemPrompt: journalSystemPrompt(kitchen),
    dynamicSystemPrompt: reviewContext ?? undefined,
    text: promptText,
    photo: input.photo ? photoSource(input.photo) : null,
    tools,
    toolNames,
    history,
    readOnly: false,
    toolset: 'journal',
    kitchen,
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
  const userMessage = await insertMessage(
    input.userId,
    'user',
    input.text,
    input.photo?.id ?? null,
    null,
  );
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
    buildDaySummary(input.userId, today, today),
    getUser(input.userId),
  ]);

  return {
    message: assistantMessage,
    // The reader's own row, so the client can retire the optimistic one it drew
    // from a cache file rather than living on it. See `ChatResponse`.
    user_message: userMessage,
    actions,
    day: updatedDay,
    profile: updatedProfile,
  };
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
 * The photo without its row id, which the model has no use for.
 *
 * Written out rather than spread, because the two arms of `PhotoSource` are
 * distinguished by which field is *absent* and spreading `{...photo}` would
 * carry `base64: undefined` into the url arm and defeat the narrowing every
 * provider does on it.
 */
function photoSource(photo: { id: string } & PhotoSource): PhotoSource {
  return photo.url !== undefined
    ? { mediaType: photo.mediaType, url: photo.url }
    : { mediaType: photo.mediaType, base64: photo.base64 };
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
  speaking: Profile,
): Promise<boolean> {
  /*
   * The language being written settles it before anything is read, because the
   * two questions come apart: an account whose app is in Bulgarian is owed a
   * Bulgarian reply to "ok" and to a photo with no caption, neither of which
   * the detector below has anything to work with. Cheap, too — no transcript is
   * loaded for the account this decides.
   *
   * `speaking` rather than `input.profile`, though today the two can only
   * differ on a turn that never reaches here: a null `locale` is a missing
   * profile field, so such an account is in setup mode and `kind` is `setup`,
   * which is on a capable model already. Written against the language actually
   * being spoken anyway — the question this answers is "what am I about to
   * write", and reading it off the stored column would be right by coincidence.
   */
  if (writingNeedsCapableModel(localeOf(speaking))) return true;

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
