import { createHash, randomBytes } from 'node:crypto';
import { query, queryOne } from '../db.ts';

/**
 * Single-use tokens for the two things that have to work without a session:
 * proving you can read an address, and getting back in when you cannot.
 *
 * They are stored the way session tokens are — hashed, with only the raw value
 * leaving the server — for a sharper reason than sessions have. A reset token
 * *is* the account for the minute it is alive, and it is sitting in a mailbox
 * that this server does not control. Everything about the design assumes it
 * will leak eventually: short lives, one use, and nothing in the database that
 * could be turned back into a working link.
 */

export type TokenPurpose = 'password_reset' | 'email_verification';

/**
 * Long enough to be unguessable, short enough to survive a mail client that
 * wraps long lines. The link must expire before it is worth attacking, which is
 * what the TTLs below are actually for.
 */
const TOKEN_BYTES = 32;

export const TOKEN_TTL_MINUTES: Record<TokenPurpose, number> = {
  /**
   * An hour. It only has to outlast the walk from "I clicked the link" to "I
   * typed a new password", and every extra minute is a minute the token is
   * alive in a mailbox someone else may already be reading.
   */
  password_reset: 60,
  /**
   * A day. Nothing is gated on verification, so the cost of it expiring is a
   * second click on "resend" rather than being locked out — but people do read
   * their mail the next morning.
   */
  email_verification: 60 * 24,
};

function hashToken(token: string): string {
  // The token is already 256 bits of randomness, so a plain digest is enough;
  // there is nothing here for a slow hash to protect against.
  return createHash('sha256').update(token).digest('hex');
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

/**
 * Mints a token, and quietly retires any earlier one for the same purpose.
 *
 * Superseding matters: someone who clicks "email me a link" three times because
 * the first two were slow should not leave three live keys to their account
 * lying around in a mailbox. The most recent link is the one that works.
 */
export async function issueToken(
  userId: string,
  purpose: TokenPurpose,
  email: string,
): Promise<IssuedToken> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES[purpose] * 60 * 1000);

  await query(
    `UPDATE auth_tokens SET used_at = now()
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose],
  );
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, email, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, purpose, hashToken(token), email, expiresAt.toISOString()],
  );

  return { token, expiresAt };
}

export interface ConsumedToken {
  userId: string;
  /** The address the link was sent to, which is what a verification proves. */
  email: string;
}

/**
 * Spends a token, or returns null.
 *
 * The claim and the check are one statement on purpose. Reading the row, then
 * deciding, then marking it used would leave a window in which two requests
 * both pass — and the whole security property of a reset link is that it works
 * exactly once. Postgres settles it here instead: whoever's UPDATE matches the
 * `used_at IS NULL` row gets the account, and the other gets nothing.
 */
export async function consumeToken(
  token: string,
  purpose: TokenPurpose,
): Promise<ConsumedToken | null> {
  const row = await queryOne<{ user_id: string; email: string }>(
    `UPDATE auth_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id, email`,
    [hashToken(token), purpose],
  );
  return row ? { userId: row.user_id, email: row.email } : null;
}

/**
 * Clears out spent and expired rows, on the same schedule as expired sessions.
 * Kept for a week after expiry rather than deleted on use, so "that link has
 * already been used" stays answerable for as long as anyone is likely to ask.
 */
export async function purgeExpiredTokens(): Promise<void> {
  await query("DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days'");
}
