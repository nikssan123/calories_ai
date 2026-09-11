import { randomInt } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type {
  ChatMessage,
  ClientCoachStatus,
  CoachAccount,
  CoachClientWeek,
  CoachComment,
  CoachCommentRequest,
  CoachDigest,
  CoachDigestStats,
  CoachFlag,
  CoachInvite,
  CoachInvitePreview,
  CoachPlan,
  CoachRoster,
  CoachRosterRow,
  CoachScope,
  CoachTargetsRequest,
  DaySummary,
  Goal,
} from '@ct/shared';
import { query, queryOne, transaction } from '../db.ts';
import { env } from '../env.ts';
import { sendCoachCommentPush } from '../push/notify.ts';
import { addDays, type DayContext, localDateFor, localPartsFor } from '../time.ts';
import { insertMessage } from './chat.ts';
import { listWeights } from './log.ts';
import { getSecret, PHOTO_URL_SECRET } from './secrets.ts';
import { signPhotoUrl } from './photos.ts';
import { buildDaySummary } from './summary.ts';
import { setTargets, targetsForDate } from './targets.ts';

/**
 * The coach seat. See COACH.md.
 *
 * Everything a coach reads is computed here from the client's own tables with
 * the client's `user_id`, behind one question — `clientLinkFor` — that every
 * route asks first. Nothing in this file calls a model: the roster is SQL, the
 * flags are the same arithmetic the nudge pass runs, and a comment is a row.
 *
 * The one thing this file writes into a client's account beyond the link
 * itself is the seat: an active link with a paying coach puts the client on
 * Plus, and a revoke takes it away. That is the whole entitlement model and it
 * is deliberately a column write rather than a join in `accountGate`, so the
 * hot path on every request stays one row.
 */

/** The free month, and how many seats it carries — see COACH.md §9. */
export const TRIAL_DAYS = 30;
export const TRIAL_SEATS = 5;
/** What a coach without a subscription keeps: the links, on the free tier, and no seats. */
export const EXPIRED_SEATS = 0;
/** An invite is good for this long. */
export const INVITE_DAYS = 14;

/**
 * Plans whose seats put the client on Plus.
 *
 * `lapsed` is among them on purpose: a failed card opens a grace period, and
 * the clients did nothing wrong. `expireLapsed` in `stripe.ts` is what ends
 * it, by expiring the account on a date.
 */
export function seatsCarryPlus(plan: CoachPlan): boolean {
  return plan === 'trial' || plan === 'paid' || plan === 'lapsed';
}

/**
 * Whether the dashboard opens at all. The free month does, a subscription
 * does, and so does the grace period. Expired is the one plan that closes it:
 * the roster, the invites and the digest wait behind the billing page until a
 * subscription exists. Nothing is deleted meanwhile — the links, the notes and
 * the comments are still the coach's.
 */
export function dashboardOpen(plan: CoachPlan): boolean {
  return plan !== 'expired';
}

const DEFAULT_SCOPE: CoachScope = { meals: true, weight: true, metrics: false };

// ---- Accounts ----------------------------------------------------------------

export async function isCoach(userId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    'SELECT TRUE AS ok FROM coach_accounts WHERE user_id = $1',
    [userId],
  );
  return row !== null;
}

/** The plan alone, for the route guard: one row, no join. */
export async function coachPlanOf(userId: string): Promise<CoachPlan | null> {
  const row = await queryOne<{ plan: CoachPlan }>(
    'SELECT plan FROM coach_accounts WHERE user_id = $1',
    [userId],
  );
  return row?.plan ?? null;
}

export async function getCoachAccount(userId: string): Promise<CoachAccount | null> {
  const row = await queryOne<any>(
    `SELECT a.*, u.display_name, u.email,
            (SELECT count(*) FROM coach_clients c
              WHERE c.coach_user_id = a.user_id AND c.status = 'active') AS seats_used
       FROM coach_accounts a JOIN users u ON u.id = a.user_id
      WHERE a.user_id = $1`,
    [userId],
  );
  return row ? toAccount(row) : null;
}

/**
 * Becomes a coach, or is one already. Idempotent, because three doors lead
 * here — the web sign-up, a web sign-in with the coach intent, and the Google
 * callback — and a second knock must not restart anybody's trial.
 */
