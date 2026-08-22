'use client';

import { unitsOf, type UnitSystem } from '@ct/shared';
import { useAuth } from '@/components/AuthGate';

/**
 * Which units to render in. Metric until the profile says otherwise, including
 * for the moment before the session resolves — every number in the app is
 * stored metric, so that fallback is the identity conversion rather than a
 * guess that could flash the wrong figure.
 *
 * Conversion itself lives in `@ct/shared/units`, which the API uses too. This
 * is only the wiring that finds the preference.
 */
export function useUnits(): UnitSystem {
  return unitsOf(useAuth().profile);
}
