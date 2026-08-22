import type { PlanName, Profile, ProfileUpdate, UnitSystem } from '@ct/shared';
import { unitsOf } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import type { DayContext } from '../time.ts';
import { hashPassword, verifyPassword } from './auth.ts';

export interface UserContext extends DayContext {
  userId: string;
}

export async function getUser(userId: string): Promise<Profile> {
  const row = await queryOne<any>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!row) throw new Error('User not found');
  return toProfile(row);
}

export async function getUserContext(userId: string): Promise<UserContext> {
  const user = await getUser(userId);
  return { userId: user.id, timezone: user.timezone, dayStartHour: user.day_start_hour };
}

export async function updateUser(userId: string, patch: ProfileUpdate): Promise<Profile> {
  const columns: Record<string, unknown> = {
    display_name: patch.display_name,
    sex: patch.sex,
    birth_date: patch.birth_date,
    height_cm: patch.height_cm,
    target_weight_kg: patch.target_weight_kg,
    activity_level: patch.activity_level,
    goal: patch.goal,
    timezone: patch.timezone,
    units: patch.units,
    day_start_hour: patch.day_start_hour,
    notify_weekly_review: patch.notify_weekly_review,
    notify_nudges: patch.notify_nudges,
    diet: patch.diet,
    avoids: patch.avoids,
  };

  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [];
  for (const [column, value] of Object.entries(columns)) {
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }

  params.push(userId);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return getUser(userId);
}

/**
 * What onboarding still has to find out. All but the last are what a target
 * cannot honestly be calculated without.
 *
 * Units is the exception and belongs here anyway, because this list is also
 * what decides when setup is over. Left out of it, the preference would be
 * asked last or not at all — the conversation would end the moment the target
 * could be computed, and someone in Ohio would be handed a number in kilos.
 * Null is "not yet asked"; existing accounts were backfilled to metric, which
 * is what they have been reading all along.
 */
export function missingProfileFields(profile: Profile): string[] {
  const missing: string[] = [];
  if (!profile.sex) missing.push('sex');
  if (!profile.birth_date) missing.push('date of birth');
  if (!profile.height_cm) missing.push('height');
  if (!profile.goal) missing.push('goal');
  if (!profile.activity_level) missing.push('activity level');
  if (!profile.units) missing.push('whether they read metric or imperial units');
  return missing;
}

export async function markOnboarded(userId: string): Promise<void> {
  await query(
    `UPDATE users
        SET is_setup_complete = TRUE,
            onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
            updated_at = now()
      WHERE id = $1`,
    [userId],
  );
}

// ---- Accounts --------------------------------------------------------------

export async function findUserByEmail(email: string) {
  return queryOne<{ id: string; password_hash: string | null; email_verified: boolean }>(
    `SELECT id, password_hash, (email_verified_at IS NOT NULL) AS email_verified
       FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
}

export async function emailInUse(email: string): Promise<boolean> {
  return (await findUserByEmail(email)) !== null;
}

/**
 * Creates an account. As a one-time upgrade path from the single-user build, an
 * existing credential-less user row is adopted by the first signup rather than
 * orphaning whatever was already logged against it.
 *
 * A null password is not a missing argument, it is an account that signs in
 * with Google and has no password at all. `authenticate` already refuses a row
 * with no hash, so such an account simply has no password door — which is the
 * point of it. It can grow one later through the reset flow, which proves the
 * mailbox rather than the old password and so works perfectly well for someone
 * who never had one.
 */
export async function createAccount(
  email: string,
  password: string | null,
  displayName: string | null,
  timezone: string,
): Promise<string> {
  const passwordHash = password === null ? null : await hashPassword(password);

  const orphan = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE email IS NULL
      AND (SELECT count(*) FROM users WHERE email IS NOT NULL) = 0
   ORDER BY created_at ASC LIMIT 1`,
  );

  if (orphan) {
    await query(
      `UPDATE users
          SET email = $1, password_hash = $2,
              display_name = COALESCE(display_name, $3),
              timezone = COALESCE(NULLIF($4, ''), timezone),
              updated_at = now()
        WHERE id = $5`,
      [email, passwordHash, displayName, timezone, orphan.id],
    );
    return orphan.id;
  }

  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name, timezone)
     VALUES ($1,$2,$3, COALESCE(NULLIF($4, ''), 'UTC'))
     RETURNING id`,
    [email, passwordHash, displayName, timezone],
  );
  return row!.id;
}

export async function authenticate(email: string, password: string): Promise<string | null> {
  const user = await findUserByEmail(email);
  if (!user?.password_hash) return null;
  return (await verifyPassword(password, user.password_hash)) ? user.id : null;
}

/**
 * Everything a message to this account needs, in one read.
 *
 * Together rather than in pieces because the caller is always about to make one
 * decision from all of it: whether to send, in what language of time, and to
 * whom. Null when there is no address to write to — the pre-accounts
 * placeholder row, or an account already deleted.
 */
export interface EmailRecipient {
  userId: string;
  email: string;
  displayName: string | null;
  timezone: string;
  /** Which units the mail should be written in. Same reason as `timezone`. */
  units: UnitSystem;
  /** Product email goes only to an address someone has proved they can read. */
  verified: boolean;
  notifyWeeklyReview: boolean;
  notifyNudges: boolean;
}

/**
 * What the session hook needs to know about an account, in one read.
 *
 * Folded into a single query rather than two calls because this runs on *every*
 * request: asking separately whether an account is suspended and whether its
 * address is proved would double the per-request round trips to answer one
 * question — may this request proceed.
 */
export interface AccountGate {
  disabled: boolean;
  verified: boolean;
  /**
   * What this account is entitled to. Read here rather than in the routes that
   * need it for the same reason as the two above — it is the same row, and the
   * rate limiter has to know the ceiling before the handler runs.
   */
  plan: PlanName;
}

export async function accountGate(userId: string): Promise<AccountGate> {
  const row = await queryOne<{
    disabled_at: string | null;
    email_verified_at: string | null;
    plan: PlanName;
  }>('SELECT disabled_at, email_verified_at, plan FROM users WHERE id = $1', [userId]);
  return {
    disabled: row?.disabled_at != null,
    // A missing row is treated as unverified, but the session hook will already
    // have failed to resolve it — this is belt and braces, not a live path.
    verified: row?.email_verified_at != null,
    plan: row?.plan ?? 'free',
  };
}

export async function getEmailRecipient(userId: string): Promise<EmailRecipient | null> {
  const row = await queryOne<any>(
    `SELECT id, email, display_name, timezone, units, email_verified_at, notify_weekly_review, notify_nudges
       FROM users WHERE id = $1 AND email IS NOT NULL`,
    [userId],
  );
  return row ? toRecipient(row) : null;
}

/** The same, found by address. For flows that start before there is a session. */
export async function findRecipientByEmail(email: string): Promise<EmailRecipient | null> {
  const row = await queryOne<any>(
    `SELECT id, email, display_name, timezone, units, email_verified_at, notify_weekly_review, notify_nudges
       FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return row ? toRecipient(row) : null;
}

