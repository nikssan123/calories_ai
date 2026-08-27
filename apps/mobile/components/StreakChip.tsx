import { StyleSheet, Text, View } from 'react-native';
import type { Streak } from '@ct/shared';
import { useT } from '@/lib/i18n';
import { font, type as t, useColors } from '@/theme';

/**
 * The logging run, under the ring that earns it.
 *
 * Deliberately small and deliberately not a card. This sits beneath a figure
 * somebody opens the app to read, and a streak that competed with the calorie
 * number for attention would be the tail wagging the dog — the run is a reason
 * to come back tomorrow, not the thing today is about.
 *
 * Nothing is drawn at all below the fourth day. A "1 day streak" is not an
 * achievement, it is a sentence about having opened the app, and putting it
 * under the ring on day one sets the expectation that this app keeps score of
 * everything. Let it appear once it means something.
 */
const WORTH_DRAWING = 4;

export function StreakChip({ streak }: { streak: Streak }) {
  const colors = useColors();
  const tr = useT();

  if (streak.state === 'none' || streak.current < WORTH_DRAWING) return null;

  /*
   * The at-risk case is the whole reason this component knows about `state`.
   * The run is intact and has nothing in it today — which is true for most of
   * every morning — so it is drawn in full and given the one line that says
   * what to do about it, rather than being dimmed or hidden.
   */
  const atRisk = streak.state === 'at_risk';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.flame}>{atRisk ? '🕯️' : '🔥'}</Text>
        {/* `streak.days` goes through `plural()`, which returns "21 days" —
            the count already formatted for the locale. Putting the number in
            front of it as well is how this first read "21 21 days". */}
        <Text style={[t.footnoteBold, t.tnum, { color: colors.foreground }]}>
          {tr('streak.days')(streak.current)}
        </Text>
        {/*
         * `best` only once it is genuinely behind them. Showing "best 7" beside
         * a live run of 7 is the app telling somebody their record is the thing
         * they are currently doing, which reads as a bug.
         */}
        {streak.best > streak.current && (
          <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
            {tr('streak.best')(streak.best)}
          </Text>
        )}
      </View>
      {atRisk && (
        <Text style={[styles.nudge, { color: colors.mutedForeground }]}>{tr('streak.atRisk')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flame: { fontSize: 13 },
  nudge: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
});
