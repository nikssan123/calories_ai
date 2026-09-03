import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { query, queryOne } from '../db.ts';
import { env } from '../env.ts';
import { authDescription } from '../ai/client.ts';
import { providerId } from '../ai/providers/index.ts';
import { openAiRate } from '../ai/pricing.ts';
import { hashPassword } from './auth.ts';
import { objectStore } from './storage.ts';

/**
 * The admin panel's data layer.
 *
 * Two halves with deliberately different shapes: everything under "Reading" is
 * read-only and generic (it browses the schema), everything under "Actions" is
 * a named, specific operation. There is no generic write path — an admin panel
 * that can run arbitrary SQL is a second database client with a web frontend,
 * and it will eventually be used at 2am to fix something by hand.
 */

// ---- Who is an admin --------------------------------------------------------

/**
 * Admin is decided by `ADMIN_EMAILS`, falling back to the oldest account.
 *
 * The fallback is what makes the self-hosted case zero-config: on a personal
 * install the first account is the person who deployed it, so they get the
 * panel without editing `.env`. As soon as `ADMIN_EMAILS` is set, the fallback
 * stops applying entirely — otherwise adding a second admin would silently
 * leave a third one behind.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const user = await queryOne<{ email: string | null }>(
    'SELECT email FROM users WHERE id = $1',
    [userId],
  );
  if (!user?.email) return false;

  if (env.adminEmails.length > 0) {
    return env.adminEmails.includes(user.email.toLowerCase());
  }

  const first = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE email IS NOT NULL ORDER BY created_at ASC, id ASC LIMIT 1`,
  );
  return first?.id === userId;
}

// ---- Reading: instance overview ---------------------------------------------

export interface AdminOverview {
  users: { total: number; onboarded: number; disabled: number; active_7d: number };
  data: {
    food_entries: number;
    exercise_entries: number;
    weight_entries: number;
    chat_messages: number;
    photos: number;
    reviews: number;
    recipes: number;
    routines: number;
    push_tokens: number;
  };
  storage: { database_bytes: number; uploads_bytes: number; photo_count: number };
  /** What is actually running, as opposed to what the repo says should be. */
  runtime: { node: string; postgres: string; uptime_s: number; env: string };
  config: {
    provider: string;
    auth: string;
    signup_allowed: boolean;
    secure_cookies: boolean;
    admin_source: 'env' | 'first-account';
    /** `local-disk`, or `bucket:<name>` once object storage is configured. */
    photo_storage: string;
    /** Null when the OpenAI-compatible path has no configured rate card. */
    openai_rate: { input: number; output: number } | null;
  };
}

export async function buildOverview(): Promise<AdminOverview> {
  // Every query below is an aggregate, so each returns exactly one row with
  // every column populated — which is why none of them is re-checked here.
  const users = (await queryOne<AdminOverview['users']>(
    `SELECT count(*) FILTER (WHERE email IS NOT NULL)::int              AS total,
            count(*) FILTER (WHERE is_setup_complete)::int              AS onboarded,
            count(*) FILTER (WHERE disabled_at IS NOT NULL)::int        AS disabled
       FROM users`,
  ))!;
  // "Active" is logging, not signing in: a session that polls the dashboard
  // every minute would otherwise make a dormant account look busy.
  const active = (await queryOne<{ n: number }>(
    `SELECT count(DISTINCT user_id)::int AS n
       FROM food_entries WHERE created_at >= now() - interval '7 days'`,
  ))!;
  const data = (await queryOne<AdminOverview['data']>(
    `SELECT (SELECT count(*) FROM food_entries)::int     AS food_entries,
            (SELECT count(*) FROM exercise_entries)::int AS exercise_entries,
            (SELECT count(*) FROM weight_entries)::int   AS weight_entries,
            (SELECT count(*) FROM chat_messages)::int    AS chat_messages,
            (SELECT count(*) FROM photos)::int           AS photos,
            (SELECT count(*) FROM weekly_reviews)::int   AS reviews,
            (SELECT count(*) FROM recipes)::int           AS recipes,
            (SELECT count(*) FROM routines)::int          AS routines,
            (SELECT count(*) FROM push_tokens)::int       AS push_tokens`,
  ))!;
  const size = (await queryOne<{ bytes: string; postgres: string }>(
    `SELECT pg_database_size(current_database())::bigint AS bytes,
            current_setting('server_version')             AS postgres`,
  ))!;

  return {
    users: { ...users, active_7d: active.n },
    data,
    storage: {
      database_bytes: Number(size.bytes),
      ...(await uploadsSize()),
    },
    // Read from the process and the server rather than from package.json,
    // because the question this answers is what a restart actually picked up.
    runtime: {
      node: process.version,
      postgres: size.postgres,
      uptime_s: Math.round(process.uptime()),
      env: process.env.NODE_ENV ?? 'development',
    },
    config: {
      provider: providerId(),
      auth: authDescription(),
      signup_allowed: env.allowSignup,
      secure_cookies: env.secureCookies,
      admin_source: env.adminEmails.length > 0 ? 'env' : 'first-account',
      // Which of the two backends new photos are going to. Worth showing
      // because both work and the wrong one is silent — a bucket that failed to
      // configure looks exactly like a deployment that never wanted one, right
      // up until the second replica.
      photo_storage: env.storage ? `bucket:${env.storage.bucket}` : 'local-disk',
      openai_rate: providerId() === 'openai' ? openAiRate() : null,
    },
  };
}

