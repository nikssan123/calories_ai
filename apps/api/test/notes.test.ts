import { beforeEach, describe, expect, it } from 'vitest';
import { addNote, forgetNote, listNotes, MAX_NOTE_LENGTH, MAX_NOTES } from '../src/services/notes.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

/**
 * The only thing that survives a session close.
 *
 * Everything else the agent might want to remember is reconstructed each turn —
 * today's numbers from the day context, past portions from search_food_history.
 * These are the instructions that never became a row, so the guarantees that
 * matter are that they persist, that they stay bounded, and that they never
 * grow into something that would need summarising.
 */

let user: TestUser;
let other: TestUser;

beforeEach(async () => {
  user = await createUser();
  other = await createUser();
});

describe('agent notes', () => {
  it('keeps a note and hands it back newest first', async () => {
    await addNote(user.id, 'Do not log my commute walk');
    await addNote(user.id, 'I use a small plate');

    expect((await listNotes(user.id)).map((n) => n.note)).toEqual([
      'I use a small plate',
      'Do not log my commute walk',
    ]);
  });

  it('never leaks between accounts', async () => {
    await addNote(user.id, 'Mine');
    expect(await listNotes(other.id)).toEqual([]);
  });

  it('refuses a note with nothing in it', async () => {
    expect(await addNote(user.id, '   ')).toBeNull();
    expect(await listNotes(user.id)).toEqual([]);
  });

  it('trims a note to the length the prompt budgets for', async () => {
    const saved = await addNote(user.id, 'x'.repeat(MAX_NOTE_LENGTH + 50));
    expect(saved!.note).toHaveLength(MAX_NOTE_LENGTH);
  });

  it('drops the oldest once the cap is reached', async () => {
    for (let i = 0; i < MAX_NOTES + 5; i += 1) await addNote(user.id, `note ${i}`);

    const notes = await listNotes(user.id);
    expect(notes).toHaveLength(MAX_NOTES);
    // The five oldest are gone, and the newest is still first.
    expect(notes[0]!.note).toBe(`note ${MAX_NOTES + 4}`);
    expect(notes.map((n) => n.note)).not.toContain('note 0');
  });

  it('forgets one by id', async () => {
    const saved = await addNote(user.id, 'Temporary');
    expect(await forgetNote(user.id, saved!.id)).toBe(true);
    expect(await listNotes(user.id)).toEqual([]);
  });

  it('will not forget another account’s note', async () => {
    const saved = await addNote(user.id, 'Mine');
    expect(await forgetNote(other.id, saved!.id)).toBe(false);
    expect(await listNotes(user.id)).toHaveLength(1);
  });
});
