import { beforeEach, describe, expect, it } from 'vitest';
import { MODELS } from '../src/ai/client.ts';
import { readOpenAiConfig } from '../src/ai/providers/openai.ts';
import { generateWeeklyReview } from '../src/ai/review.ts';
import { runTurn } from '../src/ai/run.ts';
import { getUser } from '../src/services/user.ts';
import { agentCalls, scriptAgent } from './helpers/agent-mock.ts';
import { addMeal, addWeight, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * Model routing by turn kind.
 *
 * Running every turn on Opus measured at ~$0.058, which is more than a €4
 * subscription nets after VAT and the store's cut. These tests pin the routing
 * that makes the arithmetic work — and, just as importantly, pin that the
 * expensive models still run on the turns where quality is visible.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2020-01-01', { kcal: 2200, protein_g: 160 });
  await addWeight(user, '2026-03-01', 85);
});

async function turn(text: string, photo?: { id: string; mediaType: string; base64: string }) {
  const profile = await getUser(user.id);
  return runTurn({ userId: user.id, ctx: user.ctx, profile, text, photo });
}

const modelOf = (index = 0) => agentCalls[index]!.options.model as string;
const effortOf = (index = 0) => agentCalls[index]!.options.effort as string | undefined;

describe('journal turns', () => {
  it('sends a plain meal log to the everyday model', async () => {
    scriptAgent({ text: 'Logged.' });
    await turn('two eggs and toast');

    expect(modelOf()).toBe(MODELS.text_log.model);
    expect(effortOf()).toBe(MODELS.text_log.effort);
  });

  /**
   * Every model in the table accepts `effort` today, but Haiku 4.5 rejects it
   * with a 400 — so the provider spreads the key rather than assigning it, and
   * an unset effort must reach the SDK as an absent key, not `undefined`.
   */
  it('omits the effort key entirely when the table leaves it unset', async () => {
    const bare = { ...MODELS.text_log, effort: undefined };
    const options = { model: bare.model, ...(bare.effort ? { effort: bare.effort } : {}) };
    expect('effort' in options).toBe(false);
  });

  it('sends a photo to a model that can see', async () => {
    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(user.id, 'image/png', 'iVBORw0KGgo=');

    scriptAgent({ text: 'Looks like ~700 kcal.' });
    await turn('what is this?', { id: photo.id, mediaType: 'image/png', base64: 'AAAA' });

    expect(modelOf()).toBe(MODELS.photo_log.model);
    expect(effortOf()).toBe(MODELS.photo_log.effort);
  });

  /** Setup happens once per account and is the first thing anyone sees. */
  it('sends the onboarding interview to the better model', async () => {
    const fresh = await createUser({ sex: null, is_setup_complete: false });
    user = fresh;

    scriptAgent({ text: 'Hello — how tall are you?' });
    await turn('hi');

    expect(modelOf()).toBe(MODELS.setup.model);
  });

  /** A photo during setup still needs vision, or the model cannot see the plate. */
  it('prefers vision over the setup model when a turn has both', async () => {
    const fresh = await createUser({ sex: null, is_setup_complete: false });
    user = fresh;
    const { savePhoto } = await import('../src/services/photos.ts');
    const photo = await savePhoto(fresh.id, 'image/png', 'iVBORw0KGgo=');

    scriptAgent({ text: 'That looks like lunch.' });
    await turn('what is this?', { id: photo.id, mediaType: 'image/png', base64: 'AAAA' });

    expect(modelOf()).toBe(MODELS.photo_log.model);
  });

  it('records the model and kind on the message, so turns can be costed', async () => {
    scriptAgent({ text: 'Logged.' });
    const response = await turn('two eggs and toast');

    const { queryOne } = await import('../src/db.ts');
    const row = await queryOne<{ tool_trace: any }>(
      'SELECT tool_trace FROM chat_messages WHERE id = $1',
      [response.message.id],
    );
    expect(row!.tool_trace).toMatchObject({ model: MODELS.text_log.model, kind: 'text_log' });
  });
});

describe('weekly review', () => {
  it('runs on the best model — it is one turn a week', async () => {
    await addMeal(user, { date: '2026-03-10', kcal: 2100 });
    scriptAgent({ text: 'A steady week.' });

    await generateWeeklyReview(user.id, { today: '2026-03-16' });

    expect(modelOf()).toBe(MODELS.review.model);
    expect(effortOf()).toBe(MODELS.review.effort);
  });
});

describe('OpenAI-compatible providers', () => {
  const BASE = { OPENAI_API_KEY: 'sk-test' };

  it('falls back to one model for every kind', () => {
    const config = readOpenAiConfig({ ...BASE, OPENAI_MODEL: 'gpt-4o' });
    expect(config.models).toEqual({
      text_log: 'gpt-4o',
      photo_log: 'gpt-4o',
      setup: 'gpt-4o',
      review: 'gpt-4o',
    });
  });

  /**
   * The path a non-OpenAI vendor arrives on: DeepSeek, Qwen, GLM and Kimi all
   * serve this dialect, and only some of them can see an image — which is why
   * the vision slot is configured separately from the rest.
   */
  it('routes each kind independently when told to', () => {
    const config = readOpenAiConfig({
      ...BASE,
      OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
      OPENAI_MODEL: 'deepseek-chat',
      OPENAI_MODEL_VISION: 'qwen-vl-max',
      OPENAI_MODEL_REVIEW: 'deepseek-reasoner',
    });

    expect(config.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(config.models.text_log).toBe('deepseek-chat');
    expect(config.models.photo_log).toBe('qwen-vl-max');
    expect(config.models.review).toBe('deepseek-reasoner');
    expect(config.models.setup).toBe('deepseek-chat');
  });
});
