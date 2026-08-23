import type { PantryScanProposal } from '@ct/shared';
import { listPantry } from '../services/pantry.ts';
import { savePhoto } from '../services/photos.ts';
import { recordUsage } from '../services/usage.ts';
import { getUser, getUserContext } from '../services/user.ts';
import { MAX_TURNS } from './client.ts';
import { emptyCollector } from './kitchen.ts';
import { createProvider, laneFor, type AgentRequest } from './providers/index.ts';
import { PANTRY_SCAN_PROMPT, unitsBrief } from './prompt.ts';
import { buildNutritionServer, type ToolContext } from './tools.ts';

/**
 * Reading a fridge photo into a list someone can confirm.
 *
 * The word doing the work is *confirm*. This writes nothing to the pantry, and
 * that is not caution for its own sake: a photograph shows the front row of one
 * shelf, past a milk bottle, with half the labels turned away. The model's
 * reading of it is a good first draft and a bad database. The person holding
 * the phone is standing in front of the actual fridge and can fix the list in
 * four seconds — but only if they are shown it first.
 */

export interface ScanInput {
  mediaType: string;
  /** Present when the bytes are in hand; absent when `url` carries them. */
  base64?: string;
  /** A presigned read, when the photo is already in the bucket. */
  url?: string;
  /**
   * Set when the bytes were uploaded straight to the bucket and the row already
   * exists, so this does not store them a second time under a second id.
   */
  photoId?: string;
}

export async function scanFridgePhoto(
  userId: string,
  photo: ScanInput,
): Promise<PantryScanProposal> {
  const { userId: id, units, ...ctx } = await getUserContext(userId);

  // Stored like a meal photo, so the same signed-URL read serves it and a scan
  // that read the fridge wrongly can be looked at afterwards. Already stored
  // when the client uploaded directly — `claimPhoto` wrote the row before the
  // route got here.
  const saved = photo.photoId
    ? { id: photo.photoId }
    : await savePhoto(id, photo.mediaType, photo.base64!);

  const kitchen = emptyCollector();
  const toolContext: ToolContext = {
    userId: id,
    ctx,
    now: new Date(),
    photoId: saved.id,
    actions: [],
    kitchen,
    units,
  };

  // Read for the lane and nothing else, which is the same second query the
  // review, the nudge and the recipe path each already make.
  const profile = await getUser(id);
  const provider = createProvider(toolContext, laneFor(profile.email));
  const authError = provider.checkAuth();
  if (authError) throw new Error(authError);

  const { tools, toolNames } = buildNutritionServer(toolContext, { toolset: 'kitchen' });

  const request: AgentRequest = {
    kind: 'pantry_scan',
    staticSystemPrompt: PANTRY_SCAN_PROMPT,
    dynamicSystemPrompt: '',
    // A fourth agent session that writes measurements at somebody, after the
    // journal, the review and the recipe writer — the quantities it notes land
    // on the kitchen list and are read there. The prompt above is byte-stable
    // for the cache, so the brief rides the turn instead.
    text: ['What food can you see in this photo?', unitsBrief({ units })]
      .filter(Boolean)
      .join('\n\n'),
    photo:
      photo.url !== undefined
        ? { mediaType: photo.mediaType, url: photo.url }
        : { mediaType: photo.mediaType, base64: photo.base64! },
    tools,
    toolNames,
    history: [],
    readOnly: false,
    toolset: 'kitchen',
    // One tool call and a sentence. The journal's ceiling would only ever be
    // reached here by a run that had gone wrong.
    maxTurns: 4,
    };

  const outcome = await provider.run(request, null);
  await recordUsage({ userId: id, kind: 'pantry_scan', outcome, provider: provider.id });
  if (outcome.error) throw new Error(outcome.error);

  // Which of these the kitchen already holds, so the confirmation screen can
  // show a refresh as a refresh. Matched case-insensitively, the same way the
  // upsert does — otherwise "Eggs" would look new to someone who has eggs.
  const known = new Set((await listPantry(id)).map((i) => i.name.toLowerCase()));

  return {
    found: kitchen.found,
    note: kitchen.note ?? (kitchen.found.length === 0 ? outcome.text?.trim() || null : null),
    already_known: kitchen.found.map((f) => f.name).filter((n) => known.has(n.toLowerCase())),
  };
}
