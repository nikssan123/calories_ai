import * as SecureStore from 'expo-secure-store';
import { api } from '@/lib/api';

/**
 * A guest's journal, waiting to go into the account signed in to next
 * (GUEST-ACCOUNTS.md).
 *
 * A guest whose address already has an account taps "Sign in to that account
 * instead". The guest session ends on this phone, but its token is kept here —
 * in the keystore, like the session — and after the sign-in the app hands it to
 * `POST /auth/absorb-guest`, which moves the guest's meals, weigh-ins and
 * workouts into the account and removes the guest. The token is the only proof
 * that journal belongs to whoever is holding the phone, which is why the guest's
 * server session is not revoked on the way out.
 *
 * Kept for a day. Somebody who taps the button and then walks away should not
 * have a stranger's later sign-in on this phone collect it.
 */

const KEY = 'ct_guest_to_merge';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED };

export async function keepGuestForMerge(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ token, at: Date.now() }), OPTIONS);
  } catch {
    /* Without the keystore the journal stays with the guest, as it did before merging existed. */
  }
}

/**
 * Hands a kept guest to the account now signed in. Resolves to whether anything
 * was brought across; never throws, because a sign-in that worked must not look
 * like one that failed over the journal that was meant to follow it.
 */
export async function mergeKeptGuest(): Promise<boolean> {
  let kept: { token: string; at: number } | null = null;
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    kept = raw ? (JSON.parse(raw) as { token: string; at: number }) : null;
  } catch {
    kept = null;
  }
  if (!kept) return false;
  if (Date.now() - kept.at > MAX_AGE_MS) {
    await SecureStore.deleteItemAsync(KEY, OPTIONS).catch(() => {});
    return false;
  }
  try {
    await api.absorbGuest({ guest_token: kept.token });
    await SecureStore.deleteItemAsync(KEY, OPTIONS).catch(() => {});
    return true;
  } catch {
    // 404 is "nothing to bring" — the guest is already gone. Anything else is
    // tried again at the next sign-in, within the day.
    return false;
  }
}
