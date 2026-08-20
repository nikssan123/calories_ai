import { query, queryOne } from '../db.ts';

/**
 * Standing preferences the agent has been told, kept outside the conversation.
 *
 * The agent session is closed at each day rollover, so anything the user wants
 * to hold across days has to live somewhere the transcript is not. Most things
 * already do — today's numbers and entry ids are rebuilt into the prompt every
 * turn, and past portions come back from `search_food_history`. This is only
 * for the instructions that never become a row.
 *
 * Written explicitly by the `remember` tool, never summarised from the
 * transcript: a note here is something the user actually said, which is what
 * makes it safe to replay into every prompt for the life of the account.
 */

/** Injected into every turn, so the ceiling is a prompt-budget decision. */
export const MAX_NOTES = 20;
export const MAX_NOTE_LENGTH = 200;

export interface AgentNote {
  id: string;
  note: string;
  created_at: string;
}

export async function listNotes(userId: string): Promise<AgentNote[]> {
  const rows = await query<any>(
    `SELECT id, note, created_at FROM agent_notes
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, MAX_NOTES],
  );
  return rows.map((r) => ({ id: r.id, note: r.note, created_at: new Date(r.created_at).toISOString() }));
}

/**
 * Adds a note, oldest-out once the cap is reached.
 *
 * Dropping the oldest rather than refusing the write is deliberate: refusing
 * would leave the agent holding an instruction it has just told the user it
 * would keep, and a silently ignored preference is worse than a forgotten one.
 */
export async function addNote(userId: string, note: string): Promise<AgentNote | null> {
  const text = note.trim().slice(0, MAX_NOTE_LENGTH);
  if (!text) return null;

  const row = await queryOne<any>(
    'INSERT INTO agent_notes (user_id, note) VALUES ($1, $2) RETURNING id, note, created_at',
    [userId, text],
  );

  await query(
    `DELETE FROM agent_notes
      WHERE user_id = $1
        AND id NOT IN (
          SELECT id FROM agent_notes WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
        )`,
    [userId, MAX_NOTES],
  );

  return { id: row.id, note: row.note, created_at: new Date(row.created_at).toISOString() };
}

export async function forgetNote(userId: string, noteId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    'DELETE FROM agent_notes WHERE user_id = $1 AND id = $2 RETURNING id',
    [userId, noteId],
  );
  return row !== null;
}
