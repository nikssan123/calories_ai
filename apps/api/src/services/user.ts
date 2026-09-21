import type { Locale, PlanName, Profile, ProfileUpdate, UnitSystem } from '@ct/shared';
import { localeOf, unitsOf } from '@ct/shared';
import { unmeteredFor } from '../ai/lane.ts';
import { query, queryOne } from '../db.ts';
import type { DayContext } from '../time.ts';
import { hashPassword, verifyPassword } from './auth.ts';
import { startTrial } from './trial.ts';

export interface UserContext extends DayContext {
  userId: string;
  /**
   * Which system this person reads, for the display strings the server writes
   * itself — a scanned portion, a card's quantity line. Nothing stored changes
   * with it; see UNITS.md.
   */
  units: UnitSystem;
  /**
   * Which language the strings the server writes itself are in — a scanned
   * portion's phrase, a card's quantity line. Same standing as `units`: it
   * changes what is rendered and nothing that is stored.
   */
  locale: Locale;
}

export async function getUser(userId: string): Promise<Profile> {
  const row = await queryOne<any>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!row) throw new Error('User not found');
  return toProfile(row);
}

export async function getUserContext(userId: string): Promise<UserContext> {
  const user = await getUser(userId);
  return {
    userId: user.id,
    timezone: user.timezone,
    dayStartHour: user.day_start_hour,
    units: unitsOf(user),
    locale: localeOf(user),
  };
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
    locale: patch.locale,
    day_start_hour: patch.day_start_hour,
    notify_weekly_review: patch.notify_weekly_review,
    notify_nudges: patch.notify_nudges,
    notify_milestones: patch.notify_milestones,
    notify_daily_recap: patch.notify_daily_recap,
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
 * What setup still has to find out. The first five are what a target cannot
 * honestly be calculated without.
 *
 * The last two are not — they are rendering preferences, and they belong here
 * anyway, because this list is also what decides when setup is over. Left out
 * of it, a preference would be asked last or not at all: the wizard would stop
 * the moment the target could be computed, and someone in Ohio would be handed
 * a number in kilos, in a language their phone is not set to.
 *
 * This is also the list the client is gated on — `GET /onboarding` answers
 * `complete` from it, and the app will not draw its tabs until that is true —
 * so a field added here is a question the wizard has to grow a screen for. It
 * is not somewhere to park a nice-to-have.
 *
 * Null is "nobody has ever been told", which is not the same as the default
 * either one falls back to. Existing accounts were backfilled — metric, and
 * English — because that is what they have been reading all along, so this
 * reopens nothing for them.
 */
export function missingProfileFields(profile: Profile): string[] {
  const missing: string[] = [];
  if (!profile.sex) missing.push('sex');
  if (!profile.birth_date) missing.push('date of birth');
  if (!profile.height_cm) missing.push('height');
  if (!profile.goal) missing.push('goal');
  if (!profile.activity_level) missing.push('activity level');
  if (!profile.units) missing.push('whether they read metric or imperial units');
  if (!profile.locale) missing.push('which language they read');
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
  /**
   * The device or browser language, when the client knew one.
   *
   * Stored at signup rather than left null because the very first thing this
   * account receives is a confirmation email, and that is sent before there is
   * a profile for anyone to read a preference off. Null when we could not tell,
   * which leaves the journal free to learn it from how they write.
   */
  locale: Locale | null = null,
): Promise<string> {
  const passwordHash = password === null ? null : await hashPassword(password);

  /*
   * Never a guest's row. A fresh deployment's first sign-up adopts the
   * pre-accounts placeholder; before guests existed that was the only kind of
   * row with no address, and now a stranger's guest journal is one too.
   */
  const orphan = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE email IS NULL AND guest_since IS NULL
      AND (SELECT count(*) FROM users WHERE email IS NOT NULL) = 0
   ORDER BY created_at ASC LIMIT 1`,
  );

  if (orphan) {
    await query(
      `UPDATE users
          SET email = $1, password_hash = $2,
              display_name = COALESCE(display_name, $3),
              timezone = COALESCE(NULLIF($4, ''), timezone),
              locale = COALESCE($5, locale),
              updated_at = now()
        WHERE id = $6`,
      [email, passwordHash, displayName, timezone, locale, orphan.id],
    );
    return orphan.id;
  }

  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name, timezone, locale)
     VALUES ($1,$2,$3, COALESCE(NULLIF($4, ''), 'UTC'), $5)
     RETURNING id`,
    [email, passwordHash, displayName, timezone, locale],
  );
  return row!.id;
}

