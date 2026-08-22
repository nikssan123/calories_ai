import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { DayQuality } from '@ct/shared';
import { QUALITY_COVERAGE_FLOOR } from '@ct/shared';
import { Chunk } from '@/components/Chunk';
import { duration, ease, type as t, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Fiber, sodium, saturated fat and sugar, under the macros.
 *
 * Deliberately not four more MacroBars. Three fat tracks is a glance; seven is
 * a dashboard, and the moment this reads as important as protein it starts
 * being the thing people optimise. These are smaller and quieter and sit below
 * the fold of attention on purpose — they are for noticing a pattern over a
 * week, not for scoring a lunch.
 *
 * The two halves of the panel do not mean the same thing and are not drawn
 * alike. Fiber is a floor: filling it is good news, so it takes the app's
 * positive green. The other three are ceilings, which have no good news in them
 * — a full sodium bar is not an achievement — so they run in ink and turn to
 * plain foreground when crossed. Never red: going over is still not an alarm.
 */
const ROWS = [
  { key: 'fiber_g', label: 'Fiber', emoji: '🌱', unit: 'g' },
  { key: 'sodium_mg', label: 'Sodium', emoji: '🧂', unit: 'mg' },
  { key: 'sat_fat_g', label: 'Sat fat', emoji: '🧈', unit: 'g' },
  { key: 'sugar_g', label: 'Sugar', emoji: '🍬', unit: 'g' },
] as const;

export function DietQuality({
  quality,
  style,
}: {
  quality: DayQuality;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();

  // Nothing estimated means nothing to say. An empty panel of dashes would
  // invite the reading that today had no fiber in it.
  if (ROWS.every((row) => quality[row.key] === null)) return null;

  const partial = quality.coverage < QUALITY_COVERAGE_FLOOR;

  return (
    <View style={style}>
      <View style={styles.header}>
        <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>🥦&nbsp;&nbsp;Diet quality</Text>
        {partial && (
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>partly measured</Text>
        )}
      </View>

      <Chunk
        contentStyle={{
          backgroundColor: colors.card,
          borderWidth: 2,
          borderColor: colors.border,
          paddingHorizontal: 16,
          paddingVertical: 16,
        }}
      >
        <View style={styles.grid}>
          {ROWS.map((row) => (
            <QualityTrack
              key={row.key}
              row={row}
              value={quality[row.key]}
              target={quality.targets[row.key]}
            />
          ))}
        </View>
      </Chunk>

      {partial && (
        <Text style={[t.footnote, styles.footer, { color: colors.mutedForeground }]}>
          Only {Math.round(quality.coverage * 100)}% of today’s calories carry these figures, so
          the totals are a floor rather than the whole day.
        </Text>
      )}
    </View>
  );
}

function QualityTrack({
  row,
  value,
  target,
}: {
  row: (typeof ROWS)[number];
  value: number | null;
  target: { value: number; direction: 'floor' | 'ceiling' };
}) {
  const colors = useColors();
  const floor = target.direction === 'floor';
  const pct = value === null ? 0 : Math.min(100, (value / target.value) * 100);

  // A floor reached is good; a ceiling crossed is worth seeing but is not an
  // alarm, so both land on a colour rather than on a warning.
  const marked = value !== null && (floor ? value >= target.value : value > target.value);
  const fillColor = marked && !floor ? colors.foreground : floor ? colors.calories : colors.mutedForeground;

  const width = useSharedValue(pct);
  const reduced = useReducedMotion();
  useEffect(() => {
    width.value = withTiming(pct, {
      duration: reduced ? 0 : duration.spring,
      easing: ease.spring,
    });
  }, [pct, width, reduced]);

  const fill = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, width.value))}%`,
  }));

  /*
   * Label, figure and bar stacked rather than laid out across the row — the
   * same rhythm as MacroBars above, which is what lets this sit under them
   * without reading as a different kind of object.
   */
  return (
    <View style={styles.cell}>
      <View style={styles.labelRow}>
        <Text style={styles.emoji}>{row.emoji}</Text>
        <Text
          numberOfLines={1}
          style={[t.footnoteSemibold, styles.label, { color: colors.mutedForeground }]}
        >
          {row.label}
        </Text>
      </View>

      <View style={styles.figureRow}>
        {value === null ? (
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>not estimated</Text>
        ) : (
          <>
            <Text
              style={[
                t.figure,
                styles.figure,
                { color: marked && floor ? colors.caloriesText : colors.foreground },
              ]}
            >
              {Math.round(value).toLocaleString()}
            </Text>
            <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
              /{target.value.toLocaleString()}
              {row.unit}
            </Text>
          </>
        )}
      </View>

      <View style={[styles.bar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Animated.View style={[styles.fill, fill, { backgroundColor: fillColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 20 },
  // Two columns, with the row gap already spent by `rowGap` above.
  cell: { width: '46%', flexGrow: 1, gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emoji: { fontSize: 11, lineHeight: 13 },
  label: { flexShrink: 1 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  figure: { fontSize: 13, lineHeight: 13 },
  bar: { height: 6, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  footer: { paddingHorizontal: 6, paddingTop: 2 },
});
