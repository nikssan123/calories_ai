import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db.ts';
import { runTurn } from '../src/ai/run.ts';
import { isKickoff, openingMessage } from '../src/ai/greeting.ts';
import { listMessages } from '../src/services/chat.ts';
import { getUser } from '../src/services/user.ts';
import { agentCalls, scriptAgent } from './helpers/agent-mock.ts';
import { addWeight, createUser, type TestUser } from './helpers/factories.ts';

/**
 * The opening message, which is the one turn in the product that must not cost
 * anything. See `src/ai/greeting.ts` — every new account used to buy a hello
 * from Opus for $0.17, and half of them never answered it.
 */

/** `journal.kickoff` in both clients' catalogues. */
const KICKOFF = 'Hi — I’m new here. Let’s get set up.';

let user: TestUser;

/** A new account: setup unfinished, nothing logged, nothing said. */
beforeEach(async () => {
  user = await createUser({
    height_cm: null,
    activity_level: null,
    is_setup_complete: false,
    onboarding_completed_at: null,
  });
});

async function turn(text: string) {
  const profile = await getUser(user.id);
  return runTurn({ userId: user.id, ctx: user.ctx, profile, text });
}

async function usageRows(): Promise<number> {
  const rows = await query<{ count: string }>('SELECT count(*) FROM ai_usage WHERE user_id = $1', [
    user.id,
  ]);
  return Number(rows[0]!.count);
}

describe('isKickoff', () => {
  it('matches what each client sends', () => {
    for (const text of [
      'Hi — I’m new here. Let’s get set up.',
      'Здравей — нов съм тук. Хайде да се настроим.',
      'Hi — ich bin neu hier. Lass uns einrichten.',
      'Hola — soy nuevo aquí. Vamos a configurarlo.',
      'Salut — je suis nouveau ici. On configure ça ?',
    ]) {
      expect(isKickoff(text)).toBe(true);
    }
  });

  it('survives the drift a catalogue edit causes', () => {
    // A straight apostrophe, a hyphen for the em dash, doubled spacing and no
    // full stop: none of it changes what the sentence is.
    expect(isKickoff("hi - i'm new here.  let's get set up")).toBe(true);
  });

  it('does not match somebody talking', () => {
    expect(isKickoff('two eggs and toast')).toBe(false);
    expect(isKickoff('hi')).toBe(false);
  });
});

describe('the opening turn', () => {
  it('answers without calling a model, and bills nothing', async () => {
    const response = await turn(KICKOFF);

    expect(agentCalls).toHaveLength(0);
    expect(response.message.content).toBe(openingMessage('en'));
    expect(await usageRows()).toBe(0);
  });

  it('persists both sides, so the transcript still reads as a conversation', async () => {
    await turn(KICKOFF);

    const messages = await listMessages(user.id);
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ['user', KICKOFF],
      ['assistant', openingMessage('en')],
    ]);
  });

  it('greets in the language the account reads', async () => {
    user = await createUser({ locale: 'bg', height_cm: null, is_setup_complete: false });

    const response = await turn(KICKOFF);

    expect(response.message.content).toBe(openingMessage('bg'));
    // The clause names the other four and not the one it is written in.
    expect(response.message.content).toContain('Deutsch');
    expect(response.message.content).not.toContain('Български,');
  });

  it('names the languages it is not writing in', () => {
    expect(openingMessage('en')).toContain('Български, Deutsch, Español, Français');
    expect(openingMessage('fr')).not.toContain('Français');
  });
});

describe('what still reaches the model', () => {
  beforeEach(() => {
    scriptAgent({ text: 'Logged.' }, { text: 'Logged.' });
  });

  it('a first message that is somebody talking', async () => {
    // §3 of TESTING-FEEDBACK.md: logging before setup is finished has to work.
    await turn('two eggs and toast');
    expect(agentCalls).toHaveLength(1);
  });

  it('a second kickoff, because an opening happens once', async () => {
    await turn(KICKOFF);
    expect(agentCalls).toHaveLength(0);

    await turn(KICKOFF);
    expect(agentCalls).toHaveLength(1);
  });

  it('the kickoff from an account that has already been through setup', async () => {
    user = await createUser();
    await addWeight(user, '2026-03-01', 85);

    await turn(KICKOFF);

    expect(agentCalls).toHaveLength(1);
  });
});
