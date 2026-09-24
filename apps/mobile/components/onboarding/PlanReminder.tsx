import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Switch } from '@/components/Switch';
import { wellStyle } from '@/components/Field';
import { haptics } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import {
  clock,
  DEFAULT_REMINDERS,
  loadReminders,
  remindersStanding,
  remindersTouched,
} from '@/lib/reminders';
import { type as t, useColors } from '@/theme';

/**
 * The daily reminder, offered on the last screen of the walk.
 *
 * `lib/reminder-invite.ts` argues at length that this must never happen in
 * onboarding, and it was right about the version of the question it was
 * answering. Two things about that argument do not survive contact with the
 * funnel.
 *
 * The first is reach. The invite fires on `first-log`, the moment a sentence
 * becomes a number, which is the best moment there is — for the people who get
 * there. In the twelve days after the ads started, twelve of thirty accounts
 * logged nothing at all and eleven logged exactly one meal and never came back.
 * Four came back for a second day and none for a third. An ask that waits for a
 * first meal is an ask that four in ten installs never receive, and it is
 * precisely the six in ten who need reminding who are missing.
 *
 * The second is the iOS dialog, and that objection is answered rather than
 * overruled: the OS is still never asked here. This row is ours, it is a
 * preference and not a permission, and the system dialog is raised on the way
 * out — by the button that ends the walk, and only for somebody who has left
 * this switch on with it in front of them. Nobody's one prompt is spent on a
 * screen they did not agree with.
 *
 * What is left of the original objection is real and is the reason this is a
 * row and not a sheet: the ask lands before the thing it is about. So it does
 * not interrupt, it does not cover the plan, and it says the least it can. The
 * plan above it is what makes it legible — a target is a thing you can fail to
 * keep by forgetting, and this is the app offering to remember.
 *
 * **On by default.** The switch beside it is one tap and the OS gate is still
 * in front of the actual permission, so nothing is taken from anybody who would
 * rather not — but the default is the whole lever. Nought of thirty accounts
 * have ever turned a notification on by finding it.
 *
 * Renders nothing at all for somebody who has met these switches before — a
 * reinstall, or a second walk — which is `remindersTouched`, the same guard
 * `claimCue` uses and for the same reason.
 */
export interface PlanReminderChoice {
  on: boolean;
  hour: number;
  minute: number;
}

export function PlanReminder({ onChange }: { onChange: (choice: PlanReminderChoice | null) => void }) {
  const colors = useColors();
  const tr = useT();

  /* Null until the checks below have answered; false means never show it. */
  const [offer, setOffer] = useState<boolean | null>(null);
  const [on, setOn] = useState(true);
  const [hour, setHour] = useState(DEFAULT_REMINDERS.log.hour);
  const [minute, setMinute] = useState(DEFAULT_REMINDERS.log.minute);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      /*
       * The same three disqualifications as `claimCue`, in the same order and
       * for the same reasons: somebody who has already answered this question
       * is not asked it again, and a permission that cannot be requested makes
       * this a switch that does nothing.
       */
      const show =
        !(await remindersTouched()) &&
        !(await loadReminders()).log.enabled &&
        (await remindersStanding()) !== 'blocked';
      if (cancelled) return;
      setOffer(show);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * The parent is told the answer rather than asked for it: the button that
   * ends the walk is theirs, and this row has to be able to be absent — no
   * offer means null, and null means the button does nothing about reminders.
   */
  useEffect(() => {
    onChange(offer ? { on, hour, minute } : null);
  }, [offer, on, hour, minute, onChange]);

  const pick = useCallback(() => {
    haptics.press();
    setPicking((was) => !was);
  }, []);

  if (!offer) return null;

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, wellStyle(colors)]}>
        <View style={styles.label}>
          <Text style={[t.bodySemibold, { color: colors.foreground }]}>
            {tr('setup.remindMeToLog')}
          </Text>
          <Pressable
            onPress={pick}
            accessibilityRole="button"
            accessibilityLabel={tr('setup.reminderTime')}
            accessibilityValue={{ text: clock(hour, minute) }}
            hitSlop={8}
            style={({ pressed }) => [styles.when, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[t.footnote, { color: colors.mutedForeground }]}>
              {tr('invite.everyDayAt')}{' '}
            </Text>
            <Text style={[t.footnoteSemibold, t.tnum, { color: colors.foreground }]}>
              {clock(hour, minute)}
            </Text>
          </Pressable>
        </View>
        <Switch
          value={on}
          onValueChange={(next) => {
            haptics.press();
            setOn(next);
          }}
          accessibilityLabel={tr('setup.remindMeToLog')}
        />
      </View>

      {/* Rendered in place rather than in a modal, for the reason spelled out
          on the same picker in `ReminderInvite`: UIKit refuses a modal
          presented from inside one that is still settling, and this screen has
          a sheet's worth of animation running behind it. */}
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
            // Moving the hands is a yes, whatever the switch was doing.
            setOn(true);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  label: { flex: 1, gap: 1 },
  when: { flexDirection: 'row', alignItems: 'baseline' },
});
