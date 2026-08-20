import { randomBytes } from 'node:crypto';
import { queryOne } from '../db.ts';

/**
 * Server-side secrets that are generated rather than configured.
 *
 * Kept in the database because a signing key must outlive a restart and be the
 * same on every instance, and generated rather than required because a personal
 * install should not have to invent a random string before it will boot.
 */

/** Signs photo URLs, so a native client can load an image without a session. */
export const PHOTO_URL_SECRET = 'photo_url';

const cache = new Map<string, string>();

export async function getSecret(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;

  // Two instances booting together will both try to insert. ON CONFLICT makes
  // the loser a no-op, and the RETURNING clause then yields nothing — so the
  // read afterwards is what actually settles which value won, for both of them.
  await queryOne(
    'INSERT INTO app_secrets (name, value) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
    [name, randomBytes(32).toString('base64url')],
  );
  const row = await queryOne<{ value: string }>(
    'SELECT value FROM app_secrets WHERE name = $1',
    [name],
  );

  const value = row!.value;
  cache.set(name, value);
  return value;
}

/** Drops the in-process cache. For tests, and for rotation without a restart. */
export function forgetSecrets(): void {
  cache.clear();
}