/**
 * A guest: a real row with no address, made for a phone that finished the
 * first-run walk (GUEST-ACCOUNTS.md).
 *
 * `trial_started_at` is left at its default of null on purpose — the trial is
 * what saving the account earns, and until then the row is metered as a guest.
 */
export async function createGuest(timezone: string, locale: Locale | null): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (timezone, locale, guest_since)
     VALUES (COALESCE(NULLIF($1, ''), 'UTC'), $2, now())
     RETURNING id`,
    [timezone, locale],
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
  /**
   * Which language the mail is written in. The AI-written half of a review is
   * already in it — `languageBrief` saw to that when the review was generated —
   * so this is for the chrome around it: the stat block's labels, the footer,
   * and the whole of the transactional mail, none of which passes a model.
   */
  locale: Locale;
  /** Product email goes only to an address someone has proved they can read. */
  verified: boolean;
  notifyWeeklyReview: boolean;
  notifyNudges: boolean;
  /**
   * The two push-only preferences. They live on this type despite its name
   * because it is already the one read that answers "who is this person and
   * what do they want to hear" — see `push/notify.ts`, which has used it for
   * every push since there were any.
   */
  notifyMilestones: boolean;
  notifyDailyRecap: boolean;
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
  /** A guest has not proved an identity, and is let past the verification gate. */
  guest: boolean;
  /**
   * What this account is entitled to. Read here rather than in the routes that
   * need it for the same reason as the two above — it is the same row, and the
   * rate limiter has to know the ceiling before the handler runs.
   */
  plan: PlanName;
  /**
   * Whether this account's turns are on the subscription rather than the
   * metered key, which decides whether the plan's ceilings apply to it at all.
   *
   * Resolved from the address on the same row, so it costs nothing extra here
   * and nothing at all downstream — see `unmeteredFor`. The address itself is
   * deliberately not returned: it is not the session hook's business, and
   * everything that needs one already reads the profile.
   */
  unmetered: boolean;
}

export async function accountGate(userId: string): Promise<AccountGate> {
  const row = await queryOne<{
    disabled_at: string | null;
    email_verified_at: string | null;
    plan: PlanName;
    email: string | null;
    guest_since: string | null;
  }>('SELECT disabled_at, email_verified_at, plan, email, guest_since FROM users WHERE id = $1', [userId]);
  return {
    disabled: row?.disabled_at != null,
    guest: row?.guest_since != null,
    // A missing row is treated as unverified, but the session hook will already
    // have failed to resolve it — this is belt and braces, not a live path.
    verified: row?.email_verified_at != null,
    plan: row?.plan ?? 'free',
    unmetered: unmeteredFor(row?.email),
  };
}

/**
 * Where the confirmation code goes: the account's address, or a guest's pending
 * one. The only lookup that reads `pending_email` — everything else that mails a
 * person uses `getEmailRecipient`, which never sees an address nobody proved.
 */
export async function getVerificationRecipient(userId: string): Promise<EmailRecipient | null> {
  const row = await queryOne<any>(
    `SELECT id, COALESCE(email, pending_email) AS email, display_name, timezone, units, locale,
            email_verified_at, notify_weekly_review, notify_nudges, notify_milestones, notify_daily_recap
       FROM users WHERE id = $1 AND (email IS NOT NULL OR pending_email IS NOT NULL)`,
    [userId],
  );
  return row ? toRecipient(row) : null;
}

/**
 * What a *phone* needs to know about somebody, which is less than an inbox does.
 *
 * `getEmailRecipient` is keyed on having an address, because everything it was
 * written for puts one in a To: header. A push has no To: header — it has a
 * device token — so asking for an address first is asking the wrong question,
 * and it is the question that made every guest unreachable: the alert pass
 * read its preferences through it and skipped anybody who answered null.
 *
 * Deliberately narrow rather than a nullable-email variant of the recipient.
 * The four fields below are everything the alert pass decides from, and a
 * shape that cannot carry an address cannot be handed to a mailer by mistake.
 *
 * It does check `disabled_at`, which `getEmailRecipient` does not and which is
 * a real change for the pass that swapped to this one: a deactivated account
 * with an address used to be considered. Nothing should push to an account on
 * its way out, and no other gate in that pass was catching it.
 */
export interface NotifyRecipient {
  units: UnitSystem;
  locale: Locale;
  notifyMilestones: boolean;
  notifyDailyRecap: boolean;
}

export async function getNotifyRecipient(userId: string): Promise<NotifyRecipient | null> {
  const row = await queryOne<any>(
    `SELECT units, locale, notify_milestones, notify_daily_recap
       FROM users WHERE id = $1 AND disabled_at IS NULL`,
    [userId],
  );
  if (!row) return null;
  return {
    units: unitsOf(row),
    locale: localeOf(row),
    notifyMilestones: row.notify_milestones,
    notifyDailyRecap: row.notify_daily_recap,
  };
}

export async function getEmailRecipient(userId: string): Promise<EmailRecipient | null> {
  const row = await queryOne<any>(
    `SELECT id, email, display_name, timezone, units, locale, email_verified_at,
            notify_weekly_review, notify_nudges, notify_milestones, notify_daily_recap
       FROM users WHERE id = $1 AND email IS NOT NULL`,
    [userId],
  );
  return row ? toRecipient(row) : null;
}

/** The same, found by address. For flows that start before there is a session. */
export async function findRecipientByEmail(email: string): Promise<EmailRecipient | null> {
  const row = await queryOne<any>(
    `SELECT id, email, display_name, timezone, units, locale, email_verified_at,
            notify_weekly_review, notify_nudges, notify_milestones, notify_daily_recap
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
    locale: localeOf(row),
    verified: row.email_verified_at !== null,
    notifyWeeklyReview: row.notify_weekly_review,
    notifyNudges: row.notify_nudges,
    notifyMilestones: row.notify_milestones,
    notifyDailyRecap: row.notify_daily_recap,
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
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()),
                      guest_since = NULL,
                      updated_at = now()
      WHERE id = $1 AND lower(email) = lower($2)
      RETURNING id`,
    [userId, email],
  );
  if (!row) return false;
  /*
   * An identity proved is an account saved (GUEST-ACCOUNTS.md): a guest stops
   * being one in the update above, and the seven-day trial starts here. Every
   * door that proves an address comes through this function — the six-digit
   * code, the link in the email, and Google — so the trial cannot be reached
   * without one and cannot be missed with one. Idempotent: a second confirmation
   * or a relink never hands out a second week.
   */
  await startTrial(userId);
  return true;
}

/** Postgres's unique_violation: the address was taken between the check and the write. */
export function isEmailTaken(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

/**
 * "Save my account" with an address and a password (GUEST-ACCOUNTS.md).
 *
 * The address is *pending*: it sits in `pending_email`, not `email`, until the
 * six-digit code comes back through this guest's own session. Nothing else in
 * the server — the reset flow, the admin allowlist, the subscription lane, the
 * alerts and receipts — reads `pending_email`, so an address a guest merely typed
 * grants nothing and reaches nothing but the one confirmation code. The password
 * goes on the row now; with no `email` it cannot be used to sign in until the
 * address is proved. Returns false when the row is not a guest.
 */
export async function claimAddress(
  userId: string,
  email: string,
  password: string,
  displayName: string | null,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE users SET pending_email = $2, password_hash = $3,
                      display_name = COALESCE($4, display_name),
                      updated_at = now()
      WHERE id = $1 AND guest_since IS NOT NULL AND email IS NULL
      RETURNING id`,
    [userId, email, await hashPassword(password), displayName],
  );
  return row !== null;
}

