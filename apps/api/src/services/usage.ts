import { query, queryOne } from '../db.ts';
import { anthropicRate, openAiRate, priceUsage, round6 } from '../ai/pricing.ts';
import { MODELS } from '../ai/client.ts';
import type { ProviderId } from '../ai/providers/index.ts';
import type { CostSource, Outcome, TurnKind } from '../ai/providers/types.ts';
import { limitsFor, meterFor } from './plans.ts';
import { photoCreditBalance, spendPhotoCredit } from './credits.ts';
import type { Allowance, MeterName, PlanName } from '@ct/shared';

/**
 * Recording and reading what the AI layer costs.
 *
 * The recording half is deliberately unconditional and non-throwing: every turn
 * writes a row, including the ones that failed, and a write that fails must not
 * take the turn down with it. Cost accounting that can break the product it is
 * measuring gets turned off, and then there is no accounting.
 */

export interface RecordUsageInput {
  userId: string;
  kind: TurnKind;
  outcome: Outcome;
  /**
   * Which lane actually ran the turn, which is no longer the same question as
   * which lane the deployment is configured for.
   *
   * This used to be read off `providerId()` at insert time, and that was
   * correct for exactly as long as a deployment had one lane. It stopped being
   * correct the day `SUBSCRIPTION_EMAILS` arrived and did not announce it: every
   * subscription-lane turn was filed under `anthropic-api`, silently, and the
   * cost column went on mixing money that was really billed with money that a
   * subscription had already covered. Nothing broke, which is why it took a
   * person asking "did my turn use the subscription?" to find it.
   *
   * Required rather than defaulted for that reason. A caller that forgets it is
   * a compile error now, instead of a plausible-looking row.
   */
  provider: ProviderId;
}

/**
 * How many turns of a kind this account has run recently.
 *
 * The route limiter cannot see a recipe run started from inside a journal tool
 * — it counts requests to `/recipes/suggest`, and this one never goes there. So
 * the ceiling is enforced against the cost ledger instead, which is the more
 * honest instrument anyway: it counts what was actually spent rather than what
 * was asked for, and it already records every run from every entry point.
 *
 * A rolling window rather than a calendar day, because there is no timezone
 * involved and "three in the last day" is what a person means by the limit.
 */
export async function turnsInLastDay(userId: string, kind: TurnKind): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM ai_usage
      WHERE user_id = $1 AND kind = $2 AND occurred_at > now() - interval '1 day'`,
    [userId, kind],
  );
  return Number(row?.n ?? 0);
}

/**
 * The same count over a week. For the ceilings that are weekly rather than
 * daily, which so far means the meal plan — a rolling window rather than a
 * calendar week, so nobody gets two plans by asking on Sunday night and again
 * on Monday morning.
 */
/**
 * When the oldest run still inside the window falls out of it.
 *
 * The ceiling is a rolling twenty-four hours, not a calendar day, so "resets at
 * midnight" would be a lie — and a specific lie is worse than a vague truth,
 * because somebody comes back at midnight and finds nothing. What actually
 * happens is that the earliest run ages out, and this is when.
 *
 * Null when nothing is in the window, which means nothing is waiting.
 */
export async function oldestTurnInLastDay(
  userId: string,
  kind: TurnKind,
): Promise<Date | null> {
  const row = await queryOne<{ at: Date | null }>(
    `SELECT min(occurred_at) AS at FROM ai_usage
      WHERE user_id = $1 AND kind = $2 AND occurred_at > now() - interval '1 day'`,
    [userId, kind],
  );
  return row?.at ? new Date(row.at) : null;
}

/**
 * The turn kinds each sold meter is counted over.
 *
 * `chat` covers `setup` as well as `text_log`. Nothing runs a setup turn any
 * more — the profile questions are a form now — but the rows written while it
 * was a conversation are still in `ai_usage`, and a lifetime allowance that
 * stopped counting them would quietly hand somebody back turns they had
 * already spent.
 *
 * `photo_log` is deliberately *not* in `chat`, despite being a journal turn
 * through the same route. It is metered on its own because it costs six times
 * as much, and a meter that averages the two would price neither.
 */
const METER_KINDS: Record<MeterName, TurnKind[]> = {
  chat: ['text_log', 'setup'],
  photo: ['photo_log'],
  pantry_scan: ['pantry_scan'],
  recipe: ['recipe'],
  meal_plan: ['meal_plan'],
};

/**
 * How many turns of these kinds this account has run inside the window.
 *
 * `null` days means all of time, which is what a lifetime allowance needs. The
 * free tier is built out of those, so this is not an edge case — it is the
 * common path for the majority of accounts.
 *
 * The index added in `034` is what makes the monthly form affordable: it runs
 * *before* the turn rather than after, so unlike the cost rollups it is latency
 * somebody is standing there waiting for.
 */
export async function turnsInWindow(
  userId: string,
  kinds: TurnKind[],
  days: number | null,
): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM ai_usage
      WHERE user_id = $1 AND kind = ANY($2::text[])
        AND ($3::int IS NULL OR occurred_at > now() - ($3 || ' days')::interval)`,
    [userId, kinds, days],
  );
  return Number(row?.n ?? 0);
}

