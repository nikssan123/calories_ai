import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { AuthStatus, Profile } from '@ct/shared';
import { api } from '@/lib/api';
import { clearToken, currentToken, restoreToken, saveToken } from '@/lib/session';
import { forgetPush } from '@/lib/push';
import { clearDaySnapshot } from '@/lib/snapshot';
import { watch } from '@/lib/outbox';
import { cacheProfile, cacheSession, cachedSession, forgetSession, forgetUser } from '@/lib/store';

/**
 * Who this is, resolved once at the root.
 *
 * The web's `AuthGate` does two jobs: it holds the session and it redirects
 * anyone who should not be where they are. Here they are split — this holds the
 * session, and `app/_layout.tsx` does the routing — because a native app has no
 * URL bar to defend. Nobody arrives at a screen by typing its address, so the
 * only redirect that matters is the one between "signed in" and "not".
 *
 * Sign-out is deliberately unconditional. The API call is a courtesy — it
 * revokes the row — but the token is dropped whether or not it succeeds:
 * someone tapping "sign out" on a phone with no signal must still end up
 * signed out, and a session that survives because a request failed is the worst
 * possible answer.
 */

/**
 * Signed out, as far as this phone can tell on its own.
 *
 * Everything here past `authenticated` is a guess, and only the last resort
 * should be guessing: whether the server takes registrations, whether it holds
 * any accounts, whether Google is configured on it are all facts the API
 * reports and this constant cannot know. It is the shape for an unreachable
 * server — where the guesses are at least the ones that leave a way forward —
 * and not for an ordinary sign-out, which has the real answer in its hand.
 */
const SIGNED_OUT: AuthStatus = {
  authenticated: false,
  profile: null,
  signup_allowed: true,
  has_accounts: false,
  is_admin: false,
  google_enabled: false,
};

interface AuthValue {
  authenticated: boolean;
  profile: Profile | null;
  /** Whether the server is still taking registrations. */
  signupAllowed: boolean;
  /** False on a brand-new server, so the form can open on "create account". */
  hasAccounts: boolean;
  /**
   * Whether this server has a Google client configured. False is the honest
   * default and the button is simply absent: OAuth needs a client registered
   * against this deployment's callback, so there is nothing to fall back to and
   * offering a button that 404s is worse than offering none.
   */
  googleEnabled: boolean;
  /**
   * Whether the address has been proved. Load-bearing rather than cosmetic:
   * the API answers 403 to everything outside `/auth/` until it is true.
   */
  emailVerified: boolean;
  /** Resolved once at launch; screens render only after it is false. */
  loading: boolean;
  refresh: () => Promise<void>;
  /** Adopt a profile the app already has in hand, rather than re-fetching it. */
  adoptProfile: (profile: Profile) => void;
  /** Both halves of arriving: store the token, then adopt the status it came with. */
  adoptSession: (status: AuthStatus) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  authenticated: false,
  profile: null,
  signupAllowed: false,
  hasAccounts: false,
  googleEnabled: false,
  emailVerified: false,
  loading: true,
  refresh: async () => {},
  adoptProfile: () => {},
  adoptSession: async () => {},
  signOut: async () => {},
});

