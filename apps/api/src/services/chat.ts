import type { ChatMessage } from '@ct/shared';
import { query, queryOne } from '../db.ts';

/**
 * The conversation is a view over the nutrition data, not the source of truth —
 * so this module only stores and reads text. Nothing here can change a meal.
 */

export async function insertMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  photoId: string | null = null,
  toolTrace: unknown = null,
): Promise<ChatMessage> {
  const row = await queryOne<any>(
    `INSERT INTO chat_messages (user_id, role, content, photo_id, tool_trace)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, role, content, photo_id, created_at`,
    [userId, role, content, photoId, toolTrace ? JSON.stringify(toolTrace) : null],
  );
  return toMessage(row);
}

export async function listMessages(userId: string, limit = 50): Promise<ChatMessage[]> {
  const rows = await query<any>(
    `SELECT id, role, content, photo_id, created_at FROM (
       SELECT id, role, content, photo_id, created_at
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
  };
}
