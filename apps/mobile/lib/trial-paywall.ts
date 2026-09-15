import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/lib/auth';
import { useEntitlements } from '@/lib/entitlements';

/**
 * The one time the plans open without being asked for: the first time the app
 * is in front of somebody whose free trial has ended.
 *
 * Once per account per phone, and never again after that — from then on the
 * wall in the journal and the locked buttons say it where it matters. A
 * paywall that opens on every launch is a reason to stop launching.
 *
 * Mounted in the tabs rather than the root, so it cannot land on top of the
 * first-run walk or a sign-in form.
 */
export function useTrialEndedPaywall(): void {
  const { profile } = useAuth();
  const { plan, allowances, refresh } = useEntitlements();
  const router = useRouter();
  const chat = allowances?.chat ?? null;
  const userId = profile?.id ?? null;

  /*
   * The entitlements are read when the session arrives, and a phone can sit in
   * the background across the end of a trial. So coming back to the front re-reads
   * them — but only when the week should already be over, which keeps this to
   * one request per account rather than one per unlock.
   */
  useEffect(() => {
    if (plan !== 'free' || chat?.trial !== 'trial' || !chat.trial_ends_at) return;
    const endsAt = Date.parse(chat.trial_ends_at);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() >= endsAt) void refresh();
    });
    return () => subscription.remove();
  }, [plan, chat?.trial, chat?.trial_ends_at, refresh]);

  useEffect(() => {
    if (plan !== 'free' || chat?.trial !== 'ended' || !userId) return;
    let live = true;
    const key = `paywall.trialEnded.${userId}`;
    void (async () => {
      try {
        if (await AsyncStorage.getItem(key)) return;
        // Written before the push, so a crash on the paywall cannot turn this
        // into a loop that opens it on every launch.
        await AsyncStorage.setItem(key, new Date().toISOString());
        if (live) router.push({ pathname: '/upgrade', params: { from: 'trial' } });
      } catch {
        // Storage refused: skip the moment rather than risk showing it forever.
      }
    })();
    return () => {
      live = false;
    };
  }, [plan, chat?.trial, userId, router]);
}