/**
 * The code came back: the pending address becomes the account's.
 *
 * Only for the address that was pending, only on a guest, and only called from a
 * request carrying that guest's session. Clears the guest and starts the trial
 * the same way `markEmailVerified` does. `taken` when somebody else registered
 * the address since it was typed — the unique index is the final word, so a race
 * with a sign-up lands here rather than as a 500.
 */
export async function confirmPendingAddress(
  userId: string,
  email: string,
): Promise<'confirmed' | 'taken' | 'not_pending'> {
  let row: { id: string } | null;
  try {
    row = await queryOne<{ id: string }>(
      `UPDATE users SET email = pending_email, pending_email = NULL,
                        email_verified_at = now(), guest_since = NULL, updated_at = now()
        WHERE id = $1 AND guest_since IS NOT NULL AND email IS NULL
          AND lower(pending_email) = lower($2)
        RETURNING id`,
      [userId, email],
    );
  } catch (error) {
    if (isEmailTaken(error)) return 'taken';
    throw error;
  }
  if (!row) return 'not_pending';
  await startTrial(userId);
  return 'confirmed';
}

/**
 * Puts a provider's address on a guest row, already proved by the provider. The
 * caller links the identity; `markEmailVerified` then ends the guest and starts
 * the trial. A password typed for a pending claim is removed, as the adopt path
 * in `signInWithProvider` removes an unproved one: the account signs in with the
 * provider now, and can grow a password through the reset flow.
 */