/**
 * What is left of one meter, for a screen that has to say so *before* the
 * button is pressed.
 *
 * The ceiling was only ever discovered by hitting it: the client had no way to
 * ask, so a spent account got an enabled button, a request, and a toast that
 * slid away — which reads as the button being broken rather than as a limit
 * being reached. Nothing about the number is secret, and a limit you can see is
 * a feature of the plan rather than a trap in the interface.
 *
 * A month is a rolling thirty days, not a calendar one, for the same reason the
 * daily ceilings are rolling: there is no billing period to anchor to yet, and
 * a rolling window has no cliff — the allowance comes back a turn at a time
 * instead of all at once on a date the user has to remember. When Stripe
 * arrives and there *is* a period, this is the one function that has to learn
 * about it.
 */
export async function allowanceFor(
  userId: string,
  plan: PlanName,
  meter: MeterName,
  unmetered = false,
): Promise<Allowance> {
  const { allowed, period, unlimited } = meterFor(plan, meter, unmetered);
  const kinds = METER_KINDS[meter];

  /*
   * Bought scans, which sit outside the plan entirely.
   *
   * Only photos are sold this way — see `PHOTO_BUNDLES` — so every other meter
   * skips the query rather than paying for a sum that is always zero. It is
   * read even when the monthly grant still has room, because a screen that has
   * to say "10 left this month, plus 12 you bought" needs both halves before
   * the button is pressed, not after.
   */
  const credits = meter === 'photo' ? await photoCreditBalance(userId) : 0;

  /*
   * Nobody is billed for this account's turns, so there is nothing to count and
   * no window to count it in. `used` is zero because no count was run, not
   * because none happened — the ledger still records every turn, which is the
   * only way a subscription's consumption is visible at all.
   *
   * After the credit balance rather than before it: bought scans are stock this
   * person owns, and a settings screen that reported none because they happen
   * to be unmetered would be wrong about something they paid for. They are
   * simply never spent — `requireAllowance` returns above the line that would.
   */
  if (unlimited) {
    return { meter, allowed: null, unlimited: true, used: 0, period, resets_at: null, credits };
  }

  // A meter the plan does not carry at all. No count is run: the answer does
  // not depend on it, and this is on the hot path.
  if (allowed === null) {
    return { meter, allowed: null, unlimited: false, used: 0, period, resets_at: null, credits };
  }

  const days = period === 'month' ? 30 : null;
  const used = await turnsInWindow(userId, kinds, days);
  if (used < allowed || period === 'ever') {
    return { meter, allowed, unlimited: false, used, period, resets_at: null, credits };
  }

  // Spent, and on a window that moves. When the oldest run still inside it
  // falls out is when one comes back — which is a truthful thing to say, and
  // "resets on the 1st" would not be.
  const row = await queryOne<{ at: Date | null }>(
    `SELECT min(occurred_at) AS at FROM ai_usage
      WHERE user_id = $1 AND kind = ANY($2::text[])
        AND occurred_at > now() - interval '30 days'`,
    [userId, kinds],
  );
  return {
    meter,
    allowed,
    unlimited: false,
    used,
    period,
    resets_at: row?.at ? new Date(new Date(row.at).getTime() + 30 * 86_400_000).toISOString() : null,
    credits,
  };
}

