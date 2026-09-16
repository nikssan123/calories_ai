import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DaySummary } from '@ct/shared';
import { Sheet, wellStyle } from '@/components/Field';
import { GlowButton } from '@/components/GlowButton';
import { useToast } from '@/components/Toast';
import { haptics } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import { claimCue, STREAK_DAYS, type ReminderCue } from '@/lib/reminder-invite';
import { applyReminders, DEFAULT_REMINDERS, loadReminders } from '@/lib/reminders';
import { type as t, useColors } from '@/theme';

/**
 * The daily reminder, offered at the moment it makes sense instead of waiting
 * in the settings tab to be found.
 *
 * Which moments and why is `lib/reminder-invite.ts`; what belongs here is the
 * watching and the sheet. Two things about the shape are load-bearing:
 *
 * **It is our sheet, not the OS dialog.** The permission is only ever asked
 * for from the button below — so a reader who is not interested taps "Not now"
 * and the install keeps its one iOS prompt for the day they are. That is the
 * whole reason a soft prompt exists, and it is why this can afford to ask
 * twice.
 *
 * **Only the focused screen asks.** Today and the journal both mount this and
 * tabs stay mounted, so without that guard two sheets would race for one cue —
 * the same guard, for the same reason, as `useStreakMoment`.
 */

/**
 * Long enough for the meal to land first.
 *
 * A sheet that arrives on the same frame as the reply is a sheet over the top
 * of the thing it is congratulating. Matches `StreakMoment`'s settle.
 */
const SETTLE_MS = 1400;

