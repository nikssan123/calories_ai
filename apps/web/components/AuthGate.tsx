'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthStatus, Profile } from '@ct/shared';
import { api } from '@/lib/api';

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
  // The landing page lives at `/`, so an anonymous visitor there is not lost —
  // they are exactly where they are supposed to be.
  const isPublic = onLogin || pathname === '/';

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
  }, [loading, status, onLogin, isPublic, router]);

  const signOut = useCallback(async () => {
    await api.logout();
    setStatus({
      authenticated: false,
      profile: null,
      signup_allowed: true,
      has_accounts: false,
      is_admin: false,
    });
    router.replace('/login');
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