/**
 * Meal photos are bytes somewhere else — a volume, or a bucket — not rows. The
 * same split that makes the deploy script back up two things. Sizing them here
 * is what stops storage being the surprise.
 *
 * Counted from `photos.byte_size` rather than by walking a directory, which
 * used to be the same answer and no longer is: with a bucket configured there
 * is no directory to walk, and the panel would report zero on the deployment
 * that most needs the number. The column is written from the same buffer that
 * was stored, so it is not an estimate.
 */
async function uploadsSize(): Promise<{ uploads_bytes: number; photo_count: number }> {
  const row = await queryOne<{ bytes: string; count: number }>(
    'SELECT coalesce(sum(byte_size), 0)::bigint AS bytes, count(*)::int AS count FROM photos',
  );
  return { uploads_bytes: Number(row?.bytes ?? 0), photo_count: row?.count ?? 0 };
}

// ---- Reading: the schema browser --------------------------------------------

/** The shelves the picker groups tables onto. Ordered as the product is. */
export const TABLE_GROUPS = ['Accounts', 'Food', 'Exercise', 'Coach', 'Kitchen', 'Ops'] as const;
export type TableGroup = (typeof TABLE_GROUPS)[number];

export interface TableSpec {
  group: TableGroup;
  /** Columns never sent to the panel, at any depth. */
  redact: string[];
  /** Default ordering — newest-first wherever a table has a notion of "new". */
  order: string;
  /** One sentence on what the table is, shown above its rows. */
  note: string;
}

/**
 * Tables the panel may read, and the columns it must never return.
 *
 * An allowlist rather than a denylist, because the failure modes are not
 * symmetric: forgetting to allow a table shows an admin less than they wanted,
 * while forgetting to deny one leaks password hashes. It covers the whole
 * schema rather than a chosen dozen — a browser that omits the table you are
 * looking for sends you to psql, which is the thing this exists to avoid — and
 * every genuine secret is named in a `redact` list beside its table instead.
 *
 * What is withheld is exactly the set of values that are credentials in
 * themselves: anything that would let the holder be someone else. A hash still
 * counts, because for `known_devices` the hash *is* the presented value.
 *
 * An entry whose table does not exist yet is skipped rather than fatal, so a
 * deployment mid-migration shows one table fewer instead of a 500.
 */