export async function ensureCoachAccount(userId: string, now = new Date()): Promise<CoachAccount> {
  await query(
    `INSERT INTO coach_accounts (user_id, plan, seat_limit, trial_ends_at)
     VALUES ($1, 'trial', $2, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, TRIAL_SEATS, new Date(now.getTime() + TRIAL_DAYS * 86_400_000)],
  );
  return (await getCoachAccount(userId))!;
}

export async function updateCoachAccount(
  userId: string,
  patch: { business_name?: string | null; notify_digest?: boolean },
): Promise<CoachAccount | null> {
  if (patch.business_name !== undefined) {
    await query(
      'UPDATE coach_accounts SET business_name = $1, updated_at = now() WHERE user_id = $2',
      [patch.business_name, userId],
    );
  }
  if (patch.notify_digest !== undefined) {
    await query(
      'UPDATE coach_accounts SET notify_digest = $1, updated_at = now() WHERE user_id = $2',
      [patch.notify_digest, userId],
    );
  }
  return getCoachAccount(userId);
}

// ---- The Monday digest -------------------------------------------------------

/**
 * A coach as the digest pass sees them: the clock they live by, the address,
 * and whether they asked for the mail. Only coaches with somebody on the
 * roster — a digest of nobody is a Monday email about nothing.
 */
export interface DigestCoach {
  user_id: string;
  timezone: string;
  day_start_hour: number;
  email: string | null;
  notify_digest: boolean;
}

export async function coachTimezones(): Promise<string[]> {
  const rows = await query<{ timezone: string }>(
    `SELECT DISTINCT u.timezone
       FROM coach_accounts a JOIN users u ON u.id = a.user_id
      WHERE EXISTS (SELECT 1 FROM coach_clients c
                     WHERE c.coach_user_id = a.user_id AND c.status = 'active')`,
  );
  return rows.map((row) => row.timezone);
}

export async function listDigestCoachesIn(timezones: readonly string[]): Promise<DigestCoach[]> {
  if (timezones.length === 0) return [];
  return query<DigestCoach>(
    `SELECT a.user_id, u.timezone, u.day_start_hour, u.email, a.notify_digest
       FROM coach_accounts a JOIN users u ON u.id = a.user_id
      WHERE u.timezone = ANY($1::text[])
        AND EXISTS (SELECT 1 FROM coach_clients c
                     WHERE c.coach_user_id = a.user_id AND c.status = 'active')
   ORDER BY a.created_at ASC`,
    [timezones],
  );
}

/**
 * The digest, computed. The roster as it stands, with the week named: on a
 * Monday morning every client's "seven days ending yesterday" is the same
 * Monday-to-Sunday, which is what makes a snapshot of it worth keeping.
 */
export async function buildDigest(coachId: string, now = new Date()): Promise<CoachDigestStats> {
  const current = await roster(coachId, now);
  return {
    week: { start: addDays(current.today, -7), end: addDays(current.today, -1) },
    clients: current.clients,
    seats: current.seats,
  };
}

/**
 * Writes the week's digest, once. Null means another tick got there first —
 * the same bargain `saveNudge` makes — and the caller treats that as done.
 */
export async function saveDigest(
  coachId: string,
  weekStart: string,
  stats: CoachDigestStats,
): Promise<CoachDigest | null> {
  const row = await queryOne<any>(
    `INSERT INTO coach_digests (coach_user_id, week_start, stats)
     VALUES ($1, $2, $3)
     ON CONFLICT (coach_user_id, week_start) DO NOTHING
     RETURNING *`,
    [coachId, weekStart, JSON.stringify(stats)],
  );
  return row ? toDigest(row) : null;
}

export async function digestForWeek(coachId: string, weekStart: string): Promise<CoachDigest | null> {
  const row = await queryOne<any>(
    'SELECT * FROM coach_digests WHERE coach_user_id = $1 AND week_start = $2',
    [coachId, weekStart],
  );
  return row ? toDigest(row) : null;
}

export async function markDigestSent(coachId: string, weekStart: string): Promise<void> {
  await query(
    `UPDATE coach_digests SET sent_at = COALESCE(sent_at, now())
      WHERE coach_user_id = $1 AND week_start = $2`,
    [coachId, weekStart],
  );
}

export async function listDigests(coachId: string, limit = 12): Promise<CoachDigest[]> {
  const rows = await query<any>(
    `SELECT * FROM coach_digests WHERE coach_user_id = $1
   ORDER BY week_start DESC LIMIT $2`,
    [coachId, Math.min(Math.max(limit, 1), 52)],
  );
  return rows.map(toDigest);
}

function toDigest(row: any): CoachDigest {
  return {
    week_start: String(row.week_start).slice(0, 10),
    stats: (typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats) as CoachDigestStats,
    sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
  };
}

/**
 * Moves a coach between plans and re-cuts the seats to match.
 *
 * The one entry point for the webhook, the trial sweep and the admin panel,
 * so that a plan can never change without the clients' entitlement following
 * it. `seat_limit` is written as given; `syncSeats` then decides which links
 * hold a seat.
 */
export async function setCoachPlan(
  userId: string,
  plan: CoachPlan,
  seatLimit: number,
  stripe: { customerId?: string | null; subscriptionId?: string | null } = {},
): Promise<CoachAccount | null> {
  await query(
    `UPDATE coach_accounts
        SET plan = $1, seat_limit = $2,
            stripe_customer_id = COALESCE($3, stripe_customer_id),
            stripe_subscription_id = COALESCE($4, stripe_subscription_id),
            trial_ends_at = CASE WHEN $1 IN ('trial', 'expired') THEN trial_ends_at ELSE NULL END,
            updated_at = now()
      WHERE user_id = $5`,
    [plan, seatLimit, stripe.customerId ?? null, stripe.subscriptionId ?? null, userId],
  );
  await syncSeats(userId);
  return getCoachAccount(userId);
}

/**
 * Every free month that has run out, expired.
 *
 * The backstop the scheduler runs hourly, in the spirit of `expirePlans`: a
 * trial is a date, and a date is the honest instrument. Expired keeps the
 * links and puts every client on the free tier, which is what `syncSeats`
 * does once the seat count is zero; `trial_ends_at` stays, so the billing
 * page can say when the month ended.
 */
export async function expireTrials(now = new Date()): Promise<number> {
  const rows = await query<{ user_id: string }>(
    `UPDATE coach_accounts
        SET plan = 'expired', seat_limit = $2, updated_at = now()
      WHERE plan = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < $1
      RETURNING user_id`,
    [now, EXPIRED_SEATS],
  );
  for (const row of rows) await syncSeats(row.user_id);
  return rows.length;
}

// ---- Invites -----------------------------------------------------------------

/** No 0/O, 1/I: the code is read off one screen and typed into another. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** `7kq4-mr2x` and `7KQ4MR2X` are the same code. */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The way a code is shown: two groups of four. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function createInvite(
  coachId: string,
  email: string | null = null,
  now = new Date(),
): Promise<CoachInvite> {
  // A collision on eight characters of a 32-letter alphabet is one in a
  // trillion; the loop is for the shape of it, not for a case anyone will hit.
  for (;;) {
    const code = generateCode();
    const row = await queryOne<any>(
      `INSERT INTO coach_invites (coach_user_id, code, email, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING
       RETURNING *`,
      [coachId, code, email, new Date(now.getTime() + INVITE_DAYS * 86_400_000)],
    );
    if (row) return toInvite(row);
  }
}

export async function listInvites(coachId: string): Promise<CoachInvite[]> {
  const rows = await query<any>(
    `SELECT i.*, u.display_name AS accepted_name
       FROM coach_invites i LEFT JOIN users u ON u.id = i.accepted_by
      WHERE i.coach_user_id = $1
   ORDER BY i.created_at DESC
      LIMIT 100`,
    [coachId],
  );
  return rows.map(toInvite);
}

export async function deleteInvite(coachId: string, inviteId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM coach_invites WHERE id = $1 AND coach_user_id = $2 AND accepted_at IS NULL
     RETURNING id`,
    [inviteId, coachId],
  );
  return row !== null;
}

/**
 * What the accept screen shows before the button: who is asking. Nothing
 * else about the coach — a code is not a session, and the name and the
 * business are what the coach put on the invite by handing it out.
 */
export async function previewInvite(
  rawCode: string,
  now = new Date(),
): Promise<CoachInvitePreview> {
  const code = normaliseCode(rawCode);
  if (code.length !== 8) return { valid: false, reason: 'invalid', coach: null, expires_at: null };
  const row = await queryOne<any>(
    `SELECT i.expires_at, i.accepted_at, u.display_name, a.business_name
       FROM coach_invites i
       JOIN users u ON u.id = i.coach_user_id
       JOIN coach_accounts a ON a.user_id = i.coach_user_id
      WHERE i.code = $1`,
    [code],
  );
  if (!row) return { valid: false, reason: 'invalid', coach: null, expires_at: null };
  const coach = { display_name: row.display_name ?? null, business_name: row.business_name ?? null };
  const expires_at = new Date(row.expires_at).toISOString();
  if (row.accepted_at) return { valid: false, reason: 'used', coach, expires_at };
  if (new Date(row.expires_at) < now) return { valid: false, reason: 'expired', coach, expires_at };
  return { valid: true, reason: null, coach, expires_at };
}

export type AcceptOutcome =
  | { ok: true; status: ClientCoachStatus }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'self' | 'already_linked' | 'seats_full' };

