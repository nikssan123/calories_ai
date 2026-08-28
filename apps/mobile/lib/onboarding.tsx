import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { OnboardingState } from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * Whether this account has been through setup, held once for the whole tree.
 *
 * It answers one question now, where it used to answer two. The old pair —
 * "setup is unfinished" and "unfinished *and* nothing logged yet" — existed
 * because setup was a conversation somebody could walk away from mid-sentence,
 * which left the app in a state it had to keep apologising for: five screens
 * drawing targets calculated for nobody, a banner on each of them saying so,
 * and a tab bar hiding four of the six rooms.
 *
 * Setup is a form now, and the form is a gate. `app/_layout.tsx` will not draw
 * the tabs until this says `complete`, so the half-finished state has nowhere
 * to be observed from and the whole apparatus that described it is gone. What
 * is left is the flag and the fact that it has been asked for once.
 *
 * `ready` is not a nicety. The gate has to distinguish "this account needs
 * setup" from "nobody has answered yet", or the first frame after sign-in shows
 * the tabs to somebody who is about to be sent to the wizard — and a frame of
 * the wrong screen on the very first launch is the one place this app cannot
 * afford to look uncertain about what it is.
 */
interface OnboardingValue {
  /** Null until the server has answered once. */
  state: OnboardingState | null;
  /**
   * Whether the question has been *put*, however it went. False only in the
   * window between signing in and the first answer — a failed request counts,
   * for the reason on `refresh` below.
   */
  ready: boolean;
  /** Resolved and unfinished. Never true while `ready` is false. */
  needsSetup: boolean;
  /** Adopt an answer the caller already has, rather than asking again. */
  adopt: (state: OnboardingState) => void;
  refresh: () => Promise<OnboardingState | null>;
}

const OnboardingContext = createContext<OnboardingValue>({
  state: null,
  ready: false,
  needsSetup: false,
  adopt: () => {},
  refresh: async () => null,
});

export const useOnboarding = (): OnboardingValue => useContext(OnboardingContext);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, emailVerified } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async (): Promise<OnboardingState | null> => {
    try {
      const next = await api.onboarding();
      setState(next);
      return next;
    } catch {
      /*
       * An unreachable server is not an unfinished account. Whatever was last
       * known stays, and null stays null — which now reads as "not gated",
       * because holding somebody on a setup wizard they cannot submit is the
       * one outcome worse than opening the app with a generic target in it.
       */
      return null;
    } finally {
      // Marked ready either way, which is the whole point of the `finally`: a
      // phone in a tunnel must not sit on the splash screen indefinitely.
      setReady(true);
    }
  }, []);

  /*
   * Verified as well as signed in: the API answers 403 to every route outside
   * `/auth/` until the address is confirmed, so asking earlier spends a request
   * to be told nothing. `app/_layout.tsx` holds an unverified account on the
   * verify screen anyway.
   */
  useEffect(() => {
    if (!authenticated || !emailVerified) {
      setState(null);
      setReady(false);
      return;
    }
    void refresh();
  }, [authenticated, emailVerified, refresh]);

  const value = useMemo<OnboardingValue>(
    () => ({
      state,
      ready,
      needsSetup: ready && state !== null && !state.complete,
      adopt: setState,
      refresh,
    }),
    [state, ready, refresh],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
