import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelChoice, TurnKind } from './providers/types.ts';

/**
 * Re-exported because this was where it lived. It now sits with the other
 * provider-facing types so `AgentRequest` can carry one without importing this
 * module back — see `AgentRequest.model`.
 */
export type { ModelChoice } from './providers/types.ts';

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
  // cutlery cues — and for a long time that argument alone kept it on Opus at
  // high effort, at six times the cost of a text log and no measurement behind
  // it.
  //
  // Measured, 2026-08-24: 30 plates from Nutrition5k (weighed on a scale, so
  // this is error rather than disagreement), 3 runs each, four configurations.
  //
  //   opus-5 high    kcal MAPE 70.3%   protein 53%   $0.0206/scan
  //   sonnet-5 high            66.1%           56%   $0.0121
  //   sonnet-5 none            65.8%           58%   $0.0119
  //   haiku-4.5                81.7%          126%   $0.0037
  //
  // Sonnet was better on 19 of 30 plates. The paired difference is 4.3pp in
  // Sonnet's favour with a 95% CI of [-4.7, +13.5], so what the test rules out
  // is an Opus advantage bigger than ~5pp — not a difference too small to see,
  // but a difference in the wrong direction to be worth 1.7x. The instrument
  // has resolution: it separates Haiku decisively on the same 30 plates, and
  // Haiku is why this is not `claude-haiku-4-5` — 126% protein error and it
  // returned `items` as a JSON *string* on 100% of calls.
  //
  // `effort` goes with it. High effort bought 0.3pp on Sonnet, which is noise,
  // and cost a second of latency on the one turn the user watches a spinner
  // through.
  //
  // What the same run showed is that model choice was never the lever here:
  // every configuration compresses toward a typical meal, over-reading small
  // plates by ~70-100% and under-reading large ones by ~50%, correlating with
  // the truth at only r≈0.4. That is what `PHOTO_ESTIMATION_PROMPT` addresses,
  // and it is worth more than any row in the table above.
  photo_log: { model: 'claude-sonnet-5' },
  // Once per account, and the first thing a new user experiences. It has to map
  // vague answers ("pretty active") onto enums without interrogating anyone.
  setup: { model: 'claude-opus-5', effort: 'high' },
  // Once a week. The only long-form writing in the product, and the one output
  // the user actually reads end to end.
  review: { model: 'claude-opus-5', effort: 'high' },
  // Reading a fridge photo. The job is naming what is on a shelf, not
  // estimating how much of it is on a plate, and the user confirms the list
  // before a single recipe is built on it. If real scans come back poor this is
  // a one-word change.
  //
  // This used to say "cheaper than photo_log on purpose". It is not any more —
  // photo_log came down to the same model on 2026-08-24 — and the `effort` here
  // now makes a fridge scan the dearer of the two. That is an inversion of the
  // argument above and it is left standing on purpose: high effort measured as
  // worthless for *portion estimation*, which is not this task, and enumerating
  // a shelf is where dropping it would plausibly start missing jars. Worth the
  // same 30-plate treatment before it is touched, rather than assumed either
  // way — assuming is what put photo_log on Opus for a year.
  pantry_scan: { model: 'claude-sonnet-5', effort: 'high' },
  // The suggestions themselves. Occasional, read end to end, and the thing
  // people would actually pay for — which is the argument that kept this on
  // Opus, and it is the same argument `photo_log` was on Opus for.
  //
  // Measured, 2026-08-24: 12 pantry scenarios x 3 runs. There is no weighed
  // ground truth for "is this a good recipe", so this scores the rules
  // `RECIPE_SYSTEM_PROMPT` itself states — fit the budget, two missing
  // ingredients at most, never mark a staple missing, hard dietary limits are
  // absolute — plus Atwater consistency, which checks each ingredient's
  // calories against its own macros (4p + 4c + 9f).
  //
  //                 budget overshoot   Atwater err   diet/allergy   $/recipe
  //   opus-5 high         64%             4.9%            0          $0.0401
  //   sonnet-5 high       40%             5.4%            0          $0.0169
  //   sonnet-5 none       45%             5.0%            1          $0.0166
  //
  // Sonnet at high effort matched Opus on arithmetic (+0.43pp, CI [-0.64,
  // +1.42] — nothing) and beat it on the rule the prompt states most plainly:
  // Opus overshot the day's remaining calories on 64% of recipes, Sonnet on
  // 40%, a 13.6pp paired difference with CI [-20.2, -7.1]. "A meal that
  // overshoots is a worse answer than a smaller one" is in the prompt, and the
  // cheaper model was following it more often.
  //
  // **The effort stays, and that is the whole reason it was tested separately.**
  // It is worth 0.3c a recipe and it is the difference between zero dietary
  // failures and one: `sonnet-none` put peanut butter in a vegan recipe for an
  // account with a nut allergy on file. One failure in 33 is a thin sample, but
  // the asymmetry is not thin — an allergy violation is the worst output this
  // product can produce, and the insurance costs nothing. This is also the
  // opposite of the `photo_log` result, where high effort bought nothing, which
  // is exactly why "the photo answer generalises" was not assumed here.
  recipe: { model: 'claude-sonnet-5', effort: 'high' },
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
  //
  // **Deliberately not moved with `recipe`, and this is a decision rather than
  // an oversight.** The two share this file's prompt and its tool, so it is
  // tempting to carry the measurement across — but the recipe test asked for
  // one dish and a plan is seven that have to differ from each other, share a
  // single shop, and put the batch-cooked one on the right night. None of those
  // constraints existed in what was measured, and they are precisely the kind
  // that degrade quietly rather than visibly. Assuming a nearby result carries
  // is what put both of these on Opus in the first place. It wants its own 12
  // scenarios before it moves.
  meal_plan: { model: 'claude-opus-5', effort: 'high' },
};

/**
 * What a journal turn runs on when it is written in a language Haiku 4.5 does
 * not write well. See `ai/language.ts` for the measurements behind the list.
 *
 * Sonnet 5 rather than Opus because the deficit is vocabulary and grammar, not
 * reasoning — the task is the same structured extraction it always was — and
 * `effort: 'low'` for the same reason. The commit that moved this path to Haiku
 * did so partly because Sonnet at high effort was spending ~755 output tokens a
 * turn to emit ~150 tokens of reply; none of that reasoning was what made the
 * English replies good, and re-tested on the eight languages that failed, low
 * effort came back clean. That keeps an escalated turn at ~3.2x a Haiku one
 * rather than the ~4.1x the old high-effort configuration cost.
 *
 * This is the first dial to turn if the escalated replies disappoint: raising
 * the effort is a one-word change and roughly a cent a turn.
 */
export const TEXT_LOG_UNSUPPORTED_LANGUAGE: ModelChoice = {
  model: 'claude-sonnet-5',
  effort: 'low',
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