export function ReminderInvite({
  day,
  /** Held off while the screen is busy — see the call sites. */
  quiet = false,
}: {
  day: DaySummary | null | undefined;
  quiet?: boolean;
}) {
  const colors = useColors();
  const tr = useT();
  const toast = useToast();
  const focused = useIsFocused();

  const [cue, setCue] = useState<ReminderCue | null>(null);
  /*
   * Separate from `cue`, because `Sheet` keeps its children mounted for the
   * 200ms it takes to leave. Clearing the cue on close would empty the panel
   * while it is still on screen; it is cleared from `onClosed` instead.
   */
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [hour, setHour] = useState(DEFAULT_REMINDERS.log.hour);
  const [minute, setMinute] = useState(DEFAULT_REMINDERS.log.minute);

  /*
   * A meal watched landing, rather than a meal found already there.
   *
   * The difference is the whole of the first cue. A count read on the first
   * render says nothing about when it was logged — a launch onto a day with
   * lunch already in it would open a sheet at somebody who has done nothing
   * but unlock their phone. An *increase* over a count this component has
   * already seen, on the same date, is an event with a cause.
   */
  const date = day?.local_date ?? null;
  const entries = day?.food_entries.length ?? null;
  const seen = useRef<{ date: string; count: number } | null>(null);
  const [logs, setLogs] = useState(0);

  useEffect(() => {
    if (date === null || entries === null) return;
    const before = seen.current;
    seen.current = { date, count: entries };
    // A different day is a different question, not a log. Stepping back through
    // History and returning must not read as a meal.
    if (!before || before.date !== date) return;
    if (entries > before.count) setLogs((n) => n + 1);
  }, [date, entries]);

  /*
   * `alive` rather than any run at all: `at_risk` is a run ending yesterday,
   * and a sheet that says "three days in a row" to somebody who has not logged
   * today is the app being wrong out loud. See `STREAK_STATES`.
   */
  const streak = day?.streak ?? null;
  const run = streak !== null && streak.state === 'alive' ? streak.current : null;
  const ready = logs > 0 || (run !== null && run >= STREAK_DAYS);

  useEffect(() => {
    if (!focused || quiet || !ready || open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const claimed = await claimCue({ logged: logs > 0, run });
        if (cancelled || claimed === null) return;
        setCue(claimed);
        setOpen(true);
      })();
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [focused, quiet, ready, open, logs, run]);

  const close = useCallback(() => {
    setPicking(false);
    setOpen(false);
  }, []);

  async function turnOn() {
    setBusy(true);
    haptics.press();
    /*
     * Read first so the weekly weigh-in is carried rather than flattened.
     * Nothing is stored at this point — `claimCue` refuses when anything is —
     * so this is the defaults, but a function that writes a whole settings
     * object should not be handed one it assembled from a guess.
     */
    const stored = await loadReminders();
    const applied = await applyReminders(
      { ...stored, log: { enabled: true, hour, minute } },
      { requestPermissions: true },
    );
    setBusy(false);
    close();
    /*
     * Only on the way through. `applyReminders` returns what actually took, so
     * a refusal at the OS dialog comes back off — and a refusal has already
     * been answered, by the dialog, in the reader's own words. Saying anything
     * else about it here would be the app arguing.
     */
    if (applied.log.enabled) toast.success(tr('invite.set')(clock(hour, minute)));
  }

  return (
    <Sheet
      open={open}
      title={tr(cue === 'streak-3' ? 'invite.streakTitle' : 'invite.firstTitle')}
      onClose={close}
      onClosed={() => setCue(null)}
    >
      <View style={styles.body}>
        <Text style={[t.body, { color: colors.mutedForeground }]}>
          {tr(cue === 'streak-3' ? 'invite.streakBody' : 'invite.firstBody')}
        </Text>

        <Pressable
          onPress={() => {
            haptics.press();
            setPicking((was) => !was);
          }}
          accessibilityRole="button"
          accessibilityLabel={tr('setup.reminderTime')}
          accessibilityValue={{ text: clock(hour, minute) }}
          style={({ pressed }) => [styles.when, wellStyle(colors), { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[t.body, styles.whenLabel, { color: colors.mutedForeground }]}>
            {tr('invite.everyDayAt')}
          </Text>
          <Text style={[t.bodySemibold, { color: colors.foreground }]}>{clock(hour, minute)}</Text>
        </Pressable>

        {/*
          * Inside this sheet rather than in a sheet of its own.
          *
          * On iOS that is the whole point: a `Modal` presented from inside a
          * `Modal` is refused by UIKit while the first is still settling, and
          * the picker it refuses never resolves its promise — so the spinner
          * is rendered here, in place, where nothing has to be presented at
          * all. See the note on `Sheet`'s `onClosed`.
          *
          * Android ignores `display` and puts up its own dialog whatever it is
          * told, which is fine — a platform dialog is not a React `Modal` and
          * has none of that trouble. It does mean the component has to be
          * unmounted once the dialog has been answered, which is what the
          * first line below is for: left mounted, the next render simply shows
          * the dialog again, over the value it has just accepted.
          */}
        {picking && (
          <DateTimePicker
            // Any date will do — only the clock face is read back. The first of
            // January for having no daylight-saving seam in any zone.
            value={new Date(2000, 0, 1, hour, minute)}
            mode="time"
            display="spinner"
            onChange={(event, picked) => {
              if (Platform.OS === 'android') setPicking(false);
              if (event.type === 'dismissed' || !picked) return;
              setHour(picked.getHours());
              setMinute(picked.getMinutes());
            }}
          />
        )}

        <GlowButton label={tr('invite.remindMe')} onPress={() => void turnOn()} busy={busy} />

        <Pressable
          onPress={close}
          accessibilityRole="button"
          style={({ pressed }) => [styles.later, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[t.body, { color: colors.mutedForeground }]}>{tr('invite.notNow')}</Text>
        </Pressable>

        <Text style={[t.footnote, styles.fine, { color: colors.mutedForeground }]}>
          {tr('invite.fromThisPhone')}
        </Text>
      </View>
    </Sheet>
  );
}

const clock = (hour: number, minute: number): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },
  /* A well rather than a lifted pill, at the size of a row: it is a value to
     be read as much as a control to be tapped. `wellStyle` draws no corner of
     its own — see `Field`. */
  when: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  whenLabel: { flexShrink: 1 },
  later: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 16 },
  fine: { textAlign: 'center' },
});