/**
 * Raised when an account has spent a meter.
 *
 * A typed error rather than a boolean return, because every caller has to react
 * to it and none of them can sensibly carry on: a route answers 402, and a
 * journal tool tells the model to say so and answer from the log instead.
 *
 * 402 rather than 429, and the distinction matters to the client: 429 means
 * come back later, 402 means this is what your plan is. The phone shows a
 * paywall for one and a retry for the other.
 */
export class PlanLimitError extends Error {
  constructor(readonly allowance: Allowance) {
    super(sentenceFor(allowance));
    this.name = 'PlanLimitError';
  }
}

/**
 * What the wall actually says.
 *
 * One sentence, in the second person, naming the number. `SUBSCRIPTIONS.md` is
 * right that this is a product surface rather than an error state — it is the
 * screen that earns the revenue — so the words live next to the accounting
 * rather than being assembled at four call sites.
 */
function sentenceFor({ meter, allowed, period }: Allowance): string {
  const thing: Record<MeterName, [string, string]> = {
    chat: ['message', 'messages'],
    photo: ['photo scan', 'photo scans'],
    pantry_scan: ['fridge scan', 'fridge scans'],
    recipe: ['recipe', 'recipes'],
    meal_plan: ['meal plan', 'meal plans'],
  };
  const [one, many] = thing[meter];

  if (allowed === null) return `Your plan does not include ${many}.`;
  const noun = allowed === 1 ? one : many;

  /*
   * Photos are the one meter you can buy more of without changing plan, so
   * theirs is the one sentence that ends in an offer rather than a date. Said
   * here and not in the client for the reason the rest of this function is
   * here: a wall that advertises a bundle the server has stopped selling is a
   * dead end with a button on it.
   */
  const more = meter === 'photo' ? ' You can add more without changing plan.' : '';

  /*
   * The journal's door, and it is said on both periods rather than only on the
   * lifetime one.
   *
   * It used to hang off `period === 'ever'`, which read as a sentence about
   * chat because chat was the only lifetime grant with a fallback. It was
   * really a sentence about the *meter*: manual entry, repeat and barcode are
   * what is left when the model is gone, and that does not stop being true
   * because the grant now comes back in thirty days. Free chat moving to a
   * month would otherwise have silently deleted rule 2 in `plan-copy.ts` —
   * never end on the refusal — from the most-hit wall in the product.
   */
  const open = meter === 'chat' ? ' Typing a meal in is still unlimited.' : '';

  return period === 'ever'
    ? `That is your ${allowed} free ${noun}.${open}${more}`
    : `That is all ${allowed} ${noun} for this month.${open}${more}`;
}

/**
 * The gate itself. Throws when the meter is spent, returns what is left when it
 * is not, so a caller that wants to show the remainder does not count twice.
 */
export async function requireAllowance(
  userId: string,
  plan: PlanName,
  meter: MeterName,
  unmetered = false,
): Promise<Allowance> {
  const allowance = await allowanceFor(userId, plan, meter, unmetered);
  // No ceiling, so nothing to be past. Ahead of the comparison because a null
  // `allowed` reads as "not on this plan" to the line below, and on this
  // account it means the opposite.
  if (allowance.unlimited) return allowance;
  if (allowance.allowed !== null && allowance.used < allowance.allowed) return allowance;

  /*
   * The month's grant is gone. Bought scans are what stands between here and
   * the wall, and they are spent at *permission* time rather than after the
   * turn succeeds.
   *
   * That looks harsh and it is the consistent choice: a failed turn already
   * counts against the monthly meter, because `recordUsage` writes a row for
   * every turn including the ones that failed and `turnsInWindow` counts rows
   * rather than successes. Spending a credit only on success would make the
   * two halves of the same allowance behave differently — bought scans
   * quietly more forgiving than granted ones — which is the sort of difference
   * nobody can predict from the outside and everybody notices once.
   *
   * `spendPhotoCredit` re-checks the balance inside its own statement, so two
   * photo turns racing for the last credit cannot both win. A false return is
   * the wall, not an error.
   */
  if (allowance.credits > 0 && (await spendPhotoCredit(userId))) {
    return { ...allowance, credits: allowance.credits - 1 };
  }

  throw new PlanLimitError(allowance);
}

