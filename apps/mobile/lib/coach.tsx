import { useCallback, useEffect, useState } from 'react';
import type { ClientCoachStatus, CoachScope } from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * Who is coaching this account, shared by every screen that asks.
 *
 * Three screens read it — the banner on Today, the section under Settings,
 * and the coach bubble in the journal — and they have to agree the moment a
 * link is accepted or ended. A module-level value with subscribers rather than
 * a context, because the value is a fact about the account rather than about
 * the tree, and the accept screen is pushed outside the tabs that draw it.
 *
 * Nothing here is cached to disk. A phone that opens offline draws no banner
 * and no coach section until the server answers, which is the honest reading:
 * the link is the server's to know about, and a stale "shared with Maria"
 * after she has been removed would be worse than a blank.
 */

let current: ClientCoachStatus | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Re-reads the link from the server. Safe to call from anywhere. */
export function refreshCoachLink(): Promise<void> {
  if (inflight) return inflight;
  inflight = api.myCoach
    .status()
    .then((status) => {
      current = status;
    })
    .catch(() => {
      /* keep what we had; the next screen to ask will try again */
    })
    .finally(() => {
      inflight = null;
      notify();
    });
  return inflight;
}

/** Forgets the link, on sign-out. */
export function clearCoachLink(): void {
  current = null;
  notify();
}

export function useCoachLink() {
  const { authenticated } = useAuth();
  const [status, setStatus] = useState<ClientCoachStatus | null>(current);

  useEffect(() => {
    const listener = () => setStatus(current);
    listeners.add(listener);
    if (authenticated && current === null) void refreshCoachLink();
    if (!authenticated && current !== null) clearCoachLink();
    return () => {
      listeners.delete(listener);
    };
  }, [authenticated]);

  const accept = useCallback(async (code: string): Promise<ClientCoachStatus> => {
    const next = await api.myCoach.accept(code);
    current = next;
    notify();
    return next;
  }, []);

  const setScope = useCallback(async (patch: Partial<CoachScope>): Promise<void> => {
    current = await api.myCoach.setScope(patch);
    notify();
  }, []);

  const revoke = useCallback(async (): Promise<void> => {
    current = await api.myCoach.revoke();
    notify();
  }, []);

  return {
    /** Null until the server has answered once this session. */
    status,
    link: status?.link ?? null,
    refresh: refreshCoachLink,
    accept,
    setScope,
    revoke,
  };
}

/** "EK" for Elena Koleva. The same cut the dashboard makes. */
export function initialsOf(name: string | null): string {
  if (!name) return '·';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
