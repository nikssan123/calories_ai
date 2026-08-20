import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { query, queryOne } from '../db.ts';

/**
 * Email + password with server-side sessions. Uses node's built-in scrypt so
 * there is no native dependency to build, and stores only a hash of the session
 * token — the raw value lives exclusively with the client, in the browser's
 * cookie or a native app's keystore.
 */

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SESSION_DAYS = 60;

export const SESSION_COOKIE = 'ct_session';

/**
 * The session token from an `Authorization: Bearer` header, or null when the
 * header is absent or carries a different scheme. Native clients authenticate
 * this way; browsers keep using the cookie.
 */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^bearer[ \t]+(\S+)[ \t]*$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  const expected = Buffer.from(hashHex, 'hex');
  // Lengths must match before timingSafeEqual, which throws otherwise.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function hashToken(token: string): string {
  // A session token is already high-entropy, so a plain digest is enough here;
  // it exists to stop a database leak from handing over live sessions.
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await query(
    'INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [userId, hashToken(token), expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

export async function resolveSession(token: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE auth_sessions SET last_seen_at = now()
      WHERE token_hash = $1 AND expires_at > now()
      RETURNING user_id`,
    [hashToken(token)],
  );
  return row?.user_id ?? null;
}

export async function destroySession(token: string): Promise<void> {
  await query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(token)]);
}

/**
 * Signs an account out everywhere.
 *
 * Called on a password reset, where it is the substantive half of the action:
 * changing the password stops the next sign-in, but only this stops the person
 * who is already inside.
 */
export async function destroyAllSessions(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    'DELETE FROM auth_sessions WHERE user_id = $1 RETURNING id',
    [userId],
  );
  return rows.length;
}

export async function purgeExpiredSessions(): Promise<void> {
  await query('DELETE FROM auth_sessions WHERE expires_at <= now()');
}
