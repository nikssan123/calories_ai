import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { formatNumber, type Targets } from '@ct/shared';
import { Chunk } from '@/components/Chunk';
import { column, duration, font, type as t, useColors, useType, withAlpha } from '@/theme';
import { useLocale, useT } from '@/lib/i18n';
import { useCountUp } from '@/hooks/useCountUp';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The two screens at the end, which are the point of the six before them.
 *
 * Every app that asks this many questions ends by showing what they bought,
 * and the ones that do it well spend a beat on the arithmetic first. That beat
 * is not theatre for its own sake: the target is the single number this whole
 * app is built around, and a figure that simply appears on the frame after a
 * button press reads as a constant somebody typed in. Watching it be worked out
 * is what makes it *theirs* — which is the difference between a target people
 * follow and one they change on the first hungry evening.
 *
 * It is also honest about the wait. The plan really is being written on the
 * server during it, so the animation covers a request instead of pretending to.
 */

/** How long the three lines take to tick through, whatever the request does. */
const BEAT = 620;

/**
 * The arithmetic, said out loud.
 *
 * Three lines rather than a spinner, and in this order, because they are the
 * three things the reader just answered questions for: what they burn, what
 * that means for calories, and how the calories are split. Somebody who reads
 * them learns what the number is made of; somebody who does not still sees
 * that something happened.
 */
export function Building({ steps }: { steps: string[] }) {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const reduced = useReducedMotion();
  const [done, setDone] = useState(reduced ? steps.length : 0);

  useEffect(() => {
    if (reduced) return;
    const timers = steps.map((_, i) => setTimeout(() => setDone(i + 1), BEAT * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [steps, reduced]);

  return (
    <View style={[styles.centre, column]}>
      <Spinner />

      <Text style={[type.largeTitle, styles.centred, { color: colors.foreground }]}>
        {tr('ob.buildingTitle')}
      </Text>

      <View style={styles.checklist}>
        {steps.map((step, i) => (
          <View key={step} style={styles.checkRow}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Circle
                cx={12}
                cy={12}
                r={10}
                fill={i < done ? colors.primary : 'none'}
                stroke={i < done ? colors.primary : colors.input}
                strokeWidth={2}
              />
              {i < done && (
                <Path
                  d="M7.6 12.2l3 3 5.8-6"
                  stroke={colors.primaryForeground}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              )}
            </Svg>
            <Text
              style={[
                t.body,
                { color: i < done ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {step}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A ring that turns, drawn rather than imported.
 *
 * `ActivityIndicator` is the platform's spinner and looks it — a grey hairline
 * on a screen where every other object has a ledge and a radius. This is the
 * calorie ring's own arc, with a gap in it, rotating.
 */
function Spinner() {
  const colors = useColors();
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    const spin = () => {
      turn.value = 0;
      turn.value = withTiming(1, { duration: 1100 }, (done) => {
        if (done) spin();
      });
    };
    spin();
  }, [reduced, turn]);

  const spinning = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value * 360}deg` }],
  }));

  return (
    <Animated.View style={[styles.spinner, spinning]}>
      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Circle cx={32} cy={32} r={27} stroke={colors.muted} strokeWidth={8} fill="none" />
        <Circle
          cx={32}
          cy={32}
          r={27}
          stroke={colors.primary}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 27 * 0.28} ${2 * Math.PI * 27}`}
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * The plan.
 *
 * One figure, three bars and a sentence, in that order of size — the calorie
 * number is what they came for, the macros are what makes it a plan rather
 * than a limit, and the sentence is the promise the app has to keep: this
 * moves, and it moves because of what you log.
 */
export function Plan({ targets, footer }: { targets: Targets; footer: React.ReactNode }) {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  /*
   * Counted from zero, which the rest of the app deliberately never does — see
   * `useCountUp`. This is the one screen where the figure has genuinely just
   * been arrived at, so watching it land is the truth rather than a tax.
   */
  const [target, setTarget] = useState(reduced ? targets.kcal : 0);
  useEffect(() => {
    const timer = setTimeout(() => setTarget(targets.kcal), 60);
    return () => clearTimeout(timer);
  }, [targets.kcal]);
  const shown = useCountUp(target, 900);

  const macros = [
    { key: 'protein', label: tr('macro.protein'), grams: targets.protein_g, color: colors.protein, text: colors.proteinText },
    { key: 'carbs', label: tr('macro.carbs'), grams: targets.carbs_g, color: colors.carbs, text: colors.carbsText },
    { key: 'fat', label: tr('macro.fat'), grams: targets.fat_g, color: colors.fat, text: colors.fatText },
  ];

  return (
    <View style={styles.flex}>
      <Animated.View
        entering={reduced ? undefined : FadeIn.duration(duration.spring).reduceMotion(ReduceMotion.System)}
        style={[styles.centre, column]}
      >
        <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>{tr('ob.planEyebrow')}</Text>

        <View style={styles.figureRow}>
          <Text style={[styles.figure, { color: colors.foreground }]}>
            {formatNumber(Math.round(shown), locale)}
          </Text>
        </View>
        <Text style={[t.bodySemibold, styles.centred, { color: colors.mutedForeground }]}>
          {tr('ob.planCalories')}
        </Text>

        <Chunk
          depth={3}
          radius={20}
          style={styles.macroCard}
          contentStyle={[styles.macroFace, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          {macros.map((macro) => (
            <View key={macro.key} style={styles.macro}>
              <View style={[styles.swatch, { backgroundColor: withAlpha(macro.color, 0.22) }]}>
                <View style={[styles.dot, { backgroundColor: macro.color }]} />
              </View>
              {/* No unit letter. `MacroBars` prints these bare too, and the
                  reason is the same: "g" is "г" in Bulgarian and the grams are
                  never in doubt on a screen whose other figure is a calorie
                  count four times the size. */}
              <Text style={[styles.macroGrams, { color: colors.foreground }]}>
                {formatNumber(Math.round(macro.grams), locale)}
              </Text>
              <Text style={[t.footnote, { color: macro.text }]}>{macro.label}</Text>
            </View>
          ))}
        </Chunk>

        <Text style={[t.footnote, styles.centred, styles.promise, { color: colors.mutedForeground }]}>
          {tr('ob.planFootnote')}
        </Text>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={column}>{footer}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 20 },
  centred: { textAlign: 'center' },

  spinner: { marginBottom: 8 },
  checklist: { gap: 12, marginTop: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  figureRow: { flexDirection: 'row', alignItems: 'baseline' },
  figure: {
    fontFamily: font.display,
    fontSize: 76,
    lineHeight: 88,
    letterSpacing: -1.6,
    fontVariant: ['tabular-nums'],
  },

  macroCard: { alignSelf: 'stretch', marginTop: 12 },
  macroFace: { flexDirection: 'row', paddingVertical: 18, borderWidth: 2 },
  macro: { flex: 1, alignItems: 'center', gap: 4 },
  swatch: { width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 999 },
  macroGrams: { fontFamily: font.display, fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] },

  promise: { marginTop: 12, maxWidth: 320 },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
});
