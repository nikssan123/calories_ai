import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

/**
 * The notifications that never touch the server.
 *
 * Everything else in this app that makes a phone buzz is a decision made in a
 * datacentre: a pass walks every account hourly, reads the log, decides
 * somebody is worth speaking to, and pays a relay to say it. That is the right
 * machinery for a sentence only the server could have written — a plateau, a
 * streak, a plan about to lapse.
 *
 * It is absurd machinery for "remind me at eight". A reminder needs no account,
 * no model, no token, no network and no tier: the phone already has a clock and
 * an OS that will wake an app on it. So this one is scheduled on the device and
 * stays there, which has consequences worth stating because they are all the
 * good kind — it works in a tunnel, it works on the free tier, it works for
 * somebody who has never verified their address, it costs nothing per person,
 * and it cannot be part of an outage.
 *
 * The trade is that the *server* knows nothing about it. A reminder set on a
 * phone is not restored on a new one, and there is nowhere to look up whether
 * one exists. Both are acceptable for an alarm; neither would be for a message.
 */

/** What is stored, and the shape the settings screen edits. */
export interface ReminderSettings {
  /** "Have you logged today?" — every day, at an hour of their choosing. */
  log: { enabled: boolean; hour: number; minute: number };
  /** "Time to weigh in" — once a week, because a daily weigh-in is a bad habit. */
  weighIn: { enabled: boolean; weekday: number; hour: number; minute: number };
}

/**
 * Both off, with the hours already sensible for when they are switched on.
 *
 * 20:00 for the log is after the last meal of most days and early enough to do
 * something about it. Monday at 08:00 for the scale is the morning the weekly
 * review lands, and a weigh-in taken before breakfast is the only one that
 * compares honestly with the last.
 */
export const DEFAULT_REMINDERS: ReminderSettings = {
  log: { enabled: false, hour: 20, minute: 0 },
  // Expo counts weekdays from Sunday, so 2 is Monday.
  weighIn: { enabled: false, weekday: 2, hour: 8, minute: 0 },
};

/**
 * Not namespaced by account, unlike everything in `store.ts`.
 *
 * A scheduled notification is a property of the *phone* — it lives in the OS,
 * it survives the app being killed, and it is not restored by signing in
 * somewhere else. Keying it to whoever was signed in when it was set would
 * describe the storage accurately and the world inaccurately: the alarm would
 * still fire for the next person either way. Nothing personal is in it; both
 * strings below are the same for everybody.
 */
const STORAGE_KEY = 'ct:reminders:v1';

/**
 * Stable ids so that re-applying replaces rather than accumulates.
 *
 * Without them every visit to the settings screen would schedule another copy,
 * and the failure is invisible until somebody is being reminded to log dinner
 * four times.
 */
const LOG_ID = 'reminder-log';
const WEIGH_IN_ID = 'reminder-weigh-in';

/**
 * Its own Android channel, separate from anything the server sends.
 *
 * This is the one category a reader chose the *time* of, which makes it the one
 * they are least likely to want silenced along with the rest — and the one they
 * are most likely to want silenced on its own, on the morning they decide they
 * do not want to be told to weigh themselves.
 */
const CHANNEL = 'reminders';

export async function loadReminders(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_REMINDERS;
    const stored = JSON.parse(raw) as Partial<ReminderSettings>;
    return {
      log: { ...DEFAULT_REMINDERS.log, ...stored.log },
      weighIn: { ...DEFAULT_REMINDERS.weighIn, ...stored.weighIn },
    };
  } catch {
    // A corrupt blob is not a reason to show somebody an error about an alarm.
    return DEFAULT_REMINDERS;
  }
}

/**
 * Puts the settings into force and returns what actually took.
 *
 * The return value is not the argument. Switching a reminder on needs a
 * permission the reader may refuse, and a switch that stays on after the OS
 * said no is a control lying about the state of the world — so a refusal comes
 * back as `enabled: false` and the screen renders the truth.
 *
 * Cancel-then-schedule rather than diffing: there are two of these, the ids are
 * fixed, and a cancel for something that was never scheduled is a no-op. The
 * arithmetic to work out what changed would be longer than the work it saves.
 */
export async function applyReminders(next: ReminderSettings): Promise<ReminderSettings> {
  const wanted = next.log.enabled || next.weighIn.enabled;
  const allowed = wanted ? await ensurePermission() : true;

  const settings: ReminderSettings = allowed
    ? next
    : {
        log: { ...next.log, enabled: false },
        weighIn: { ...next.weighIn, enabled: false },
      };

  await save(settings);

  try {
    if (Platform.OS === 'android' && wanted && allowed) await ensureChannel();

    await Notifications.cancelScheduledNotificationAsync(LOG_ID).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(WEIGH_IN_ID).catch(() => {});

    if (settings.log.enabled) {
      await Notifications.scheduleNotificationAsync({
        identifier: LOG_ID,
        content: {
          title: 'Anything to log?',
          /*
           * A question, and deliberately not a scolding. The phone has no idea
           * whether today was logged — it is an alarm, not an observation — so
           * anything more specific than this would be a guess presented as a
           * fact to somebody who logged their dinner an hour ago.
           */
          body: 'A minute now beats reconstructing the day tomorrow.',
          data: { route: '/' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: settings.log.hour,
          minute: settings.log.minute,
          channelId: CHANNEL,
        },
      });
    }

    if (settings.weighIn.enabled) {
      await Notifications.scheduleNotificationAsync({
        identifier: WEIGH_IN_ID,
        content: {
          title: 'Weigh-in day',
          body: 'Before breakfast is the reading that compares with the last one.',
          data: { route: '/progress' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: settings.weighIn.weekday,
          hour: settings.weighIn.hour,
          minute: settings.weighIn.minute,
          channelId: CHANNEL,
        },
      });
    }
  } catch {
    /*
     * A simulator with no notification service, an OS that refused the schedule.
     * The preference is still saved, so the switch keeps its position and the
     * next launch tries again — and failing to set an alarm is not worth an
     * error message the reader cannot act on.
     */
  }

  return settings;
}

/**
 * Re-applies whatever is stored. Called at launch.
 *
 * Scheduled notifications survive a restart on both platforms, so this is not
 * what keeps them alive — it is what repairs the cases where they quietly did
 * not: a reinstall that kept AsyncStorage but lost the OS-level schedule, a
 * permission revoked and later granted again, an Android upgrade that dropped a
 * channel. Cheap, idempotent, and it fixes the failure nobody would report
 * because its symptom is silence.
 */
export async function restoreReminders(): Promise<void> {
  const stored = await loadReminders();
  if (!stored.log.enabled && !stored.weighIn.enabled) return;
  await applyReminders(stored);
}

/** Both switches off and both alarms cancelled. For signing out on a shared phone. */
export async function clearReminders(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(LOG_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(WEIGH_IN_ID).catch(() => {});
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

/**
 * The permission, asked for at the moment it is an answer to something.
 *
 * The same rule `registerForPush` follows and the same reason: `canAskAgain` is
 * the difference between "not yet" and "no", and asking past it resolves
 * instantly to denied — which would read as the person having just refused
 * rather than months ago, in Settings, about something else.
 */
async function ensurePermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Reminders you set',
    // The only category here somebody picked a time for, so it is the only one
    // that has earned a heads-up display: an alarm that arrives silently in the
    // shade has failed at the one job it was given.
    importance: Notifications.AndroidImportance.HIGH,
  });
}

async function save(settings: ReminderSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A full disk loses the preference, not the alarm — that one is already in
    // the OS by the time this runs.
  }
}
