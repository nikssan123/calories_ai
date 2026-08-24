import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DaySummary } from '@ct/shared';

/**
 * Today's numbers, left somewhere the widget can find them.
 *
 * A widget is drawn when the app is not running, which is the whole difficulty:
 * it has no session, no API client and no React tree to ask. The two ways out
 * are to give the widget its own copy of the network stack and the credentials
 * to use it, or to have the app leave a note. This is the note.
 *
 * Leaving a note is the better trade by some distance. A widget that fetched
 * would need the session token in a second place, would wake the radio on a
 * timer the reader did not ask for, and would still be blank on the first draw.
 * A snapshot is stale at worst — and staleness is bounded by the thing that
 * matters, because the app rewrites it every time the day is loaded, which is
 * every time anyone logs anything.
 *
 * Deliberately not the whole `DaySummary`. A widget shows a ring and a figure,
 * and storing the entries as well would mean every meal logged rewrites a
 * payload the widget never reads.
 */

const KEY = 'day-snapshot.v1';

export interface DaySnapshot {
  /** The local date these numbers belong to, so a stale note can be spotted. */
  localDate: string;
  consumed: number;
  target: number;
  burned: number;
  /** When it was written, for deciding whether to trust it at all. */
  savedAt: string;
}

/**
 * Called wherever a fresh day arrives. Failure is silent on purpose: the note
 * is a convenience for a surface nobody is looking at, and a screen that
 * errored because it could not update a widget would be a worse app.
 */
export async function writeDaySnapshot(day: DaySummary): Promise<void> {
  const snapshot: DaySnapshot = {
    localDate: day.local_date,
    consumed: Math.round(day.consumed.kcal),
    target: Math.round(day.targets.kcal),
    burned: Math.round(day.burned_kcal),
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(snapshot)).catch(() => {});
  await repaintWidget();
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
 * What the widget draws from.
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
    return typeof parsed?.consumed === 'number' && typeof parsed?.target === 'number'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Signed out means the numbers are not ours to show any more. */
export async function clearDaySnapshot(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