/**
 * The client's side of the handshake, and the only way a link comes to exist.
 *
 * Inside one transaction with the coach row locked, because the seat count is
 * a race: two clients accepting the last seat in the same second must not both
 * get it. `FOR UPDATE` on `coach_accounts` serialises accepts per coach, which
 * is exactly the granularity the count needs and no wider.
 */
export async function acceptInvite(
  clientId: string,
  rawCode: string,
  now = new Date(),
): Promise<AcceptOutcome> {
  const code = normaliseCode(rawCode);
  if (code.length !== 8) return { ok: false, reason: 'invalid' };

  return transaction(async (client) => {
    const invite = (
      await client.query<any>('SELECT * FROM coach_invites WHERE code = $1', [code])
    ).rows[0];
    if (!invite) return { ok: false, reason: 'invalid' as const };
    if (invite.accepted_at) return { ok: false, reason: 'used' as const };
    if (new Date(invite.expires_at) < now) return { ok: false, reason: 'expired' as const };
    if (invite.coach_user_id === clientId) return { ok: false, reason: 'self' as const };

    const account = (
      await client.query<any>('SELECT * FROM coach_accounts WHERE user_id = $1 FOR UPDATE', [
        invite.coach_user_id,
      ])
    ).rows[0];
    if (!account) return { ok: false, reason: 'invalid' as const };

    const existing = (
      await client.query<any>(
        `SELECT coach_user_id FROM coach_clients WHERE client_user_id = $1 AND status = 'active'`,
        [clientId],
      )
    ).rows[0];
    if (existing) return { ok: false, reason: 'already_linked' as const };

    const used = Number(
      (
        await client.query<{ n: string }>(
          `SELECT count(*) AS n FROM coach_clients WHERE coach_user_id = $1 AND status = 'active'`,
          [invite.coach_user_id],
        )
      ).rows[0]!.n,
    );
    if (used >= Number(account.seat_limit)) return { ok: false, reason: 'seats_full' as const };

    /*
     * A re-accept after a revoke reuses the row rather than adding a second,
     * because the pair is unique. The scope resets to the default: whatever
     * was agreed last time was revoked with the link.
     */
    await client.query(
      `INSERT INTO coach_clients (coach_user_id, client_user_id, status, scope, accepted_at)
       VALUES ($1, $2, 'active', $3, $4)
       ON CONFLICT (coach_user_id, client_user_id) DO UPDATE
         SET status = 'active', scope = EXCLUDED.scope, accepted_at = EXCLUDED.accepted_at,
             revoked_at = NULL, revoked_by = NULL`,
      [invite.coach_user_id, clientId, JSON.stringify(DEFAULT_SCOPE), now],
    );
    await client.query(
      'UPDATE coach_invites SET accepted_by = $1, accepted_at = $2 WHERE id = $3',
      [clientId, now, invite.id],
    );

    if (seatsCarryPlus(account.plan)) {
      await client.query(
        `UPDATE users SET plan = 'plus', plan_source = 'coach_seat', plan_expires_at = NULL
          WHERE id = $1 AND plan = 'free'`,
        [clientId],
      );
    }

    return { ok: true as const, status: (await clientStatus(clientId, client))! };
  });
}

