import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { FunnelStep } from '@ct/shared';
import { API_BASE_URL } from '@/lib/api';

/**
 * Tells the server a new install reached a screen of the first-run walk.
 *
 * The walk runs on the phone and is silent until the account step, so without
 * this an install that left on the welcome screen and one that left on the
 * sign-up form look the same from the server: one `GET /auth/me` and nothing.
 * The steps are `FUNNEL_STEPS` in `@ct/shared`.
 *
 * What makes it a count rather than tracking is what is *not* sent. No install
 * id, no device id, no account: the body is the step, the platform and the
 * version, and nothing else. Each step goes at most once per install — the
 * phone remembers which it has sent — which is what lets the server's plain
 * per-day count stand for "installs that got this far" without being able to
 * tell one install from another.
 *
 * A bare `fetch` rather than the `api` client, on purpose: the client attaches
 * the session token whenever there is one, and a ping sent with a token is a
 * ping the server could put a name to. Nothing here reads a session, and this
 * keeps it from ever being handed one.
 *
 * Fire and forget. A ping that fails is not marked as sent, so the step is
 * tried again the next time it is reached; one that never gets through is a
 * number on a chart slightly too low, which is not worth a retry loop.
 */

const SENT_KEY = 'ct:funnel-sent:v1';

let sent: Promise<Set<FunnelStep>> | null = null;
const inFlight = new Set<FunnelStep>();

function loadSent(): Promise<Set<FunnelStep>> {
  sent ??= AsyncStorage.getItem(SENT_KEY)
    .then((raw) => new Set<FunnelStep>(raw ? (JSON.parse(raw) as FunnelStep[]) : []))
    .catch(() => new Set<FunnelStep>());
  return sent;
}

export function reachedStep(step: FunnelStep): void {
  const platform = Platform.OS;
  const version = Constants.expoConfig?.version;
  if ((platform !== 'ios' && platform !== 'android') || !version) return;

  void (async () => {
    const done = await loadSent();
    if (done.has(step) || inFlight.has(step)) return;
    inFlight.add(step);
    try {
      const response = await fetch(`${API_BASE_URL}/funnel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step, platform, app_version: version }),
      });
      if (!response.ok) return;
      done.add(step);
      await AsyncStorage.setItem(SENT_KEY, JSON.stringify([...done]));
    } catch {
      // Offline, or the server is down: tried again when the step comes round.
    } finally {
      inFlight.delete(step);
    }
  })();
}
