'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthStatus, Profile } from '@ct/shared';
import { api } from '@/lib/api';
import { isEmailedRoute, isLegalRoute } from '@/lib/routes';

interface AuthValue {
  /** Whether there is a session at all. `profile` is null for other reasons too. */
  authenticated: boolean;
  profile: Profile | null;
  /**
   * Whether this account may open /admin — and, since the journal moved to the
   * phone, whether it may open the web at all. Decided by the API, never here.
   */
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Adopt a profile the app already has in hand — chat turns come back with
   * one, because `set_profile` can change units or diet mid-conversation. A
   * local swap rather than a `refresh()`, which would be a round trip to fetch
   * something already received.
   */
  adoptProfile: (profile: Profile) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  authenticated: false,
  profile: null,
  isAdmin: false,
  loading: true,
  refresh: async () => {},
  adoptProfile: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/**
 * Resolves the session once at the root and keeps unauthenticated visitors on a
 * public route. Everything below it can assume a signed-in user — except at `/`,
 * which serves the landing page to a visitor and the journal to an account, and
 * so is the one place that reads `authenticated` for itself.
 *
 * "A signed-in user" here means an admin. The journal moved to the phone, and
 * the API will not open a browser session for anybody else — so the only way to
 * arrive holding one is to have had it before the change, or to have been an
 * admin until a moment ago. Both are handled in one place, below.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const onLogin = pathname === '/login';
  /*
   * The landing page lives at `/`, so an anonymous visitor there is not lost —
   * they are exactly where they are supposed to be.
   *
   * The three routes after it are reached from a link in an email, by someone
   * who by definition cannot sign in (or does not want to). Bouncing them to
   * `/login` would strip the token out of the URL on the way, which turns
   * "reset my password" into a loop with no exit.
   */
  const isPublic =
    onLogin || pathname === '/' || isEmailedRoute(pathname) || isLegalRoute(pathname);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.me());
    } catch {
      setStatus({
        authenticated: false,
        profile: null,
        signup_allowed: true,
        has_accounts: false,
        is_admin: false,
        google_enabled: false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      // Logout answers with the signed-out status rather than a bare ack, so the
      // page we are about to show is drawn from the server's answer rather than
      // from an optimistic guess about who this now is.
      setStatus(await api.logout());
    } catch {
      /*
       * A guess, because the alternative is a blank screen.
       *
       * This used to be reachable only from a button, where a failure could be
       * left to the person to try again. The stranded-session path above calls
       * it on its own and renders nothing until it resolves, so a request that
       * never arrives would hold an empty page open indefinitely. Signed out
       * locally is the honest reading either way: whatever happened to the
       * request, this browser is not going to be shown the app.
       */
      setStatus({
        authenticated: false,
        profile: null,
        signup_allowed: false,
        has_accounts: true,
        is_admin: false,
        google_enabled: false,
      });
    }
    // Out through the front door, not the side one: `/` is the landing page to
    // anyone without a session, which is a better place to be left than a bare
    // sign-in form you did not ask for.
    router.replace('/');
  }, [router]);

  /*
   * A session in a browser that is not an admin's, ended rather than ignored.
   *
   * There is nothing here for it to open: the web is the landing page and the
   * panel, and every screen between them belongs to an account whose journal is
   * now on a phone. Leaving the session alive and merely refusing to draw the
   * app would strand it — signed in, with a "Sign in" link that bounces off
   * `onLogin` below and comes straight back. So it is closed, which puts them on
   * the landing page as the visitor they now are.
   *
   * Not on the emailed routes. Confirming an address or spending a reset link is
   * the one thing a member still does in a browser, and signing them out from
   * under the token in the URL would break the only flow that brought them here.
   */
  const strandedSession =
    (status?.authenticated ?? false) &&
    !(status?.is_admin ?? false) &&
    !isEmailedRoute(pathname) &&
    !isLegalRoute(pathname);

  useEffect(() => {
    if (loading || !status) return;
    if (strandedSession) {
      void signOut();
      return;
    }
    if (!status.authenticated && !isPublic) router.replace('/login');
    if (status.authenticated && onLogin) router.replace('/');
    /*
     * Signed in, but the address is unproved.
     *
     * Held at `/verify` until the code is entered, which mirrors the API: every
     * route but `/auth/` answers 403 for this session, so any other screen would
     * render as a wall of failed requests. Not sent to `/login` — the session is
     * perfectly good, and bouncing them to a sign-in form they have already
     * passed is the single most confusing thing this could do.
     */
    if (
      status.authenticated &&
      status.profile &&
      !status.profile.email_verified &&
      pathname !== '/verify' &&
      // Except on the policy and the terms. Someone stopped at the code is
      // mid-signup, which is exactly when a person wants to read what they
      // just agreed to, and holding them away from it would be perverse.
      !isLegalRoute(pathname)
    ) {
      router.replace('/verify');
    }
    // Deliberately no redirect away from the emailed routes for a signed-in
    // visitor: confirming an address or unsubscribing is just as valid with a
    // session as without one, and a reset link should still work on the laptop
    // where you are already logged in.
  }, [loading, status, strandedSession, signOut, onLogin, isPublic, pathname, router]);

  const adoptProfile = useCallback((profile: Profile) => {
    setStatus((prev) => (prev ? { ...prev, profile } : prev));
  }, []);

  // Avoid flashing the app shell before we know who this is — and avoid one
  // frame of somebody's journal in the gap between the effect above deciding to
  // close their session and the server saying it has.
  if (loading || strandedSession) return null;
  if (!status?.authenticated && !isPublic) return null;

  return (
    <AuthContext.Provider
      value={{
        authenticated: status?.authenticated ?? false,
        profile: status?.profile ?? null,
        isAdmin: status?.is_admin ?? false,
        loading,
        refresh,
        adoptProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