// ---- Links -------------------------------------------------------------------

export interface ClientLink {
  id: string;
  coachId: string;
  clientId: string;
  scope: CoachScope;
  acceptedAt: Date;
}

/** The active link between these two, or null. Every coach read asks this first. */
export async function clientLinkFor(coachId: string, clientId: string): Promise<ClientLink | null> {
  const row = await queryOne<any>(
    `SELECT id, coach_user_id, client_user_id, scope, accepted_at
       FROM coach_clients
      WHERE coach_user_id = $1 AND client_user_id = $2 AND status = 'active'`,
    [coachId, clientId],
  );
  return row ? toLink(row) : null;
}

/**
 * Ends the link, whoever asked. The seat goes with it: a client on Plus because
 * of this coach goes back to free, and a client paying for themselves is not
 * touched.
 */
export async function revokeLink(
  coachId: string,
  clientId: string,
  by: 'client' | 'coach' | 'system',
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE coach_clients
        SET status = 'revoked', revoked_at = now(), revoked_by = $3
      WHERE coach_user_id = $1 AND client_user_id = $2 AND status = 'active'
      RETURNING id`,
    [coachId, clientId, by],
  );
  if (!row) return false;
  await releaseSeat(clientId);
  return true;
}

async function releaseSeat(clientId: string): Promise<void> {
  await query(
    `UPDATE users SET plan = 'free', plan_source = 'manual', plan_expires_at = NULL
      WHERE id = $1 AND plan_source = 'coach_seat'`,
    [clientId],
  );
}

/**
 * Re-cuts which clients hold a seat after the plan or the seat count moved.
 *
 * Seats go to the earliest links first, which is the only ordering a client
 * could have predicted. A link past the limit is *not* revoked — the coach can
 * still see them — it simply stops carrying Plus, and the roster says so.
 */
export async function syncSeats(coachId: string): Promise<void> {
  const account = await queryOne<{ plan: CoachPlan; seat_limit: number }>(
    'SELECT plan, seat_limit FROM coach_accounts WHERE user_id = $1',
    [coachId],
  );
  if (!account) return;

  const links = await query<{ client_user_id: string }>(
    `SELECT client_user_id FROM coach_clients
      WHERE coach_user_id = $1 AND status = 'active'
   ORDER BY accepted_at ASC, id ASC`,
    [coachId],
  );
  const carry = seatsCarryPlus(account.plan);

  for (const [index, link] of links.entries()) {
    if (carry && index < Number(account.seat_limit)) {
      await query(
        `UPDATE users SET plan = 'plus', plan_source = 'coach_seat', plan_expires_at = NULL
          WHERE id = $1 AND (plan = 'free' OR plan_source = 'coach_seat')`,
        [link.client_user_id],
      );
    } else {
      await releaseSeat(link.client_user_id);
    }
  }
}

/** Whether this client's seat currently carries Plus. */
async function seatTierFor(
  clientId: string,
  run: Runner = { query: (text, params) => query(text, params) },
): Promise<'plus' | 'free'> {
  const rows: { plan_source: string; plan: string }[] = await run.query(
    'SELECT plan, plan_source FROM users WHERE id = $1',
    [clientId],
  );
  const row = rows[0];
  return row && row.plan_source === 'coach_seat' && row.plan === 'plus' ? 'plus' : 'free';
}

interface Runner {
  query(text: string, params?: unknown[]): Promise<any[]>;
}

/** What the phone shows under Settings: who, since when, and what they see. */
export async function clientStatus(
  clientId: string,
  tx?: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
): Promise<ClientCoachStatus> {
  const run: Runner = tx
    ? { query: async (text, params) => (await tx.query(text, params)).rows }
    : { query: (text, params) => query(text, params) };

  const rows: any[] = await run.query(
    `SELECT c.id, c.scope, c.accepted_at, u.display_name, a.business_name
       FROM coach_clients c
       JOIN users u ON u.id = c.coach_user_id
       JOIN coach_accounts a ON a.user_id = c.coach_user_id
      WHERE c.client_user_id = $1 AND c.status = 'active'`,
    [clientId],
  );
  const row = rows[0];
  if (!row) return { link: null };
  return {
    link: {
      id: row.id,
      coach: { display_name: row.display_name ?? null, business_name: row.business_name ?? null },
      scope: toScope(row.scope),
      accepted_at: new Date(row.accepted_at).toISOString(),
      seat: await seatTierFor(clientId, run),
    },
  };
}

export async function updateScope(
  clientId: string,
  patch: Partial<CoachScope>,
): Promise<ClientCoachStatus> {
  const current = await queryOne<{ scope: unknown }>(
    `SELECT scope FROM coach_clients WHERE client_user_id = $1 AND status = 'active'`,
    [clientId],
  );
  if (!current) return { link: null };
  const scope = { ...toScope(current.scope), ...patch };
  await query(
    `UPDATE coach_clients SET scope = $1 WHERE client_user_id = $2 AND status = 'active'`,
    [JSON.stringify(scope), clientId],
  );
  return clientStatus(clientId);
}

/** The coach this client is linked to, for the routes that write into the journal. */
export async function coachOf(clientId: string): Promise<string | null> {
  const row = await queryOne<{ coach_user_id: string }>(
    `SELECT coach_user_id FROM coach_clients WHERE client_user_id = $1 AND status = 'active'`,
    [clientId],
  );
  return row?.coach_user_id ?? null;
}

// ---- The roster --------------------------------------------------------------

const WINDOW_DAYS = 7;
const WEIGHT_WINDOW_DAYS = 28;
/** A link younger than this is a client still settling in. */
const NEW_CLIENT_DAYS = 7;
/** Two days of silence is worth a word; the nudge pass waits for three. */
const NO_LOG_AFTER_DAYS = 2;
const PROTEIN_SHORT_RATIO = 0.85;
const KCAL_OVER_RATIO = 1.15;
const KCAL_UNDER_RATIO = 0.75;
/** Below this many logged days, an average is not a habit. */
const MIN_LOGGED_FOR_AVERAGES = 4;
/** Fewer than this many weigh-ins over four weeks and the scale has not spoken. */
const MIN_WEIGH_INS = 4;
const STALLED_KG = 0.3;

const SEVERITY_RANK = { critical: 3, warning: 2, info: 1 } as const;

interface ClientRow {
  id: string;
  display_name: string | null;
  goal: Goal | null;
  timezone: string;
  day_start_hour: number;
  accepted_at: Date;
  scope: unknown;
  plan: string;
  plan_source: string;
}

/**
 * What the flags say, given what the week said. Pure, and exported so the
 * thresholds can be pinned by a test without seeding a roster.
 */
export function flagsFor(input: {
  today: string;
  lastLoggedDate: string | null;
  acceptedDate: string;
  acceptedWeekday: string;
  daysLogged: number;
  averageKcal: number | null;
  targetKcal: number;
  averageProtein: number | null;
  targetProtein: number;
  goal: Goal | null;
  weighIns: number;
  weightChange4w: number | null;
}): CoachFlag[] {
  const flags: CoachFlag[] = [];
  const isNew = daysBetween(input.acceptedDate, input.today) < NEW_CLIENT_DAYS;

  if (input.lastLoggedDate === null) {
    flags.push({
      kind: 'no_log',
      severity: isNew ? 'warning' : 'critical',
      label: 'Nothing logged yet',
      days: null,
    });
  } else {
    const gap = daysBetween(input.lastLoggedDate, input.today);
    if (gap >= NO_LOG_AFTER_DAYS) {
      flags.push({
        kind: 'no_log',
        severity: 'critical',
        label: `No log ${gap} days`,
        days: gap,
      });
    }
  }

  if (input.daysLogged >= MIN_LOGGED_FOR_AVERAGES) {
    if (
      input.averageProtein !== null &&
      input.averageProtein < input.targetProtein * PROTEIN_SHORT_RATIO
    ) {
      flags.push({ kind: 'protein_short', severity: 'warning', label: 'Protein short', days: null });
    }
    if (input.averageKcal !== null && input.averageKcal > input.targetKcal * KCAL_OVER_RATIO) {
      flags.push({ kind: 'kcal_over', severity: 'warning', label: 'Over calories', days: null });
    }
    if (input.averageKcal !== null && input.averageKcal < input.targetKcal * KCAL_UNDER_RATIO) {
      flags.push({ kind: 'kcal_under', severity: 'warning', label: 'Under calories', days: null });
    }
  }

  if (
    input.goal === 'lose' &&
    input.weighIns >= MIN_WEIGH_INS &&
    input.weightChange4w !== null &&
    input.weightChange4w > -STALLED_KG
  ) {
    flags.push({ kind: 'stalled', severity: 'warning', label: 'Weight stalled', days: null });
  }

  if (isNew) {
    flags.push({
      kind: 'new',
      severity: 'info',
      label: `Joined ${input.acceptedWeekday}`,
      days: daysBetween(input.acceptedDate, input.today),
    });
  }

  return flags;
}

/** Most urgent first, then the people who logged least, then by name. */
export function attention(a: CoachRosterRow, b: CoachRosterRow): number {
  const severity = (row: CoachRosterRow) =>
    row.flags.reduce((max, flag) => Math.max(max, SEVERITY_RANK[flag.severity]), 0);
  return (
    severity(b) - severity(a) ||
    a.days_logged - b.days_logged ||
    (a.client.display_name ?? '').localeCompare(b.client.display_name ?? '')
  );
}

/**
 * Every active client, as the Monday screen wants them.
 *
 * Five queries for the whole roster rather than five per client: the links,
 * the week of totals, the month of weigh-ins, the last log, and the targets.
 * Each client's week is the seven days ending *their* yesterday, in their own
 * timezone — a roster of people in three countries is still one query, because
 * the window is fetched wide and cut in TypeScript.
 */
export async function roster(coachId: string, now = new Date()): Promise<CoachRoster> {
  const account = await getCoachAccount(coachId);
  if (!account) throw new Error('Not a coach');

  const clients = await query<ClientRow>(
    `SELECT u.id, u.display_name, u.goal, u.timezone, u.day_start_hour, u.plan, u.plan_source,
            c.accepted_at, c.scope
       FROM coach_clients c JOIN users u ON u.id = c.client_user_id
      WHERE c.coach_user_id = $1 AND c.status = 'active'
   ORDER BY c.accepted_at ASC`,
    [coachId],
  );

  const coachToday = localDateFor(now, await coachContext(coachId));
  if (clients.length === 0) {
    return {
      today: coachToday,
      clients: [],
      seats: { used: 0, limit: account.seat_limit },
      account,
    };
  }

  const ids = clients.map((c) => c.id);
  const windows = new Map(
    clients.map((c) => {
      const ctx = { timezone: c.timezone, dayStartHour: c.day_start_hour };
      const today = localDateFor(now, ctx);
      return [c.id, { ctx, today, from: addDays(today, -WINDOW_DAYS), to: addDays(today, -1) }];
    }),
  );
  const earliest = [...windows.values()].map((w) => w.from).sort()[0]!;
  const latest = [...windows.values()].map((w) => w.today).sort().at(-1)!;

  const [totals, weights, lastLogs, targets] = await Promise.all([
    query<any>(
      `SELECT e.user_id, e.local_date,
              COALESCE(SUM(i.kcal), 0) AS kcal, COALESCE(SUM(i.protein_g), 0) AS protein_g
         FROM food_entries e LEFT JOIN food_items i ON i.entry_id = e.id
        WHERE e.user_id = ANY($1::uuid[]) AND e.local_date BETWEEN $2 AND $3
     GROUP BY e.user_id, e.local_date`,
      [ids, earliest, latest],
    ),
    query<any>(
      `SELECT user_id, local_date, weight_kg FROM weight_entries
        WHERE user_id = ANY($1::uuid[]) AND local_date >= $2
     ORDER BY local_date ASC`,
      [ids, addDays(earliest, -(WEIGHT_WINDOW_DAYS - WINDOW_DAYS))],
    ),
    query<any>(
      `SELECT user_id, max(eaten_at) AS at, max(local_date) AS local_date
         FROM food_entries WHERE user_id = ANY($1::uuid[]) GROUP BY user_id`,
      [ids],
    ),
    Promise.all(clients.map((c) => targetsForDate(c.id, windows.get(c.id)!.to))),
  ]);
  const lastComments = await query<any>(
    `SELECT client_user_id, max(created_at) AS at FROM coach_comments
      WHERE coach_user_id = $1 AND client_user_id = ANY($2::uuid[])
   GROUP BY client_user_id`,
    [coachId, ids],
  );

  const totalsByClient = groupBy(totals, (t) => t.user_id);
  const weightsByClient = groupBy(weights, (w) => w.user_id);
  const lastByClient = new Map(lastLogs.map((l) => [l.user_id, l]));
  const commentByClient = new Map(lastComments.map((c) => [c.client_user_id, c.at]));

  const rows: CoachRosterRow[] = clients.map((client, index) => {
    const window = windows.get(client.id)!;
    const byDate = new Map(
      (totalsByClient.get(client.id) ?? []).map((t) => [String(t.local_date).slice(0, 10), t]),
    );
    const days = dateRange(window.from, window.to).map((local_date) => {
      const total = byDate.get(local_date);
      const kcal = total ? Number(total.kcal) : 0;
      return {
        local_date,
        logged: total !== undefined && kcal > 0,
        kcal: Math.round(kcal),
        protein_g: total ? Math.round(Number(total.protein_g)) : 0,
      };
    });
    const logged = days.filter((d) => d.logged);
    const target = targets[index]!;

    const series = (weightsByClient.get(client.id) ?? []).map((w) => ({
      local_date: String(w.local_date).slice(0, 10),
      kg: Number(w.weight_kg),
    }));
    const current = series.at(-1)?.kg ?? null;
    const fourWeeksAgo = addDays(window.today, -WEIGHT_WINDOW_DAYS);
    const oldest = series.find((w) => w.local_date >= fourWeeksAgo) ?? null;
    const change =
      current !== null && oldest && oldest.local_date !== series.at(-1)!.local_date
        ? round1(current - oldest.kg)
        : null;

    const last = lastByClient.get(client.id);
    const acceptedDate = localDateFor(new Date(client.accepted_at), window.ctx);
    const flags = flagsFor({
      today: window.today,
      lastLoggedDate: last ? String(last.local_date).slice(0, 10) : null,
      acceptedDate,
      acceptedWeekday: localPartsFor(new Date(client.accepted_at), client.timezone).weekday.slice(0, 3),
      daysLogged: logged.length,
      averageKcal: mean(logged.map((d) => d.kcal)),
      targetKcal: target.kcal,
      averageProtein: mean(logged.map((d) => d.protein_g)),
      targetProtein: target.protein_g,
      goal: client.goal,
      weighIns: series.filter((w) => w.local_date >= fourWeeksAgo).length,
      weightChange4w: change,
    });

    const seat: 'plus' | 'free' =
      client.plan_source === 'coach_seat' && client.plan === 'plus' ? 'plus' : 'free';

    return {
      client: {
        id: client.id,
        display_name: client.display_name,
        goal: client.goal,
        timezone: client.timezone,
        accepted_at: new Date(client.accepted_at).toISOString(),
        scope: toScope(client.scope),
        seat,
      },
      week: { start: window.from, end: window.to },
      days,
      days_logged: logged.length,
      kcal: { average: roundOrNull(mean(logged.map((d) => d.kcal))), target: target.kcal },
      protein: {
        average_g: roundOrNull(mean(logged.map((d) => d.protein_g))),
        target_g: target.protein_g,
      },
      weight: {
        current_kg: current,
        change_4w_kg: change,
        weigh_ins: series.filter((w) => w.local_date >= fourWeeksAgo).length,
      },
      flags,
      last_logged_at: last?.at ? new Date(last.at).toISOString() : null,
      last_comment_at: commentByClient.has(client.id)
        ? new Date(commentByClient.get(client.id)).toISOString()
        : null,
    };
  });

  rows.sort(attention);
  return {
    today: coachToday,
    clients: rows,
    seats: { used: clients.length, limit: account.seat_limit },
    account,
  };
}

// ---- One client --------------------------------------------------------------

/**
 * Seven days of one client, as the journal draws them, plus the things the
 * coach page hangs off the side: eight weeks of weigh-ins, the targets in
 * force, the coach's own notes and comments.
 *
 * `end` defaults to the client's yesterday, so the page opens on the last
 * complete day rather than on a today with one breakfast in it.
 */
export async function clientWeek(
  coachId: string,
  clientId: string,
  end?: string,
  now = new Date(),
): Promise<CoachClientWeek | null> {
  const link = await clientLinkFor(coachId, clientId);
  if (!link) return null;

  const client = await queryOne<ClientRow>(
    `SELECT u.id, u.display_name, u.goal, u.timezone, u.day_start_hour, u.plan, u.plan_source,
            c.accepted_at, c.scope
       FROM users u JOIN coach_clients c ON c.client_user_id = u.id AND c.coach_user_id = $2
      WHERE u.id = $1`,
    [clientId, coachId],
  );
  if (!client) return null;

  const ctx: DayContext = { timezone: client.timezone, dayStartHour: client.day_start_hour };
  const today = localDateFor(now, ctx);
  const to = end && /^\d{4}-\d{2}-\d{2}$/.test(end) && end <= today ? end : addDays(today, -1);
  const from = addDays(to, -(WINDOW_DAYS - 1));
  const scope = toScope(client.scope);

  const [days, weights, targets, notes, comments] = await Promise.all([
    Promise.all(dateRange(from, to).map((date) => buildDaySummary(clientId, date))),
    scope.weight ? listWeights(clientId, { from: addDays(to, -56), to }) : Promise.resolve([]),
    targetsForDate(clientId, to),
    getNotes(coachId, clientId),
    listComments(coachId, clientId, 50),
  ]);

  // What the scope withholds is stripped here, once, rather than in each route.
  const shown: DaySummary[] = days.map((day) => ({
    ...day,
    food_entries: scope.meals ? day.food_entries : [],
    weight: scope.weight ? day.weight : null,
    steps: scope.metrics ? day.steps : null,
    steps_average: scope.metrics ? day.steps_average : null,
  }));

  const photoIds = shown.flatMap((day) =>
    day.food_entries.map((entry) => entry.photo_id).filter((id): id is string => id !== null),
  );
  const secret = photoIds.length > 0 ? await getSecret(PHOTO_URL_SECRET) : null;
  const photo_urls = Object.fromEntries(
    photoIds.map((id) => [id, signPhotoUrl(id, secret!)]),
  );

  return {
    client: {
      id: client.id,
      display_name: client.display_name,
      goal: client.goal,
      timezone: client.timezone,
      accepted_at: new Date(client.accepted_at).toISOString(),
      scope,
      seat: client.plan_source === 'coach_seat' && client.plan === 'plus' ? 'plus' : 'free',
    },
    week: { start: from, end: to },
    today,
    days: shown,
    photo_urls,
    weights,
    targets,
    notes,
    comments,
  };
}

/**
 * Targets set by the coach.
 *
 * `is_custom` so the adaptive pass leaves them alone — the same courtesy it
 * extends to a number the client typed — and `source: 'coach'` so the app can
 * say who set them. Dated today in the client's own timezone.
 */
export async function setClientTargets(
  coachId: string,
  clientId: string,
  targets: CoachTargetsRequest,
  now = new Date(),
): Promise<boolean> {
  const link = await clientLinkFor(coachId, clientId);
  if (!link) return false;
  const ctx = await clientContext(clientId);
  await setTargets(
    clientId,
    localDateFor(now, ctx),
    { ...targets, is_custom: true, source: 'coach' },
    `set by coach ${coachId}`,
  );
  return true;
}

// ---- Comments ----------------------------------------------------------------

/**
 * A comment lands in three places: its own row, the client's journal, and the
 * client's lock screen. The journal row is the one the client reads; the
 * comment row is what the coach page lists and what `read_at` is kept on.
 */
export async function addComment(
  coachId: string,
  clientId: string,
  input: CoachCommentRequest,
  logger?: FastifyBaseLogger,
): Promise<CoachComment | null> {
  const link = await clientLinkFor(coachId, clientId);
  if (!link) return null;

  const coach = await queryOne<{ display_name: string | null }>(
    'SELECT display_name FROM users WHERE id = $1',
    [coachId],
  );
  const message: ChatMessage = await insertMessage(clientId, 'coach', input.body, null, {
    kind: 'coach_comment',
    coach_user_id: coachId,
    local_date: input.local_date,
    food_entry_id: input.food_entry_id ?? null,
  });

  const row = await queryOne<any>(
    `INSERT INTO coach_comments
       (coach_user_id, client_user_id, local_date, food_entry_id, body, message_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [coachId, clientId, input.local_date, input.food_entry_id ?? null, input.body, message.id],
  );

  await sendCoachCommentPush(clientId, coach?.display_name ?? null, input.body, logger);
  return toComment({ ...row, coach_name: coach?.display_name ?? null });
}

