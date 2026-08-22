import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { Nutrition, Targets } from '@ct/shared';
import { duration, ease, type as t, useColors, type Palette } from '@/theme';
import { Confetti } from '@/components/Confetti';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Protein, carbs, fat as three fat tracks.
 *
 * The bars are twice the weight of an ordinary progress bar, which is most of
 * why they read as part of the same object as the ring above rather than as a
 * legend printed under it. Each carries a picture as well as a word, because
 * three coloured stubs with three short labels is exactly the arrangement a
 * glance skips.
 *
 * Crossing a target throws confetti — once, out of the bar that did it. That is
 * the app's only celebration and it is deliberately on the macros rather than
 * on calories: "you have reached your protein" is unambiguously good news and
 * "you have reached your calorie limit" is not.
 */
const MACROS = [
  { key: 'protein_g', label: 'Protein', emoji: '💪', fill: 'protein', ink: 'proteinText' },
  { key: 'carbs_g', label: 'Carbs', emoji: '🌾', fill: 'carbs', ink: 'carbsText' },
  { key: 'fat_g', label: 'Fat', emoji: '🥑', fill: 'fat', ink: 'fatText' },
] as const satisfies readonly {
  key: keyof Nutrition & keyof Targets;
  label: string;
  emoji: string;
  fill: keyof Palette;
  ink: keyof Palette;
}[];

export function MacroBars({
  consumed,
  targets,
  style,
}: {
  consumed: Nutrition;
  targets: Targets;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.grid, style]}>
      {MACROS.map((macro, i) => (
        <MacroTrack
          key={macro.key}
          macro={macro}
          value={consumed[macro.key]}
          target={targets[macro.key]}
          index={i}
        />
      ))}
    </View>
  );
}

function MacroTrack({
  macro,
  value,
  target,
  index,
}: {
  macro: (typeof MACROS)[number];
  value: number;
  target: number;
  index: number;
}) {
  const colors = useColors();
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  const met = target > 0 && value >= target;

  /*
   * Counts the crossings rather than tracking a boolean, so <Confetti> — which
   * ignores the value it is handed and watches only for a change — fires again
   * if a target is met, undone by a deletion, and met a second time.
   */
  const [crossings, setCrossings] = useState(0);
  const wasMet = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasMet.current === null) {
      // The state on arrival is not an event: a day already at target must not
      // let off fireworks every time the screen is opened.
      wasMet.current = met;
      return;
    }
    if (met && !wasMet.current) setCrossings((c) => c + 1);
    wasMet.current = met;
  }, [met]);

  const width = useSharedValue(pct);
  const reduced = useReducedMotion();
  useEffect(() => {
    const timing = withTiming(pct, {
      duration: reduced ? 0 : duration.spring,
      easing: ease.spring,
    });
    // Staggered so the three bars read as a sequence rather than one three-part
    // thing snapping at once.
    width.value = reduced ? timing : withDelay(index * 70, timing);
  }, [pct, index, width, reduced]);

  const fill = useAnimatedStyle(() => ({
    // The spring overshoots; a bar wider than its track would paint outside the
    // rounded end, so the clamp lives here rather than in the easing.
    width: `${Math.max(0, Math.min(100, width.value))}%`,
  }));

  return (
    <View style={styles.track}>
      <Confetti trigger={crossings || null} />

      <View style={styles.labelRow}>
        <Text style={styles.emoji}>{macro.emoji}</Text>
        <Text
          numberOfLines={1}
          style={[t.footnoteSemibold, styles.label, { color: colors.mutedForeground }]}
        >
          {macro.label}
        </Text>
      </View>

      <View style={styles.figureRow}>
        <Text
          style={[t.figure, styles.figure, { color: met ? colors[macro.ink] : colors.foreground }]}
        >
          {Math.round(value)}
        </Text>
        <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
          /{target}
        </Text>
      </View>

      <View style={[styles.bar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Animated.View style={[styles.fill, fill, { backgroundColor: colors[macro.fill] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 12 },
  track: { flex: 1, gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emoji: { fontSize: 13, lineHeight: 15 },
  label: { flexShrink: 1 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  /*
   * `leading-none` on the web, but not spelled 16/16 here.
   *
   * CSS lets a glyph overflow a short line box; React Native clips it. The
   * display face is Baloo, whose natural line box is about 1.5em, so a line
   * height equal to the font size cropped the tops off every figure on the
   * screen. This is the tightest leading that still draws the whole numeral.
   */
  figure: { fontSize: 16, lineHeight: 20 },
  bar: {
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 999 },
});