export const useAuth = (): AuthValue => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Whether the status on hand came off the disk because the server could not
   * be reached. Not shown anywhere — it exists so the foreground listener below
   * knows there is still a real answer to go and get.
   */
  const [restoredOffline, setRestoredOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.me();
      setStatus(next);
      setRestoredOffline(false);
      // Keeping it is the effect below; forgetting it belongs here, because
      // this is the only place that learns the session is gone. A signed-out
      // status is never worth restoring — that is a fact the phone reaches on
      // its own — and leaving one on disk would outlive the token.
      if (!next.authenticated) void forgetSession();
    } catch {
      /*
       * Unreachable server, not a rejected session — and now that distinction
       * is acted on rather than merely noted.
       *
       * `/auth/me` answers `authenticated: false` for a token it dislikes and
       * never throws over one, so everything arriving here is the network. The
       * token was already being kept for that reason. What was not kept was
       * anything to *use* it with: the status went to `SIGNED_OUT`, the gate in
       * `app/_layout.tsx` drew the sign-in screen, and every offline path
       * behind it — the cached day, the templates, the outbox, the whole of
       * OFFLINE.md §3-§6 — sat behind a login that cannot be completed without
       * a network. An app whose listing promises "logging with no signal at
       * all" spent its first cold start in a basement asking for an account.
       *
       * So the last status this phone was handed is restored instead, and only
       * ever beside a token still in the keystore: a cached status on its own
       * is a picture of a session, not a session. It is marked as restored so
       * the next foreground goes and asks for the real one.
       */
      const restored = currentToken() ? await cachedSession() : null;
      setStatus(restored ?? SIGNED_OUT);
      setRestoredOffline(restored !== null);
    }
  }, []);

  // The keystore has to be read before the first request, or the client sends
  // an anonymous `me()` and everyone launches signed out exactly once.
  useEffect(() => {
    void (async () => {
      await restoreToken();
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  /*
   * Ask again when the app comes back, whenever what we are holding is not a
   * real answer from the server.
   *
   * Two cases, and they used to be one. `SIGNED_OUT` is a genuine sign-out
   * *and* a launch that could not reach anybody, wearing one shape — launching
   * in a lift left somebody on *Create your account* for the rest of the
   * session, still signed in as far as the keystore was concerned, with a
   * force-quit as the only way back. That is what `restoredOffline` now
   * separates out: a launch with no signal keeps the session and comes back
   * here to be corrected, rather than being indistinguishable from having
   * pressed sign out.
   *
   * Both are worth re-asking. A restored session is a copy and the server has
   * the original; and even a real sign-out benefits, because the guesses in
   * `SIGNED_OUT` — whether registrations are open, whether Google is configured
   * — are exactly the ones a reachable server can replace with facts.
   *
   * An ordinary signed-in foreground still costs nothing, which is the point of
   * the guard rather than refreshing unconditionally.
   */
  useEffect(() => {
    if (status?.authenticated && !restoredOffline) return;
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [status?.authenticated, restoredOffline, refresh]);

  /*
   * The outbox starts draining as soon as there is a session to drain it with,
   * and keeps watching for the app coming back to the foreground.
   *
   * Here rather than in a screen because a queued meal must not depend on
   * anybody visiting the tab that queued it: someone who types a meal in a lift
   * and then closes the app has done their part, and the send is ours.
   */
  useEffect(() => {
    if (!status?.authenticated) return;
    return watch();
  }, [status?.authenticated]);

  /*
   * The profile is cached for its `timezone` and `day_start_hour` — without
   * them the phone cannot work out which day a meal belongs to, and offline
   * there is nobody to ask.
   *
   * The whole status goes with it, and it has to be written here rather than
   * only in `refresh`: setup rewrites the profile through `adoptProfile`, and a
   * cached session still carrying the old `day_start_hour` would put the first
   * offline meal after a settings change on the wrong day.
   */
  useEffect(() => {
    const profile = status?.profile;
    if (!profile || !status?.authenticated) return;
    void cacheProfile(profile.id, profile);
    if (!restoredOffline) void cacheSession(status);
  }, [status, restoredOffline]);

  const adoptSession = useCallback(async (next: AuthStatus) => {
    if (next.token) await saveToken(next.token);
    // The token is stripped before it is put in React state: nothing rendering
    // a screen has any business reading it, and the keystore is now the copy
    // that matters.
    const { token: _token, ...rest } = next;
    setStatus(rest);
    // A sign-in is as live as an answer gets; the cache below picks it up from
    // here rather than waiting for the next `me()`.
    setRestoredOffline(false);
  }, []);

  const adoptProfile = useCallback((profile: Profile) => {
    setStatus((prev) => (prev ? { ...prev, profile } : prev));
  }, []);

  const signedInAs = status?.profile?.id ?? null;

  const signOut = useCallback(async () => {
    /*
     * Before the session goes, because giving the address up is an authenticated
     * call. A push token belongs to the *device* rather than the account, so one
     * left behind would keep delivering this person's nudges to whoever signs in
     * on this phone next.
     */
    await forgetPush();
    await clearDaySnapshot();
    /*
     * The status logout answers with, kept rather than dropped.
     *
     * It is the same body `me()` returns, and the fields that are not
     * `authenticated: false` are the ones this phone has no other way to learn:
     * `google_enabled` and `has_accounts`. Falling back to `SIGNED_OUT` while
     * the server was right there took "Continue with Google" off the sign-in
     * screen for the rest of the launch — the button renders from
     * `googleEnabled` — and opened the form on "create account" against a
     * server full of them. The web has never had this bug because its own
     * `signOut` has always adopted this response; this is the same fix.
     */
    let next = SIGNED_OUT;
    try {
      next = await api.logout();
    } catch {
      /* revoking the row is a courtesy; dropping the token is the point */
    }
    await clearToken();
    /*
     * And the cached session with it, before anything else — it is the one
     * thing that could put somebody back inside the app after they asked to
     * leave. `refresh` will not restore it without a token and the token is
     * already gone, so this is the second of two locks rather than the only
     * one; sign-out is where being sure is worth a write.
     */
    setRestoredOffline(false);
    await forgetSession();
    /*
     * And the cached day. Not a security measure — the token is gone and the
     * data was this user's own — but leaving it behind means the next person to
     * sign in on this phone waits for a fetch while somebody else's breakfast
     * is on the screen.
     */
    if (signedInAs) void forgetUser(signedInAs);
    // Stripped on the way into state exactly as `adoptSession` does it: logout
    // does not send one, and state is where a token must never be.
    const { token: _token, ...rest } = next;
    setStatus(rest);
  }, [signedInAs]);

  const value = useMemo<AuthValue>(
    () => ({
      authenticated: status?.authenticated ?? false,
      profile: status?.profile ?? null,
      signupAllowed: status?.signup_allowed ?? false,
      hasAccounts: status?.has_accounts ?? false,
      googleEnabled: status?.google_enabled ?? false,
      emailVerified: status?.profile?.email_verified ?? false,
      loading,
      refresh,
      adoptProfile,
      adoptSession,
      signOut,
    }),
    [status, loading, refresh, adoptProfile, adoptSession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
