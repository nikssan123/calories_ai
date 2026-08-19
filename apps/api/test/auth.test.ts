import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db.ts';
import {
  createSession,
  destroySession,
  hashPassword,
  purgeExpiredSessions,
  resolveSession,
  SESSION_COOKIE,
  verifyPassword,
} from '../src/services/auth.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

describe('password hashing', () => {
  it('verifies the right password', async () => {
    const stored = await hashPassword('correct-horse');
    expect(await verifyPassword('correct-horse', stored)).toBe(true);
    expect(await verifyPassword('correct-horsey', stored)).toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('stores the scheme and salt, never the password', async () => {
    const stored = await hashPassword('correct-horse');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored).not.toContain('correct-horse');
  });

  it.each([
    ['an unknown scheme', 'bcrypt$aa$bb'],
    ['a missing salt', 'scrypt$$bb'],
    ['a truncated record', 'scrypt$aa'],
    ['nonsense', 'garbage'],
    ['an empty string', ''],
  ])('rejects %s rather than throwing', async (_label, stored) => {
    expect(await verifyPassword('correct-horse', stored)).toBe(false);
  });

  it('rejects a hash of the wrong length without throwing', async () => {
    // timingSafeEqual throws on a length mismatch, so this must be pre-checked.
    expect(await verifyPassword('correct-horse', 'scrypt$aabb$ccdd')).toBe(false);
  });
});

describe('sessions', () => {
  it('issues a token that resolves back to its user', async () => {
    const { token, expiresAt } = await createSession(user.id);
    expect(await resolveSession(token)).toBe(user.id);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('stores only a hash, so a database leak hands over nothing usable', async () => {
    const { token } = await createSession(user.id);
    const rows = await query<{ token_hash: string }>('SELECT token_hash FROM auth_sessions');
    expect(rows[0]!.token_hash).not.toBe(token);
    expect(rows[0]!.token_hash).toHaveLength(64);
  });

  it('refuses an unknown token', async () => {
    expect(await resolveSession('not-a-real-token')).toBeNull();
  });

  it('refuses an expired token', async () => {
    const { token } = await createSession(user.id);
    await query("UPDATE auth_sessions SET expires_at = now() - interval '1 day'");
    expect(await resolveSession(token)).toBeNull();
  });

  it('touches last_seen_at on use', async () => {
    const { token } = await createSession(user.id);
    await query("UPDATE auth_sessions SET last_seen_at = now() - interval '1 day'");
    const before = await query<{ last_seen_at: Date }>('SELECT last_seen_at FROM auth_sessions');
    await resolveSession(token);
    const after = await query<{ last_seen_at: Date }>('SELECT last_seen_at FROM auth_sessions');
    expect(after[0]!.last_seen_at.getTime()).toBeGreaterThan(before[0]!.last_seen_at.getTime());
  });

  it('destroys one session without touching the others', async () => {
    const first = await createSession(user.id);
    const second = await createSession(user.id);
    await destroySession(first.token);
    expect(await resolveSession(first.token)).toBeNull();
    expect(await resolveSession(second.token)).toBe(user.id);
  });

  it('ignores a logout with an unknown token', async () => {
    await expect(destroySession('nope')).resolves.toBeUndefined();
  });

  it('purges expired rows and keeps live ones', async () => {
    const live = await createSession(user.id);
    await createSession(user.id);
    await query(
      "UPDATE auth_sessions SET expires_at = now() - interval '1 day' WHERE token_hash <> encode(digest($1, 'sha256'), 'hex')",
      [live.token],
    ).catch(async () => {
      // pgcrypto's digest() may be unavailable; fall back to expiring everything
      // except the newest row.
      await query(
        `UPDATE auth_sessions SET expires_at = now() - interval '1 day'
          WHERE id <> (SELECT id FROM auth_sessions ORDER BY created_at DESC LIMIT 1)`,
      );
    });

    await purgeExpiredSessions();
    const remaining = await query<{ n: string }>('SELECT count(*) AS n FROM auth_sessions');
    expect(Number(remaining[0]!.n)).toBe(1);
  });

  it('names the cookie the client and server agree on', () => {
    expect(SESSION_COOKIE).toBe('ct_session');
  });
});
