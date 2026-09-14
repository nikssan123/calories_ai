import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActivityLevel, Goal, Locale, OnboardingState, Sex, UnitSystem } from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * Whether this person has been through setup — and now, whether they have been
 * through it before they had an account at all.
 *
 * Setup used to be the third gate, behind sign-in and verification: an app that
 * opened on "Create your account" and only then asked what you were here for.
 * That is the order a database wants and the opposite of the order a person
 * decides in. Somebody deciding whether this app is worth an email address
 * wants to see what it would do for them first, and the plan it draws at the
 * end of six questions is the best answer it has (GLOW-UP.md, "onboarding
 * before account creation").
 *
 * So the questions are answered into a **draft** that lives on the phone, the
 * plan is worked out on the phone (`calculateTargets` is shared for exactly
 * this), and the account is asked for only when there is a plan to save. Once a
 * verified session exists, the draft is written to the server here — in the
 * provider rather than on the verify screen, because Google sign-in never passes
 * through that screen and a plan answered before it must not be lost to it.
 *
 * An account that is already set up wins over a draft. Somebody reinstalling on
 * a new phone who walks through the questions again and then signs in to their
 * real account has not asked for their profile to be overwritten by a sketch;
 * the draft is simply dropped.
 */
export interface OnboardingDraft {
  goal: Goal;
  sex: Sex;
  birth_date: string;
  height_cm: number;
  weight_kg: number;
  target_weight_kg: number | null;
  activity_level: ActivityLevel;
  units: UnitSystem;
  locale: Locale;
  /** When the plan was shown. A draft without this is still being answered. */
  completed_at: string | null;
}

interface OnboardingValue {
  /** Null until the server has answered once. */
  state: OnboardingState | null;
  /**
   * Whether the question has been *put*, however it went. False only in the
   * window between a verified session appearing and the first answer — which
   * now includes writing a draft up, so the tabs never draw a target computed
   * before the profile it belongs to has landed.
   */
  ready: boolean;
  /** Resolved and unfinished. Never true while `ready` is false. */
  needsSetup: boolean;
  /** Adopt an answer the caller already has, rather than asking again. */
  adopt: (state: OnboardingState) => void;
  refresh: () => Promise<OnboardingState | null>;

  /** Whether the draft has been read off the disk yet. The gate waits on it. */
  draftLoaded: boolean;
  /** The answers so far, from a session with no account. */
  draft: OnboardingDraft | null;
  /** Whether the draft has a plan at the end of it, waiting for an account. */
  planWaiting: boolean;
  saveDraft: (draft: OnboardingDraft) => Promise<void>;
  /**
   * "I already have an account", pressed on the way in. Held in memory only:
   * the next cold launch with no session asks again, which is right for a phone
   * somebody else might pick up.
   */
  signingIn: boolean;
  chooseSignIn: (signingIn: boolean) => void;
  /** Whether a draft is being written to a fresh account right now. */
  saving: boolean;
}

const DRAFT_KEY = 'ct:onboarding-draft:v1';

const OnboardingContext = createContext<OnboardingValue>({
  state: null,
  ready: false,
  needsSetup: false,
  adopt: () => {},
  refresh: async () => null,
  draftLoaded: false,
  draft: null,
  planWaiting: false,
  saveDraft: async () => {},
  signingIn: false,
  chooseSignIn: () => {},
  saving: false,
});

export const useOnboarding = (): OnboardingValue => useContext(OnboardingContext);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, emailVerified, adoptProfile } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (raw) setDraft(JSON.parse(raw) as OnboardingDraft);
      } catch {
        /* A corrupt draft is six questions asked again, not a launch that fails. */
      } finally {
        setDraftLoaded(true);
      }
    })();
  }, []);

  const saveDraft = useCallback(async (next: OnboardingDraft) => {
    setDraft(next);
    try {
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      /* Kept in memory; only a relaunch before sign-up would lose it. */
    }
  }, []);

  const dropDraft = useCallback(async () => {
    setDraft(null);
    try {
      await AsyncStorage.removeItem(DRAFT_KEY);
    } catch {
      /* Harmless: an account that is set up ignores a draft anyway. */
    }
  }, []);

  /*
   * The draft is read through a ref inside `refresh`, so that saving an answer
   * does not give `refresh` a new identity and re-run the effect below — which
   * would ask the server again on every question of a signed-in setup.
   */
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const refresh = useCallback(async (): Promise<OnboardingState | null> => {
    try {
      let next = await api.onboarding();
      const waiting = draftRef.current;
      if (waiting?.completed_at) {
        if (next.complete) {
          // An account that already knows who it is keeps what it knows.
          await dropDraft();
        } else {
          setSaving(true);
          /*
           * The weigh-in first, for the reason `submit` in `app/onboarding.tsx`
           * gives: `PATCH /profile` recalculates today's target from the latest
           * weight, and a profile saved before the weight exists computes one
           * against nothing.
           */
          await api.logWeight(waiting.weight_kg);
          const saved = await api.updateProfile({
            sex: waiting.sex,
            birth_date: waiting.birth_date,
            height_cm: waiting.height_cm,
            goal: waiting.goal,
            activity_level: waiting.activity_level,
            units: waiting.units,
            locale: waiting.locale,
            target_weight_kg: waiting.goal === 'maintain' ? null : waiting.target_weight_kg,
          });
          adoptProfile(saved);
          next = await api.onboarding();
          // Dropped only once the server has it. A failure above leaves the
          // draft in place for the next launch to try again.
          await dropDraft();
        }
      }
      setState(next);
      return next;
    } catch {
      /*
       * An unreachable server is not an unfinished account. Whatever was last
       * known stays, and null stays null — which reads as "not gated", because
       * holding somebody on a setup wizard they cannot submit is the one outcome
       * worse than opening the app with a generic target in it.
       */
      return null;
    } finally {
      setSaving(false);
      // Marked ready either way: a phone in a tunnel must not sit on the splash.
      setReady(true);
    }
  }, [adoptProfile, dropDraft]);

  /*
   * Verified as well as signed in: the API answers 403 to every route outside
   * `/auth/` until the address is confirmed, so asking earlier spends a request
   * to be told nothing.
   */
  useEffect(() => {
    if (!authenticated || !emailVerified) {
      setState(null);
      setReady(false);
      return;
    }
    // Waits for the disk, so a draft is never missed by a session restored
    // faster than AsyncStorage answered.
    if (!draftLoaded) return;
    setSigningIn(false);
    void refresh();
  }, [authenticated, emailVerified, draftLoaded, refresh]);

  const value = useMemo<OnboardingValue>(
    () => ({
      state,
      ready,
      needsSetup: ready && state !== null && !state.complete,
      adopt: setState,
      refresh,
      draftLoaded,
      draft,
      planWaiting: Boolean(draft?.completed_at),
      saveDraft,
      signingIn,
      chooseSignIn: setSigningIn,
      saving,
    }),
    [state, ready, refresh, draftLoaded, draft, saveDraft, signingIn, saving],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
