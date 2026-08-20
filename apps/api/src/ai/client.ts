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
 * The agent runs on a Claude Code subscription, so there is no per-token bill to
 * optimise against — but the subscription's rate limits are shared with your own
 * terminal usage, and a meal log competes with them. So the split is by where
 * capability actually pays: the frequent, well-specified turn takes Sonnet, and
 * the rare or genuinely hard ones take Opus.
 *
 * If this ever moves to a metered API key, revisit this table first — that is
 * where the economics live.
 */
export interface ModelChoice {
  model: string;
  /**
   * Reasoning depth. Pinned rather than defaulted so a Claude Code release
   * cannot silently move the cost and latency of every meal log.
   *
   * Optional because not every model accepts it — Haiku 4.5 rejects `effort`
   * with a 400. Nothing here uses Haiku today, but the provider omits the key
   * entirely when this is unset, so adding a cheaper tier later cannot break the
   * highest-volume path.
   */
  effort?: 'low' | 'medium' | 'high';
}

export const MODELS: Record<TurnKind, ModelChoice> = {
  // ~70% of turns, and the most predictable: turning "two eggs and toast" into
  // items with macros is structured extraction, not reasoning. Sonnet does it
  // well and leaves subscription headroom for everything else.
  text_log: { model: 'claude-sonnet-5', effort: 'high' },
  // The hardest task in the product — estimating a portion from plate and
  // cutlery cues. Opus 5's high-resolution vision is the point of paying here.
  photo_log: { model: 'claude-opus-5', effort: 'high' },
  // Once per account, and the first thing a new user experiences. It has to map
  // vague answers ("pretty active") onto enums without interrogating anyone.
  setup: { model: 'claude-opus-5', effort: 'high' },
  // Once a week. The only long-form writing in the product, and the one output
  // the user actually reads end to end.
  review: { model: 'claude-opus-5', effort: 'high' },
  // Reading a fridge photo. Cheaper than photo_log on purpose: the job is
  // naming what is on a shelf, not estimating how much of it is on a plate, and
  // the user confirms the list before a single recipe is built on it. If real
  // scans come back poor this is a one-word change.
  pantry_scan: { model: 'claude-sonnet-5', effort: 'high' },
  // The suggestions themselves. Occasional, read end to end, and the thing
  // people would actually pay for — so it goes where the review goes.
  recipe: { model: 'claude-opus-5', effort: 'high' },
};

/** Back-compat for anything still asking for "the" model. */
export const MODEL = MODELS.text_log.model;

/** Tool-call round trips per turn. A meal log needs 2–3; the cap is a runaway guard. */
export const MAX_TURNS = 12;

/**
 * Messages in one day before the agent session is rotated mid-day.
 *
 * The session is normally dropped at the day rollover, which caps an ordinary
 * day at roughly forty messages. This only catches the day that runs away —
 * without it a single very long conversation could still reach the context
 * window and trigger a compaction pass, which costs a model call and quietly
 * loses fidelity. Set well above a heavy day's logging so it never fires for
 * anyone using the product normally.
 */
export const MAX_SESSION_MESSAGES = 120;