export async function listComments(
  coachId: string,
  clientId: string,
  limit = 50,
): Promise<CoachComment[]> {
  const rows = await query<any>(
    `SELECT c.*, u.display_name AS coach_name
       FROM coach_comments c JOIN users u ON u.id = c.coach_user_id
      WHERE c.coach_user_id = $1 AND c.client_user_id = $2
   ORDER BY c.created_at DESC LIMIT $3`,
    [coachId, clientId, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map(toComment);
}

/**
 * The client opened the journal: everything unread is now read. Called from
 * the history route, which is the one screen the bubbles are drawn on.
 */
export async function markCommentsRead(clientId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE coach_comments SET read_at = now()
      WHERE client_user_id = $1 AND read_at IS NULL RETURNING id`,
    [clientId],
  );
  return rows.length;
}

// ---- Notes -------------------------------------------------------------------

export async function getNotes(coachId: string, clientId: string): Promise<string> {
  const row = await queryOne<{ body: string }>(
    'SELECT body FROM coach_notes WHERE coach_user_id = $1 AND client_user_id = $2',
    [coachId, clientId],
  );
  return row?.body ?? '';
}

export async function setNotes(coachId: string, clientId: string, body: string): Promise<boolean> {
  const link = await clientLinkFor(coachId, clientId);
  if (!link) return false;
  await query(
    `INSERT INTO coach_notes (coach_user_id, client_user_id, body)
     VALUES ($1, $2, $3)
     ON CONFLICT (coach_user_id, client_user_id) DO UPDATE
       SET body = EXCLUDED.body, updated_at = now()`,
    [coachId, clientId, body],
  );
  return true;
}

// ---- Shapes ------------------------------------------------------------------

async function coachContext(coachId: string): Promise<DayContext> {
  const row = await queryOne<{ timezone: string; day_start_hour: number }>(
    'SELECT timezone, day_start_hour FROM users WHERE id = $1',
    [coachId],
  );
  return { timezone: row?.timezone ?? 'UTC', dayStartHour: Number(row?.day_start_hour ?? 4) };
}

async function clientContext(clientId: string): Promise<DayContext> {
  return coachContext(clientId);
}

function toAccount(row: any): CoachAccount {
  return {
    user_id: row.user_id,
    display_name: row.display_name ?? null,
    email: row.email ?? null,
    business_name: row.business_name ?? null,
    plan: row.plan,
    seat_limit: Number(row.seat_limit),
    seats_used: Number(row.seats_used ?? 0),
    seats_carry_plus: seatsCarryPlus(row.plan),
    trial_ends_at: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : null,
    lapsed_at: row.lapsed_at ? new Date(row.lapsed_at).toISOString() : null,
    billing_configured: env.stripe !== null,
    notify_digest: row.notify_digest ?? true,
    created_at: new Date(row.created_at).toISOString(),
  };
}

function toInvite(row: any): CoachInvite {
  return {
    id: row.id,
    code: formatCode(row.code),
    url: `${env.appUrl}/c/${row.code}`,
    email: row.email ?? null,
    created_at: new Date(row.created_at).toISOString(),
    expires_at: new Date(row.expires_at).toISOString(),
    accepted_by: row.accepted_by ?? null,
    accepted_name: row.accepted_name ?? null,
    accepted_at: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
  };
}

function toLink(row: any): ClientLink {
  return {
    id: row.id,
    coachId: row.coach_user_id,
    clientId: row.client_user_id,
    scope: toScope(row.scope),
    acceptedAt: new Date(row.accepted_at),
  };
}

function toComment(row: any): CoachComment {
  return {
    id: row.id,
    local_date: String(row.local_date).slice(0, 10),
    food_entry_id: row.food_entry_id ?? null,
    body: row.body,
    coach_name: row.coach_name ?? null,
    created_at: new Date(row.created_at).toISOString(),
    read_at: row.read_at ? new Date(row.read_at).toISOString() : null,
  };
}

function toScope(raw: unknown): CoachScope {
  const value = (typeof raw === 'string' ? safeJson(raw) : raw) as Partial<CoachScope> | null;
  return {
    meals: value?.meals ?? DEFAULT_SCOPE.meals,
    weight: value?.weight ?? DEFAULT_SCOPE.weight,
    metrics: value?.metrics ?? DEFAULT_SCOPE.metrics,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function dateRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) days.push(date);
  return days;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(row);
  }
  return map;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
