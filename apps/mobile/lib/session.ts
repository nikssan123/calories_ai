import * as SecureStore from 'expo-secure-store';

const KEY = 'ct_session';

/**
 * The session token, in the device keystore.
 *
 * A native client has no httpOnly cookie to hide behind, so the token is
 * readable by definition — the question is only by what. `expo-secure-store` is
 * the Keychain on iOS and the EncryptedSharedPreferences/Keystore pair on
 * Android: still readable by this app, not readable by another one, and gone
 * with the app rather than left in a plaintext file a backup would carry off.
 *
 * `WHEN_UNLOCKED` rather than the default: this is a food journal, not a
 * background sync, and there is no reason for the token to be reachable while
 * the phone is locked.
 *
 * Cached in memory as well as on disk, because `createApiClient` reads the
 * token synchronously on every single request and SecureStore is async. The
 * cache is the authority during a session; disk is what survives a restart.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

let cached: string | null = null;

/** Reads the stored token into the cache. Call once, before the first request. */
export async function restoreToken(): Promise<string | null> {
  try {
    cached = await SecureStore.getItemAsync(KEY, OPTIONS);
  } catch {
    // A keystore that will not open is indistinguishable from no session, and
    // the recovery for both is the same screen.
    cached = null;
  }
  return cached;
}

/** The token as of right now, without touching disk. */
export function currentToken(): string | null {
  return cached;
}

export async function saveToken(token: string): Promise<void> {
  cached = token;
  await SecureStore.setItemAsync(KEY, token, OPTIONS);
}

export async function clearToken(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
}
