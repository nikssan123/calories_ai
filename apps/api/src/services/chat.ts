import { ChatAction, type ChatMessage } from '@ct/shared';
import { query, queryOne } from '../db.ts';

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
  return toMessage(row);
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
  return rows.map(toMessage);
}

function toMessage(row: any): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    photo_id: row.photo_id,
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
