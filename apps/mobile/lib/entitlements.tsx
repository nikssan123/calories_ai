import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { METERS, type Allowance, type MeterName, type PlanName, type PlanTier } from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { configureBilling, forgetBilling } from '@/lib/billing';

/**
 * What this account may spend, held once for the whole app.
 *
 * Every surface that has an opinion about money reads from here: the line above
 * the composer that says three messages are left, the wall the journal shows
 * when there are none, the locked kitchen, the plan row in settings. One fetch
 * rather than one per screen, because the numbers must agree — a Cook tab that
 * thinks the recipe budget is spent and a settings screen that thinks it is not
 * are two bugs wearing one coat.
 *
 * It is deliberately *not* the authority on whether an action is allowed. The
 * server decides that, on the ledger, and answers 402; this only decides what
 * the interface says beforehand. Which is why a stale copy here is a cosmetic
 * problem and never an entitlement one.
 */

interface EntitlementsValue {
  plan: PlanName;
  /** Null until the first fetch lands. Not the same as "nothing left". */
  allowances: Record<MeterName, Allowance> | null;
  /** Every tier, cheapest first, as `plans.ts` defines them. */
  tiers: PlanTier[];
  /** Re-read from the server; returns the plan it now reports. */
  refresh: () => Promise<PlanName>;
  /**
   * Adopt an allowance that arrived attached to something else — the journal
   * gets one back with every turn, which is how the counter stays live without
   * a request per message.
   */
  adopt: (allowance: Allowance) => void;
}

const EMPTY: EntitlementsValue = {
  plan: 'free',
  allowances: null,
  tiers: [],
  refresh: async () => 'free',
  adopt: () => {},
};

const EntitlementsContext = createContext<EntitlementsValue>(EMPTY);

export const useEntitlements = (): EntitlementsValue => useContext(EntitlementsContext);

/** One meter, or null while the first fetch is still out. */
export function useAllowance(meter: MeterName): Allowance | null {
  return useEntitlements().allowances?.[meter] ?? null;
}

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, emailVerified, profile } = useAuth();
  const userId = profile?.id ?? null;

  const [allowances, setAllowances] = useState<Record<MeterName, Allowance> | null>(null);
  const [tiers, setTiers] = useState<PlanTier[]>([]);
  /*
   * Seeded from the profile rather than left at `free` until `/entitlements` answers.
   *
   * `me()` has already said what the plan is by the time this mounts, and a
   * paying account that renders one frame of a locked kitchen on every launch
   * is a worse bug than a stale count: the count is small text, the lock is the
   * whole screen.
   */
  const [plan, setPlan] = useState<PlanName>(profile?.plan ?? 'free');
  useEffect(() => {
    if (profile?.plan) setPlan(profile.plan);
  }, [profile?.plan]);

  const refresh = useCallback(async (): Promise<PlanName> => {
    try {
      const entitlements = await api.entitlements();
      setPlan(entitlements.plan);
      setTiers(entitlements.tiers);
      setAllowances(byMeter(entitlements.allowances));
      return entitlements.plan;
    } catch {
      /*
       * Offline, most likely — this app is built to work there. Whatever is
       * already held stays: the counts go stale rather than reverting to
       * "unknown", which keeps a locked feature locked and an unlocked one
       * open. The wall is on the server regardless.
       */
      return plan;
    }
  }, [plan]);

  useEffect(() => {
    if (!authenticated || !emailVerified) {
      setAllowances(null);
      return;
    }
    void refresh();
    // `refresh` is intentionally out of the deps: it closes over `plan`, which
    // this effect changes, and following it would re-fetch every time the plan
    // moved. The session arriving is the only thing that should start a load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, emailVerified]);

  /*
   * Tell the store who this is, as soon as there is an account to tell it
   * about. Here rather than in the paywall screen because the binding has to
   * exist *before* a purchase starts — a checkout begun against an anonymous
   * RevenueCat id posts a webhook naming an account that does not exist, and
   * the money is taken either way.
   */
  useEffect(() => {
    if (!userId) {
      void forgetBilling();
      return;
    }
    void configureBilling(userId);
  }, [userId]);

  const adopt = useCallback((allowance: Allowance) => {
    setAllowances((prev) => (prev ? { ...prev, [allowance.meter]: allowance } : prev));
  }, []);

  const value = useMemo<EntitlementsValue>(
    () => ({ plan, allowances, tiers, refresh, adopt }),
    [plan, allowances, tiers, refresh, adopt],
  );

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

/** The array the API sends, keyed for the screens that want one meter. */
function byMeter(list: Allowance[]): Record<MeterName, Allowance> {
  const keyed = {} as Record<MeterName, Allowance>;
  for (const meter of METERS) {
    keyed[meter] = list.find((allowance) => allowance.meter === meter) ?? {
      meter,
      allowed: null,
      // A meter the server did not mention is a locked one, not a free-for-all:
      // this is the fallback for an older API, and guessing the generous way
      // round would draw a live button that 402s on press.
      unlimited: false,
      used: 0,
      period: 'month',
      resets_at: null,
      // Bought scans, which only `photo` ever has. Zero is the right stand-in
      // here for the same reason `allowed: null` is — this branch is the meter
      // the server did not mention, so nothing has been bought either.
      credits: 0,
    };
  }
  return keyed;
}
