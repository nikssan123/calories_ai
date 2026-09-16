import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadReminders, remindersStanding, remindersTouched } from '@/lib/reminders';

/**
 * When to offer the daily reminder, rather than waiting to be found.
 *
 * The reminder in `lib/reminders.ts` is the single cheapest thing in this app
 * that keeps somebody logging — no account, no network, no meter — and it was
 * three taps into the settings tab, below the notification switches it has
 * nothing to do with. Nobody goes looking for it. So it comes to them instead,
 * twice, at the only two moments where the answer to "shall I remind you?" is
 * obviously yes.
 *
 * **Never in onboarding**, which is the decision the rest of this file exists
 * to protect. The first-run walk happens before a single meal has been logged,
 * so the ask lands before the thing it is about; and on iOS the OS dialog is
 * one per install, so a refusal there is not a "not today" — it is permanent,
 * and the switch it exiles is the one in Settings.app rather than ours.
 *
 * So: a soft prompt of our own, at a moment that earned it, and the OS dialog
 * only ever shown to somebody who has already said yes to us. A "not now"
 * costs the install nothing, which is what makes asking a second time fair.
 */

/**
 * The two moments, in the order they can happen.
 *
 * `first-log` is the first meal this install watches land. The value has just
 * been felt — a sentence became a number — and "keep this going" is a sentence
 * about something that exists.
 *
 * `streak-3` is three days in a row, which is the second chance and the better
 * one: by then it is a habit with something to lose, and the reminder is in
 * service of a run the reader can see. Whoever said no at the first meal is
 * asked once more here, and never again.
 */
export const REMINDER_CUES = ['first-log', 'streak-3'] as const;
export type ReminderCue = (typeof REMINDER_CUES)[number];

/** Days in a row that make the second ask. */
export const STREAK_DAYS = 3;

/**
 * Not namespaced by account, for the reason written on `STORAGE_KEY` in
 * `lib/reminders.ts`: the thing being offered is a property of the phone, so
 * the record of having offered it is too.
 */
const KEY = 'ct:reminder-invite:v1';

type Spent = Partial<Record<ReminderCue, string>>;

/**
 * The cue to offer now, marked as spent on the way out — or null, which is the
 * ordinary answer.
 *
 * Spent *before* the sheet is shown rather than after it is answered, and for
 * the same reason `review-prompt.ts` records before requesting: the app can be
 * killed between the two, and an ask that comes back tomorrow because the
 * write lost a race is the expensive mistake. At most one prompt per cue, in
 * exchange for occasionally losing one nobody saw.
 *
 * Claiming a cue spends every cue before it as well. Without that, somebody
 * who reached three days without ever being asked at their first meal — a
 * reinstall, an install that logged before this version shipped — would be
 * asked at the streak and then again at their next meal, which is the one
 * outcome this whole file is arranged to prevent.
 */
export async function claimCue({
  logged,
  run,
}: {
  /** A meal was watched landing in this session. */
  logged: boolean;
  /** The live logging run in days, or null when there is none. */
  run: number | null;
}): Promise<ReminderCue | null> {
  const cue: ReminderCue | null =
    run !== null && run >= STREAK_DAYS ? 'streak-3' : logged ? 'first-log' : null;
  if (cue === null) return null;

  try {
    const spent = await read();
    if (spent[cue]) return null;

    /*
     * Anybody who has touched these switches has had this conversation, and
     * that includes the person who ran the reminder for a fortnight and then
     * turned it off. `loadReminders` cannot tell them apart from a new install
     * — both are `enabled: false` — which is exactly what `remindersTouched`
     * is for. Asked first because it is the cheaper of the two reads and the
     * one that disqualifies most people who get this far.
     */
    if (await remindersTouched()) return null;
    if ((await loadReminders()).log.enabled) return null;

    // A permission that cannot be asked for again makes this a sheet with a
    // button that does nothing. See `remindersStanding`.
    if ((await remindersStanding()) === 'blocked') return null;

    const now = new Date().toISOString();
    const through = REMINDER_CUES.slice(0, REMINDER_CUES.indexOf(cue) + 1);
    await write({ ...spent, ...Object.fromEntries(through.map((id) => [id, spent[id] ?? now])) });
    return cue;
  } catch {
    // Storage unavailable. Nothing is offered rather than offered unrecorded:
    // an ask that cannot be written down is an ask that repeats.
    return null;
  }
}

async function read(): Promise<Spent> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return {};
  const parsed: unknown = JSON.parse(raw);
  // Anything but an object came from a shape this version does not know.
  // Treated as empty, the same as `review-prompt.ts`: the cost of being wrong
  // is one extra prompt, and the alternative is a migration for two dates.
  return typeof parsed === 'object' && parsed !== null ? (parsed as Spent) : {};
}

async function write(next: Spent): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}