export const BROWSABLE_TABLES: Record<string, TableSpec> = {
  // ---- Accounts
  users: {
    group: 'Accounts',
    redact: ['password_hash', 'agent_session_id'],
    order: 'created_at DESC',
    note: 'One row per person: profile, goal, plan, notification switches.',
  },
  auth_sessions: {
    group: 'Accounts',
    redact: ['token_hash'],
    order: 'last_seen_at DESC',
    note: 'Live sign-ins. One row per cookie; deleting one signs that device out.',
  },
  auth_tokens: {
    group: 'Accounts',
    redact: ['token_hash', 'code_hash'],
    order: 'created_at DESC',
    note: 'Single-use links and codes — verification, password resets. `used_at` set means spent.',
  },
  oauth_identities: {
    group: 'Accounts',
    redact: [],
    order: 'last_login_at DESC',
    note: 'Google and Apple logins bound to an account. `subject` is the provider’s own id.',
  },
  known_devices: {
    group: 'Accounts',
    redact: ['device_hash'],
    order: 'last_seen_at DESC',
    note: 'Devices a sign-in has been seen from, and what decides whether a new one is challenged.',
  },
  push_tokens: {
    group: 'Accounts',
    redact: ['token'],
    order: 'last_seen_at DESC',
    note: 'Where notifications are delivered. One row per app install, not per account.',
  },
  billing_events: {
    group: 'Accounts',
    redact: [],
    order: 'received_at DESC',
    note: 'Every store webhook as received. The audit trail behind `users.plan`.',
  },
  credits: {
    group: 'Accounts',
    redact: [],
    order: 'created_at DESC',
    note: 'Scans and messages bought outright. A ledger, not a balance: the balance is the sum of `delta` over these rows, per `meter`.',
  },

  // ---- Food
  food_entries: {
    group: 'Food',
    redact: [],
    order: 'eaten_at DESC',
    note: 'A logged meal. The items that make up its numbers are in food_items.',
  },
  food_items: {
    group: 'Food',
    redact: [],
    order: 'created_at DESC',
    note: 'The lines inside a meal. Every calorie on the dashboard is a sum over these.',
  },
  food_entry_client_keys: {
    group: 'Food',
    redact: [],
    order: 'created_at DESC',
    note: 'What makes the offline outbox safe to replay: a client id already here is a duplicate.',
  },
  photos: {
    group: 'Food',
    redact: [],
    order: 'created_at DESC',
    note: 'Meal photos. `storage_key` means a bucket, `file_path` means the local volume.',
  },
  barcode_products: {
    group: 'Food',
    redact: [],
    order: 'fetched_at DESC',
    note: 'The scanner’s cache of Open Food Facts. `found = false` rows are remembered misses.',
  },
  targets: {
    group: 'Food',
    redact: [],
    order: 'effective_from DESC',
    note: 'Daily goals over time. Never updated in place — a change is a new row.',
  },
  weight_entries: {
    group: 'Food',
    redact: [],
    order: 'measured_at DESC',
    note: 'Weigh-ins, which are what the adaptive pass reads to move a target.',
  },

  // ---- Exercise
  exercise_entries: {
    group: 'Exercise',
    redact: [],
    order: 'performed_at DESC',
    note: 'A workout as logged. Strength sets hang off it in exercise_sets.',
  },
  exercise_sets: {
    group: 'Exercise',
    redact: [],
    order: 'created_at DESC',
    note: 'Reps, weight, distance — one row per set within a workout.',
  },
  exercise_types: {
    group: 'Exercise',
    redact: [],
    order: 'created_at DESC',
    note: 'The movement catalogue. A null `user_id` is a built-in rather than one somebody added.',
  },
  routines: {
    group: 'Exercise',
    redact: [],
    order: 'created_at DESC',
    note: 'Saved workout templates.',
  },
  routine_exercises: {
    group: 'Exercise',
    redact: [],
    order: 'position ASC',
    note: 'The movements in a routine, in the order they are performed.',
  },
  routine_days: {
    group: 'Exercise',
    redact: [],
    order: 'created_at DESC',
    note: 'Which routine belongs to which weekday, per person.',
  },

  // ---- Coach
  chat_messages: {
    group: 'Coach',
    redact: [],
    order: 'created_at DESC',
    note: 'The journal thread. `tool_trace` holds what the model actually called.',
  },
  weekly_reviews: {
    group: 'Coach',
    redact: [],
    order: 'week_start DESC',
    note: 'One generated review per week, with the stats it was written from.',
  },
  nudges: {
    group: 'Coach',
    redact: [],
    order: 'created_at DESC',
    note: 'Written-once prompts, one per kind per local day.',
  },
  alerts: {
    group: 'Coach',
    redact: [],
    order: 'created_at DESC',
    note: 'Rendered warnings. The sentence is stored, not its inputs, so it still reads right later.',
  },
  achievements: {
    group: 'Coach',
    redact: [],
    order: 'earned_at DESC',
    note: 'Badges. Write-once and never revoked — the number beside one stays derived.',
  },
  agent_notes: {
    group: 'Coach',
    redact: [],
    order: 'created_at DESC',
    note: 'What the coach chose to remember about someone between turns.',
  },

  // ---- Kitchen
  recipes: {
    group: 'Kitchen',
    redact: [],
    order: 'created_at DESC',
    note: 'Generated and adapted recipes. `saved` is the difference between kept and passed over.',
  },
  library_recipes: {
    group: 'Kitchen',
    redact: [],
    order: 'title ASC',
    note: 'The shipped recipe library, shared by every account.',
  },
  saved_library_recipes: {
    group: 'Kitchen',
    redact: [],
    order: 'saved_at DESC',
    note: 'Who kept which library recipe.',
  },
  meal_plans: {
    group: 'Kitchen',
    redact: [],
    order: 'week_start DESC',
    note: 'One plan per week, with the brief it was generated from.',
  },
  meal_plan_slots: {
    group: 'Kitchen',
    redact: [],
    order: 'local_date DESC',
    note: 'A recipe placed on a day. `cooked_at` set means it was actually made.',
  },
  pantry_items: {
    group: 'Kitchen',
    redact: [],
    order: 'last_seen_at DESC',
    note: 'What somebody has in. Staples are assumed present and never fall off the list.',
  },
  shopping_extras: {
    group: 'Kitchen',
    redact: [],
    order: 'created_at DESC',
    note: 'Hand-added shopping lines, beside the ones a plan implies.',
  },

  // ---- Ops
  ai_usage: {
    group: 'Ops',
    redact: [],
    order: 'occurred_at DESC',
    note: 'Every model turn, priced. Survives account deletion with a null user_id, deliberately.',
  },
  model_token_buckets: {
    group: 'Ops',
    redact: [],
    order: 'refilled_at DESC',
    note: 'The shared rate limiter. One row per model, drained by turns and refilled by time.',
  },
  email_deliveries: {
    group: 'Ops',
    redact: [],
    order: 'created_at DESC',
    note: 'Mail this deployment sent, and whether the provider took it.',
  },
  support_emails: {
    group: 'Ops',
    redact: [],
    order: 'received_at DESC',
    note: 'Mail this deployment received. The Inbox tab is a nicer view of the same rows.',
  },
  app_secrets: {
    group: 'Ops',
    redact: ['value'],
    order: 'created_at DESC',
    note: 'Generated keys — signing secrets and the like. The values themselves are withheld.',
  },
  schema_migrations: {
    group: 'Ops',
    redact: [],
    order: 'applied_at DESC',
    note: 'What this image has actually applied. The first thing to check when a deploy looks wrong.',
  },
};

