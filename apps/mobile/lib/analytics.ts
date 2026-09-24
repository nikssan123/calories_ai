import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Google Analytics for Firebase, for one job: telling Google Ads which of the
 * installs it paid for turned into somebody who set the app up.
 *
 * The campaign bids on installs because installs are all it can see, and an
 * install that leaves on the welcome screen costs the same as one that finishes
 * the walk. `onboarding_complete` is the first event that separates the two,
 * and it happens often enough (a dozen a day at current spend) for the bidder
 * to learn from — a purchase does not, yet.
 *
 * ---- What is sent, and what never is -------------------------------------
 *
 * Event *names*. No parameter on any event here carries a food, a weight, a
 * goal or a target: a calorie tracker's data is health data, and neither the
 * Google Ads policy nor the promise on the privacy page lets it reach an ad
 * system. If a future event needs a value, it is a count or a plan tier, never
 * something about a body.
 *
 * ---- Consent ---------------------------------------------------------------
 *
 * Every Consent Mode v2 signal starts denied — `firebase.json` bakes that into
 * the manifest, so it holds from the very first launch, before any JS runs. In
 * that state Firebase stores no identifier and sends only cookieless pings,
 * which Google uses to model conversions without counting anybody. The sheet
 * after the plan (`components/onboarding/MeasureAsk.tsx`) is the only thing
 * that turns them on, and the Settings row is where they are turned off again.
 *
 * ---- Android only, for now -------------------------------------------------
 *
 * `react-native.config.js` keeps the native module out of the iOS build, which
 * has no `GoogleService-Info.plist` and would need static frameworks to take
 * one. So everything here is behind `available`, and the module is required
 * lazily: a top-level import would throw on iOS the moment this file loaded.
 */

const CONSENT_KEY = 'ct:ad-consent:v1';
const LOGGED_KEY = 'ct:analytics-logged:v1';

export type Consent = 'granted' | 'denied';

type Firebase = typeof import('@react-native-firebase/analytics');

let firebase: Firebase | null | undefined;

function load(): Firebase | null {
  if (firebase !== undefined) return firebase;
  if (Platform.OS !== 'android') return (firebase = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    firebase = require('@react-native-firebase/analytics') as Firebase;
  } catch {
    // A dev client built before the module was added. Nothing to measure with.
    firebase = null;
  }
  return firebase;
}

/** Whether this build can measure anything — and so whether to ask at all. */
export const analyticsAvailable = Platform.OS === 'android';

export async function storedConsent(): Promise<Consent | null> {
  try {
    const raw = await AsyncStorage.getItem(CONSENT_KEY);
    return raw === 'granted' || raw === 'denied' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Records the answer and hands it to Firebase.
 *
 * All four signals move together. The sheet asks one question — may Google see
 * which ad brought you here — and splitting it into four switches would be
 * asking a question nobody outside ad tech could answer.
 */
export async function setConsent(consent: Consent): Promise<void> {
  try {
    await AsyncStorage.setItem(CONSENT_KEY, consent);
  } catch {
    // Firebase keeps its own copy of the state; ours only decides the sheet.
  }
  await apply(consent);
}

async function apply(consent: Consent): Promise<void> {
  const fb = load();
  if (!fb) return;
  const on = consent === 'granted';
  try {
    await fb.setConsent(fb.getAnalytics(), {
      analytics_storage: on,
      ad_storage: on,
      ad_user_data: on,
      ad_personalization: on,
    });
  } catch {
    // Measurement is never a reason for anything else to fail.
  }
}

/**
 * Re-applies the stored answer on launch.
 *
 * Firebase persists consent itself, so this is belt and braces — but the
 * manifest default is "denied", and a phone whose native state was ever reset
 * under it (a data clear keeps nothing, an OS restore can keep half) should not
 * quietly drift back to it with the person's yes still on file.
 */
export async function restoreConsent(): Promise<void> {
  const consent = await storedConsent();
  if (consent) await apply(consent);
}

/**
 * An event that means something once per install.
 *
 * Remembered on the phone, so "Change my answers" and a second walk through
 * setup do not tell the bidder the same person converted twice.
 */
export async function logOnce(event: 'onboarding_complete'): Promise<void> {
  const fb = load();
  if (!fb) return;
  try {
    const raw = await AsyncStorage.getItem(LOGGED_KEY);
    const done = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    if (done.has(event)) return;
    await fb.logEvent(fb.getAnalytics(), event);
    done.add(event);
    await AsyncStorage.setItem(LOGGED_KEY, JSON.stringify([...done]));
  } catch {
    // Lost is better than loud.
  }
}
