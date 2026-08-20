import { ChatAction, type ChatMessage } from '@ct/shared';
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
 */
export async function lastMessageAt(userId: string): Promise<Date | null> {
  const row = await queryOne<{ created_at: string }>(
    'SELECT created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
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
