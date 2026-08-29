import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDateFor, matchLocale, type DaySummary, type Locale, type Profile } from '@ct/shared';
import { deviceLocale } from '@/messages';

/**
 * Today's numbers, left somewhere the widget can find them.
 *
 * A widget is drawn when the app is not running, which is the whole difficulty:
 * it has no session, no API client and no React tree to ask. So the app leaves
 * a note, and the launcher's draw spends it.
 *
 * The note is still the fast path and the offline path, and it is written every
 * time the app loads a day — which is every time anyone logs anything. What it
 * is *not* is the only path: a note is a record of the last time somebody
 * looked, and a home screen is looked at on mornings when nobody has opened the
 * app yet. Left to itself the note would still be reporting last night's total
 * at nine the next morning, under the word "Today". So the widget refreshes it
 * when it has gone off — see `currentDaySnapshot` — and the note's job narrows
 * to being the answer when the network cannot be reached.
 *
 * Deliberately not the whole `DaySummary`. A widget shows a ring and a figure,
 * and storing the entries as well would mean every meal logged rewrites a
 * payload the widget never reads.
 *
 * The language is part of the note for the same reason the numbers are. The
 * launcher draws with no tree to ask, and the answer `useLocale()` gives is not
 * one the widget could reconstruct — it can be the account's setting rather
 * than the device's. So the screen that knows writes it down.
 */

const KEY = 'day-snapshot.v1';

/**
 * How long a note is taken on trust before the widget goes and asks.
 *
 * Under this, a draw spends what it has: the launcher redraws on a click and on
 * a resize as well as on its timer, and three taps in a row should not be three
 * requests. Over it, the numbers are old enough to be worth a few kilobytes —
 * and comfortably under the half hour the platform floors `updatePeriodMillis`
 * at, so every scheduled draw does refetch rather than skipping every other one
 * on a rounding error.
 */
const TRUST_MS = 10 * 60 * 1000;

export interface DaySnapshot {
  /** The local date these numbers belong to, so a stale note can be spotted. */
  localDate: string;
  consumed: number;
  target: number;
  burned: number;
  /** The language the screen was being read in when the note was left. */
  locale: Locale;
  /**
   * The reader's clock, carried so the widget can work out what day it is now.
   *
   * `localDate` on its own cannot say whether it is still today: this app's day
   * turns over at the account's `day_start_hour` in the account's timezone, and
   * neither is anything the launcher could guess. Without them a note has a
   * date on it that nothing is in a position to compare.
   */
  timezone: string;
  dayStartHour: number;
  /** When it was written, for deciding whether to trust it at all. */
  savedAt: string;
}

/**
 * Called wherever a fresh day arrives. Failure is silent on purpose: the note
 * is a convenience for a surface nobody is looking at, and a screen that
 * errored because it could not update a widget would be a worse app.
 */
export async function writeDaySnapshot(
  day: DaySummary,
  locale: Locale,
  profile: Profile | null,
): Promise<void> {
  await putDaySnapshot(snapshotOf(day, locale, profile));
  await repaintWidget();
}

/** The note a day makes, without deciding where it goes. */
function snapshotOf(day: DaySummary, locale: Locale, profile: Profile | null): DaySnapshot {
  return {
    localDate: day.local_date,
    consumed: Math.round(day.consumed.kcal),
    target: Math.round(day.targets.kcal),
    burned: Math.round(day.burned_kcal),
    locale,
    /*
     * The device's clock when there is no profile to ask, which is the same
     * fallback `lib/day.ts` works from and wrong only for somebody who has set
     * a day start and is reading a screen that has not loaded their account
     * yet. A widget an hour out at 4am beats one that cannot tell the date at
     * all.
     */
    timezone: profile?.timezone ?? deviceTimezone(),
    dayStartHour: profile?.day_start_hour ?? 0,
    savedAt: new Date().toISOString(),
  };
}

async function putDaySnapshot(snapshot: DaySnapshot): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(snapshot)).catch(() => {});
}

/** Whatever this device thinks it is, for a note written before an account is. */
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Asks the launcher to redraw, now that the note has changed.
 *
 * Without this the widget would only ever be as fresh as its update period,
 * which the platform floors at half an hour — so logging a meal and then
 * looking at the home screen would show the old number for up to thirty
 * minutes, which is exactly the moment somebody checks.
 *
 * `widgetNotFound` is left empty on purpose. Nobody having added the widget is
 * the normal case, not an error, and the snapshot is still worth writing for
 * whenever they do.
 */
