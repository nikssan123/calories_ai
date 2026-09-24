import type { Allowance, ChatResponse, Locale } from '@ct/shared';
import { insertMessage, recentUserTexts } from '../services/chat.ts';
import { buildDaySummary } from '../services/summary.ts';
import { journalChanged, recordUsage, spend, spendsGrant } from '../services/usage.ts';
import { getUser, getUserContext } from '../services/user.ts';
import { localDateFor } from '../time.ts';
import { LANGUAGE_LOOKBACK, replyLanguage, speakingLocale } from './language.ts';
import { createProvider, laneFor, type AgentRequest } from './providers/index.ts';
import { languageBrief, PHOTO_ESTIMATION_PROMPT, unitsBrief } from './prompt.ts';
import { buildNutritionServer, type ToolContext } from './tools.ts';

/**
 * The photo-only lane. See COACH.md §10.
 *
 * A photograph with nothing typed under it is the most common turn a client
 * on a coach's seat makes, and through the journal it is the most expensive:
 * the same vision call the fridge scan makes at a cent, wrapped in the
 * journal's 19.7k-token prefix, twenty-seven tool schemas and the replayed
 * transcript. None of that is needed to read a plate. This lane sends the
 * plate-reading prompt, one tool, and the picture — and writes the same rows
 * the journal would have, so the conversation shows the photo and the card
 * exactly as before.
 *
 * What it gives up is deliberate: no history, so it cannot know that "the
 * usual" means oats; no correction tools, so a wrong reading is fixed with a
 * typed sentence in the journal, which routes through the full turn. A photo
 * with words under it never comes here.
 */

/*
 * The language rule is its own bullet, over both endings, because hanging it
 * off the first one left the second in English: on 2026-09-24 a Bulgarian
 * guest photographed a bottle of water, the brief said Bulgarian, and the
 * reply was "This is just a bottle of water, no food to log here."
 */
const PHOTO_LANE_PROMPT = `# This turn

You are reading one photograph of one meal, and nothing else. There is no conversation to continue and no question to answer.

- Call \`log_food\` exactly once, with every distinct food you can see as its own item. Estimate portions from the plate, the cutlery and the packaging, as described above.
- Leave \`when\` null: the photo was taken now.
- Then reply with one short sentence naming what you logged. No questions, no advice, no numbers — the card carries the numbers.
- If there is genuinely no food in the photograph, do not call the tool; say so in one sentence.
- Whichever sentence you write, write it in the language named below, if one is. That includes the names of the foods: they were not given to you in any language, so they take the reply's.`;

export interface PhotoLaneInput {
  mediaType: string;
  /** Present when the bytes are in hand; absent when `url` carries them. */
  base64?: string;
  /** A presigned read, when the photo is already in the bucket. */
  url?: string;
  /** The stored row, whichever way the bytes arrived. */
  photoId: string;
}

export async function logPhotoOnly(
  userId: string,
  photo: PhotoLaneInput,
  /**
   * What the client is drawing itself in, for an account with no preference of
   * its own. A guess, stored nowhere: see `SPOKEN_LOCALE_HEADER`.
   */
  spokenLocale: Locale | null,
  /**
   * What the route's gate found before it permitted this scan. Handed back on
   * the reply with the turn added, or not added — a photograph the lane could
   * find no food in does not spend the scan, which on a guest is the only one
   * they have.
   */
  allowance: Allowance,
): Promise<ChatResponse> {
  const { userId: id, units, ...ctx } = await getUserContext(userId);
  // Read before the language rather than after it: the column on this row is
  // the first half of the answer, and the lane this account runs on is the
  // second thing it is needed for.
  const profile = await getUser(id);
  /*
   * Wordless, and the most wordless request the app makes: a plate, one
   * tool, an empty history. Nothing here can be read for a language, so a
   * reading the detector cannot name has to fall back to the account rather
   * than to the model — see `LanguageTurn`.
   */
  const language = replyLanguage(
    await recentUserTexts(id, LANGUAGE_LOOKBACK),
    speakingLocale(profile, spokenLocale),
    { wordless: true },
  ).name;
  const now = new Date();

  const toolContext: ToolContext = {
    userId: id,
    ctx,
    now,
    photoId: photo.photoId,
    actions: [],
    units,
  };

  const provider = createProvider(toolContext, laneFor(profile.email));
  const authError = provider.checkAuth();
  if (authError) throw new Error(authError);

  const { tools, toolNames } = buildNutritionServer(toolContext, { toolset: 'photo' });

  const request: AgentRequest = {
    kind: 'photo_log',
    // The plate-reading guidance is the whole system prompt. Byte-stable, so
    // it caches across every account the way the journal's prefix does — and
    // it is a fraction of that prefix's size, which is the point of the lane.
    staticSystemPrompt: `${PHOTO_ESTIMATION_PROMPT}\n\n---\n\n${PHOTO_LANE_PROMPT}`,
    dynamicSystemPrompt: '',
    text: ['Log this meal.', languageBrief(language), unitsBrief({ units })].filter(Boolean).join('\n\n'),
    photo:
      photo.url !== undefined
        ? { mediaType: photo.mediaType, url: photo.url }
        : { mediaType: photo.mediaType, base64: photo.base64! },
    tools,
    toolNames,
    history: [],
    readOnly: false,
    toolset: 'photo',
    // One tool call and a sentence. Anything more is a run that lost the plot.
    maxTurns: 3,
  };

  const outcome = await provider.run(request, null);
  const actions = toolContext.actions;
  /*
   * Before the error check, so a turn that spent tokens and failed still counts
   * against the meter it was sold under.
   *
   * A turn that succeeded and read no food off the plate is the other case, and
   * the opposite answer: the sentence below already admits there was nothing to
   * log, and charging a scan for it takes a guest's only one for a photograph
   * of a cat. `spendsGrant` decides both.
   */
  const changed = journalChanged(actions);
  const metered = await spendsGrant(id, {
    changed,
    failed: Boolean(outcome.error),
    unlimited: allowance.unlimited,
  });
  await recordUsage({
    userId: id,
    kind: 'photo_log',
    outcome,
    provider: provider.id,
    metered,
    changed: outcome.error ? undefined : changed,
  });
  if (outcome.error) throw new Error(outcome.error);

  const text = outcome.text?.trim() || (actions.length > 0 ? 'Logged.' : 'Nothing on the plate could be read.');

  /*
   * The same two rows the journal writes, so the conversation shows the photo
   * and the card the way it always has. The user's row carries no words —
   * there were none — and the trace on the reply says which lane it came
   * through, which is what the cost report reads.
   */
  const userMessage = await insertMessage(id, 'user', '', photo.photoId);
  const assistantMessage = await insertMessage(
    id,
    'assistant',
    text,
    null,
    {
      kind: 'photo_lane',
      num_turns: outcome.numTurns,
      cost_usd: outcome.costUsd,
      model: outcome.model,
      tools: actions.map((action) => action.kind),
    },
    actions,
  );

  const today = localDateFor(now, ctx);
  const [day, updatedProfile] = await Promise.all([buildDaySummary(id, today, today), getUser(id)]);

  return {
    message: assistantMessage,
    user_message: userMessage,
    actions,
    day,
    profile: updatedProfile,
    allowance: spend(allowance, metered),
  };
}
