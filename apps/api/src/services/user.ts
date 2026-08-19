import type { Profile, ProfileUpdate } from '@ct/shared';
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
    day_start_hour: patch.day_start_hour,
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

/** The fields onboarding needs before targets can be calculated honestly. */
export function missingProfileFields(profile: Profile): string[] {
  const missing: string[] = [];
  if (!profile.sex) missing.push('sex');
  if (!profile.birth_date) missing.push('date of birth');
  if (!profile.height_cm) missing.push('height');
  if (!profile.goal) missing.push('goal');
  if (!profile.activity_level) missing.push('activity level');
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
  return queryOne<{ id: string; password_hash: string | null }>(
    'SELECT id, password_hash FROM users WHERE lower(email) = lower($1)',
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
 */
export async function createAccount(
  email: string,
  password: string,
  displayName: string | null,
  timezone: string,
): Promise<string> {
  const passwordHash = await hashPassword(password);

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
    display_name: row.display_name,
    sex: row.sex,
    birth_date: row.birth_date ? String(row.birth_date).slice(0, 10) : null,
    height_cm: row.height_cm === null ? null : Number(row.height_cm),
    target_weight_kg: row.target_weight_kg === null ? null : Number(row.target_weight_kg),
    activity_level: row.activity_level,
    goal: row.goal,
    timezone: row.timezone,
    day_start_hour: Number(row.day_start_hour),
    is_setup_complete: row.is_setup_complete,
  };
}