async function repaintWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    /*
     * Imported here rather than at the top of the file. This module is read by
     * `today.tsx` and the journal on every load, and the widget library pulls
     * in a native module that has no business being on the critical path of a
     * screen — nor of iOS, where it does not exist at all.
     */
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { paint } = await import('@/widget/handler');
    const snapshot = await readDaySnapshot();
    /*
     * Each name separately, because `requestWidgetUpdate` is keyed by one — and
     * both are asked for even when neither is on a home screen, which costs a
     * no-op and saves knowing which the reader chose.
     */
    await Promise.all(
      (['Ring', 'Day'] as const).map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          renderWidget: (info) => paint(info, snapshot),
          widgetNotFound: () => {},
        }),
      ),
    );
  } catch {
    /* A home screen with no widget on it, or a platform with no widgets. */
  }
}

/**
 * What the widget draws from, fetched if the note has gone off.
 *
 * The order matters and is the whole of the fix. A note that is recent *and*
 * about today is spent as it stands — that is the overwhelming majority of
 * draws, and it costs nothing. Anything else goes to the server, because the
 * two ways a note goes wrong are both invisible from inside it: the day rolled
 * over while the app was closed, or somebody logged a meal on another device.
 *
 * When the ask cannot happen — no session, a locked keystore, no radio — the
 * note is used only if it is still about today. Yesterday's total under the
 * word "Today" is not a stale reading, it is a wrong one, and the honest answer
 * there is the empty widget that says to open the app.
 */
export async function currentDaySnapshot(): Promise<DaySnapshot | null> {
  const note = await readDaySnapshot();
  if (note && describesToday(note) && Date.now() - Date.parse(note.savedAt) < TRUST_MS) {
    return note;
  }
  return (await fetchDaySnapshot(note)) ?? (note && describesToday(note) ? note : null);
}

/** Whether these numbers are still the ones for the day the reader is in. */
function describesToday(snapshot: DaySnapshot): boolean {
  try {
    const today = localDateFor(new Date(), {
      timezone: snapshot.timezone,
      dayStartHour: snapshot.dayStartHour,
    });
    return snapshot.localDate === today;
  } catch {
    // An unrecognised timezone from a note written by an older build. Treat it
    // as unknown rather than as today: the fetch below is the better answer and
    // this is what sends us there.
    return false;
  }
}

/**
 * The day, asked for from the launcher's own process, and written back.
 *
 * Everything here is imported dynamically for the reason `repaintWidget` gives:
 * the module that registers this handler is evaluated before the router, and
 * dragging the API client and the keystore into that moment would put them on
 * the critical path of every cold start for the sake of a rectangle.
 *
 * The token is read off disk only when the process does not already have it.
 * `restoreToken` writes its answer into the in-memory cache, and a widget draw
 * that happened to run against a locked keystore would otherwise answer "no
 * token" and sign the running app out of itself.
 */
async function fetchDaySnapshot(note: DaySnapshot | null): Promise<DaySnapshot | null> {
  try {
    const { api } = await import('@/lib/api');
    const { currentToken, restoreToken } = await import('@/lib/session');
    if (!(currentToken() ?? (await restoreToken()))) return null;

    const [day, profile] = await Promise.all([api.day(), api.profile()]);
    /*
     * The account's language wins, then the one the last note was written in,
     * then the device's. The middle term is what `useLocale()` would have
     * answered from its own store, which a headless task has not hydrated.
     */
    const locale = matchLocale(profile.locale) ?? note?.locale ?? deviceLocale();
    const snapshot = snapshotOf(day, locale, profile);
    await putDaySnapshot(snapshot);
    return snapshot;
  } catch {
    // Signed out, offline, or the keystore is shut because the phone is locked.
    return null;
  }
}

/**
 * The note as it stands on disk, with no opinion about whether to believe it.
 *
 * Returns null rather than a zeroed day when there is nothing to read, because
 * those are different things to look at: "nothing logged yet" is a ring at zero
 * and "we do not know" is a widget that should say so. Rendering 0 of 2,000 for
 * somebody who has simply never opened the app would be a lie told confidently.
 */
export async function readDaySnapshot(): Promise<DaySnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DaySnapshot;
    if (typeof parsed?.consumed !== 'number' || typeof parsed?.target !== 'number') return null;
    /*
     * The language is read back defensively rather than trusted. A note written
     * before this field existed has none, and the device's answer is the same
     * one `lib/i18n` starts from — so an upgrade draws in the right language on
     * the first repaint instead of waiting for the next meal.
     *
     * The clock is filled in the same way and for the same reason, except that
     * the fallback is deliberately the *device's* rather than a guess at the
     * account's: a note from before this field will fail `describesToday` on
     * anyone whose day starts late, which sends the widget to the server and
     * gets the real answer written down. Better that than trusting a date we
     * have nothing to compare against.
     */
    return {
      ...parsed,
      locale: matchLocale(parsed.locale) ?? deviceLocale(),
      timezone: parsed.timezone ?? deviceTimezone(),
      dayStartHour: typeof parsed.dayStartHour === 'number' ? parsed.dayStartHour : 0,
    };
  } catch {
    return null;
  }
}

/** Signed out means the numbers are not ours to show any more. */
export async function clearDaySnapshot(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
