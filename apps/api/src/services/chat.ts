import { ChatAction, type ChatCard, type ChatMessage } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { signPhotoUrl } from './photos.ts';
import { getSecret, PHOTO_URL_SECRET } from './secrets.ts';

/**
 * The conversation is a view over the nutrition data, not the source of truth —
 * so this module only stores and reads text and the cards drawn from it.
 * Nothing here can change a meal.
 */

export async function insertMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  photoId: string | null = null,
  toolTrace: unknown = null,
  actions: ChatAction[] = [],
): Promise<ChatMessage> {
  const row = await queryOne<any>(
    `INSERT INTO chat_messages (user_id, role, content, photo_id, tool_trace, actions)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, role, content, photo_id, created_at, actions`,
    [
      userId,
      role,
      content,
      photoId,
      toolTrace ? JSON.stringify(toolTrace) : null,
      actions.length > 0 ? JSON.stringify(actions) : null,
    ],
  );
  return toMessage(row, await photoSecret(row));
}

/**
 * Replaces a message's cards, once one of them has been answered.
 *
 * The workout card is the only one in the app that asks a question, and a
 * question is a thing that stops being one. Without this, filling it in would
 * log the session and then leave the same unanswered card sitting in the
 * conversation forever — reappearing every time the app reopened, inviting the
 * user to log it a second time.
 *
 * Scoped by user, and a no-op when the message is not theirs.
 */
export async function replaceActions(
  userId: string,
  messageId: string,
  actions: ChatAction[],
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    'UPDATE chat_messages SET actions = $1 WHERE id = $2 AND user_id = $3 RETURNING id',
    [JSON.stringify(actions), messageId, userId],
  );
  return row !== null;
}

/**
 * Strikes an entry off every card that was drawn from it.
 *
 * A card is a receipt for a meal, and a receipt for a meal that no longer
 * exists is a lie the conversation keeps telling: delete last night's pasta
 * from the Today tab and the journal goes on showing it, macros, ring and all,
 * for as long as the history is scrolled back to. Nothing in the conversation
 * knew, because deleting an entry is not a turn.
 *
 * So the cards are marked where they are stored rather than removed. The turn
 * happened and the transcript says so; the card only stops claiming the food
 * is still counted — see `removed` on `ChatAction`.
 *
 * Every action carrying the id is marked, not just the one that logged it: a
 * meal that was logged and then corrected has a card for each, and both are
 * pictures of the same gone entry. The containment test is what keeps this off
 * the rest of the conversation — without it this rewrites every message the
 * user has ever sent to set nothing.
 */
export async function markEntryRemoved(userId: string, entryId: string): Promise<void> {
  await query(
    `UPDATE chat_messages
        SET actions = (
              SELECT jsonb_agg(
                       CASE WHEN action->>'entry_id' = $2
                            THEN action || '{"removed":true}'::jsonb
                            ELSE action END
                       ORDER BY position)
                FROM jsonb_array_elements(actions) WITH ORDINALITY AS element(action, position)
            )
      WHERE user_id = $1
        AND actions @> jsonb_build_array(jsonb_build_object('entry_id', $2::text))`,
    [userId, entryId],
  );
}

/**
 * Redraws every card that was drawn from an entry, after that entry changed.
 *
 * The sibling of `markEntryRemoved`, and it exists for the same reason: a
 * correction is not a turn either. Fix a portion on the Today screen and the
 * journal goes on showing the figure it was logged with, because the card was
 * written once, at the moment of the turn, and nothing has re-read the entry
 * since. The two screens then disagree about the same meal, and the one that is
 * wrong is the one that reads like a receipt.
 *
 * So the stored card is replaced in place, and the summary with it — the chip a
 * cardless action falls back to carries the same stale number, and a card that
 * was corrected while its one-line summary still says "620 kcal" is the same
 * lie in a smaller font.
 *
 * Every action carrying the id, again: a meal that was logged and then
 * corrected has a card for each, and both are pictures of the same entry as it
 * is now. `removed` is deliberately left alone — an entry can be edited and
 * later deleted, and the strike outlives the redraw.
 */
export async function refreshEntryCards(
  userId: string,
  entryId: string,
  card: ChatCard,
  summary: string,
): Promise<void> {
  await query(
    `UPDATE chat_messages
        SET actions = (
              SELECT jsonb_agg(
                       CASE WHEN action->>'entry_id' = $2
                            THEN action || jsonb_build_object('card', $3::jsonb, 'summary', $4::text)
                            ELSE action END
                       ORDER BY position)
                FROM jsonb_array_elements(actions) WITH ORDINALITY AS element(action, position)
            )
      WHERE user_id = $1
        AND actions @> jsonb_build_array(jsonb_build_object('entry_id', $2::text))`,
    [userId, entryId, JSON.stringify(card), summary],
  );
}

export async function messageActions(
  userId: string,
  messageId: string,
): Promise<ChatAction[] | null> {
  const row = await queryOne<{ actions: ChatAction[] | null }>(
    'SELECT actions FROM chat_messages WHERE id = $1 AND user_id = $2',
    [messageId, userId],
  );
  return row ? (row.actions ?? []) : null;
}

/**
 * The last few things this person typed, newest first, for the language check.
 *
 * `listMessages` is the wrong shape for it twice over: it returns oldest-first
 * and it signs a photo URL for every row that has one, which is a secret fetch
 * and a signature per message to answer a question that only reads text. This
 * is the same rows with neither cost.
 *
 * User turns only. The assistant's own replies would make the decision
 * self-confirming — a turn that wrongly answered a Bulgarian message in English
 * would then look like an English conversation forever.
 */
