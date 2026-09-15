import { useCallback } from 'react';
import { useRouter } from 'expo-router';

/**
 * Why the save-your-account screen was opened (GUEST-ACCOUNTS.md). It decides
 * the headline and the reason given, never what the screen does.
 *
 * - `guest_limit` — the guest's AI logs are spent; saving unlocks the trial.
 * - `purchase` — a guest tapped buy; what is bought should belong to an account.
 * - `you` — the "Save your account" row on the You tab.
 * - `first_log` — a soft ask after the first meal.
 */
export type SaveReason = 'guest_limit' | 'purchase' | 'you' | 'first_log';

/** Opens the save-your-account screen. */
export function useSaveAccount() {
  const router = useRouter();
  const open = useCallback(
    (reason: SaveReason) => router.push({ pathname: '/save-account', params: { reason } }),
    [router],
  );
  return { open };
}