function toRecipient(row: any): EmailRecipient {
  return {
    userId: row.id,
    email: row.email,
    displayName: row.display_name,
    timezone: row.timezone,
    units: unitsOf(row),
    verified: row.email_verified_at !== null,
    notifyWeeklyReview: row.notify_weekly_review,
    notifyNudges: row.notify_nudges,
  };
}

/**
 * Records that this address has been proved.
 *
 * Scoped to the address the link was issued for, not just the user: someone who
 * requests a link, changes their email, then clicks the old link has proved
 * only that they can read the *old* mailbox, which is not the claim being made.
 * The mismatch makes it a no-op rather than an error — there is nothing useful
 * to tell them, and the state they wanted is one click away.
 */
export async function markEmailVerified(userId: string, email: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
      WHERE id = $1 AND lower(email) = lower($2)
      RETURNING id`,
    [userId, email],
  );
  return row !== null;
}

/**
 * Takes the password away, leaving the account reachable only by its linked
 * provider — or by the reset flow, which needs no password to start.
 *
 * Signing existing sessions out is the caller's job, and a caller that does not
 * do it has achieved nothing: this closes the front door on someone who is
 * already inside the house.
 */
export async function clearPassword(userId: string): Promise<void> {
  await query('UPDATE users SET password_hash = NULL, updated_at = now() WHERE id = $1', [userId]);
}

/** Replaces the password. Signing other sessions out is the caller's job. */
export async function setPassword(userId: string, password: string): Promise<void> {
  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
    await hashPassword(password),
    userId,
  ]);
}

export async function setWeeklyReviewEmails(userId: string, enabled: boolean): Promise<void> {
  await query('UPDATE users SET notify_weekly_review = $1, updated_at = now() WHERE id = $2', [
    enabled,
    userId,
  ]);
}

export async function setNudgeEmails(userId: string, enabled: boolean): Promise<void> {
  await query('UPDATE users SET notify_nudges = $1, updated_at = now() WHERE id = $2', [
    enabled,
    userId,
  ]);
}

export async function countAccounts(): Promise<number> {
  const row = await queryOne<{ n: string }>(
    'SELECT count(*) AS n FROM users WHERE email IS NOT NULL',
  );
  return Number(row?.n ?? 0);
}

function toProfile(row: any): Profile {
  return {
    id: row.id,
    email: row.email ?? null,
    email_verified: row.email_verified_at !== null,
    display_name: row.display_name,
    sex: row.sex,
    birth_date: row.birth_date ? String(row.birth_date).slice(0, 10) : null,
    height_cm: row.height_cm === null ? null : Number(row.height_cm),
    target_weight_kg: row.target_weight_kg === null ? null : Number(row.target_weight_kg),
    activity_level: row.activity_level,
    goal: row.goal,
    timezone: row.timezone,
    units: row.units ?? null,
    day_start_hour: Number(row.day_start_hour),
    is_setup_complete: row.is_setup_complete,
    notify_weekly_review: row.notify_weekly_review,
    notify_nudges: row.notify_nudges,
    plan: row.plan,
    diet: row.diet,
    avoids: row.avoids ?? [],
  };
}

/**
 * Accounts the weekly scheduler should consider: real (email-bearing) users who
 * have finished setup. The pre-account placeholder row is excluded — it has no
 * owner to write a review for.
 */
export async function listActiveUsers(): Promise<
  Array<{ id: string; timezone: string; day_start_hour: number }>
> {
  return query<{ id: string; timezone: string; day_start_hour: number }>(
    `SELECT id, timezone, day_start_hour
       FROM users
      WHERE email IS NOT NULL AND is_setup_complete = TRUE
   ORDER BY created_at ASC`,
  );
}