export async function recentUserTexts(userId: string, limit: number): Promise<string[]> {
  const rows = await query<{ content: string }>(
    `SELECT content FROM chat_messages
      WHERE user_id = $1 AND role = 'user'
   ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(Math.max(limit, 1), 50)],
  );
  return rows.map((row) => row.content);
}

export async function listMessages(userId: string, limit = 50): Promise<ChatMessage[]> {
  const rows = await query<any>(
    `SELECT id, role, content, photo_id, created_at, actions FROM (
       SELECT id, role, content, photo_id, created_at, actions
         FROM chat_messages WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2
     ) recent ORDER BY created_at ASC`,
    [userId, Math.min(Math.max(limit, 1), 200)],
  );
  // Fetched once for the whole page rather than per row, and skipped entirely
  // for a conversation with no photos in it.
  const secret = rows.some((row) => row.photo_id) ? await getSecret(PHOTO_URL_SECRET) : null;
  return rows.map((row) => toMessage(row, secret));
}

/**
 * The window of transcript a provider replays, with a start that holds still.
 *
 * `listMessages` above is the wrong shape for this, and only for one reason: a
 * turn appends two rows, so its "most recent N" window slides by two every
 * turn. The replayed conversation is the front of the cached prefix, and a
 * prefix whose first message changes on every request is re-keyed on every
 * request — the cache write is paid and the read is never earned.
 *
 * So the *start* is quantised rather than the end. The anchor advances a whole
 * `chunk` of messages at a time, which holds the replayed prefix byte-identical
 * for `chunk / 2` consecutive turns and re-keys once, when the anchor jumps.
 * The window therefore breathes between `keep` and `keep + chunk - 1` messages
 * instead of sitting at a fixed size. That is the price of the stability, and
 * it is the whole point: a window that is always exactly thirty messages long
 * is a window that is never the same twice.
 *
 * Counted forward from the user's first message rather than back from their
 * last, because only a fixed origin gives an anchor that does not drift.
 * `row_number` and `count` come off the same scan, so it stays one round trip.
 * `id` breaks ties in the ordering: two rows sharing a `created_at` would
 * otherwise be free to swap places between turns, which is exactly the silent
 * re-keying this function exists to prevent.
 *
 * Deliberately leaner than `listMessages` — no photo URLs, no cards, no ids.
 * The model is being sent a transcript, not a page of the app.
 */
export async function listReplayWindow(
  userId: string,
  keep: number,
  chunk: number,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const rows = await query<{ role: string; content: string }>(
    `WITH numbered AS (
       SELECT role, content,
              row_number() OVER (ORDER BY created_at, id) - 1 AS idx,
              count(*)     OVER ()                           AS total
         FROM chat_messages WHERE user_id = $1
     )
     SELECT role, content FROM numbered
      WHERE idx >= GREATEST(0, (total - $2) / $3) * $3
      ORDER BY idx`,
    [userId, keep, chunk],
  );
  return rows.map((row) => ({ role: row.role as 'user' | 'assistant', content: row.content }));
}

/** The signing key, read only when this row actually has a photo to sign. */
async function photoSecret(row: { photo_id: string | null }): Promise<string | null> {
  return row.photo_id ? getSecret(PHOTO_URL_SECRET) : null;
}

/**
 * When the conversation was last touched, for detecting a day rollover.
 *
 * Read separately from `listMessages` because the caller needs it before the
 * turn runs, and on providers that keep their own session there is no transcript
 * to read it off.
 *
 * Scan receipts do not count. They are written by the barcode route without a
 * model ever running, so one is not evidence that a conversation happened —
 * and treating it as one is expensive: a packet scanned at breakfast would
 * make the first typed message of the day look like a continuation, keeping
 * yesterday's session and its whole transcript alive for another day. That is
 * the bill `shouldStartFreshSession` exists to stop, and the bug it exists to
 * stop — yesterday's meals running into this morning's photograph. A nudge is
 * deliberately still counted: the user may be answering it, and dropping the
 * history under their reply would leave the model reading half a conversation.
 */
export async function lastMessageAt(userId: string): Promise<Date | null> {
  const row = await queryOne<{ created_at: string }>(
    `SELECT created_at FROM chat_messages
      WHERE user_id = $1 AND tool_trace->>'kind' IS DISTINCT FROM 'scan'
   ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return row ? new Date(row.created_at) : null;
}

/** How many messages have been stored since `since`. Used to cap a runaway day. */
export async function countMessagesSince(userId: string, since: Date): Promise<number> {
  const row = await queryOne<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM chat_messages WHERE user_id = $1 AND created_at >= $2',
    [userId, since],
  );
  return row ? Number(row.count) : 0;
}

function toMessage(row: any, photoSecret: string | null): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    photo_id: row.photo_id,
    photo_url: row.photo_id && photoSecret ? signPhotoUrl(row.photo_id, photoSecret) : null,
    created_at: new Date(row.created_at).toISOString(),
    actions: parseActions(row.actions),
  };
}

/**
 * Stored cards are re-validated on the way out rather than trusted.
 *
 * These rows outlive the code that wrote them: a card shape that is dropped or
 * changed in a later release leaves older rows on disk in the old shape, and a
 * client handed one would render garbage or throw mid-conversation. Anything
 * that no longer parses is dropped, so the worst outcome is an old turn that
 * reads as plain text — which is exactly how it read before this column existed.
 */
function parseActions(value: unknown): ChatAction[] {
  if (!Array.isArray(value)) return [];
  // Element-wise rather than whole-array, so one unreadable card costs its own
  // card rather than every card in the turn.
  return value.flatMap((entry) => {
    const parsed = ChatAction.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}
