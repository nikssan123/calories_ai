import type { TokenUsage } from './providers/types.ts';

/**
 * What a turn costs.
 *
 * The honest answer differs by provider, so this file has two halves rather
 * than one table:
 *
 *   - **Claude Code prices its own turns.** The Agent SDK returns
 *     `total_cost_usd` and a per-model `costUSD`, computed by the signed-in
 *     binary against whatever the current rates are. That is always fresher
 *     than anything hardcoded here, so it wins whenever it is present, and the
 *     rate card below is only a fallback and a projection basis.
 *   - **The OpenAI-compatible path returns no price at all**, and the endpoint
 *     behind it might be OpenAI, Groq, Together, or a local Ollama. There is no
 *     rate card that could be right for all of them, so rather than guessing,
 *     the two rates are configuration.
 *
 * The subscription caveat is the whole point of the exercise: running on a
 * Claude Code subscription, the reported cost is not billed to anyone — it is
 * what the same tokens *would* cost at API rates. That is exactly the number
 * you want when the question is "could this be a product?", because a product
 * pays API rates.
 */

/** USD per million tokens. */
export interface Rate {
  input: number;
  output: number;
}

/**
 * Anthropic list prices, USD per million tokens.
 *
 * This is a rate card, so it goes stale — Claude Code's own figure is used in
 * preference to it for every real turn, and this exists for the projections on
 * the admin panel and for turns where the SDK reported nothing.
 *
 * These are checked against what production was actually billed: reconstructing
 * a day of `ai_usage` rows from these rates reproduces the SDK's own
 * `total_cost_usd` to the sixth decimal. Sonnet 5 bills at $3/$15 here — the
 * $2/$10 introductory rate did *not* apply to these turns, so it is not in the
 * table. If a projection ever stops matching the reported column, this is the
 * first place to look.
 */
export const ANTHROPIC_RATES: Record<string, Rate> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-fable-5': { input: 10, output: 50 },
};

/**
 * Cache reads bill at a tenth of the input rate. Writes bill at 1.25× for the
 * five-minute TTL and 2× for the one-hour one, and the Agent SDK takes the
 * one-hour: every usage record it returns reports its cache writes under
 * `ephemeral_1h_input_tokens` and none under `ephemeral_5m_input_tokens`.
 *
 * 2× is therefore the multiplier that matches the bill, and it is worth stating
 * plainly that this is the expensive lever in the whole file: a token written
 * to cache costs twenty times the same token read back out of it. Keeping the
 * prefix stable enough to be read rather than re-written is worth more than any
 * choice of model — see `dayContextPrompt`.
 */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 2;

export function anthropicRate(model: string): Rate | null {
  return ANTHROPIC_RATES[model] ?? null;
}

/**
 * Per-million-token rates for the OpenAI-compatible provider, from the
 * environment. Unset means unset: the tokens are still recorded, the cost is
 * reported as unknown, and the admin panel says which two variables would
 * turn it into a number. A plausible-looking guess would be worse than a
 * blank, because the blank is the thing that prompts someone to check.
 */
export function openAiRate(source: NodeJS.ProcessEnv = process.env): Rate | null {
  const input = Number(source.OPENAI_PRICE_INPUT);
  const output = Number(source.OPENAI_PRICE_OUTPUT);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  if (input < 0 || output < 0) return null;
  return { input, output };
}

/**
 * Prices token counts against a rate card. Cache reads and writes are charged
 * against the input rate at their own multipliers; `inputTokens` is assumed to
 * already exclude them, which is how both providers report it.
 */
export function priceUsage(usage: TokenUsage, rate: Rate): number {
  const million = 1_000_000;
  const input =
    usage.inputTokens * rate.input +
    usage.cacheReadTokens * rate.input * CACHE_READ_MULTIPLIER +
    usage.cacheWriteTokens * rate.input * CACHE_WRITE_MULTIPLIER;
  return round6((input + usage.outputTokens * rate.output) / million);
}

/** Six decimal places — a text log can cost well under a tenth of a cent. */
export function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
