import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { TurnKind } from './providers/types.ts';

/**
 * Auth: this app runs the agent on your Claude Code subscription rather than a
 * metered API key. The Agent SDK picks up the OAuth credentials that `claude`
 * writes to ~/.claude/.credentials.json, so there is no key to configure.
 *
 * An ANTHROPIC_API_KEY in the environment would take precedence and bill per
 * token instead, so `env.ts` deliberately does not set one.
 */

const CREDENTIALS_PATH = join(homedir(), '.claude', '.credentials.json');

export function hasSubscriptionAuth(): boolean {
  return existsSync(CREDENTIALS_PATH);
}

export function authDescription(): string {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic-api-key';
  return hasSubscriptionAuth() ? 'claude-code-subscription' : 'none';
}

export const AUTH_HELP =
  'No Claude credentials found. Run `claude` once and sign in with your subscription, ' +
  'then restart the API. (Credentials are read from ~/.claude/.credentials.json.)';

/**
 * One model per kind of turn.
 *
 * Running everything on Opus measured at ~$0.058 a turn, which is ~$7 a month
 * for someone logging four meals a day — more than a €4 subscription nets after
 * VAT and the store's cut. Routing by turn kind is what makes the arithmetic
 * work, and it costs nothing in quality where quality is visible: the expensive
 * models stay on the rare turns.
 */
export interface ModelChoice {
  model: string;
  /**
   * Reasoning depth, where the model accepts it. Pinned rather than defaulted so
   * a Claude Code release cannot silently move the cost of every meal log.
   *
   * Omitted for Haiku: `effort` is rejected with a 400 on Haiku 4.5, so sending
   * it would break the highest-volume path in the app.
   */
  effort?: 'low' | 'medium' | 'high';
}

export const MODELS: Record<TurnKind, ModelChoice> = {
  // ~70% of turns. Structured extraction from a short sentence — a small model
  // does this well, at a fifth of Opus's price on both input and output.
  text_log: { model: 'claude-haiku-4-5' },
  // Needs high-resolution vision (2576px long edge) to read portion sizes.
  photo_log: { model: 'claude-sonnet-5', effort: 'medium' },
  // Once per account, and the first impression. Worth the better model.
  setup: { model: 'claude-sonnet-5', effort: 'high' },
  // Once a week. The only long-form writing in the product; cost is negligible.
  review: { model: 'claude-opus-5', effort: 'high' },
};

/** Back-compat for anything still asking for "the" model. */
export const MODEL = MODELS.text_log.model;

/** Tool-call round trips per turn. A meal log needs 2–3; the cap is a runaway guard. */
export const MAX_TURNS = 12;
