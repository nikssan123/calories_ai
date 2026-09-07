import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';
import {
  dayStartFor,
  localDateFor,
  STEP_SYNC_WINDOW_DAYS,
  type DailySteps,
  type DayContext,
  type Profile,
} from '@ct/shared';
import { api } from '@/lib/api';

/**
 * The phone's step count, read on the phone and sent up as context.
 *
 * Read the comment on `DailySteps` before changing anything here, because the
 * obvious next feature — turning these into calories and netting them off the
 * day — is the one thing this must never do. Steps are already inside the
 * adaptive TDEE (the scale saw them) and priced again into the activity
 * multiplier; a third counting would shrink the target of whoever moves most.
 *
 * ## Two sensors, one shape
 *
 * The platforms answer the same question through completely different doors,
 * and the difference is not an API detail — it is what the operating system
 * keeps.
 *
 * **iOS keeps step history itself.** CoreMotion writes to a system store and
 * `CMPedometer` will hand back any window inside the last seven days, whenever
 * asked, whether or not the app was running. Nothing has to be installed and
 * nothing has to be counting on our behalf.
 *
 * **Android keeps none.** `Sensor.TYPE_STEP_COUNTER` is a raw tally since the
 * device last booted, readable only while a process of ours is alive: no
 * history, nothing across a reboot, nothing while the app is shut. That is why
 * `expo-sensors` throws from `getStepCountAsync` there rather than answering
 * badly, and why its `watchStepCount` reports steps *since subscribing* — a
 * figure that would tell somebody who opens the app twice a day that they
 * walked four hundred steps.
 *
 * Health Connect is Google's answer to that gap: an on-device store that phones
 * and watches write into, with real history and no need for our process to be
 * running. So Android reads from a *database* where iOS reads from a *sensor* —
 * and the one thing that follows from that is worth stating plainly, because it
 * has no iOS equivalent and it is not a bug:
 *
 * **Health Connect is a store, not a counter.** It holds what other apps put
 * there. Permission can be granted and the answer still be nothing, because
 * nothing on that phone is writing steps — no Samsung Health, no Fitbit, no
 * anything. `hasWriter` below is that state, and the app says so rather than
 * drawing a zero.
 *
 * Everything above `stepsBetween` is shared. The window walk, the day
 * boundaries, the upload and its rate limit are one implementation, because the
 * hard part — slicing a sensor's history into *this account's* days — is the
 * same problem on both.
 */

/** The one Health Connect permission this app asks for. Read, steps, nothing else. */
const STEPS_PERMISSION = { accessType: 'read', recordType: 'Steps' } as const;

/**
 * When the window was last accepted by the server.
 *
 * Only an optimisation, and deliberately not a source of truth: losing it costs
 * one redundant sync, which is a few hundred bytes and an upsert that lands on
 * the same rows. Nothing reads it to decide what to *send* — the whole window
 * goes every time.
 */
const SYNCED_KEY = 'steps-synced-at.v1';

/**
 * How long a sync is left alone before another is worth making.
 *
 * Foregrounding is a common event — a notification, a share sheet, switching
 * back from the camera — and a request per foreground would be a request every
 * few seconds while somebody logs a meal. Fifteen minutes is under the
 * granularity anybody reads a step count at and well over the rate the app is
 * re-entered.
 */
const SYNC_EVERY_MS = 15 * 60 * 1000;

export type StepPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/**
 * Health Connect, loaded only where it exists.
 *
 * Imported lazily rather than at the top of the file, for the reason
 * `snapshot.tsx` gives about the widget library: this module is read by the
 * Today screen on every load, and pulling a native module onto that path costs
 * every reader — on iOS, where it does not exist at all, the import is simply
 * wrong.
 */
