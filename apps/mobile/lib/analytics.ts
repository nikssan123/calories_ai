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
const DAYS_KEY = 'ct:analytics-days:v1';

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
 * The rungs an install climbs, each a conversion Google Ads can be told to bid
 * on, cheapest first:
 *
 * - `onboarding_complete` — finished the walk and pressed start.
 * - `first_food_logged` — a meal exists, by any road (chat, photo, barcode, the
 *   outbox draining). The first sign the product did its job.
 * - `logged_second_day` — a meal on a second calendar day. Of the first thirty
 *   ad installs four came back for a day two, so this is the rung that
 *   separates a curious tap from a user, and the one to bid on once it has the
 *   volume.
 * - `sign_up` — Google's recommended name, for a guest who saved an account or
 *   an install that created one at sign-in. Too rare to bid on for now; here so
 *   the history exists when it is not.
 *
 * Purchases are not in the list: Firebase logs `in_app_purchase` from Play
 * Billing by itself, with the price, and a second copy from here would count
 * every subscription twice.
 */
export type Milestone = 'onboarding_complete' | 'first_food_logged' | 'logged_second_day' | 'sign_up';

/**
 * An event that means something once per install.
 *
 * Remembered on the phone, so "Change my answers" and a second walk through
 * setup do not tell the bidder the same person converted twice.
 */
export function logOnce(event: Milestone): Promise<void> {
  /*
   * One at a time. The record is a single stored list, and two rungs reached in
   * the same tick — a first meal on a second day — would both read it before
   * either wrote, so one would be forgotten and sent again later. The same bug
   * `lib/funnel.ts` found in its queue.
   */
  const run = queue.then(() => logNow(event));
  queue = run.catch(() => undefined);
  return run;
}

let queue: Promise<unknown> = Promise.resolve();

async function logNow(event: Milestone): Promise<void> {
  const fb = load();
  if (!fb) return;
  try {
    const raw = await AsyncStorage.getItem(LOGGED_KEY);
    const done = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    if (done.has(event)) return;
    // Widened to a plain name: the typed overloads want a `method` on
    // `sign_up`, and which door an account came through is not the bidder's
    // business.
    await fb.logEvent(fb.getAnalytics(), event as string);
    done.add(event);
    await AsyncStorage.setItem(LOGGED_KEY, JSON.stringify([...done]));
  } catch {
    // Lost is better than loud.
  }
}

/**
 * A day seen with at least one meal in it — the source of the two logging
 * rungs above.
 *
 * Only the dates are kept, and only the first two: the question is whether
 * there was a second day at all, and a phone does not need a diary of which
 * days somebody ate to answer it. The date is the journal's own `local_date`,
 * so a 1am snack counts toward the evening it belongs to, the same as
 * everywhere else.
 */
export async function noteLoggedDay(date: string): Promise<void> {
  if (!load()) return;
  let days: string[] = [];
  try {
    const raw = await AsyncStorage.getItem(DAYS_KEY);
    days = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    // Unreadable: start again. At worst a second day is counted a day late.
  }
  if (!days.includes(date) && days.length < 2) {
    days = [...days, date];
    try {
      await AsyncStorage.setItem(DAYS_KEY, JSON.stringify(days));
    } catch {
      // Kept for this call only; the events below still go.
    }
  }
  await logOnce('first_food_logged');
  if (days.length >= 2) await logOnce('logged_second_day');
}
