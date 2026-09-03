import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import type * as StoreReviewSdk from 'expo-store-review';

/**
 * Asking for a store rating, at the only moment the app has earned one.
 *
 * The store listing is the first thing a stranger reads about this app, and
 * until it carries a few dozen ratings it reads as untested. Ratings are
 * therefore not vanity — they are the conversion rate on every install the app
 * will ever get, paid or not. Left to chance somewhere under 3% of retained
 * users leave one; asked at a good moment it is closer to 8%.
 *
 * What makes the moment good here is that the app already knows when somebody
 * has kept a run going, so it can ask the person having the best week rather
 * than interrupting the person still deciding whether they like it.
 *
 * Two rules from Apple shape everything below and are worth stating, because
 * both are easy to violate without noticing:
 *
 * 1. **The OS decides, not us.** `requestReview` is a request. iOS shows at most
 *    three of these per app per user per year and silently drops the rest, and
 *    the promise resolves either way. There is no success to observe.
 * 2. **It may not hang off a button, and it may not be pre-screened.** A "Rate
 *    us" control has to open the store write-review URL instead, and filtering
 *    for happy users first — "enjoying the app? → then rate it" — is against the
 *    guidelines. So the trigger has to be something the app already believes
 *    about the user, which is exactly what a streak is.
 *
 * Android runs the same two rules through Play's In-App Review API, with one
 * difference that matters here: **it reports failure and iOS does not.** Play
 * rejects when the flow genuinely could not run — the build did not come from
 * Play, Play Services is missing — and *resolves* when it ran and chose to show
 * nothing, which is what hitting the quota looks like. So a rejection on
 * Android is real information, and `maybeAskForReview` gives the milestone back
 * when it sees one. iOS has no equivalent signal and never gets one back.
 */

/**
 * The runs worth asking on, longest first.
 *
 * The same two numbers as `streak_7` and `streak_30` in
 * `apps/api/src/services/achievements.ts`, and deliberately not a third set of
 * thresholds: a milestone the app celebrates is a milestone the app may ask on,
 * and anywhere those lists disagree one of them is wrong.
 *
 * Two rather than Apple's three. The third slot is left unspent so that a future
 * ask — after a weekly review somebody actually read, say — does not have to
 * take one of these away from it.
 */
const MILESTONES = [30, 7] as const;

/**
 * The shortest gap between two asks, in days.
 *
 * Reaching 30 means having passed 7, so without this the second ask lands 23
 * days after the first — inside the same year, on somebody who has already been
 * asked once and did nothing. Ninety days is long enough that the second ask is
 * a fresh question rather than a repeat of the one they declined.
 */
const MIN_GAP_DAYS = 90;

const KEY = 'ct:review-prompt:v1';

/** Milestone → when it was asked, ISO. Written on attempt, never on success. */
type Asked = Record<string, string>;

/**
 * The SDK, required on first use rather than imported at the top of this file.
 *
 * `expo-store-review` resolves its native module at module scope —
 * `requireNativeModule('ExpoStoreReview')` runs on the import, not on the first
 * call — so a static import throws while the module is being *evaluated*, in
 * any runtime that does not carry the native side. That is not a missing
 * feature, it is a missing app: Today imports this file, expo-router reports
 * `(tabs)/today.tsx` as "missing the required default export", and the screen
 * does not render at all. `Cannot find native module 'ExpoStoreReview'` is what
 * is on the phone instead of the food diary.
 *
 * The runtimes that hit it are ordinary ones — Expo Go, and any dev client
 * built before this dependency was added, which is every one of them that was
 * installed before the rating ask landed. `maybeAskForReview` already catches
 * "the module missing on this platform"; the catch was simply one level too
 * late to run.
 *
 * `lib/billing.ts` carries the same guard for the same reason, and its comment
 * is the longer version of this one — a store binding took down the food diary
 * once already.
 */
type Sdk = typeof StoreReviewSdk;
let sdk: Sdk | null | undefined;

function storeReview(): Sdk | null {
  if (sdk !== undefined) return sdk;
  /*
   * Asked before it is required, rather than requiring it and catching.
   *
   * Catching works — the app runs, and Today draws — but `requireNativeModule`
   * throwing is still a thrown error, and in development LogBox puts it on the
   * screen as an *uncaught* one over the top of the app. That is the same red
   * rectangle this was supposed to remove, so the question has to be asked in a
   * way that has an answer rather than an exception.
   *
   * The `try` stays behind it for the require itself, which is a different
   * failure with a different cause and no reason to be fatal either.
   */
  if (!requireOptionalNativeModule('ExpoStoreReview')) {
    sdk = null;
    return sdk;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('expo-store-review') as Sdk;
  } catch {
    sdk = null;
  }
  return sdk;
}

