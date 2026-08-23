import { createHash, randomBytes, randomInt } from 'node:crypto';
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

export type TokenPurpose = 'password_reset' | 'email_verification' | 'oauth_handoff';

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
  /**
   * Two minutes, which is the walk from Google's consent screen back into the
   * app and nothing more. Nobody reads this one, nobody types it, and nobody
   * comes back to it tomorrow: it is minted by a redirect and spent by the
   * request that redirect lands on. A longer life would buy nothing and would
   * leave a live key to an account sitting in a browser's history.
   */
  oauth_handoff: 2,
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
// ---- Codes -----------------------------------------------------------------

/**
 * Wrong guesses a single code will tolerate before it is spent.
 *
 * Six digits is a million possibilities — ample against a person typing, and
 * nothing at all against a script. The route's rate limit is keyed by IP and an
 * attacker with addresses to spare walks straight past it, so the real ceiling
 * has to live on the row being attacked. Five is generous for a code someone is
 * copying across from another device and useless to anyone brute-forcing it.
 */
export const MAX_CODE_ATTEMPTS = 5;

const CODE_DIGITS = 6;

/**
 * A code, and a link, for the same verification.
 *
 * Two ways into one row, so spending either spends both — which is what stops
 * "click the link, then be asked for the code it already used" from being a
 * state anyone can reach. The code is for the common case of reading mail on a
 * phone while signed in on a laptop; the link is for the reverse.
 */
export async function issueVerification(
  userId: string,
  email: string,
): Promise<{ token: string; code: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  // `randomInt` rather than `Math.random`: this is a credential, and a modulo of
  // a weak PRNG is exactly how a "random" code turns out to be predictable.
  const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
  const expiresAt = new Date(
    Date.now() + TOKEN_TTL_MINUTES.email_verification * 60 * 1000,
  );

  // Supersede first, for the reason `issueToken` does: three impatient clicks
  // must not leave three live codes, and the newest is the one people will type.
  await query(
    `UPDATE auth_tokens SET used_at = now()
      WHERE user_id = $1 AND purpose = 'email_verification' AND used_at IS NULL`,
    [userId],
  );
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, code_hash, email, expires_at)
     VALUES ($1,'email_verification',$2,$3,$4,$5)`,
    [userId, hashToken(token), hashToken(code), email, expiresAt.toISOString()],
  );

  return { token, code, expiresAt };
}

export type CodeResult =
  | { ok: true; email: string }
  /** Wrong, and how many tries are left. Told plainly — see the route. */
  | { ok: false; reason: 'wrong'; remaining: number }
  /** Out of guesses, or expired, or never issued. One answer for all three. */
  | { ok: false; reason: 'spent' };

/**
 * Spends a code, for the user who is holding the session.
 *
 * Scoped by user, unlike `consumeToken`, and that is not a detail: six digits
 * are not unique across accounts the way 256 bits are, so a global lookup would
 * let anyone guessing find *somebody's* live code eventually. Tying it to the
 * session means a guess is aimed at one account and counted against one row.
 */
export async function consumeCode(userId: string, code: string): Promise<CodeResult> {
  const live = await queryOne<{ id: string; email: string; code_hash: string; attempts: number }>(
    `SELECT id, email, code_hash, attempts FROM auth_tokens
      WHERE user_id = $1 AND purpose = 'email_verification'
        AND code_hash IS NOT NULL AND used_at IS NULL AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (!live) return { ok: false, reason: 'spent' };

  if (live.code_hash !== hashToken(code.trim())) {
    // Counted in the database rather than in memory, so concurrent guesses
    // cannot both read "4 used" and each spend a fifth.
    const row = await queryOne<{ attempts: number }>(
      'UPDATE auth_tokens SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
      [live.id],
    );
    const attempts = row?.attempts ?? MAX_CODE_ATTEMPTS;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      // Burn it. A code that has been guessed at five times is a code somebody
      // is working on, and the owner can have a fresh one for the asking.
      await query('UPDATE auth_tokens SET used_at = now() WHERE id = $1', [live.id]);
      return { ok: false, reason: 'spent' };
    }
    return { ok: false, reason: 'wrong', remaining: MAX_CODE_ATTEMPTS - attempts };
  }

  // Right answer. Claim it the same way the link path does — conditionally, so
  // two requests arriving together cannot both win.
  const claimed = await queryOne<{ email: string }>(
    `UPDATE auth_tokens SET used_at = now()
      WHERE id = $1 AND used_at IS NULL
      RETURNING email`,
    [live.id],
  );
  return claimed ? { ok: true, email: claimed.email } : { ok: false, reason: 'spent' };
}

// ---- Handing a browser sign-in to a native app -----------------------------

/**
 * Parks a completed Google sign-in for an app to collect.
 *
 * Two secrets on one row, and they answer different questions. The code is
 * random and travels back through a custom-scheme redirect, which is a channel
 * the app does not have exclusive claim to on Android. The challenge is the
 * SHA-256 of a verifier the app made before it opened the browser and has not
 * sent anywhere — so spending the row needs both the thing that was intercepted
 * and the thing that never left the device.
 *
 * That is PKCE with this server in Google's chair, and it is why the code being
 * readable in a browser's history is survivable rather than fatal.
 */
export async function issueHandoff(
  userId: string,
  email: string,
  challenge: string,
): Promise<IssuedToken> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES.oauth_handoff * 60 * 1000);

  // No superseding here, unlike the two mailed kinds. Nothing about this row is
  // waiting in an inbox to be found later — it dies in two minutes — and two
  // sign-ins started on two devices at once are two people's business.
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, code_hash, email, expires_at)
     VALUES ($1,'oauth_handoff',$2,$3,$4,$5)`,
    [userId, hashToken(token), challenge, email, expiresAt.toISOString()],
  );

  return { token, expiresAt };
}

/**
 * Spends a handoff, or returns null.
 *
 * One statement for the same reason `consumeToken` is one: the row is a session
 * waiting to be issued, and "read it, check it, mark it" leaves a window where
 * two requests are both told yes. The challenge is compared in SQL rather than
 * in JavaScript so the whole decision stays inside that single claim.
 *
 * No attempt counter, unlike the six-digit code. Both halves here are 256 bits
 * of randomness: there is nothing to throttle, because there is nothing anyone
 * could be part-way through guessing.
 */
export async function consumeHandoff(
  code: string,
  challenge: string,
): Promise<ConsumedToken | null> {
  const row = await queryOne<{ user_id: string; email: string }>(
    `UPDATE auth_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = 'oauth_handoff' AND code_hash = $2
        AND used_at IS NULL AND expires_at > now()
      RETURNING user_id, email`,
    [hashToken(code), challenge],
  );
  return row ? { userId: row.user_id, email: row.email } : null;
}

export async function purgeExpiredTokens(): Promise<void> {
  await query("DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days'");
}
