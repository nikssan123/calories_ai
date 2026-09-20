import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { FunnelStep, SaveReason } from '@ct/shared';
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
 * id, no device id, no account: the body is the step, the platform, the version
 * and — on the two steps about the save-your-account screen — which prompt
 * opened it, and nothing else. Each step goes at most once per install — the
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

/**
 * What "once" means for a step that carries a reason: once per reason.
 *
 * A guest can meet the save screen more than once and from different rungs —
 * the soft ask after their first meal, then the wall when their logs run out —
 * and counting only the first would credit the whole ladder to whichever rung
 * happened to come first. The key is still not an identifier: it never leaves
 * this phone, and what goes to the server is the step and the reason.
 *
 * The stored key stays a plain string, so the `v1` list an install already has
 * keeps working: only the two reasoned steps change shape, and at worst such an
 * install sends one of them a second time.
 */
type SentKey = string;

let sent: Promise<Set<SentKey>> | null = null;
const inFlight = new Set<SentKey>();

const keyOf = (step: FunnelStep, reason?: SaveReason): SentKey =>
  reason ? `${step}:${reason}` : step;

function loadSent(): Promise<Set<SentKey>> {
  sent ??= AsyncStorage.getItem(SENT_KEY)
    .then((raw) => new Set<SentKey>(raw ? (JSON.parse(raw) as SentKey[]) : []))
    .catch(() => new Set<SentKey>());
  return sent;
}

/**
 * `reason` belongs to `save_prompt` and `account` and is refused anywhere else
 * — the server's `FunnelPing` says so, and a ping it refuses is a step that
 * never counts. Which prompt asked is the point of it: see GUEST-ACCOUNTS.md.
 */
export function reachedStep(step: FunnelStep, reason?: SaveReason): void {
  const platform = Platform.OS;
  const version = Constants.expoConfig?.version;
  if ((platform !== 'ios' && platform !== 'android') || !version) return;

  const key = keyOf(step, reason);
  void (async () => {
    const done = await loadSent();
    if (done.has(key) || inFlight.has(key)) return;
    inFlight.add(key);
    try {
      const response = await fetch(`${API_BASE_URL}/funnel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step, platform, app_version: version, ...(reason ? { reason } : {}) }),
      });
      if (!response.ok) return;
      done.add(key);
      await AsyncStorage.setItem(SENT_KEY, JSON.stringify([...done]));
    } catch {
      // Offline, or the server is down: tried again when the step comes round.
    } finally {
      inFlight.delete(key);
    }
  })();
}
