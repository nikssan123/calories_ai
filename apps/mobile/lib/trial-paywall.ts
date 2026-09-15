import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/lib/auth';
import { useEntitlements } from '@/lib/entitlements';

/**
 * The one time the plans open without being asked for: the first time the app
 * is opened by somebody whose free trial has ended.
 *
 * Once per account per phone, and never again after that — from then on the
 * wall in the journal and the locked buttons say it where it matters. A
 * paywall that opens on every launch is a reason to stop launching.
 *
 * **On opening, never mid-sentence.** It is checked when the entitlements are
 * fetched (launch, sign-in) and when the app comes back to the front — not when
 * a turn's refusal is adopted. The first message after the trial ends already
 * lands as a wall in the journal; sliding the plans over that same message, with
 * the close held back, is two refusals for one tap.
 *
 * Mounted in the tabs rather than the root, so it cannot land on top of the
 * first-run walk or a sign-in form.
 */
export function useTrialEndedPaywall(): void {
  const { profile } = useAuth();
  const { plan, allowances, fetchedAt, refresh } = useEntitlements();
  const router = useRouter();
  const chat = allowances?.chat ?? null;
  const userId = profile?.id ?? null;

  // Read through a ref so the foreground listener sees the latest state without
  // being torn down and re-added on every adopted allowance.
  const state = useRef({ plan, trial: chat?.trial ?? null, endsAt: chat?.trial_ends_at ?? null, userId });
  state.current = { plan, trial: chat?.trial ?? null, endsAt: chat?.trial_ends_at ?? null, userId };

  const showOnce = useCallback(async () => {
    const { plan: p, trial, userId: id } = state.current;
    if (p !== 'free' || trial !== 'ended' || !id) return;
    const key = `paywall.trialEnded.${id}`;
    try {
      if (await AsyncStorage.getItem(key)) return;
      // Written before the push, so a crash on the paywall cannot turn this
      // into a loop that opens it on every launch.
      await AsyncStorage.setItem(key, new Date().toISOString());
      router.push({ pathname: '/upgrade', params: { from: 'trial' } });
    } catch {
      // Storage refused: skip the moment rather than risk showing it forever.
    }
  }, [router]);

  // After every fetch from the server.
  useEffect(() => {
    if (fetchedAt !== null) void showOnce();
  }, [fetchedAt, userId, showOnce]);

  /*
   * Back to the front. A phone can sit in the background across the end of a
   * trial, so a week that should be over is re-read — one request, and only
   * then. A trial a turn already found ended needs no request, only the check.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const { plan: p, trial, endsAt } = state.current;
      if (p !== 'free') return;
      if (trial === 'trial' && endsAt && Date.now() >= Date.parse(endsAt)) void refresh();
      else if (trial === 'ended') void showOnce();
    });
    return () => subscription.remove();
  }, [refresh, showOnce]);
}
