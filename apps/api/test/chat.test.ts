import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatAction } from '@ct/shared';
import { query } from '../src/db.ts';
import { insertMessage, listMessages } from '../src/services/chat.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

describe('insertMessage', () => {
  it('stores a message and returns it in wire shape', async () => {
    const message = await insertMessage(user.id, 'user', 'two eggs and toast');
    expect(message).toMatchObject({ role: 'user', content: 'two eggs and toast', photo_id: null });
    expect(message.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps the tool trace out of the wire shape but in the database', async () => {
    const message = await insertMessage(user.id, 'assistant', 'Logged.', null, { num_turns: 3 });
    expect(message).not.toHaveProperty('tool_trace');

    const rows = await query<{ tool_trace: any }>('SELECT tool_trace FROM chat_messages WHERE id = $1', [
      message.id,
    ]);
    expect(rows[0]!.tool_trace).toEqual({ num_turns: 3 });
  });

  it('stores null rather than "null" when there is no trace', async () => {
    const message = await insertMessage(user.id, 'assistant', 'Logged.');
    const rows = await query<{ tool_trace: any }>('SELECT tool_trace FROM chat_messages WHERE id = $1', [
      message.id,
    ]);
    expect(rows[0]!.tool_trace).toBeNull();
  });
});

describe('listMessages', () => {
  beforeEach(async () => {
    for (let i = 0; i < 5; i++) {
      await insertMessage(user.id, i % 2 === 0 ? 'user' : 'assistant', `message ${i}`);
    }
  });

  it('returns oldest first, so the transcript reads downward', async () => {
    const messages = await listMessages(user.id);
    expect(messages.map((m) => m.content)).toEqual([
      'message 0',
      'message 1',
      'message 2',
      'message 3',
      'message 4',
    ]);
  });

  it('takes the most recent N, still in reading order', async () => {
    expect((await listMessages(user.id, 2)).map((m) => m.content)).toEqual(['message 3', 'message 4']);
  });

  it('clamps a nonsensical limit', async () => {
    expect(await listMessages(user.id, 0)).toHaveLength(1);
    expect(await listMessages(user.id, 10_000)).toHaveLength(5);
  });

  it('never returns another account’s conversation', async () => {
    const other = await createUser();
    expect(await listMessages(other.id)).toEqual([]);
  });
});

/**
 * Cards are stored with the turn so a reload does not silently downgrade a
 * conversation full of charts into plain text. Rows outlive the code that wrote
 * them, so the read path treats what is on disk as untrusted.
 */
describe('stored actions', () => {
  const foodAction: ChatAction = {
    kind: 'food_logged',
    entry_id: '11111111-1111-4111-8111-111111111111',
    summary: 'lunch: Chicken and rice — 620 kcal',
    card: {
      type: 'food',
      entry_id: '11111111-1111-4111-8111-111111111111',
      meal: 'lunch',
      description: 'Chicken and rice',
      confidence: 'medium',
      items: [{ name: 'Chicken', quantity: '200g' }],
      kcal: 620,
      protein_g: 62,
      carbs_g: 50,
      fat_g: 8,
    },
  };

  it('round-trips a card through the database', async () => {
    const written = await insertMessage(user.id, 'assistant', 'Logged.', null, null, [foodAction]);
    expect(written.actions).toEqual([foodAction]);

    const [read] = await listMessages(user.id);
    expect(read!.actions).toEqual([foodAction]);
  });

  it('defaults to an empty list for a message that carried none', async () => {
    await insertMessage(user.id, 'user', 'hello');
    const [read] = await listMessages(user.id);
    expect(read!.actions).toEqual([]);
  });

  /**
   * The forward-compatibility case: a card shape dropped in a later release
   * leaves old rows on disk in a shape the current client cannot draw. Losing
   * that one card is correct; losing the turn, or throwing mid-conversation,
   * is not.
   */
  it('drops a card it can no longer read without losing the rest of the turn', async () => {
    await insertMessage(user.id, 'assistant', 'Here you go.', null, null, [foodAction]);
    await query(
      `UPDATE chat_messages
          SET actions = actions || $2::jsonb
        WHERE user_id = $1`,
      [user.id, JSON.stringify([{ kind: 'from_the_future', entry_id: null, summary: 'gone' }])],
    );

    const [read] = await listMessages(user.id);
    expect(read!.actions).toEqual([foodAction]);
  });

  it('reads a row written before the column existed as no actions', async () => {
    await insertMessage(user.id, 'assistant', 'Older turn.');
    await query('UPDATE chat_messages SET actions = NULL WHERE user_id = $1', [user.id]);

    const [read] = await listMessages(user.id);
    expect(read!.actions).toEqual([]);
  });
});
