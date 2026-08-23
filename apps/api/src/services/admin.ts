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
  data: { food_entries: number; exercise_entries: number; weight_entries: number; chat_messages: number; photos: number; reviews: number };
  storage: { database_bytes: number; uploads_bytes: number; photo_count: number };
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
            (SELECT count(*) FROM weekly_reviews)::int   AS reviews`,
  ))!;
  const size = (await queryOne<{ bytes: string }>(
    'SELECT pg_database_size(current_database())::bigint AS bytes',
  ))!;

  return {
    users: { ...users, active_7d: active.n },
    data,
    storage: {
      database_bytes: Number(size.bytes),
      ...(await uploadsSize()),
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

/**
 * Tables the panel may read, and the columns it must never return.
 *
 * An allowlist rather than a denylist, because the failure modes are not
 * symmetric: forgetting to allow a table shows an admin less than they wanted,
 * while forgetting to deny one leaks password hashes. `schema_migrations` is
 * included because "which migrations has this deployment actually run" is the
 * first question when a deploy looks wrong.
 */
export const BROWSABLE_TABLES: Record<string, { redact: string[]; order: string }> = {
  users: { redact: ['password_hash', 'agent_session_id'], order: 'created_at DESC' },
  auth_sessions: { redact: ['token_hash'], order: 'last_seen_at DESC' },
  food_entries: { redact: [], order: 'eaten_at DESC' },
  food_items: { redact: [], order: 'created_at DESC' },
  exercise_entries: { redact: [], order: 'performed_at DESC' },
  weight_entries: { redact: [], order: 'measured_at DESC' },
  chat_messages: { redact: [], order: 'created_at DESC' },
  photos: { redact: [], order: 'created_at DESC' },
  targets: { redact: [], order: 'effective_from DESC' },
  weekly_reviews: { redact: [], order: 'week_start DESC' },
  ai_usage: { redact: [], order: 'occurred_at DESC' },
  schema_migrations: { redact: [], order: 'applied_at DESC' },
};

export interface TableSummary {
  name: string;
  rows: number;
  bytes: number;
}

export async function listTables(): Promise<TableSummary[]> {
  const names = Object.keys(BROWSABLE_TABLES);
  const rows = await query<any>(
    `SELECT c.relname AS name,
            c.reltuples::bigint AS estimate,
            pg_total_relation_size(c.oid)::bigint AS bytes
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
    [names],
  );
  const byName = new Map(rows.map((r) => [r.name, r]));

  // reltuples is an estimate that reads -1 until the table is first analysed,
  // and the tables here are small enough that an exact count is cheap.
  const out: TableSummary[] = [];
  for (const name of names) {
    const exact = (await queryOne<{ n: string }>(`SELECT count(*)::bigint AS n FROM "${name}"`))!;
    out.push({ name, rows: Number(exact.n), bytes: Number(byName.get(name)!.bytes) });
  }
  return out;
}

export interface TablePage {
  table: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  total: number;
  limit: number;
  offset: number;
  redacted: string[];
}

/**
 * One page of a table.
 *
 * The table name is never interpolated from the request — it is looked up in
 * `BROWSABLE_TABLES` and the *key* is what reaches the query, so an unknown
 * name is a 404 rather than a string that ends up in SQL. Everything else is
 * parameterised.
 */
export async function readTable(
  table: string,
  options: { limit: number; offset: number; userId?: string | null },
): Promise<TablePage | null> {
  const spec = BROWSABLE_TABLES[table];
  if (!spec) return null;

  const columns = (
    await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
      [table],
    )
  ).map((c) => c.column_name);

  const visible = columns.filter((c) => !spec.redact.includes(c));
  const selectList = visible.map((c) => `"${c}"`).join(', ');

  // Only tables that actually have a user_id can be filtered by one; asking for
  // a user filter on `schema_migrations` is a no-op rather than an error.
  const canFilter = columns.includes('user_id') && options.userId;
  const where = canFilter ? 'WHERE user_id = $3' : '';
  const params: unknown[] = [options.limit, options.offset];
  if (canFilter) params.push(options.userId);

  const rows = await query<any>(
    `SELECT ${selectList} FROM "${table}" ${where} ORDER BY ${spec.order} LIMIT $1 OFFSET $2`,
    params,
  );
  const total = (await queryOne<{ n: string }>(
    `SELECT count(*)::bigint AS n FROM "${table}" ${canFilter ? 'WHERE user_id = $1' : ''}`,
    canFilter ? [options.userId] : [],
  ))!;

  return {
    table,
    columns: visible,
    rows: rows.map(serialiseRow),
    total: Number(total.n),
    limit: options.limit,
    offset: options.offset,
    redacted: spec.redact,
  };
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
    `SELECT u.id, u.email, u.display_name, u.timezone, u.is_setup_complete,
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
    `SELECT u.id, u.email, u.display_name, u.timezone, u.is_setup_complete,
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
