import { queryOne } from '../db.ts';
import type { TurnKind } from './providers/types.ts';

/**
 * Admission control in tokens per minute, in front of the metered lane.
 *
 * `CHAT_LIMIT` counts requests per account per hour, which is the right shape
 * for stopping one abusive account and the wrong shape for protecting an
 * org-wide token ceiling: a photo turn and a text turn differ by an order of
 * magnitude in tokens and a request counter cannot tell them apart. Forty turns
 * an hour is a modest allowance in text and a large one in photographs.
 *
 * This is lane-specific and lives here rather than in `runTurn` for that
 * reason. The ceiling it protects is the API key's input-tokens-per-minute
 * limit, which only the `anthropic-api` provider has: the subscription lane
 * shares a budget with a signed-in terminal, which is a real constraint but not
 * this one, and the OpenAI lane answers to a different vendor entirely. Taxing
 * either of them with a bucket sized against Anthropic's tiers would be a cost
 * with no ceiling behind it.
 *
 * The bucket is off unless `ANTHROPIC_ITPM` is set, and off is what a personal
 * install wants — one person cannot outrun a per-minute token limit, and a
 * limiter with a number nobody chose is worse than none. It is what the
 * deployment that starts paying per token should set on the same day it sets
 * `ANTHROPIC_API_KEY`.
 */

/**
 * How much of the published limit this bucket will actually spend.
 *
 * The remaining fifth absorbs what the estimates below cannot see: another
 * process on the same key, a retry the SDK made on our behalf, and the gap
 * between a turn's reservation and what it really read. Governing right up to
 * the ceiling would mean discovering every one of those as a 429.
 */
export const HEADROOM = 0.8;

/**
 * What one turn is expected to put on the meter, per kind.
 *
 * These are *counted* tokens rather than gross ones, and the difference is
 * roughly fourfold. A journal turn reads about 24k input tokens, but ~18k of
 * that is the cached prefix re-read on each of its two or three model calls,
 * and cache reads are excluded from ITPM outright — what counts is
 * `input_tokens + cache_creation_input_tokens`. See §"The question that moved
 * the plan" in SCALING.md; the ~6k below is that section's own figure for the
 * volatile remainder of a text log.
 *
 * A constant per kind rather than `messages.count_tokens`, for two reasons.
 * The endpoint reports the gross figure and has no way to know which of it will
 * come back as a cache read, so admitting against it would govern to a quarter
 * of the real capacity — the pessimism would be invisible and would look like a
 * ceiling being hit. And it is a round trip of its own, on the front of a path
 * somebody is watching.
 *
 * They only have to be roughly right, because every turn settles up against
 * what it actually spent — see `settle`. An estimate that is too low is repaid
 * out of the same minute's capacity; one that is too high is refunded the
 * moment the turn ends. What they buy is that the *first* turn of a burst is
 * admitted against something better than zero.
 *
 * Worth re-deriving from real traffic rather than trusting forever: `ai_usage`
 * records `input_tokens` and `cache_write_tokens` per kind, and their sum per
 * turn is exactly the quantity estimated here.
 */
export const TURN_INPUT_TOKENS: Record<TurnKind, number> = {
  // The measured figure. ~70% of turns, so it is the one that has to be right.
  text_log: 6_000,
  // The same volatile context, plus an image — which sits after the cache
  // breakpoint and is therefore uncached input on every model call in the turn,
  // not once.
  photo_log: 12_000,
  // A text turn carrying the onboarding block, which is per-account and so
  // rides on the uncached half of the system prompt.
  setup: 8_000,
  // One call, no tools worth speaking of, and a week of the journal in front of
  // it.
  review: 15_000,
  // A fridge photo and little else: no day context, no transcript.
  pantry_scan: 8_000,
  // The pantry, the preferences and the library, across several calls.
  recipe: 20_000,
  // Two sentences from stats that were computed in SQL before the call.
  nudge: 4_000,
  // The largest thing the product asks for, and the largest context behind it.
  meal_plan: 30_000,
};

/**
 * Kinds where waiting for capacity is better than failing.
 *
 * The rest are refused immediately and deliberately, on the same grounds the
 * turn lease refuses a double-tapped send: somebody is watching the screen, and
 * a queue moves the wait rather than removing it. These two are the scheduler's
 * — the Monday review pass and the nudge pass — where nobody is waiting on a
 * response and the alternative to a short wait is a review that is simply never
 * written. A pass that walks every user is also the one thing in this product
 * that can empty a bucket by itself.
 */
const UNWATCHED: ReadonlySet<TurnKind> = new Set<TurnKind>(['review', 'nudge']);