async function healthConnect() {
  if (Platform.OS !== 'android') return null;
  try {
    const hc = await import('react-native-health-connect');
    const { SdkAvailabilityStatus } = hc;
    /*
     * `getSdkStatus` before anything else. Health Connect is a platform module
     * on Android 14 and up and an installable app below it, so "this phone has
     * it" is a real question with three answers — and the middle one, a
     * provider that needs updating, is a phone that will answer every read with
     * an error until somebody visits the Play Store. Both non-available answers
     * are reported as unsupported: an app that cannot read steps should say so
     * once, not offer a button that fails.
     */
    if ((await hc.getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE) return null;
    if (!(await hc.initialize())) return null;
    return hc;
  } catch {
    /* No native module in this build — an older install, or Expo Go. */
    return null;
  }
}

/**
 * What we are allowed to read, without asking for anything.
 *
 * Kept apart from `requestStepPermission` because the two answer questions with
 * different consequences. This one is safe to call on every launch; the other
 * puts a system dialog on somebody's screen.
 */
export async function stepPermission(): Promise<StepPermission> {
  if (Platform.OS === 'ios') {
    try {
      /*
       * Availability first, and it is not a formality: a pedometer is hardware,
       * and the simulator, an iPad and a handful of older phones do not have
       * one. `getPermissionsAsync` on a device with no sensor answers about a
       * capability that does not exist.
       */
      if (!(await Pedometer.isAvailableAsync())) return 'unsupported';
      const { status } = await Pedometer.getPermissionsAsync();
      return status as StepPermission;
    } catch {
      return 'unsupported';
    }
  }

  const hc = await healthConnect();
  if (!hc) return 'unsupported';
  try {
    const granted = await hc.getGrantedPermissions();
    /*
     * Undetermined rather than denied when the permission is simply absent,
     * and the distinction matters to the card: Health Connect does not tell us
     * whether somebody was asked and refused or has never been asked at all.
     * Treating "not granted" as "never asked" means the offer stays available,
     * which is the right way to be wrong here — Health Connect's own sheet is
     * re-openable, unlike an iOS permission prompt, so a second tap costs
     * nothing and a hidden offer would strand anybody who declined once.
     */
    return granted.some(
      (p) => 'recordType' in p && p.recordType === 'Steps' && p.accessType === 'read',
    )
      ? 'granted'
      : 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/** The system dialog. Only ever from something the reader tapped. */
export async function requestStepPermission(): Promise<StepPermission> {
  if (Platform.OS === 'ios') {
    try {
      if (!(await Pedometer.isAvailableAsync())) return 'unsupported';
      const { status } = await Pedometer.requestPermissionsAsync();
      return status as StepPermission;
    } catch {
      return 'unsupported';
    }
  }

  const hc = await healthConnect();
  if (!hc) return 'unsupported';
  try {
    const granted = await hc.requestPermission([STEPS_PERMISSION]);
    return granted.some(
      (p) => 'recordType' in p && p.recordType === 'Steps' && p.accessType === 'read',
    )
      ? 'granted'
      : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Health Connect's own screen, where the reader can see what feeds it.
 *
 * The answer to "permission granted, still no steps": the problem is not this
 * app and cannot be fixed from inside it, so the honest move is to open the
 * place where it *can* be fixed rather than to explain it in a paragraph
 * nobody reads. No-op on iOS, where the state it addresses cannot happen.
 */
export async function openStepsSettings(): Promise<void> {
  const hc = await healthConnect();
  try {
    hc?.openHealthConnectSettings();
  } catch {
    /* Health Connect uninstalled between the check and the tap. */
  }
}

/**
 * One window, from whichever door this platform has.
 *
 * The seam, and the whole of the platform difference. Both sides answer the
 * same question — how many steps between these two instants — so everything
 * above works in days and boundaries and never learns which sensor replied.
 *
 * Null means "could not say", which is not zero: permission revoked mid-read,
 * a provider that went away, a day past the edge of the history.
 */
async function stepsBetween(start: Date, end: Date): Promise<number | null> {
  if (Platform.OS === 'ios') {
    try {
      const { steps } = await Pedometer.getStepCountAsync(start, end);
      return Number.isFinite(steps) ? Math.round(steps) : null;
    } catch {
      return null;
    }
  }

  const hc = await healthConnect();
  if (!hc) return null;
  try {
    /*
     * `aggregateRecord` over an explicit window rather than
     * `aggregateGroupByPeriod`, which would be the obvious call and is the
     * wrong one: grouping by period slices on the *device's calendar day*, and
     * this app's day runs from `day_start_hour` in the account's timezone. A
     * 1am walk would land on the wrong date — the one mistake this whole file
     * is arranged to avoid — and it would do it silently.
     *
     * Asking per window costs one call per day of the sync and keeps the
     * boundary arithmetic in `readStepWindow`, shared with iOS, where it can be
     * read and tested.
     */
    const result = await hc.aggregateRecord({
      recordType: 'Steps',
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
    return Number.isFinite(result.COUNT_TOTAL) ? Math.round(result.COUNT_TOTAL) : null;
  } catch {
    return null;
  }
}

/**
 * The last week of days, sliced this account's way.
 *
 * The slicing is the part worth being careful about, and the reason this is not
 * a loop over `new Date().setDate(-i)`. A day in this app runs from
 * `day_start_hour` in the account's timezone, so somebody in Sofia with the
 * default 4am rollover has days that begin at 01:00 UTC and are 23 or 25 hours
 * long twice a year. Walking backwards through `dayStartFor` asks the same
 * question `localDateFor` answers everywhere else, so a step taken at 1am lands
 * on the evening it belongs to — exactly as the meal eaten alongside it does.
 *
 * Days are resolved here rather than on the server because this is the only
 * process that can ask the sensor for a specific window. Sending raw buckets up
 * and re-deriving the boundaries would mean two implementations of the same
 * rule, and the second one would be the one that drifts.
 */
export async function readStepWindow(ctx: DayContext): Promise<DailySteps[]> {
  const now = new Date();
  const days: DailySteps[] = [];

  /* Today's window closes at "now" rather than at the day's end, which is still
   * hours away: `CMPedometer` answers a query running into the future with an
   * error, and an aggregate over a window half of which has not happened is at
   * best a wasted call. Every earlier day closes at the next day's start, which
   * the walk below supplies. */
  let end = now;
  let start = dayStartFor(now, ctx);

  for (let i = 0; i < STEP_SYNC_WINDOW_DAYS; i += 1) {
    const steps = await stepsBetween(start, end);
    /*
     * A zero is dropped rather than sent, and on Android it is the common case
     * rather than an edge: an empty Health Connect answers every window with
     * nought, and so does iOS past the edge of its seven-day history. Neither
     * is distinguishable from a real day of not moving — and of the two
     * readings, "no data" is overwhelmingly the more likely and the only one
     * safe to be wrong about. A genuine zero-step day is a phone left at home,
     * which is the same thing.
     */
    if (steps !== null && steps > 0) {
      days.push({ local_date: localDateFor(start, ctx), steps, source: 'device' });
    }

    end = start;
    /* One millisecond back is inside the previous day whatever its length, so
     * the walk cannot skip or repeat one across a clock change. */
    start = dayStartFor(new Date(start.getTime() - 1), ctx);
  }

  /* Oldest first, which is the order the server's chart and every caller below
   * wants, and the reverse of the order they were read in. */
  return days.reverse();
}

export interface StepSync {
  /** Today's count, when the window had one. */
  today: number | null;
  /**
   * True when we are allowed to read and the whole window came back empty.
   *
   * The Android-only state that has no iOS equivalent: Health Connect is a
   * store rather than a counter, so a phone with nothing writing into it grants
   * the permission and then has nothing to give. Distinguished from "not synced
   * yet" so the card can say which it is — the fix lives in Health Connect's
   * own settings, not in this app, and pretending otherwise would leave people
   * tapping a button that cannot work.
   */
  hasWriter: boolean;
}

/**
 * Read the window and hand it over, if it is time to.
 *
 * Failure is quiet and the recovery is free, which is the nicest property this
 * feature has: nothing here is an event that can be missed. The whole window is
 * re-read and re-sent on the next foreground, so a sync lost to a dead network
 * costs nothing and needs no outbox, no retry queue and no reconciliation — the
 * shape `OFFLINE.md` has to build carefully for a meal is inherent here,
 * because a step count is a fact about a day rather than something that
 * happened at an instant.
 */
export async function syncSteps(
  profile: Profile | null,
  options: { force?: boolean } = {},
): Promise<StepSync | null> {
  if (!options.force && !(await dueForSync())) return null;
  if ((await stepPermission()) !== 'granted') return null;

  const ctx: DayContext = {
    /*
     * The account's clock, not the handset's. They differ for anybody who has
     * travelled, and the difference decides which day a walk counts toward —
     * the same reasoning `snapshot.ts` gives for carrying both onto the widget.
     */
    timezone: profile?.timezone ?? deviceTimezone(),
    dayStartHour: profile?.day_start_hour ?? 0,
  };

  const days = await readStepWindow(ctx);
  if (days.length === 0) return { today: null, hasWriter: false };

  try {
    await api.syncSteps(days);
    await AsyncStorage.setItem(SYNCED_KEY, String(Date.now())).catch(() => {});
  } catch {
    /* Offline, or signed out between the read and the send. The next
     * foreground sends the same window again. */
  }

  const today = localDateFor(new Date(), ctx);
  return { today: days.find((d) => d.local_date === today)?.steps ?? null, hasWriter: true };
}

async function dueForSync(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SYNCED_KEY);
    if (!raw) return true;
    return Date.now() - Number(raw) > SYNC_EVERY_MS;
  } catch {
    return true;
  }
}

/** Whatever this device thinks it is, for a sync before an account is loaded. */
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Signing out drops the sync clock, so the next account starts its own. */
export async function clearStepSync(): Promise<void> {
  await AsyncStorage.removeItem(SYNCED_KEY).catch(() => {});
}
