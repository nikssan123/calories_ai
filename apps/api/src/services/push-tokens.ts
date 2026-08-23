import { query, queryOne } from '../db.ts';

export type PushPlatform = 'ios' | 'android';

export interface PushToken {
  token: string;
  platform: PushPlatform;
}

/**
 * The addresses a person's phones can be reached at.
 *
 * Deliberately small. Everything about *whether* to send lives in `push/notify`
 * beside the same decision for email; this file only knows where.
 */

/**
 * Claims a token for a user.
 *
 * An upsert on the token rather than on the pair, which is the whole point of
 * the unique index: a phone that is signed out of and back into by somebody
 * else keeps the same token, and the second person must take that address over
 * rather than end up sharing it. Two rows would mean one device buzzing with
 * another person's food log.
 *
 * `last_seen_at` moves on every registration, which the app does on every cold
 * start it has permission for. That is the cheap half of knowing which tokens
 * are still real; the expensive half is Expo telling us one is not, which
 * `dropToken` handles.
 */
export async function registerPushToken(
  userId: string,
  { token, platform }: PushToken,
): Promise<void> {
  await query(
    `INSERT INTO push_tokens (user_id, token, platform)
          VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE
             SET user_id = EXCLUDED.user_id,
                 platform = EXCLUDED.platform,
                 last_seen_at = now()`,
    [userId, token, platform],
  );
}

/**
 * Gives a token up, on sign-out.
 *
 * Scoped to the user as well as the token so that a stale client cannot
 * unregister a device that has since been claimed by somebody else — the
 * signed-out half of the same handover `registerPushToken` guards.
 */
export async function forgetPushToken(userId: string, token: string): Promise<void> {
  await query('DELETE FROM push_tokens WHERE user_id = $1 AND token = $2', [userId, token]);
}

/**
 * Every device to try for one person.
 *
 * Unscoped by platform: what gets sent is identical either way, and a person
 * with a phone and a tablet asked to be told once, not once per device they own
 * — but that is a question about the *message*, not about the address list, and
 * it belongs to whoever decides to collapse them.
 */
export async function pushTokensFor(userId: string): Promise<PushToken[]> {
  return query<{ token: string; platform: PushPlatform }>(
    'SELECT token, platform FROM push_tokens WHERE user_id = $1',
    [userId],
  );
}

/**
 * Forgets a token the relay has told us is dead.
 *
 * By token alone, with no user: the whole point of a `DeviceNotRegistered`
 * receipt is that the app is gone from that device, and which account it last
 * belonged to does not change that the address is void.
 */
export async function dropToken(token: string): Promise<void> {
  await query('DELETE FROM push_tokens WHERE token = $1', [token]);
}

/** For the tests, and for anyone wondering whether a registration landed. */
export async function countPushTokens(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    'SELECT count(*)::text AS count FROM push_tokens WHERE user_id = $1',
    [userId],
  );
  return Number(row?.count ?? 0);
}
