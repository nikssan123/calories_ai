import { Dimensions } from 'react-native';
import { localDateFor, nextDayStart, type Locale } from '@ct/shared';
import { DayWidget, RingWidget } from './Face';
import { dayProps, ringProps } from './props';
import type { DaySnapshot } from '@/lib/snapshot';

/**
 * Telling WidgetKit what the day looks like, and when it will stop being today.
 *
 * The other platform's widget goes and asks. This one cannot: a WidgetKit
 * layout is a pure function of the props it is handed, evaluated in an
 * extension with no session, no network client and nowhere to put an answer if
 * it had one. Everything it will ever draw has to be pushed from the app, in
 * advance, which is what a timeline is for.
 *
 * So the same bug `currentDaySnapshot` was written to fix has to be closed a
 * different way here. That bug: a widget that only ever draws the last thing
 * the app wrote will, on a morning when nobody has opened the app, report last
 * night's total under the word "Today" — and go on reporting it. Android fixes
 * it by fetching from the headless draw. Here the fix has to be scheduled
 * before the fact, because after the fact there is nobody to run it.
 *
 * Two entries, then. The day as it stands, and — dated at the exact instant
 * this account's day turns over, `day_start_hour` in their timezone and not
 * midnight — the same day emptied out.
 *
 * Emptied rather than blanked, and that is the one place this deliberately
 * departs from the Android reasoning. `Empty` refuses to draw "0 of 2,000"
 * because for somebody who has never opened the app it is a confident lie: no
 * target is known, so the zero and the two thousand are both invented. At a day
 * boundary neither is invented. The target is the one the app last saw, and the
 * zero is true — nothing has been logged today, because today is four seconds
 * old. A ring that empties overnight is what a new day actually looks like, and
 * it is a better answer than a rectangle that has given up.
 *
 * What it cannot know is a meal logged on another device before this one is
 * next opened, which would leave the ring reading low until it is. That is the
 * same exposure the Android note has between refreshes, and the app corrects it
 * on the next launch.
 */

/** The day again, at the moment it becomes tomorrow: same target, nothing eaten. */
function freshDay(snapshot: DaySnapshot, at: Date): DaySnapshot {
  return {
    ...snapshot,
    consumed: 0,
    burned: 0,
    localDate: localDateFor(at, {
      timezone: snapshot.timezone,
      dayStartHour: snapshot.dayStartHour,
    }),
    savedAt: at.toISOString(),
  };
}

/**
 * Hands both widgets a timeline. Safe to call when neither is on a home screen
 * — WidgetKit keeps the entries against the kind, and a widget added later
 * picks them up without the app being opened again.
 */
export function pushIosWidgets(snapshot: DaySnapshot | null, locale?: Locale): void {
  /*
   * The one thing the widget cannot work out for itself. WidgetKit sizes follow
   * from the screen width, and this is the only process that can see it — see
   * `familySize`.
   */
  const screen = Dimensions.get('window').width;
  if (!snapshot) {
    /* Signed out, or never signed in: one entry, and nothing scheduled after
     * it — there is no day to roll over to. `locale` is what the note said
     * before it was dropped, so somebody who signs out of a Bulgarian account
     * is told to open the app in Bulgarian. */
    RingWidget.updateTimeline([{ date: new Date(), props: ringProps(null, locale, screen) }]);
    DayWidget.updateTimeline([{ date: new Date(), props: dayProps(null, locale, screen) }]);
    return;
  }

  const now = new Date();
  const turnover = nextDayStart(now, {
    timezone: snapshot.timezone,
    dayStartHour: snapshot.dayStartHour,
  });
  const tomorrow = freshDay(snapshot, turnover);

  RingWidget.updateTimeline([
    { date: now, props: ringProps(snapshot, undefined, screen) },
    { date: turnover, props: ringProps(tomorrow, undefined, screen) },
  ]);
  DayWidget.updateTimeline([
    { date: now, props: dayProps(snapshot, undefined, screen) },
    { date: turnover, props: dayProps(tomorrow, undefined, screen) },
  ]);
}