export interface TableSummary {
  name: string;
  group: TableGroup;
  rows: number;
  bytes: number;
}

/**
 * Every browsable table with an exact row count and its size on disk.
 *
 * Counted in one round trip rather than one per table: forty sequential
 * `count(*)` queries is forty network waits for a screen that renders as a
 * sidebar. The names interpolated into that union come from the allowlist keys,
 * intersected with what `pg_class` actually holds — never from a request.
 */
export async function listTables(): Promise<TableSummary[]> {
  const names = Object.keys(BROWSABLE_TABLES);
  const present = await query<{ name: string; bytes: string }>(
    `SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`,
    [names],
  );
  if (present.length === 0) return [];

  const sizes = new Map(present.map((row) => [row.name, Number(row.bytes)]));
  // reltuples would save this scan, but it reads -1 until a table is first
  // analysed and drifts afterwards — and a row count someone is about to page
  // through has to be the real one.
  const counts = await query<{ name: string; n: string }>(
    present
      .map((row) => `SELECT '${row.name}'::text AS name, count(*)::bigint AS n FROM "${row.name}"`)
      .join(' UNION ALL '),
  );
  const rows = new Map(counts.map((row) => [row.name, Number(row.n)]));

  // Allowlist order, not alphabetical: the allowlist is grouped by what the
  // tables are for, and the picker renders it in that order.
  return names
    .filter((name) => sizes.has(name))
    .map((name) => ({
      name,
      group: BROWSABLE_TABLES[name]!.group,
      rows: rows.get(name) ?? 0,
      bytes: sizes.get(name) ?? 0,
    }));
}

