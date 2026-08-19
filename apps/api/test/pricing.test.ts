import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_RATES,
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  SONNET_INTRO,
  anthropicRate,
  openAiRate,
  priceUsage,
  round6,
} from '../src/ai/pricing.ts';

/**
 * The rate card, which is the only place in the codebase that turns tokens into
 * money. It is worth pinning precisely because it is the half that goes stale:
 * a wrong multiplier here misprices every projection on the admin panel by an
 * order of magnitude and nothing else would notice.
 */

const USAGE = {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

describe('priceUsage', () => {
  it('charges input and output at their own rates', () => {
    expect(priceUsage(USAGE, { input: 5, output: 25 })).toBe(30);
  });

  it('charges a cache read at a tenth of the input rate', () => {
    const cost = priceUsage(
      { ...USAGE, inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 },
      { input: 5, output: 25 },
    );
    expect(cost).toBe(5 * CACHE_READ_MULTIPLIER);
  });

  it('charges a cache write at a premium over plain input', () => {
    const cost = priceUsage(
      { ...USAGE, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000 },
      { input: 5, output: 25 },
    );
    expect(cost).toBe(5 * CACHE_WRITE_MULTIPLIER);
  });

  /**
   * The reason the three token buckets are kept apart rather than summed. A
   * turn that is mostly cache read costs a fraction of one that is mostly fresh
   * input, and the journal's system prompt is half stable — so this is the
   * common case, not an edge one.
   */
  it('prices a cache-heavy turn far below the same tokens as fresh input', () => {
    const cached = priceUsage(
      { inputTokens: 500, outputTokens: 200, cacheReadTokens: 20_000, cacheWriteTokens: 0 },
      { input: 3, output: 15 },
    );
    const fresh = priceUsage(
      { inputTokens: 20_500, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
      { input: 3, output: 15 },
    );
    expect(cached).toBeLessThan(fresh / 3);
  });

  it('keeps six decimals, because a text log costs less than a tenth of a cent', () => {
    const cost = priceUsage(
      { inputTokens: 900, outputTokens: 120, cacheReadTokens: 0, cacheWriteTokens: 0 },
      { input: 3, output: 15 },
    );
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
    expect(String(cost).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(6);
  });
});

describe('anthropicRate', () => {
  it('knows the models the router actually uses', () => {
    for (const choice of ['claude-opus-5', 'claude-sonnet-5']) {
      expect(anthropicRate(choice)).not.toBeNull();
    }
  });

  it('returns null for a model it has never heard of', () => {
    expect(anthropicRate('some-local-llama')).toBeNull();
  });

  /**
   * Sonnet 5 ships at an introductory rate that expires. Without the date check
   * the panel would keep reporting the cheap rate afterwards, understating
   * every projection by a third at exactly the moment the real bill went up.
   */
  it('applies the introductory Sonnet rate until it expires, and the list rate after', () => {
    const during = new Date(`${SONNET_INTRO.until}T00:00:00Z`);
    expect(anthropicRate('claude-sonnet-5', during)).toEqual(SONNET_INTRO.rate);

    const after = new Date(Date.parse(`${SONNET_INTRO.until}T00:00:00Z`) + 86_400_000);
    expect(anthropicRate('claude-sonnet-5', after)).toEqual(ANTHROPIC_RATES['claude-sonnet-5']);
  });

  it('leaves other models alone on the intro boundary', () => {
    const after = new Date('2030-01-01T00:00:00Z');
    expect(anthropicRate('claude-opus-5', after)).toEqual(ANTHROPIC_RATES['claude-opus-5']);
  });
});

describe('openAiRate', () => {
  it('reads both rates from the environment', () => {
    expect(openAiRate({ OPENAI_PRICE_INPUT: '0.5', OPENAI_PRICE_OUTPUT: '1.5' } as never)).toEqual({
      input: 0.5,
      output: 1.5,
    });
  });

  /**
   * Unconfigured is null rather than zero. Zero would report a metered endpoint
   * as free, which is the single most misleading thing this panel could say.
   */
  it('is null when unset, rather than free', () => {
    expect(openAiRate({} as never)).toBeNull();
    expect(openAiRate({ OPENAI_PRICE_INPUT: '1' } as never)).toBeNull();
    expect(openAiRate({ OPENAI_PRICE_INPUT: 'cheap', OPENAI_PRICE_OUTPUT: '2' } as never)).toBeNull();
  });

  it('rejects a negative rate', () => {
    expect(openAiRate({ OPENAI_PRICE_INPUT: '-1', OPENAI_PRICE_OUTPUT: '2' } as never)).toBeNull();
  });

  it('accepts a genuinely free local endpoint when it is stated explicitly', () => {
    expect(openAiRate({ OPENAI_PRICE_INPUT: '0', OPENAI_PRICE_OUTPUT: '0' } as never)).toEqual({
      input: 0,
      output: 0,
    });
  });
});

describe('round6', () => {
  it('rounds to the sixth decimal', () => {
    expect(round6(0.0000004)).toBe(0);
    expect(round6(0.12345678)).toBe(0.123457);
  });
});