/**
 * How long an unwatched turn will wait before giving up.
 *
 * A full bucket is one minute of capacity, so a wait longer than this is not a
 * queue that is about to clear — it is a deployment genuinely over its ceiling,
 * and the right answer is to stop rather than to hold a scheduler pass open
 * behind a job lock. The pass runs again on the next tick.
 */
const MAX_WAIT_MS = 60_000;

/** How often a waiting turn re-checks. Coarse: nothing is watching the clock. */
const POLL_MS = 1_000;

/**
 * Raised when the model's per-minute token budget is spent.
 *
 * Distinct from an ordinary failure, because the right answer is "come back in
 * a moment" rather than "something went wrong" — the caller turns it into a 429
 * with a `retry-after`, exactly as it does for the turn lease, rather than the
 * 502 every other provider error becomes.
 */
export class ModelBusyError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Too many messages right now. Try again in ${retryAfterSeconds} seconds.`);
    this.name = 'ModelBusyError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * A turn's claim on the bucket, to be settled when it ends.
 *
 * Opaque on purpose: the caller's only job is to hand it back to `settle` with
 * what the turn really spent.
 */
export interface Reservation {
  model: string;
  tokens: number;
}

interface Limits {
  /** Applies to any model not named individually. Null means no bucket. */
  fallback: number | null;
  byModel: Map<string, number>;
}

/**
 * `ANTHROPIC_ITPM`, in the two forms a deployment actually has.
 *
 * A bare number is the limit for every model — each still gets its own bucket,
 * because the ceiling itself is per model and one counter across all of them
 * would let a Monday review pass throttle the meal logs. Comma-separated
 * `model:tokens` pairs name them individually, which is what a tier table looks
 * like once the line-up spans Haiku and Opus. The two combine: a bare number
 * among the pairs is the default for everything the pairs did not mention.
 *
 * Anything unparseable is ignored rather than thrown on. This is read on the
 * turn path, and a typo in an optional variable must not be how the journal
 * stops working — the failure it causes is a limiter that does not limit, which
 * is the same failure as not setting it at all.
 */
export function parseLimits(raw: string): Limits {
  const limits: Limits = { fallback: null, byModel: new Map() };

  for (const part of raw.split(',')) {
    const entry = part.trim();
    if (!entry) continue;

    const split = entry.lastIndexOf(':');
    if (split === -1) {
      const value = Number(entry);
      if (Number.isFinite(value) && value > 0) limits.fallback = value;
      continue;
    }

    const model = entry.slice(0, split).trim();
    const value = Number(entry.slice(split + 1).trim());
    if (model && Number.isFinite(value) && value > 0) limits.byModel.set(model, value);
  }

  return limits;
}

/**
 * Parsed once per distinct value rather than per turn, and keyed on the raw
 * string so that changing the variable still takes effect — which is mostly a
 * courtesy to the test suite, the same one `clientFor` extends in
 * `providers/messages.ts`.
 */
let parsed: { raw: string; limits: Limits } | null = null;

/** The per-minute token ceiling for one model, or null when ungoverned. */
export function limitFor(model: string, source: NodeJS.ProcessEnv = process.env): number | null {
  const raw = source.ANTHROPIC_ITPM?.trim() ?? '';
  if (!raw) return null;
  if (parsed?.raw !== raw) parsed = { raw, limits: parseLimits(raw) };
  return parsed.limits.byModel.get(model) ?? parsed.limits.fallback;
}

/**
 * Takes this turn's tokens out of the model's bucket, or says when to come back.
 *
 * Per turn rather than per model call, which is the one design decision here
 * worth stating. A turn is two or three round trips with tool writes in
 * between, so a check in front of each call could refuse the third one — after
 * the meal was logged and before the sentence saying so was written. Reserving
 * the whole turn up front means the only possible refusal happens before
 * anything has been done, which is the only refusal that costs nothing.
 *
 * Returns null when the bucket is off, which is also the signal that there is
 * nothing to settle afterwards.
 */
export async function reserve(model: string, kind: TurnKind): Promise<Reservation | null> {
  const limit = limitFor(model);
  if (limit === null) return null;

  const capacity = limit * HEADROOM;
  const perSecond = capacity / 60;
  /*
   * Clamped to the capacity so a bucket smaller than one turn cannot wedge.
   * That is a misconfiguration — a ceiling below the cost of the cheapest
   * thing the product does — and the best available behaviour is to admit one
   * turn at a time from a full bucket rather than to refuse every turn forever
   * with a message about seconds that will never be enough.
   */
  const tokens = Math.min(TURN_INPUT_TOKENS[kind], capacity);
  const deadline = Date.now() + MAX_WAIT_MS;

  for (;;) {
    if (await take(model, capacity, perSecond, tokens)) return { model, tokens };

    const wait = await waitSeconds(model, capacity, perSecond, tokens);
    if (!UNWATCHED.has(kind) || Date.now() + wait * 1000 > deadline) {
      throw new ModelBusyError(Math.max(1, Math.ceil(wait)));
    }
    await sleep(Math.min(Math.max(wait * 1000, POLL_MS), deadline - Date.now()));
  }
}

/**
 * One atomic refill-and-debit.
 *
 * A single statement, so the read and the write cannot be separated by another
 * replica — the same property `turn-lock.ts` needs and gets the same way. The
 * refill is computed rather than stored: `tokens` is the balance as of
 * `refilled_at`, and every reader brings it forward, so there is no ticker to
 * run and no process whose death stops the bucket from filling.
 *
 * The `WHERE` on the upsert is what makes it admission control rather than
 * accounting. When the refilled balance is short, no row is touched and nothing
 * is returned — a rejected turn leaves the bucket exactly as it found it, which
 * is what stops a queue of refusals from digging the hole deeper.
 */
async function take(
  model: string,
  capacity: number,
  perSecond: number,
  tokens: number,
): Promise<boolean> {
  const row = await queryOne<{ tokens: number }>(
    /*
     * Every parameter is cast explicitly. Postgres has no type to infer for a
     * bare placeholder in an expression like `$2 - $4` and rejects the
     * statement as ambiguous rather than guessing — which is the right
     * behaviour, and an easy one to meet halfway.
     */
    `INSERT INTO model_token_buckets AS b (model, tokens, refilled_at)
          VALUES ($1, $2::float8 - $4::float8, now())
     ON CONFLICT (model) DO UPDATE
            SET tokens = LEAST(
                  $2::float8,
                  b.tokens + EXTRACT(EPOCH FROM (now() - b.refilled_at)) * $3::float8
                ) - $4::float8,
                refilled_at = now()
          WHERE LEAST(
                  $2::float8,
                  b.tokens + EXTRACT(EPOCH FROM (now() - b.refilled_at)) * $3::float8
                ) >= $4::float8
      RETURNING b.tokens`,
    [model, capacity, perSecond, tokens],
  );
  return row !== null;
}

/**
 * How long until the bucket holds enough, in seconds.
 *
 * A second round trip, taken only on the path that was already refused, where
 * one more query costs nothing anyone will notice. The answer can be stale by
 * the time it is read — another replica may take the capacity first — but it is
 * only ever used to say "try again in about N seconds", and a number from the
 * bucket itself is a far better answer than one invented here.
 */
async function waitSeconds(
  model: string,
  capacity: number,
  perSecond: number,
  tokens: number,
): Promise<number> {
  const row = await queryOne<{ wait: number }>(
    `SELECT GREATEST(
              0,
              $4::float8 - LEAST(
                $2::float8,
                tokens + EXTRACT(EPOCH FROM (now() - refilled_at)) * $3::float8
              )
            ) / $3::float8 AS wait
       FROM model_token_buckets
      WHERE model = $1`,
    [model, capacity, perSecond, tokens],
  );
  return row ? Number(row.wait) : 0;
}

/**
 * Settles a reservation against what the turn actually read.
 *
 * This is what keeps the estimates above from having to be right. `spent` is
 * the turn's counted total — uncached input plus cache writes, summed over
 * every model call it made — so a turn that reserved 6k and read 9k gives back
 * a 3k debt, and one that failed before it called anything gives back the whole
 * reservation. The bucket therefore tracks real consumption within one turn's
 * error, whatever the constants say.
 *
 * The debt is floored at a full bucket, so a single wild turn cannot lock the
 * model out for longer than the minute it takes to refill.
 *
 * Never throws. It runs on the way out of a turn whose result the caller is
 * already holding, and a bucket that failed to balance is not a reason to lose
 * a reply that was written — the next refill corrects it either way.
 */
export async function settle(reservation: Reservation | null, spent: number): Promise<void> {
  if (!reservation) return;

  const limit = limitFor(reservation.model);
  if (limit === null) return;

  const capacity = limit * HEADROOM;
  const perSecond = capacity / 60;
  const adjustment = reservation.tokens - spent;

  try {
    await queryOne(
      `UPDATE model_token_buckets
          SET tokens = GREATEST(
                -$2::float8,
                LEAST(
                  $2::float8,
                  tokens + EXTRACT(EPOCH FROM (now() - refilled_at)) * $3::float8
                ) + $4::float8
              ),
              refilled_at = now()
        WHERE model = $1`,
      [reservation.model, capacity, perSecond, adjustment],
    );
  } catch {
    // Deliberately swallowed. See the note above.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
