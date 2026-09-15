import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActivityLevel, Goal, Locale, OnboardingState, Sex, UnitSystem } from '@ct/shared';
import { ApiError } from '@ct/api-client';
import { api } from '@/lib/api';
import { currentToken } from '@/lib/session';
import { reachedStep } from '@/lib/funnel';
import { useAuth } from '@/lib/auth';
import { preferredLocale } from '@/lib/i18n';

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
  /** Forget the draft — once setup has reached the server some other way. */
  dropDraft: () => Promise<void>;
  /**
   * "I already have an account", pressed on the way in. Held in memory only:
   * the next cold launch with no session asks again, which is right for a phone
   * somebody else might pick up.
   */
  signingIn: boolean;
  chooseSignIn: (signingIn: boolean) => void;
  /** Whether a draft is being written to a fresh account right now. */
  saving: boolean;
  /**
   * Why starting the guest session failed, when it did. `offline` is worth a
   * retry; `refused` is the server saying no — too many new accounts from this
   * connection, or sign-ups closed — where a retry is the same answer again, so
   * the saving screen offers signing in and changing the answers instead.
   */
  guestError: 'offline' | 'refused' | null;
  retryGuest: () => void;
}

const DRAFT_KEY = 'ct:onboarding-draft:v1';

/** How long "Start logging" waits for the server before offering a retry. */
const GUEST_TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
  dropDraft: async () => {},
  signingIn: false,
  chooseSignIn: () => {},
  saving: false,
  guestError: null,
  retryGuest: () => {},
});

export const useOnboarding = (): OnboardingValue => useContext(OnboardingContext);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const {
    authenticated,
    emailVerified: verified,
    guest,
    loading,
    profile,
    startGuest,
    adoptProfile,
    refresh: refreshAuth,
  } = useAuth();
  const profileId = profile?.id ?? null;
  /*
   * "Inside" for everything below: a proved address, or a guest. A guest is let
   * past the verification gate on the server, so its answers upload and its
   * setup state is read exactly as a confirmed account's are.
   */
  const emailVerified = verified || guest;
  const [state, setState] = useState<OnboardingState | null>(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guestError, setGuestError] = useState<'offline' | 'refused' | null>(null);
  /*
   * Set when a signed-in session ends, so the finished draft still in state for
   * the rest of that render is not mistaken for a new walk to make a guest of.
   * Cleared by the next `saveDraft`, which is the only way a new walk finishes.
   */
  const suppressGuest = useRef(false);
  const [guestAttempt, setGuestAttempt] = useState(0);

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
    suppressGuest.current = false;
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

  /*
   * One attempt per session. `refresh` is also what Setup calls after a save,
   * and a draft that failed to upload at sign-in must not be written over the
   * profile somebody has since edited by hand — so the upload is tried once, and
   * a failure hands the draft to the onboarding screen to finish instead.
   */
  const uploadTried = useRef(false);

  const refresh = useCallback(async (): Promise<OnboardingState | null> => {
    try {
      let next = await api.onboarding();
      /*
       * Adopted before the upload rather than after it. If the upload then
       * fails, the gate reads an unfinished account and puts the questions
       * back — prefilled from the draft — instead of the tabs drawing the
       * generic target for somebody who was just shown their own.
       */
      setState(next);
      const waiting = draftRef.current;
      if (waiting && !uploadTried.current) {
        uploadTried.current = true;
        if (next.complete || !waiting.completed_at) {
          // An account that already knows who it is keeps what it knows, and a
          // walk abandoned half way has nothing worth writing to one.
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
            /*
             * The language in force now, not the one the questions were
             * answered in: the picker is on the sign-up form too, and sign-up
             * has already stored that choice — the draft's would undo it.
             */
            locale: preferredLocale(),
            target_weight_kg: waiting.goal === 'maintain' ? null : waiting.target_weight_kg,
          });
          adoptProfile(saved);
          next = await api.onboarding();
          setState(next);
          // Dropped only once the server has it.
          await dropDraft();
          // The last step of the first-run funnel: the plan is on the account.
          reachedStep('in_app');
        }
      }
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
   * A plan that could not even be asked about — `api.onboarding()` itself
   * failed, so no upload was attempted — is tried again when the app comes back
   * to the front, rather than waiting for the next cold launch.
   */
  useEffect(() => {
    if (!authenticated || !emailVerified || !draft?.completed_at) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && !uploadTried.current) void refresh();
    });
    return () => subscription.remove();
  }, [authenticated, emailVerified, draft?.completed_at, refresh]);

  /*
   * Signing out forgets the draft. A plan is the answers of whoever typed them,
   * and a phone handed to somebody else must not offer them that person's body
   * to save — or prefill it into their questions.
   */
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (authenticated) {
      wasSignedIn.current = true;
      return;
    }
    if (wasSignedIn.current) {
      wasSignedIn.current = false;
      uploadTried.current = false;
      suppressGuest.current = true;
      void dropDraft();
    }
  }, [authenticated, dropDraft]);

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
    // `profileId` too: a guest's save can land on a different, existing account,
    // and that account's setup state is not the guest's.
  }, [authenticated, emailVerified, draftLoaded, refresh, profileId]);

  /*
   * A finished walk with no session becomes a guest (GUEST-ACCOUNTS.md).
   *
   * "Start my day" on the plan marks the draft finished; this is what turns that
   * into a session — no form, no address — and the effect above then uploads the
   * answers to the new row exactly as it does for an account signed in the old
   * way. Somebody who chose "I already have an account" is left to sign in.
   */
  const startingGuest = useRef(false);
  useEffect(() => {
    if (loading || !draftLoaded || authenticated || signingIn || !draft?.completed_at) return;
    if (suppressGuest.current || startingGuest.current) return;
    /*
     * A token in the keystore with no session on screen is a launch that could
     * not reach the server, not a phone without an account. Making a guest here
     * would leave the real one stranded; the retry asks the server again instead.
     */
    if (currentToken()) {
      setGuestError('offline');
      return;
    }
    startingGuest.current = true;
    setGuestError(null);
    void withTimeout(startGuest(draft.locale ?? preferredLocale()), GUEST_TIMEOUT_MS)
      .then(() => reachedStep('guest'))
      .catch((error: unknown) => {
        const refused = error instanceof ApiError && (error.status === 403 || error.status === 429);
        setGuestError(refused ? 'refused' : 'offline');
      })
      .finally(() => {
        startingGuest.current = false;
      });
  }, [loading, draftLoaded, authenticated, signingIn, draft?.completed_at, draft?.locale, startGuest, guestAttempt]);

  const retryGuest = useCallback(() => {
    if (currentToken()) {
      void refreshAuth();
      return;
    }
    setGuestAttempt((n) => n + 1);
  }, [refreshAuth]);

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
      dropDraft,
      signingIn,
      chooseSignIn: setSigningIn,
      saving,
      guestError,
      retryGuest,
    }),
    [state, ready, refresh, draftLoaded, draft, saveDraft, dropDraft, signingIn, saving, guestError, retryGuest],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
