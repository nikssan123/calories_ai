import { query, queryOne } from '../db.ts';
import { anthropicRate, openAiRate, priceUsage, round6 } from '../ai/pricing.ts';
import { MODELS } from '../ai/client.ts';
import { providerId } from '../ai/providers/index.ts';
import type { CostSource, Outcome, TurnKind } from '../ai/providers/types.ts';

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
    const estimated = estimateCost(model, usage);
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
        providerId(),
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

/** Rate-card price for a turn, or null when no rate applies to that model. */
export function estimateCost(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
): number | null {
  const rate = anthropicRate(model) ?? openAiRate();
  return rate ? priceUsage(usage, rate) : null;
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
