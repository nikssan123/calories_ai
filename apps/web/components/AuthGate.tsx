'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AuthStatus, Profile } from '@ct/shared';
import { api } from '@/lib/api';

interface AuthValue {
  profile: Profile | null;
  /** Whether this account may open /admin. Decided by the API, never the client. */
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  profile: null,
  isAdmin: false,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/**
 * Resolves the session once at the root and keeps unauthenticated visitors on
 * /login. Everything below it can assume a signed-in user.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const onLogin = pathname === '/login';

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
    if (!status.authenticated && !onLogin) router.replace('/login');
    if (status.authenticated && onLogin) router.replace('/');
  }, [loading, status, onLogin, router]);

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
  if (!status?.authenticated && !onLogin) return null;

  return (
    <AuthContext.Provider
      value={{
        profile: status?.profile ?? null,
        isAdmin: status?.is_admin ?? false,
        loading,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