export async function turnsInLastWeek(userId: string, kind: TurnKind): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM ai_usage
      WHERE user_id = $1 AND kind = $2 AND occurred_at > now() - interval '7 days'`,
    [userId, kind],
  );
  return Number(row?.n ?? 0);
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const { outcome } = input;
  const usage = outcome.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const model = outcome.model ?? MODELS[input.kind].model;

  let costUsd = outcome.costUsd;
  let costSource: CostSource = outcome.costSource ?? 'unknown';

  // The provider is the better authority when it priced the turn itself. When
  // it did not — or priced it at zero while plainly having done work — fall
  // back to the rate card, so the row carries a number rather than a blank.
  if (costSource !== 'reported' || costUsd === 0) {
    const estimated = estimateCost(model, usage, outcome.cacheWriteMultiplier);
    if (estimated !== null) {
      costUsd = estimated;
      costSource = 'estimated';
    }
  }

  try {
    await query(
      `INSERT INTO ai_usage (
         user_id, provider, kind, model,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         cost_usd, cost_source, duration_ms, num_turns, ok, error, breakdown
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        input.userId,
        input.provider,
        input.kind,
        model,
        Math.round(usage.inputTokens),
        Math.round(usage.outputTokens),
        Math.round(usage.cacheReadTokens),
        Math.round(usage.cacheWriteTokens),
        round6(costUsd),
        costSource,
        outcome.durationMs ?? null,
        outcome.numTurns ?? 0,
        !outcome.error,
        outcome.error ?? null,
        usage.byModel ? JSON.stringify(usage.byModel) : null,
      ],
    );
  } catch {
    // Deliberately swallowed. See the note at the top of the file.
  }
}

/**
 * Rate-card price for a turn, or null when no rate applies to that model.
 *
 * `cacheWriteMultiplier` comes from the provider that ran the turn, because
 * what a cache write costs depends on the TTL it was written at and only the
 * writer knows which it asked for. Left unset it falls back to the rate card's
 * default, which is the one-hour TTL the Agent SDK takes.
 */
export function estimateCost(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
  cacheWriteMultiplier?: number,
): number | null {
  const rate = anthropicRate(model) ?? openAiRate();
  return rate ? priceUsage(usage, rate, cacheWriteMultiplier) : null;
}

// ---- Reading ----------------------------------------------------------------

export interface CostTotals {
  turns: number;
  failed_turns: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  /** Median-ish: the mean is dragged around by one photo turn in a small window. */
  avg_cost_usd: number;
  p95_duration_ms: number | null;
  /** Distinct accounts that spent anything in the window. */
  active_users: number;
}

/**
 * The shape every aggregate below returns. A `count(*)` query always produces
 * exactly one row, and every summed column is COALESCEd in SQL, so these are
 * guaranteed present — which is why nothing downstream re-checks them.
 */
interface TotalsRow {
  turns: number;
  failed_turns: number;
  cost_usd: number;
  input_tokens: string;
  output_tokens: string;
  cache_read_tokens: string;
  cache_write_tokens: string;
  avg_cost_usd: number;
  /** Null only when no turn in the window recorded a duration. */
  p95_duration_ms: number | null;
  active_users: number;
}

const TOTALS_SELECT = `
  count(*)::int                                      AS turns,
  count(*) FILTER (WHERE NOT ok)::int                AS failed_turns,
  COALESCE(sum(cost_usd), 0)::float8                 AS cost_usd,
  COALESCE(sum(input_tokens), 0)::bigint             AS input_tokens,
  COALESCE(sum(output_tokens), 0)::bigint            AS output_tokens,
  COALESCE(sum(cache_read_tokens), 0)::bigint        AS cache_read_tokens,
  COALESCE(sum(cache_write_tokens), 0)::bigint       AS cache_write_tokens,
  COALESCE(avg(cost_usd), 0)::float8                 AS avg_cost_usd,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_duration_ms,
  count(DISTINCT user_id)::int                       AS active_users
`;

