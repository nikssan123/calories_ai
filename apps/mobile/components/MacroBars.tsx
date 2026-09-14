import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { Nutrition, Targets } from '@ct/shared';
import { duration, ease, tint, type as t, useColors, type Palette } from '@/theme';
import { Confetti } from '@/components/Confetti';
import { Glossy, type GlossyName } from '@/components/icons/Glossy';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useCountUp } from '@/hooks/useCountUp';
import { useT, type StringKey } from '@/lib/i18n';

/**
 * Protein, carbs, fat as three fat tracks.
 *
 * The bars are twice the weight of an ordinary progress bar, which is most of
 * why they read as part of the same object as the ring above rather than as a
 * legend printed under it. Each carries a picture as well as a word, because
 * three coloured stubs with three short labels is exactly the arrangement a
 * glance skips.
 *
 * The glow-up made each bar a lit capsule — a glossy highlight along its top and
 * a soft lift in its own colour — and swapped the emoji for the app's own icons,
 * which draw the same picture on both platforms (GLOW-UP.md).
 *
 * Crossing a target throws confetti — once, out of the bar that did it. That is
 * the app's only celebration and it is deliberately on the macros rather than
 * on calories: "you have reached your protein" is unambiguously good news and
 * "you have reached your calorie limit" is not.
 */
const MACROS = [
  { key: 'protein_g', label: 'macro.protein', icon: 'protein', fill: 'protein', ink: 'proteinText' },
  { key: 'carbs_g', label: 'macro.carbs', icon: 'carbs', fill: 'carbs', ink: 'carbsText' },
  { key: 'fat_g', label: 'macro.fat', icon: 'fat', fill: 'fat', ink: 'fatText' },
] as const satisfies readonly {
  key: keyof Nutrition & keyof Targets;
  label: StringKey;
  icon: GlossyName;
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
  const tr = useT();
  const colors = useColors();
  // The bar and the figure move together, on the same clock as the ring's.
  const shown = useCountUp(value, 900);
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
        <Glossy name={macro.icon} size={16} />
        {/*
          Shrinks rather than truncates. Three columns inside a card leave about
          seventy points for the word, and "Kohlenhydrate" or "Въглехидрати" is
          wider than that — cut to "Kohlenhydr…" the one word that says which bar
          this is stops saying it.
        */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={[t.footnoteSemibold, styles.label, { color: colors.mutedForeground }]}
        >
          {tr(macro.label)}
        </Text>
      </View>

      {/*
        One text run, not two sibling views. As siblings, Android re-measured
        "/54" against the counting figure beside it and on some frames kept the
        narrower measurement, drawing "26 /" with the target cut off; a single
        run is laid out once, as a line.
      */}
      <Text numberOfLines={1} style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
        <Text style={[t.figure, styles.figure, { color: met ? colors[macro.ink] : colors.foreground }]}>
          {Math.round(shown)}
        </Text>
        {` /${target}`}
      </Text>

      <View style={[styles.bar, { backgroundColor: colors.hairline }]}>
        <Animated.View
          style={[
            styles.fill,
            fill,
            {
              backgroundColor: colors[macro.fill],
              experimental_backgroundImage:
                'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%)',
              /* A lift, not a glow: the bars sit under the ring, which is the one
                 thing on the screen that gives off light. */
              boxShadow: `0px 2px 5px -2px ${tint(colors[macro.fill], 0.55)}`,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 10 },
  track: { flex: 1, gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { flexShrink: 1 },
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
    height: 12,
    borderRadius: 999,
  },
  fill: { height: '100%', borderRadius: 999 },
});
