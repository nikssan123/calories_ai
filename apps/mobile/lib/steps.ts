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
 * The phone's own step count, read on the phone and sent up as context.
 *
 * Read the comment on `DailySteps` before changing anything here, because the
 * obvious next feature — turning these into calories and netting them off the
 * day — is the one thing this must never do. Steps are already inside the
 * adaptive TDEE (the scale saw them) and priced again into the activity
 * multiplier; a third counting would shrink the target of whoever moves most.
 *
 * ## What each platform can actually answer
 *
 * iOS keeps roughly seven days of `CMPedometer` history and will hand back any
 * window inside it, which is the whole feature for free: the app opens, asks
 * for the last week, and gets real days including the ones nobody opened the
 * app on.
 *
 * Android, through `expo-sensors`, cannot. `getStepCountAsync` throws
 * `NotSupportedException` there, and the only other door — `watchStepCount` —
 * is `Sensor.TYPE_STEP_COUNTER` with the module zeroing the baseline at
 * subscribe time, so it reports steps *since the app came to the foreground*.
 * Accumulating those would produce a number that is confidently, silently,
 * always low: somebody who opens the app twice a day would be told they walked
 * four hundred steps. That is the same lie `Empty.tsx` refuses to tell with
 * "0 of 2,000", and it is worse here because it looks plausible.
 *
 * So Android reports unavailable rather than wrong, and the real answer there
 * is Health Connect — which reads what the phone and any watch already wrote,
 * in the background, with history. It needs a native module and a Play data
 * declaration, which is why it is a stage of its own; see INTEGRATIONS.md.
 * Everything above this file is platform-blind, so that stage is a new
 * implementation of `readStepWindow` and nothing else.
 */

/** Whether this build can produce a step history at all. See the note above. */
export const STEPS_SUPPORTED = Platform.OS === 'ios';

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
 * What we are allowed to read, without asking for anything.
 *
 * Kept apart from `requestStepPermission` because the two answer questions with
 * different consequences. This one is safe to call on every launch; the other
 * puts a system dialog on somebody's screen and can only be answered once.
 */
export async function stepPermission(): Promise<StepPermission> {
  if (!STEPS_SUPPORTED) return 'unsupported';
  try {
    /*
     * Availability first, and it is not a formality: a pedometer is hardware,
     * and the simulator, an iPad and a handful of older phones do not have one.
     * `getPermissionsAsync` on a device with no sensor answers about a
     * capability that does not exist.
     */
    if (!(await Pedometer.isAvailableAsync())) return 'unsupported';
    const { status } = await Pedometer.getPermissionsAsync();
    return status as StepPermission;
  } catch {
    return 'unsupported';
  }
}

/** The system dialog. Only ever from something the reader tapped. */
export async function requestStepPermission(): Promise<StepPermission> {
  if (!STEPS_SUPPORTED) return 'unsupported';
  try {
    if (!(await Pedometer.isAvailableAsync())) return 'unsupported';
    const { status } = await Pedometer.requestPermissionsAsync();
    return status as StepPermission;
  } catch {
    return 'unsupported';
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
  if (!STEPS_SUPPORTED) return [];

  const now = new Date();
  const days: DailySteps[] = [];

  /* Today's window closes at the sensor's "now" rather than at the day's end,
   * which is still hours away: `CMPedometer` answers a query that runs into the
   * future with an error, not with a partial count. Every earlier day closes at
   * the next day's start, which the walk below supplies. */
  let end = now;
  let start = dayStartFor(now, ctx);

  for (let i = 0; i < STEP_SYNC_WINDOW_DAYS; i += 1) {
    const localDate = localDateFor(start, ctx);
    try {
      const { steps } = await Pedometer.getStepCountAsync(start, end);
      /*
       * A zero is dropped rather than sent. Past the edge of the sensor's
       * seven-day history the query succeeds and answers nought, which is
       * indistinguishable from a real day of not moving — and of the two
       * readings, "no data" is overwhelmingly the more likely and the only one
       * that is safe to be wrong about. A genuine zero-step day is a phone left
       * at home, which is the same thing.
       */
      if (Number.isFinite(steps) && steps > 0) {
        days.push({ local_date: localDate, steps: Math.round(steps), source: 'device' });
      }
    } catch {
      /* Permission revoked mid-read, or a day the sensor has nothing for. Skip
       * it and keep the rest: a partial window is worth sending. */
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

/**
 * Read the window and hand it over, if it is time to.
 *
 * Returns today's count when it has one, so the caller that triggers a sync can
 * also draw the result without a second round trip.
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
): Promise<number | null> {
  if (!STEPS_SUPPORTED) return null;
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
  if (days.length === 0) return null;

  try {
    await api.syncSteps(days);
    await AsyncStorage.setItem(SYNCED_KEY, String(Date.now())).catch(() => {});
  } catch {
    /* Offline, or signed out between the read and the send. The next
     * foreground sends the same window again. */
  }

  const today = localDateFor(new Date(), ctx);
  return days.find((d) => d.local_date === today)?.steps ?? null;
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
