import { StyleSheet, Text, View } from 'react-native';
import type { Streak, TrainingWeek as Week } from '@ct/shared';
import { addDays, WEEK_ORDER, weekdayName } from '@ct/shared';
import { useLocale, useT } from '@/lib/i18n';
import { font, type as t, useColors } from '@/theme';
import { Glossy } from '@/components/icons/Glossy';

/**
 * The training week, as seven cells rather than as a fraction.
 *
 * A weekly streak has a visibility problem a daily one does not. "3 weeks" is
 * a number that only resolves on Sunday — too late to act on and too vague to
 * feel like anything on a Wednesday. The dots are the fix: they say how far
 * along the week is *and* which days it was, and a week with Monday and Tuesday
 * filled reads very differently on a Saturday than one with Thursday and
 * Friday.
 *
 * Monday-first via `WEEK_ORDER`, and the letters come from `Intl` rather than an
 * array — Bulgarian has "П" for three different days and only the platform
 * knows which narrow forms it actually uses.
 */
export function TrainingWeek({ week, streak }: { week: Week; streak: Streak }) {
  const colors = useColors();
  const locale = useLocale();
  const tr = useT();

  const trained = new Set(week.days);
  const met = week.days.length >= week.needed;

  return (
    <View style={styles.wrap}>
      <View style={styles.dots}>
        {WEEK_ORDER.map((weekday, index) => {
          // `WEEK_ORDER` is Monday-first, so the index *is* the offset from the
          // week's own Monday — no need to reason about the weekday number.
          const date = addDays(week.week_start, index);
          const done = trained.has(date);
          return (
            <View key={weekday} style={styles.day}>
              <View
                style={[
                  styles.dot,
                  done
                    ? {
                        /* A trained day is lit in exercise pink; a rest day is an empty glass bead. */
                        backgroundColor: colors.exercise,
                        borderColor: 'rgba(255, 255, 255, 0.7)',
                        experimental_backgroundImage: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${colors.exercise} 55%)`,
                        boxShadow: `0px 3px 8px -3px ${colors.exercise}`,
                      }
                    : { backgroundColor: colors.glass, borderColor: colors.hairline },
                ]}
              />
              <Text style={[styles.letter, { color: colors.mutedForeground }]}>
                {weekdayName(weekday, locale, 'narrow')}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
        {met ? tr('streak.weekMet') : tr('streak.weekProgress')(week.days.length, week.needed)}
      </Text>

      {/*
       * The run, and only when there is one. A zero-week streak drawn as "0
       * weeks" is a scoreboard reminding somebody they are losing; the line
       * underneath tells a first-timer what the bar even is instead.
       */}
      {streak.current > 0 ? (
        <View style={styles.run}>
          <Glossy name="dumbbell" size={16} />
          <Text style={[t.footnoteBold, t.tnum, { color: colors.foreground }]}>
            {tr('streak.weeks')(streak.current)}
            {streak.best > streak.current ? `  ${tr('streak.best')(streak.best)}` : ''}
          </Text>
        </View>
      ) : (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {tr('streak.startTraining')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  dots: { flexDirection: 'row', gap: 10 },
  day: { alignItems: 'center', gap: 4 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
  run: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  letter: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14 },
  hint: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
