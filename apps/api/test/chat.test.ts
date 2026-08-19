import { beforeEach, describe, expect, it } from 'vitest';
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