export interface TableField {
  name: string;
  /** The Postgres type name — `uuid`, `timestamptz`, `jsonb`, `numeric`. */
  type: string;
  nullable: boolean;
  primary_key: boolean;
  /** The row this column points at, when the target is browsable too. */
  references: { table: string; column: string } | null;
}

export interface TablePage {
  table: string;
  group: TableGroup;
  note: string;
  fields: TableField[];
  rows: Array<Record<string, unknown>>;
  total: number;
  limit: number;
  offset: number;
  redacted: string[];
  /** The column actually sorted on, or null for the table's default order. */
  sort: string | null;
  dir: 'asc' | 'desc';
  q: string | null;
  user_id: string | null;
}

export interface ReadTableOptions {
  limit: number;
  offset: number;
  userId?: string | null;
  q?: string | null;
  sort?: string | null;
  dir?: 'asc' | 'desc' | null;
}

/**
 * One page of a table, with enough about its shape to render it well.
 *
 * The table name is never interpolated from the request — it is looked up in
 * `BROWSABLE_TABLES` and the *key* is what reaches the query, so an unknown
 * name is a 404 rather than a string that ends up in SQL. The sort column gets
 * the same treatment against the table's own live column list, and everything
 * else is parameterised.
 *
 * Types, keys and foreign keys are read from the catalogue rather than declared
 * beside the allowlist, because a hand-written copy of the schema is a copy
 * that goes stale on the next migration. They are what lets the panel right-
 * align a number, pretty-print a jsonb, and turn a `user_id` into a link.
 */
