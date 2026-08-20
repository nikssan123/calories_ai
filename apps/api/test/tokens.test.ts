import { describe, expect, it } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import {
  consumeToken,
  issueToken,
  purgeExpiredTokens,
  TOKEN_TTL_MINUTES,
} from '../src/services/tokens.ts';
import { createUser } from './helpers/factories.ts';

/**
 * A reset token is the account for as long as it lives, so the properties
 * asserted here are the ones the whole flow rests on: it is never stored in a
 * form that could be replayed, it works exactly once, it dies on schedule, and
 * asking for a new one kills the old.
 */

describe('issueToken', () => {
  it('stores a hash, never the token', async () => {
    const user = await createUser();
    const { token } = await issueToken(user.id, 'password_reset', user.email);

    const rows = await query<{ token_hash: string }>('SELECT token_hash FROM auth_tokens');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toContain(token);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a URL-safe token with no padding to be mangled in a link', async () => {
    const user = await createUser();
    const { token } = await issueToken(user.id, 'password_reset', user.email);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it('never issues the same token twice', async () => {
    const user = await createUser();
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      seen.add((await issueToken(user.id, 'email_verification', user.email)).token);
    }
    expect(seen.size).toBe(5);
  });

  it('dates the expiry from the purpose’s own TTL', async () => {
    const user = await createUser();
    const before = Date.now();
    const reset = await issueToken(user.id, 'password_reset', user.email);
    const verify = await issueToken(user.id, 'email_verification', user.email);

    const minutes = (issued: Date) => Math.round((issued.getTime() - before) / 60_000);
    expect(minutes(reset.expiresAt)).toBe(TOKEN_TTL_MINUTES.password_reset);
    expect(minutes(verify.expiresAt)).toBe(TOKEN_TTL_MINUTES.email_verification);
    // An hour for a reset; a day for a confirmation nothing is gated on.
    expect(TOKEN_TTL_MINUTES.password_reset).toBeLessThan(TOKEN_TTL_MINUTES.email_verification);
  });

  it('retires the previous token of the same purpose', async () => {
    const user = await createUser();
    const first = await issueToken(user.id, 'password_reset', user.email);
    const second = await issueToken(user.id, 'password_reset', user.email);

    // Three impatient clicks must not leave three live keys in a mailbox.
    expect(await consumeToken(first.token, 'password_reset')).toBeNull();
    expect(await consumeToken(second.token, 'password_reset')).toMatchObject({ userId: user.id });
  });

  it('leaves a token of a different purpose alone', async () => {
    const user = await createUser();
    const verification = await issueToken(user.id, 'email_verification', user.email);
    await issueToken(user.id, 'password_reset', user.email);

    expect(await consumeToken(verification.token, 'email_verification')).toMatchObject({
      userId: user.id,
    });
  });

  it('records the address the link was sent to', async () => {
    const user = await createUser();
    const { token } = await issueToken(user.id, 'email_verification', user.email);

    expect(await consumeToken(token, 'email_verification')).toEqual({
      userId: user.id,
      email: user.email,
    });
  });
});

describe('consumeToken', () => {
  it('works exactly once', async () => {
    const user = await createUser();
    const { token } = await issueToken(user.id, 'password_reset', user.email);

    expect(await consumeToken(token, 'password_reset')).toMatchObject({ userId: user.id });
    expect(await consumeToken(token, 'password_reset')).toBeNull();
  });

  it('is settled by the database when two requests race', async () => {
    const user = await createUser();
    const { token } = await issueToken(user.id, 'password_reset', user.email);

    const results = await Promise.all([
      consumeToken(token, 'password_reset'),
      consumeToken(token, 'password_reset'),
      consumeToken(token, 'password_reset'),
    ]);

    // Exactly one winner, whichever it is.
    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it('refuses a token presented for the wrong purpose', async () => {
    const user = await createUser();
    const { token } = await issueToken(user.id, 'email_verification', user.email);

    // Otherwise a confirmation link — which is long-lived and handed out freely
    // — would double as a password reset.
    expect(await consumeToken(token, 'password_reset')).toBeNull();
    expect(await consumeToken(token, 'email_verification')).not.toBeNull();
  });

  it('refuses an expired token', async () => {
    const user = await createUser();
    const { token } = await issueToken(user.id, 'password_reset', user.email);
    await query("UPDATE auth_tokens SET expires_at = now() - interval '1 minute'");

    expect(await consumeToken(token, 'password_reset')).toBeNull();
  });

  it('refuses a token that was never issued', async () => {
    expect(await consumeToken('not-a-real-token', 'password_reset')).toBeNull();
  });

  it('dies with the account it belonged to', async () => {
    const user = await createUser();
    const { token } = await issueToken(user.id, 'password_reset', user.email);
    await query('DELETE FROM users WHERE id = $1', [user.id]);

    expect(await consumeToken(token, 'password_reset')).toBeNull();
  });
});

describe('purgeExpiredTokens', () => {
  it('keeps a spent token long enough to explain itself, then clears it', async () => {
    const user = await createUser();
    await issueToken(user.id, 'password_reset', user.email);

    // Expired yesterday: still worth being able to say "already used".
    await query("UPDATE auth_tokens SET expires_at = now() - interval '1 day'");
    await purgeExpiredTokens();
    expect(await count()).toBe(1);

    await query("UPDATE auth_tokens SET expires_at = now() - interval '8 days'");
    await purgeExpiredTokens();
    expect(await count()).toBe(0);
  });

  it('leaves live tokens alone', async () => {
    const user = await createUser();
    await issueToken(user.id, 'password_reset', user.email);
    await purgeExpiredTokens();
    expect(await count()).toBe(1);
  });
});

async function count(): Promise<number> {
  const row = await queryOne<{ n: string }>('SELECT count(*) AS n FROM auth_tokens');
  return Number(row!.n);
}