export async function costTotals(days: number): Promise<CostTotals> {
  const row = await queryOne<TotalsRow>(
    `SELECT ${TOTALS_SELECT} FROM ai_usage WHERE occurred_at >= now() - ($1 || ' days')::interval`,
    [days],
  );
  return normaliseTotals(row!);
}

export interface CostByKind extends CostTotals {
  kind: string;
  model: string;
}

/**
 * The unit-economics table: one row per (kind, model). This is where the model
 * routing in `ai/client.ts` either pays for itself or does not — a photo turn
 * costing thirty times a text turn is fine at 3% of volume and fatal at 30%.
 */
export async function costByKind(days: number): Promise<CostByKind[]> {
  const rows = await query<TotalsRow & { kind: string; model: string }>(
    `SELECT kind, model, ${TOTALS_SELECT}
       FROM ai_usage
      WHERE occurred_at >= now() - ($1 || ' days')::interval
   GROUP BY kind, model
   ORDER BY sum(cost_usd) DESC`,
    [days],
  );
  return rows.map((row) => ({ ...normaliseTotals(row), kind: row.kind, model: row.model }));
}

export interface CostDay {
  date: string;
  turns: number;
  cost_usd: number;
  active_users: number;
}

export async function costByDay(days: number): Promise<CostDay[]> {
  const rows = await query<any>(
    `SELECT occurred_at::date::text          AS date,
            count(*)::int                    AS turns,
            COALESCE(sum(cost_usd), 0)::float8 AS cost_usd,
            count(DISTINCT user_id)::int     AS active_users
       FROM ai_usage
      WHERE occurred_at >= now() - ($1 || ' days')::interval
   GROUP BY 1
   ORDER BY 1`,
    [days],
  );
  return rows.map((row) => ({
    date: row.date,
    turns: row.turns,
    cost_usd: round6(row.cost_usd),
    active_users: row.active_users,
  }));
}

export interface CostByUser {
  user_id: string | null;
  email: string | null;
  turns: number;
  cost_usd: number;
  last_turn_at: string | null;
}

export async function costByUser(days: number, limit = 50): Promise<CostByUser[]> {
  const rows = await query<any>(
    `SELECT u.user_id, users.email,
            u.turns, u.cost_usd, u.last_turn_at
       FROM (
         SELECT user_id,
                count(*)::int                      AS turns,
                COALESCE(sum(cost_usd), 0)::float8 AS cost_usd,
                max(occurred_at)                   AS last_turn_at
           FROM ai_usage
          WHERE occurred_at >= now() - ($1 || ' days')::interval
       GROUP BY user_id
       ) u
  LEFT JOIN users ON users.id = u.user_id
   ORDER BY u.cost_usd DESC
      LIMIT $2`,
    [days, limit],
  );
  return rows.map((row) => ({
    user_id: row.user_id,
    email: row.email,
    turns: row.turns,
    cost_usd: round6(row.cost_usd),
    last_turn_at: row.last_turn_at ? new Date(row.last_turn_at).toISOString() : null,
  }));
}

/**
 * Cost per active user per month, and what that implies at scale.
 *
 * This is the number the whole feature exists to produce. It is deliberately
 * built from *observed* per-user daily spend rather than dividing the total by
 * the headcount: a fortnight where one account did all the logging would
 * otherwise report a per-user cost an order of magnitude too low.
 */
export interface Economics {
  window_days: number;
  /** Accounts that ran at least one turn in the window. */
  active_users: number;
  cost_usd: number;
  turns: number;
  cost_per_turn_usd: number;
  /** Mean spend per active user per 30 days, extrapolated from the window. */
  cost_per_user_month_usd: number;
  /** The heaviest user's spend, scaled the same way. Sizes the worst case. */
  heaviest_user_month_usd: number;
  turns_per_user_day: number;
  /** What the AI bill would be at these unit economics, at N users. */
  projection: Array<{ users: number; monthly_usd: number }>;
  /** Share of rows whose price nobody could establish. */
  unpriced_share: number;
}

