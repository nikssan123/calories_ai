import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { OnboardingState } from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * How far into the app a new account has got, held once for the whole tree.
 *
 * It was local state on the journal, which was the only screen that asked —
 * and that is precisely what made setup skippable: the journal knew the profile
 * was half empty, and the five screens rendering targets off it did not. A tab
 * bar cannot read a hook that lives inside one of its tabs, so this had to come
 * out to where both can see it.
 *
 * Two facts, and they answer different questions:
 *
 * - `pending` — setup is unfinished, so every target on every screen is a
 *   generic default rather than a number calculated for this person. Screens
 *   that show one say so; see `<SetupBanner>`.
 * - `gated` — unfinished *and* nothing logged yet, which is a brand-new account
 *   that has not done anything at all. Only the journal is offered, because
 *   nothing else would be true yet.
 *
 * The moment they log a meal without finishing, `gated` goes false and the rest
 * of the app opens with its numbers labelled. That is deliberate: somebody who
 * photographs their lunch instead of answering questions has told you what they
 * came for, and the answer to it is to get out of the way rather than to keep
 * the door shut. The journal picks setup back up on the next turn — the brief
 * has told it to do that since it was written.
 */
interface OnboardingValue {
  /** Null until the server has answered once. */
  state: OnboardingState | null;
  pending: boolean;
  gated: boolean;
  /** Adopt an answer the caller already has, rather than asking again. */
  adopt: (state: OnboardingState) => void;
  refresh: () => Promise<OnboardingState | null>;
}

const OnboardingContext = createContext<OnboardingValue>({
  state: null,
  pending: false,
  gated: false,
  adopt: () => {},
  refresh: async () => null,
});

export const useOnboarding = (): OnboardingValue => useContext(OnboardingContext);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, emailVerified } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);

  const refresh = useCallback(async (): Promise<OnboardingState | null> => {
    try {
      const next = await api.onboarding();
      setState(next);
      return next;
    } catch {
      // An unreachable server is not an unfinished account. Whatever was last
      // known stays, and null stays null — which reads as "not gated", because
      // penning somebody on one screen over a failed request is the one outcome
      // worse than showing them a placeholder target.
      return null;
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
      return;
    }
    void refresh();
  }, [authenticated, emailVerified, refresh]);

  const value = useMemo<OnboardingValue>(
    () => ({
      state,
      pending: state !== null && !state.complete,
      gated: state !== null && !state.complete && !state.logged,
      adopt: setState,
      refresh,
    }),
    [state, refresh],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
