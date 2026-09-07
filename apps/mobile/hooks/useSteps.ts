import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '@ct/shared';
import {
  requestStepPermission,
  stepPermission,
  stepsEmptyReason,
  syncSteps,
  type StepPermission,
  type StepsEmpty,
} from '@/lib/steps';

export interface Steps {
  steps: number | null;
  permission: StepPermission | null;
  /**
   * Why a granted read came back with nothing at all, when one did.
   *
   * Android only in practice, and two states rather than one because they want
   * opposite screens: `starting` is the ordinary minute after somebody taps
   * Allow, when the platform has begun counting from zero and has nothing to
   * show yet, and `no-source` is a phone where nothing will ever write. The
   * distinction and how it is drawn are on `GRANTED_KEY` in `lib/steps.ts`.
   *
   * Null until a read has actually happened, because "we have not looked yet"
   * and "we looked and it is empty" are different things to put on a screen.
   */
  empty: StepsEmpty | null;
  enable: () => void;
}

/**
 * The step count for the screen, and the one control that turns it on.
 *
 * Everything about the timing here is chosen so the app never asks for a
 * sensor it has not been told to read. `stepPermission` is a look, safe on
 * every render; `requestStepPermission` puts a system sheet on somebody's
 * screen and hangs off `enable` alone.
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
): Steps {
  const [permission, setPermission] = useState<StepPermission | null>(null);
  const [local, setLocal] = useState<number | null>(null);
  const [empty, setEmpty] = useState<StepsEmpty | null>(null);

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
    void (async () => {
      const result = await syncSteps(profile);
      if (!live || result === null) return;
      if (result.today !== null) setLocal(result.today);
      const reason = result.hasWriter ? null : await stepsEmptyReason();
      if (live) setEmpty(reason);
    })();
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
      const result = await syncSteps(profile, { force: true });
      if (result === null) return;
      setLocal(result.today);
      setEmpty(result.hasWriter ? null : await stepsEmptyReason());
    });
  }, [profile]);

  /*
   * A past day is whatever the server recorded and nothing else — the sensor's
   * answer for today has no bearing on Tuesday. Today prefers the local read
   * for the reason above: it is the only one still climbing.
   */
  return { steps: isToday ? (local ?? fallback) : fallback, permission, empty, enable };
}
