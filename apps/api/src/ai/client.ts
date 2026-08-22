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
   * with a 400, and `text_log` now runs on Haiku, so this is load-bearing
   * rather than hypothetical: the provider omits the key entirely when this is
   * unset, and setting it on the text path would 400 every meal log.
   */
  effort?: 'low' | 'medium' | 'high';
}

export const MODELS: Record<TurnKind, ModelChoice> = {
  // ~70% of turns, and the most predictable: turning "two eggs and toast" into
  // items with macros is structured extraction, not reasoning. This is the
  // highest-volume path in the product and therefore the one that decides
  // whether the unit economics work, so it runs on the cheapest model that can
  // do the job: Haiku 4.5 at $1/$5, a third of Sonnet.
  //
  // Deliberately no `effort`. Haiku 4.5 is the one model in the line-up that
  // *rejects* the parameter with a 400 — see `ModelChoice.effort` — and it does
  // no thinking unless thinking is explicitly enabled, which is exactly what is
  // wanted here. On Sonnet at high effort this path was spending ~755 output
  // tokens a turn to emit ~150 tokens of reply and one tool call; 91% of that
  // was reasoning nobody reads, on a task that is not a reasoning task.
  text_log: { model: 'claude-haiku-4-5' },
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
  // Two sentences, from stats that were computed before the call. There is no
  // reasoning to do here and no long-form writing — the hard part was deciding
  // to send it at all, and that happened in SQL. Sonnet, and it would be waste
  // to spend more: this runs unprompted, so its cost is the app's, not a
  // request somebody chose to make.
  nudge: { model: 'claude-sonnet-5', effort: 'high' },
  // A week of dinners in one run, and the largest output the product produces.
  // Where the review goes, for the same reason: it is read end to end, it is
  // the thing people would pay for, and the constraint that makes it good —
  // seven dishes that vary, share a shop and land a batch on the right night —
  // is exactly the kind a smaller model drops halfway through.
  meal_plan: { model: 'claude-opus-5', effort: 'high' },
};

/** Back-compat for anything still asking for "the" model. */
export const MODEL = MODELS.text_log.model;

/** Tool-call round trips per turn. A meal log needs 2–3; the cap is a runaway guard. */
export const MAX_TURNS = 12;

/**
 * Output ceiling for one model call on the direct Messages API, which — unlike
 * the Agent SDK — requires the caller to name one.
 *
 * A runaway guard rather than a budget: nothing here wants to be truncated, so
 * it sits well above the longest thing the product produces (a weekly review,
 * or seven dinners and their shop, both comfortably under 6k) and well below
 * every model's cap — Haiku 4.5 tops out at 64k and the rest at 128k. It also
 * stays under the ceiling where the SDK insists on streaming to avoid an HTTP
 * timeout — which still matters, because streaming is a property of the *turn*
 * and the unwatched paths are the long ones: a weekly review, a week of dinners.
 * The journal turn is the one that streams.
 *
 * Raising it costs nothing until it is actually reached: `max_tokens` is a
 * ceiling, not a reservation, and is neither billed nor thought about unless
 * the model runs into it.
 */
export const MAX_OUTPUT_TOKENS = 16_000;

/**
 * Messages in one day before the agent session is rotated mid-day.
 *
 * The session is normally dropped at the day rollover, which caps an ordinary
 * day at roughly forty messages. This only catches the day that runs away —
 * without it a single very long conversation could still reach the context
 * window and trigger a compaction pass, which costs a model call and quietly
 * loses fidelity.
 *
 * 60 rather than 120 because `text_log` moved to Haiku 4.5, whose context
 * window is 200K rather than the 1M the rest of the line-up has. Two rows land
 * in `chat_messages` per turn, so this is ~30 turns; production transcripts
 * grow about 5k tokens a turn, which puts the ceiling near 150k — headroom,
 * where 120 would have been ~270k and over the limit on a heavy day.
 *
 * Rotating early is also the cheap direction: a fresh session drops the
 * accumulated transcript, and today's numbers and entry ids arrive on every
 * turn regardless, so almost nothing is lost with it.
 */
export const MAX_SESSION_MESSAGES = 60;
