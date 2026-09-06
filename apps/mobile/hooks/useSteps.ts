import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '@ct/shared';
import {
  requestStepPermission,
  stepPermission,
  syncSteps,
  STEPS_SUPPORTED,
  type StepPermission,
} from '@/lib/steps';

/**
 * The step count for the screen, and the one control that turns it on.
 *
 * Everything about the timing here is chosen so the app never asks for a
 * sensor it has not been told to read. `stepPermission` is a look, safe on
 * every render; `requestStepPermission` is a system dialog that can only be
 * answered once in the life of an install, so it hangs off `enable` and nothing
 * else calls it.
 *
 * The count comes from two places and prefers the fresher: `fallback` is what
 * the server had when the day was fetched, and `local` is what the sensor said
 * during this session's sync. The local one wins because it is minutes newer —
 * a step count climbs all day, and the figure the server returned at breakfast
 * is stale by lunch. Neither triggers a re-fetch of the day; the sync writes
 * the number up, and the next ordinary load brings it back.
 */
export function useSteps(
  profile: Profile | null,
  /**
   * Whether the screen is showing today. Yesterday's steps are already on the
   * day summary and complete; only today's are worth re-reading, and syncing
   * while somebody browses March would be a sensor read triggered by scrolling.
   */
  isToday: boolean,
  fallback: number | null,
): { steps: number | null; permission: StepPermission | null; enable: () => void } {
  const [permission, setPermission] = useState<StepPermission | null>(
    STEPS_SUPPORTED ? null : 'unsupported',
  );
  const [local, setLocal] = useState<number | null>(null);

  /*
   * Asked once per mount rather than once per focus. The answer only changes
   * when the reader has been to Settings, and a screen that re-checks a
   * permission on every tab switch is a screen doing IO for a row that has not
   * moved.
   */
  useEffect(() => {
    let live = true;
    void stepPermission().then((status) => {
      if (live) setPermission(status);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!isToday || permission !== 'granted') return;
    let live = true;
    /* `syncSteps` decides for itself whether enough time has passed — see
     * `SYNC_EVERY_MS`. Calling it on every focus is the intent; sending on
     * every focus is not. */
    void syncSteps(profile).then((today) => {
      if (live && today !== null) setLocal(today);
    });
    return () => {
      live = false;
    };
  }, [isToday, permission, profile]);

  const enable = useCallback(() => {
    void requestStepPermission().then(async (status) => {
      setPermission(status);
      if (status !== 'granted') return;
      /*
       * Forced, because the reader has just tapped a button and is watching for
       * the number to appear. The ordinary rate limit is there to keep
       * foregrounds cheap, and this is not one.
       */
      setLocal(await syncSteps(profile, { force: true }));
    });
  }, [profile]);

  /*
   * A past day is whatever the server recorded and nothing else — the sensor's
   * answer for today has no bearing on Tuesday. Today prefers the local read
   * for the reason above: it is the only one still climbing.
   */
  return { steps: isToday ? (local ?? fallback) : fallback, permission, enable };
}