export async function attachProvedAddress(
  userId: string,
  email: string,
  displayName: string | null,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE users SET email = $2, pending_email = NULL, password_hash = NULL,
                      display_name = COALESCE(display_name, $3), updated_at = now()
      WHERE id = $1 AND guest_since IS NOT NULL AND email IS NULL
      RETURNING id`,
    [userId, email, displayName],
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
    guest: row.guest_since != null,
    pending_email: row.pending_email ?? null,
    email_verified: row.email_verified_at !== null,
    // The fact, never the hash: this is the shape that leaves the server.
    has_password: row.password_hash !== null && row.password_hash !== undefined,
    display_name: row.display_name,
    sex: row.sex,
    birth_date: row.birth_date ? String(row.birth_date).slice(0, 10) : null,
    height_cm: row.height_cm === null ? null : Number(row.height_cm),
    target_weight_kg: row.target_weight_kg === null ? null : Number(row.target_weight_kg),
    activity_level: row.activity_level,
    goal: row.goal,
    timezone: row.timezone,
    units: row.units ?? null,
    locale: row.locale ?? null,
    day_start_hour: Number(row.day_start_hour),
    is_setup_complete: row.is_setup_complete,
    notify_weekly_review: row.notify_weekly_review,
    notify_nudges: row.notify_nudges,
    notify_milestones: row.notify_milestones,
    notify_daily_recap: row.notify_daily_recap,
    plan: row.plan,
    diet: row.diet,
    avoids: row.avoids ?? [],
  };
}

/**
 * An account as a scheduled pass sees it.
 *
 * Named rather than repeated inline now that three functions return it, which
 * is worth doing for one reason beyond tidiness: this shape is a list of the
 * columns a pass is allowed to decide anything from, and a type is where that
 * stays visible.
 */
export interface ActiveUser {
  id: string;
  timezone: string;
  day_start_hour: number;
  plan: PlanName;
  email: string | null;
}

const ACTIVE_USER_COLUMNS = 'id, timezone, day_start_hour, plan, email';
/*
 * Somebody who finished setup, and who is somebody.
 *
 * It used to read `email IS NOT NULL AND is_setup_complete = TRUE`, and the
 * address was doing two jobs. One was real and is kept below: a row with
 * neither an address nor a guest marker is the pre-account placeholder, and it
 * has no owner to write anything for. The other was an accident of history —
 * when it was written, having an address was the same thing as being a person.
 *
 * Guest accounts (GUEST-ACCOUNTS.md) ended that, and nothing here noticed. A
 * guest is a finished, owned, logging account that has not been asked for an
 * address yet, and every one of them was dropped by this line, silently, from
 * every scheduled pass in the file. That is the whole of paid acquisition:
 * an install from the French or German campaigns walks setup and lands as a
 * guest, so the app's answer to "somebody stopped logging" could not reach the
 * only people it was happening to.
 *
 * `guest_since` says the thing the address was standing in for. Nothing
 * downstream loses a guard: the review and the nudge read `plan` before they
 * spend a model, and both of their senders still need an address of their own
 * before anything reaches an inbox.
 */
const ACTIVE_USER_WHERE =
  'is_setup_complete = TRUE AND (email IS NOT NULL OR guest_since IS NOT NULL)';

/**
 * Accounts the scheduler should consider: anyone who has finished setup and
 * belongs to somebody, with or without an address. The pre-account placeholder
 * row is excluded — it has neither.
 */
export async function listActiveUsers(): Promise<ActiveUser[]> {
  /*
   * `plan` is selected because both scheduled passes are entitlements, not
   * chores. The weekly review and the model-written nudge are sold — they are
   * `reviewsPerDay` and `nudgesPerWeek` in `plans.ts`, and both are zero on
   * free — and the scheduler is the one caller that can spend them without a
   * request ever arriving. Without this column it did: every active account got
   * a review every Monday and a nudge every week, whatever they were paying,
   * which is roughly $0.65 and $0.11 a month of model time per free account
   * against a tier whose whole design is a steady state of zero.
   *
   * `email` rides along for the other half of that question. It is already in
   * the WHERE clause, and both passes have to know whether this account's turns
   * are billed at all before they read a ceiling written in dollars — see
   * `unmeteredFor`.
   */
  return query<ActiveUser>(
    `SELECT ${ACTIVE_USER_COLUMNS}
       FROM users
      WHERE ${ACTIVE_USER_WHERE}
   ORDER BY created_at ASC`,
  );
}

/**
 * The distinct timezones active accounts live in.
 *
 * The first half of not reading every account, every hour, to find the few
 * whose clock has come round. A scheduled pass is a question about a *clock* —
 * is it Monday morning where you are — and the answer is the same for everyone
 * in a zone, so the zones are what should be walked. There are a few dozen of
 * them at any size of user base, and at a thousand accounts in Sofia there is
 * precisely one.
 *
 * The clock itself deliberately stays in TypeScript. Postgres could answer
 * `EXTRACT(ISODOW FROM now() AT TIME ZONE timezone)` directly and save this
 * round trip, and it would be the wrong trade twice over: the publishing rule
 * would then exist in two languages that have to agree, and `AT TIME ZONE` over
 * a column throws on a name Postgres does not carry — which turns one account
 * with a zone from a browser Postgres has never heard of into a pass that
 * fails for everybody.
 */
export async function activeTimezones(): Promise<string[]> {
  const rows = await query<{ timezone: string }>(
    `SELECT DISTINCT timezone FROM users WHERE ${ACTIVE_USER_WHERE}`,
  );
  return rows.map((row) => row.timezone);
}

/**
 * Active accounts in the given timezones, and none at all for an empty list.
 *
 * The second half. On the twenty-three hours a day and six days a week when
 * nobody's review is due this reads no rows rather than all of them, which is
 * the difference between a scheduler whose cost tracks the accounts it has work
 * for and one whose cost tracks the accounts that exist.
 */
export async function listActiveUsersIn(timezones: readonly string[]): Promise<ActiveUser[]> {
  if (timezones.length === 0) return [];

  return query<ActiveUser>(
    `SELECT ${ACTIVE_USER_COLUMNS}
       FROM users
      WHERE ${ACTIVE_USER_WHERE}
        AND timezone = ANY($1::text[])
   ORDER BY created_at ASC`,
    [timezones],
  );
}
