import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthStatus, Profile } from '@ct/shared';
import { api } from '@/lib/api';
import { clearToken, restoreToken, saveToken } from '@/lib/session';

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

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.me());
    } catch {
      /*
       * Unreachable server, not a rejected session. Reported as signed out
       * because that is the screen with a way forward — but the token is
       * deliberately *not* cleared, so a signal that comes back finds the
       * session still there rather than making someone sign in again for
       * having walked into a lift.
       */
      setStatus(SIGNED_OUT);
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

  const adoptSession = useCallback(async (next: AuthStatus) => {
    if (next.token) await saveToken(next.token);
    // The token is stripped before it is put in React state: nothing rendering
    // a screen has any business reading it, and the keystore is now the copy
    // that matters.
    const { token: _token, ...rest } = next;
    setStatus(rest);
  }, []);

  const adoptProfile = useCallback((profile: Profile) => {
    setStatus((prev) => (prev ? { ...prev, profile } : prev));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* revoking the row is a courtesy; dropping the token is the point */
    }
    await clearToken();
    setStatus(SIGNED_OUT);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      authenticated: status?.authenticated ?? false,
      profile: status?.profile ?? null,
      signupAllowed: status?.signup_allowed ?? false,
      hasAccounts: status?.has_accounts ?? false,
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
