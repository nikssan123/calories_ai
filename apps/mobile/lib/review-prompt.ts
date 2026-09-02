import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

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
 * Ask for a rating if this run has just cleared a milestone that has not been
 * asked on before.
 *
 * `run` is the current logging streak in days. Everything here is best-effort
 * and silent: an ask that cannot be made is not an error the person logging
 * their lunch should ever hear about, and the next milestone will come round.
 */
export async function maybeAskForReview(run: number): Promise<void> {
  try {
    const milestone = MILESTONES.find((days) => run >= days);
    if (milestone === undefined) return;

    const asked = await read();
    if (asked[String(milestone)]) return;

    const now = Date.now();
    if (tooSoon(asked, now)) return;

    // `hasAction` is false where there is nothing to review against — a
    // simulator without a store, a dev client, a platform that does not carry
    // one. Checking it keeps the milestone unspent for a build that can
    // actually ask, rather than burning it on a machine that cannot.
    if (!(await StoreReview.hasAction())) return;

    // Recorded *before* the request rather than after it, and this is the whole
    // subtlety of the API. `requestReview` resolves whether iOS drew the sheet
    // or dropped it on the quota, so a failure to record on the way out — the
    // app is killed, the write loses a race — would come back tomorrow and ask
    // again. Spending the milestone on an ask that may not have been shown is
    // the cheaper mistake by a wide margin: the alternative pesters somebody
    // every single day until the yearly limit swallows it.
    await write({ ...asked, [String(milestone)]: new Date(now).toISOString() });

    await StoreReview.requestReview();
  } catch {
    // Storage unavailable, the module missing on this platform, the sheet
    // refusing — none of it is worth a word to the user. See the header.
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