export async function readTable(
  table: string,
  options: ReadTableOptions,
): Promise<TablePage | null> {
  const spec = BROWSABLE_TABLES[table];
  if (!spec) return null;

  const columns = await query<{ column_name: string; udt_name: string; is_nullable: string }>(
    `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
   ORDER BY ordinal_position`,
    [table],
  );
  // An allowlisted table whose migration has not run on this deployment yet.
  if (columns.length === 0) return null;

  const fields = await describeColumns(table, columns, spec.redact);
  const selectList = fields.map((field) => `"${field.name}"`).join(', ');

  const params: unknown[] = [];
  const where: string[] = [];

  // Only tables that actually have a user_id can be filtered by one; asking for
  // a user filter on `schema_migrations` is a no-op rather than an error.
  const canFilter = Boolean(options.userId) && columns.some((c) => c.column_name === 'user_id');
  if (canFilter) {
    params.push(options.userId);
    where.push(`user_id = $${params.length}`);
  }

  /*
   * Search is one box over every visible column cast to text, rather than a
   * field picker. It is a sequential scan and it is the right trade here: the
   * question an admin brings to this screen is "where does this id / address /
   * word appear", and they do not yet know which column answers it. The cast
   * is what makes a uuid, a date and a jsonb all reachable from the same box.
   */
  const q = options.q?.trim() ?? '';
  if (q && fields.length > 0) {
    params.push(`%${q}%`);
    const placeholder = `$${params.length}`;
    where.push(`(${fields.map((f) => `"${f.name}"::text ILIKE ${placeholder}`).join(' OR ')})`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const sort = options.sort && fields.some((f) => f.name === options.sort) ? options.sort : null;
  const dir = options.dir === 'asc' ? 'asc' : 'desc';
  const key = fields.find((f) => f.primary_key)?.name;
  /*
   * The key is appended as a tiebreaker because paging is by offset: without a
   * total order, two rows equal on the sort column can swap between page one
   * and page two, and the reader sees one of them twice and the other never.
   */
  const order = sort
    ? `"${sort}" ${dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST${key && key !== sort ? `, "${key}" ASC` : ''}`
    : spec.order;

  const rows = await query<Record<string, unknown>>(
    `SELECT ${selectList} FROM "${table}" ${clause}
      ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, options.limit, options.offset],
  );
  const total = (await queryOne<{ n: string }>(
    `SELECT count(*)::bigint AS n FROM "${table}" ${clause}`,
    params,
  ))!;

  return {
    table,
    group: spec.group,
    note: spec.note,
    fields,
    rows: rows.map(serialiseRow),
    total: Number(total.n),
    limit: options.limit,
    offset: options.offset,
    redacted: spec.redact,
    sort,
    dir,
    q: q || null,
    user_id: canFilter ? (options.userId ?? null) : null,
  };
}

/**
 * Column metadata from the catalogue: which are keys, and which point somewhere.
 *
 * Foreign keys are resolved through the allowlist as well, so a column pointing
 * at a table the panel cannot open comes back with `references: null` rather
 * than a link to a 404.
 */
async function describeColumns(
  table: string,
  columns: Array<{ column_name: string; udt_name: string; is_nullable: string }>,
  redact: string[],
): Promise<TableField[]> {
  const constraints = await query<{
    kind: string;
    column_name: string;
    ref_table: string | null;
    ref_column: string | null;
  }>(
    `SELECT c.contype::text AS kind,
            att.attname    AS column_name,
            ft.relname     AS ref_table,
            ref.attname    AS ref_column
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid AND t.relnamespace = 'public'::regnamespace
       LEFT JOIN pg_class ft ON ft.oid = c.confrelid
       CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = k.attnum
       LEFT JOIN LATERAL (
            SELECT a.attname FROM pg_attribute a
             WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[k.ord]
       ) ref ON true
      WHERE t.relname = $1 AND c.contype IN ('p', 'f')`,
    [table],
  );

  const keys = new Set(constraints.filter((c) => c.kind === 'p').map((c) => c.column_name));
  const links = new Map(
    constraints
      .filter((c) => c.kind === 'f' && c.ref_table && c.ref_column)
      .filter((c) => BROWSABLE_TABLES[c.ref_table!])
      .map((c) => [c.column_name, { table: c.ref_table!, column: c.ref_column! }]),
  );

  return columns
    .filter((column) => !redact.includes(column.column_name))
    .map((column) => ({
      name: column.column_name,
      type: column.udt_name,
      nullable: column.is_nullable === 'YES',
      primary_key: keys.has(column.column_name),
      references: links.get(column.column_name) ?? null,
    }));
}

/** Dates and buffers do not survive JSON as themselves; make that explicit here. */
function serialiseRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

// ---- Reading: accounts ------------------------------------------------------

export interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  timezone: string;
  /**
   * Here for the deletion receipt, which is written after the row it would
   * otherwise be read from is gone. Null is a real answer — an account that has
   * never said which language it reads — and `localeOf` resolves it.
   */
  locale: string | null;
  is_setup_complete: boolean;
  disabled_at: string | null;
  created_at: string;
  last_seen_at: string | null;
  food_entries: number;
  chat_messages: number;
  last_entry_at: string | null;
  ai_turns: number;
  ai_cost_usd: number;
}

export async function listUsers(limit = 100): Promise<AdminUser[]> {
  const rows = await query<any>(
    `SELECT u.id, u.email, u.display_name, u.timezone, u.locale, u.is_setup_complete,
            u.disabled_at, u.created_at,
            (SELECT max(last_seen_at) FROM auth_sessions s WHERE s.user_id = u.id) AS last_seen_at,
            (SELECT count(*) FROM food_entries f WHERE f.user_id = u.id)::int      AS food_entries,
            (SELECT count(*) FROM chat_messages m WHERE m.user_id = u.id)::int     AS chat_messages,
            (SELECT max(eaten_at) FROM food_entries f WHERE f.user_id = u.id)      AS last_entry_at,
            (SELECT count(*) FROM ai_usage a WHERE a.user_id = u.id)::int          AS ai_turns,
            (SELECT COALESCE(sum(cost_usd), 0) FROM ai_usage a WHERE a.user_id = u.id)::float8 AS ai_cost_usd
       FROM users u
      WHERE u.email IS NOT NULL
   ORDER BY u.created_at ASC
      LIMIT $1`,
    [limit],
  );
  return rows.map(toAdminUser);
}

export async function getAdminUser(userId: string): Promise<AdminUser | null> {
  const rows = await query<any>(
    `SELECT u.id, u.email, u.display_name, u.timezone, u.locale, u.is_setup_complete,
            u.disabled_at, u.created_at,
            (SELECT max(last_seen_at) FROM auth_sessions s WHERE s.user_id = u.id) AS last_seen_at,
            (SELECT count(*) FROM food_entries f WHERE f.user_id = u.id)::int      AS food_entries,
            (SELECT count(*) FROM chat_messages m WHERE m.user_id = u.id)::int     AS chat_messages,
            (SELECT max(eaten_at) FROM food_entries f WHERE f.user_id = u.id)      AS last_entry_at,
            (SELECT count(*) FROM ai_usage a WHERE a.user_id = u.id)::int          AS ai_turns,
            (SELECT COALESCE(sum(cost_usd), 0) FROM ai_usage a WHERE a.user_id = u.id)::float8 AS ai_cost_usd
       FROM users u
      WHERE u.id = $1`,
    [userId],
  );
  return rows[0] ? toAdminUser(rows[0]) : null;
}

function toAdminUser(row: any): AdminUser {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    timezone: row.timezone,
    locale: row.locale ?? null,
    is_setup_complete: row.is_setup_complete,
    disabled_at: row.disabled_at ? new Date(row.disabled_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
    last_seen_at: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    food_entries: row.food_entries,
    chat_messages: row.chat_messages,
    last_entry_at: row.last_entry_at ? new Date(row.last_entry_at).toISOString() : null,
    ai_turns: row.ai_turns,
    ai_cost_usd: Math.round(row.ai_cost_usd * 1e6) / 1e6,
  };
}

// ---- Actions ----------------------------------------------------------------

/**
 * Every action below is one named operation with one obvious effect. They
 * return `false` for "no such user" rather than throwing, so the route layer
 * can turn that into a 404 without inspecting an error message.
 */

/** Revokes every session. The user is signed out everywhere on their next request. */
export async function signOutEverywhere(userId: string): Promise<number> {
  const rows = await query('DELETE FROM auth_sessions WHERE user_id = $1 RETURNING id', [userId]);
  return rows.length;
}

/**
 * Sets a new password and drops every existing session, because the usual
 * reason to reset one is that the old one is compromised — leaving live
 * sessions behind would defeat the point.
 */
export async function resetPassword(userId: string, password: string): Promise<boolean> {
  const hash = await hashPassword(password);
  const rows = await query(
    'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2 RETURNING id',
    [hash, userId],
  );
  if (rows.length === 0) return false;
  await signOutEverywhere(userId);
  return true;
}

/**
 * Suspends or restores an account. Disabling also revokes sessions — without
 * that, an already-signed-in user would keep working until their cookie aged
 * out sixty days later.
 */
export async function setDisabled(userId: string, disabled: boolean): Promise<boolean> {
  const rows = await query(
    'UPDATE users SET disabled_at = $1, updated_at = now() WHERE id = $2 RETURNING id',
    [disabled ? new Date().toISOString() : null, userId],
  );
  if (rows.length === 0) return false;
  if (disabled) await signOutEverywhere(userId);
  return true;
}

export interface DeleteSummary {
  food_entries: number;
  chat_messages: number;
  photos: string[];
  /** Rows erased from the two mail tables, which no cascade would have taken. */
  emails: number;
}

/**
 * Deletes an account and everything it owns.
 *
 * Three things are not automatic. Photo *files* live in a volume rather than in
 * Postgres, so the rows would cascade away and leave orphaned bytes on disk —
 * the paths are collected first and unlinked after. `ai_usage.user_id` is
 * ON DELETE SET NULL, so the cost history survives deliberately: deleting an
 * account must not retroactively change what the product costs to run, and
 * token counts with no owner are not personal data.
 *
 * The third is the mail, and it is the one that used to be wrong. Both mail
 * tables are ON DELETE SET NULL as well, on the reasoning that a record of what
 * was sent should outlive the account it was sent to — but severing `user_id`
 * severs a *link*, and both tables carry the address itself in a column of
 * their own. What survived was a table of email addresses belonging to people
 * who had asked to be forgotten. So they are erased here, by address as well as
 * by id: `support_emails.user_id` is null for anyone who wrote in before they
 * signed in, or from the account's address after changing it.
 */
export async function deleteAccount(userId: string): Promise<DeleteSummary | null> {
  const user = await queryOne<{ id: string; email: string | null }>(
    'SELECT id, email FROM users WHERE id = $1',
    [userId],
  );
  if (!user) return null;

  const photos = await query<{ file_path: string | null; storage_key: string | null }>(
    'SELECT file_path, storage_key FROM photos WHERE user_id = $1',
    [userId],
  );
  const counts = (await queryOne<{ food_entries: number; chat_messages: number }>(
    `SELECT (SELECT count(*) FROM food_entries WHERE user_id = $1)::int  AS food_entries,
            (SELECT count(*) FROM chat_messages WHERE user_id = $1)::int AS chat_messages`,
    [userId],
  ))!;

  /*
   * Before the user row goes, because after it there is no `user_id` left to
   * match on — the FK would already have set both columns to null, and the
   * address would be the only thread back to the rows. Matched case-insensitively
   * on the same terms as the unique index that made the address an identity.
   */
  const email = user.email?.toLowerCase() ?? null;
  const erased = [
    await query(
      `DELETE FROM email_deliveries
        WHERE user_id = $1 OR ($2::text IS NOT NULL AND lower(to_email) = $2)
    RETURNING 1`,
      [userId, email],
    ),
    await query(
      `DELETE FROM support_emails
        WHERE user_id = $1 OR ($2::text IS NOT NULL AND lower(from_email) = $2)
    RETURNING 1`,
      [userId, email],
    ),
  ];
  const emails = erased[0]!.length + erased[1]!.length;

  await query('DELETE FROM users WHERE id = $1', [userId]);

  const dir = resolve(env.uploadDir);
  const store = objectStore();
  const removed: string[] = [];
  for (const photo of photos) {
    if (photo.storage_key) {
      /*
       * A bucket delete that fails must not abort the loop. The rows are
       * already gone, so throwing here would leave the rest of this account's
       * photos unreachable *and* undeleted — the worst of both. An orphaned
       * object is recoverable by a lifecycle rule; a half-run erasure is not.
       */
      if (!store) continue;
      await store.remove(photo.storage_key).then(
        () => removed.push(photo.storage_key!),
        () => undefined,
      );
      continue;
    }
    if (!photo.file_path) continue;
    // Confined to the upload directory for the same reason `readPhoto` is: the
    // path is ours, but a delete loop is the wrong place to assume that.
    if (!resolve(photo.file_path).startsWith(dir)) continue;
    // A missing file is not a failure — the row is already gone either way.
    await unlink(photo.file_path).then(
      () => removed.push(photo.file_path!),
      () => undefined,
    );
  }

  return { ...counts, photos: removed, emails };
}

/** Whether a user is currently suspended. Read by the session hook on every request. */
export async function isDisabled(userId: string): Promise<boolean> {
  const row = await queryOne<{ disabled_at: string | null }>(
    'SELECT disabled_at FROM users WHERE id = $1',
    [userId],
  );
  return row?.disabled_at != null;
}

/** The migrations this deployment has actually applied, newest first. */
export async function appliedMigrations(): Promise<Array<{ name: string; applied_at: string }>> {
  const rows = await query<any>(
    'SELECT name, applied_at FROM schema_migrations ORDER BY name DESC',
  );
  return rows.map((r) => ({ name: r.name, applied_at: new Date(r.applied_at).toISOString() }));
}