const PROJECTION_TIERS = [100, 1_000, 10_000];

export async function economics(days: number): Promise<Economics> {
  const row = (await queryOne<{
    turns: number;
    cost_usd: number;
    active_users: number;
    heaviest_user_cost: number;
    unpriced: number;
  }>(
    `SELECT count(*)::int                              AS turns,
            COALESCE(sum(cost_usd), 0)::float8         AS cost_usd,
            count(DISTINCT user_id)::int               AS active_users,
            COALESCE(
              (SELECT max(per_user) FROM (
                 SELECT sum(cost_usd)::float8 AS per_user
                   FROM ai_usage
                  WHERE occurred_at >= now() - ($1 || ' days')::interval
               GROUP BY user_id
               ) heaviest), 0)::float8                 AS heaviest_user_cost,
            count(*) FILTER (WHERE cost_source = 'unknown')::int AS unpriced
       FROM ai_usage
      WHERE occurred_at >= now() - ($1 || ' days')::interval`,
    [days],
  ))!;

  // A window with no turns has no users either, and dividing by that would
  // turn an empty deployment into an infinite per-user cost.
  const users = Math.max(1, row.active_users);
  const scaleToMonth = 30 / days;
  const perUserMonth = round6((row.cost_usd / users) * scaleToMonth);

  return {
    window_days: days,
    active_users: row.active_users,
    cost_usd: round6(row.cost_usd),
    turns: row.turns,
    cost_per_turn_usd: round6(row.turns ? row.cost_usd / row.turns : 0),
    cost_per_user_month_usd: perUserMonth,
    heaviest_user_month_usd: round6(row.heaviest_user_cost * scaleToMonth),
    turns_per_user_day: round6(row.turns ? row.turns / users / days : 0),
    projection: PROJECTION_TIERS.map((n) => ({
      users: n,
      monthly_usd: round6(perUserMonth * n),
    })),
    unpriced_share: round6(row.turns ? row.unpriced / row.turns : 0),
  };
}

export interface UsageRow {
  id: string;
  user_id: string | null;
  email: string | null;
  occurred_at: string;
  provider: string;
  kind: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  cost_source: string;
  duration_ms: number | null;
  num_turns: number;
  ok: boolean;
  error: string | null;
}

/** The raw log, newest first. The panel's "show me the actual turns" view. */
export async function recentUsage(limit: number, userId?: string | null): Promise<UsageRow[]> {
  const rows = await query<any>(
    `SELECT a.*, users.email
       FROM ai_usage a
  LEFT JOIN users ON users.id = a.user_id
      WHERE ($2::uuid IS NULL OR a.user_id = $2)
   ORDER BY a.occurred_at DESC
      LIMIT $1`,
    [limit, userId ?? null],
  );
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    email: row.email,
    occurred_at: new Date(row.occurred_at).toISOString(),
    provider: row.provider,
    kind: row.kind,
    model: row.model,
    input_tokens: Number(row.input_tokens),
    output_tokens: Number(row.output_tokens),
    cache_read_tokens: Number(row.cache_read_tokens),
    cache_write_tokens: Number(row.cache_write_tokens),
    cost_usd: Number(row.cost_usd),
    cost_source: row.cost_source,
    duration_ms: row.duration_ms,
    num_turns: row.num_turns,
    ok: row.ok,
    error: row.error,
  }));
}

function normaliseTotals(row: TotalsRow): CostTotals {
  return {
    turns: row.turns,
    failed_turns: row.failed_turns,
    cost_usd: round6(row.cost_usd),
    // bigint comes back as a string from pg to preserve precision; these are
    // token counts, comfortably inside float range.
    input_tokens: Number(row.input_tokens),
    output_tokens: Number(row.output_tokens),
    cache_read_tokens: Number(row.cache_read_tokens),
    cache_write_tokens: Number(row.cache_write_tokens),
    avg_cost_usd: round6(row.avg_cost_usd),
    p95_duration_ms: row.p95_duration_ms,
    active_users: row.active_users,
  };
}