/**
 * Ask for a rating if this run has just cleared a milestone that has not been
 * asked on before.
 *
 * `run` is the current logging streak in days. Everything here is best-effort
 * and silent: an ask that cannot be made is not an error the person logging
 * their lunch should ever hear about, and the next milestone will come round.
 */
export async function maybeAskForReview(run: number): Promise<void> {
  try {
    const StoreReview = storeReview();
    if (!StoreReview) return;

    const milestone = MILESTONES.find((days) => run >= days);
    if (milestone === undefined) return;

    const asked = await read();
    if (asked[String(milestone)]) return;

    const now = Date.now();
    if (tooSoon(asked, now)) return;

    // False where there is nothing to review against. On iOS that means a
    // TestFlight build; on Android it only checks that the Play *app* is
    // installed, not that this app arrived through it — so a sideloaded build
    // passes here and fails inside the flow instead. That gap is what the
    // rollback below covers.
    if (!(await StoreReview.hasAction())) return;

    // Recorded *before* the request rather than after it, and this is the whole
    // subtlety of the API. `requestReview` resolves whether iOS drew the sheet
    // or dropped it on the quota, so a failure to record on the way out — the
    // app is killed, the write loses a race — would come back tomorrow and ask
    // again. Spending the milestone on an ask that may not have been shown is
    // the cheaper mistake by a wide margin: the alternative pesters somebody
    // every single day until the yearly limit swallows it.
    await write({ ...asked, [String(milestone)]: new Date(now).toISOString() });

    try {
      await StoreReview.requestReview();
    } catch (error) {
      // Only Android rejects, and only for a flow that never ran — see the
      // header. Giving the milestone back costs nothing there, because a
      // spent quota resolves rather than throws, so this cannot turn into
      // asking the same person twice. On iOS there is nothing to catch.
      if (Platform.OS === 'android') await write(asked);
      throw error;
    }
  } catch {
    // Storage unavailable, the sheet refusing, Play declining to run the flow —
    // none of it is worth a word to the user. See the header. A runtime with no
    // native module at all does not reach here; it never gets past
    // `storeReview()`, which is the point of that function.
  }
}

function tooSoon(asked: Asked, now: number): boolean {
  const last = Object.values(asked)
    .map((at) => Date.parse(at))
    .filter((at) => Number.isFinite(at))
    .sort((a, b) => b - a)[0];
  if (last === undefined) return false;
  return now - last < MIN_GAP_DAYS * 24 * 60 * 60 * 1000;
}

async function read(): Promise<Asked> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return {};
  const parsed: unknown = JSON.parse(raw);
  // Anything but an object is a record from a shape this version does not
  // know. Treated as empty rather than repaired: the cost of getting it wrong
  // is one extra ask, and the alternative is migration code for a file whose
  // entire contents are two timestamps.
  return typeof parsed === 'object' && parsed !== null ? (parsed as Asked) : {};
}

async function write(next: Asked): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}


/**
 * Where a "Rate this app" *control* has to send somebody.
 *
 * Not `requestReview`, and this is rule 2 in the header read the other way
 * round: the native sheet may only appear because the app decided the moment
 * was right, never because a finger landed on a button. A button wired to it
 * would also lie about half the time — iOS drops the request once the yearly
 * quota is spent and resolves anyway, so the tap would do nothing, silently,
 * with no way for the settings screen to know or say so. A URL always does
 * something.
 *
 * `?action=write-review` opens the App Store with the star control already up.
 * Play has no equivalent parameter — the deep link that used to jump to the
 * review sheet is gone — so Android gets the listing, where the stars are the
 * first thing under the install button. The https form rather than `market://`
 * on purpose: Play claims the intent on any device that has it, and a device
 * that does not falls through to a browser instead of failing outright.
 *
 * Both come out of `app.json` rather than being retyped here. The App Store id
 * is a ten-digit number that appears in exactly one other place — `ascAppId` in
 * `eas.json` — and a second hand-copy of it is a second thing to get wrong on
 * the day it is read out loud from the console.
 */
export function storeListingUrl(): string | null {
  if (Platform.OS === 'ios') {
    const listing = Constants.expoConfig?.ios?.appStoreUrl;
    return listing ? `${listing}?action=write-review` : null;
  }
  return Constants.expoConfig?.android?.playStoreUrl ?? null;
}
