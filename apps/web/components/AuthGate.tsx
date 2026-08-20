'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthStatus, Profile } from '@ct/shared';
import { api } from '@/lib/api';
import { isEmailedRoute } from '@/lib/routes';

interface AuthValue {
  /** Whether there is a session at all. `profile` is null for other reasons too. */
  authenticated: boolean;
  profile: Profile | null;
  /** Whether this account may open /admin. Decided by the API, never the client. */
  isAdmin: boolean;
  /** Whether the server is still taking registrations. The landing page's CTA
      falls back to a plain "Sign in" once it is not. */
  signupAllowed: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  authenticated: false,
  profile: null,
  isAdmin: false,
  signupAllowed: false,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/**
 * Resolves the session once at the root and keeps unauthenticated visitors on a
 * public route. Everything below it can assume a signed-in user — except at `/`,
 * which serves the landing page to a visitor and the journal to an account, and
 * so is the one place that reads `authenticated` for itself.
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
  const isPublic = onLogin || pathname === '/' || isEmailedRoute(pathname);

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
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (loading || !status) return;
    if (!status.authenticated && !isPublic) router.replace('/login');
    if (status.authenticated && onLogin) router.replace('/');
    // Deliberately no redirect away from the emailed routes for a signed-in
    // visitor: confirming an address or unsubscribing is just as valid with a
    // session as without one, and a reset link should still work on the laptop
    // where you are already logged in.
  }, [loading, status, onLogin, isPublic, router]);

  const signOut = useCallback(async () => {
    // Logout answers with the signed-out status rather than a bare ack, so the
    // landing page we are about to show reads the server's real `signup_allowed`
    // instead of an optimistic guess that would offer a stranger a closed door.
    setStatus(await api.logout());
    // Out through the front door, not the side one: `/` is the landing page to
    // anyone without a session, which is a better place to be left than a bare
    // sign-in form you did not ask for.
    router.replace('/');
  }, [router]);

  // Avoid flashing the app shell before we know who this is.
  if (loading) return null;
  if (!status?.authenticated && !isPublic) return null;

  return (
    <AuthContext.Provider
      value={{
        authenticated: status?.authenticated ?? false,
        profile: status?.profile ?? null,
        isAdmin: status?.is_admin ?? false,
        signupAllowed: status?.signup_allowed ?? false,
        loading,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
