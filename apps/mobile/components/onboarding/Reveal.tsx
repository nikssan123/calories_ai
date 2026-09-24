import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { formatBodyWeight, formatNumber, type Targets, type UnitSystem } from '@ct/shared';
import { Figure } from '@/components/Figure';
import { Glass } from '@/components/Glass';
import { Glossy, type GlossyName } from '@/components/icons/Glossy';
import { Serif } from '@/components/Serif';
import { Trio } from '@/components/cast/Character';
import { column, type as t, useColors, useType } from '@/theme';
import { useLocale, useT } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
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
 * The glow-up made both of them a moment (GLOW-UP.md, "cinematic onboarding")
 * without making either of them a lie. The loader's ticks follow the caller's
 * real stages — the requests for a signed-in account, the arithmetic for a
 * phone with no account yet — and its rotating cards say true things about the
 * app rather than quoting reviews nobody wrote.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The foods in orbit around the core. Four, a quarter-turn apart. */
const ORBIT: GlossyName[] = ['avocado', 'egg', 'fish', 'apple'];

export function Building({
  steps,
  done,
  notes,
}: {
  steps: string[];
  /** How many of `steps` are finished. The ring and the ticks follow it. */
  done: number;
  /** True sentences to rotate under the checklist while the work happens. */
  notes: string[];
}) {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const reduced = useReducedMotion();

  const size = 236;
  const ringRadius = 78;
  const circumference = 2 * Math.PI * ringRadius;
  const ratio = steps.length === 0 ? 1 : Math.min(1, done / steps.length);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(ratio, {
      duration: reduced ? 0 : 520,
      easing: Easing.out(Easing.cubic),
    });
  }, [ratio, reduced, progress]);

  const arc = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const percent = useCountUp(Math.round(ratio * 100), 520);

  /* One angle for the whole orbit; each orb counter-rotates to stay upright. */
  const turn = useSharedValue(0);
  const breath = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    turn.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.linear }), -1, false);
    breath.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(turn);
      cancelAnimation(breath);
    };
  }, [reduced, turn, breath]);

  const orbiting = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const upright = useAnimatedStyle(() => ({ transform: [{ rotate: `${-turn.value * 360}deg` }] }));
  const breathing = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.06 }],
    opacity: 0.92 + breath.value * 0.08,
  }));

  /* The note on show. Advances on its own clock; the work does not wait for it. */
  const [note, setNote] = useState(0);
  useEffect(() => {
    if (notes.length < 2) return;
    const timer = setInterval(() => setNote((i) => (i + 1) % notes.length), 3200);
    return () => clearInterval(timer);
  }, [notes.length]);

  return (
    <View style={[styles.building, column]}>
      <Serif accessibilityRole="header" style={[type.hero, styles.centred, { color: colors.foreground }]}>
        {tr('ob.buildingTitle')}
      </Serif>

      <View style={{ width: size + 40, height: size + 40, alignItems: 'center', justifyContent: 'center' }}>
        {/* The warm core, breathing. Its glow is a radial gradient, not a blur. */}
        <Animated.View
          style={[
            styles.core,
            {
              experimental_backgroundImage:
                'radial-gradient(circle at 40% 35%, #fff7dc 0%, #ffd36a 30%, #ffa51f 52%, rgba(255,165,31,0.18) 62%, rgba(255,165,31,0) 72%)',
            },
            breathing,
          ]}
        />

        <Svg width={size + 40} height={size + 40} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="loader" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.calories} />
              <Stop offset="1" stopColor={colors.logoRamp} />
            </LinearGradient>
          </Defs>
          <G transform={`translate(20 20)`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={ringRadius}
              stroke={colors.hairline}
              strokeWidth={8}
              fill="none"
            />
            <G rotation={-90} originX={size / 2} originY={size / 2}>
              <AnimatedCircle
                cx={size / 2}
                cy={size / 2}
                r={ringRadius}
                stroke="url(#loader)"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={`${circumference} ${circumference}`}
                fill="none"
                animatedProps={arc}
              />
            </G>
          </G>
        </Svg>

        <View style={[StyleSheet.absoluteFill, styles.centreBox]} pointerEvents="none">
          <Figure value={`${Math.round(percent)}%`} size={32} color="#4a3213" />
        </View>

        {/* Outside the ring, so no orb ever crosses the figure. */}
        <Animated.View style={[StyleSheet.absoluteFill, orbiting]} pointerEvents="none">
          {ORBIT.map((food, i) => {
            const angle = (i / ORBIT.length) * Math.PI * 2;
            /* Inside the box the loader owns, so an orb never drifts up into the title. */
            const r = size / 2 - 6;
            return (
              <Animated.View
                key={food}
                style={[
                  styles.orb,
                  {
                    left: (size + 40) / 2 + r * Math.cos(angle) - 21,
                    top: (size + 40) / 2 + r * Math.sin(angle) - 21,
                  },
                  upright,
                ]}
              >
                <Glossy name={food} size={30} />
              </Animated.View>
            );
          })}
        </Animated.View>
      </View>

      <View style={styles.checklist}>
        {steps.map((step, i) => {
          const finished = i < done;
          const current = i === done;
          return (
            <View key={step} style={styles.checkRow}>
              <View
                style={[
                  styles.check,
                  finished
                    ? {
                        borderColor: 'transparent',
                        experimental_backgroundImage: `linear-gradient(135deg, ${colors.calories}, ${colors.logoRamp})`,
                        boxShadow: `0px 0px 12px ${colors.ring}`,
                      }
                    : { borderColor: current ? colors.protein : colors.input },
                ]}
              >
                {finished && (
                  <Svg width={12} height={12} viewBox="0 0 24 24">
                    <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={colors.primaryForeground} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </Svg>
                )}
              </View>
              <Text style={[t.bodySemibold, styles.flex, { color: finished || current ? colors.foreground : colors.mutedForeground }]}>
                {step}
              </Text>
            </View>
          );
        })}
      </View>

      {notes.length > 0 && (
        <Glass strong style={styles.note}>
          <Animated.Text
            key={note}
            entering={reduced ? undefined : FadeInDown.duration(420).reduceMotion(ReduceMotion.System)}
            exiting={reduced ? undefined : FadeOut.duration(200)}
            style={[t.footnoteSemibold, styles.centred, { color: colors.foreground }]}
          >
            {notes[note]}
          </Animated.Text>
        </Glass>
      )}
    </View>
  );
}

/**
 * Where the plan goes, drawn — when it goes anywhere.
 *
 * Only for somebody aiming at a weight. The rate is the plan's own: the gap
 * between the target and the maintenance it was worked out from, at 7,700 kcal
 * a kilo, which is the conventional figure and the one the weekly review
 * already talks in. It is a line from here to there, not a forecast of a body;
 * the copy says "around", and a date more than two years out is not shown at
 * all, because it is not a promise worth making.
 */
export interface Projection {
  fromKg: number;
  toKg: number;
  kgPerWeek: number;
  /** ISO date the line arrives at. */
  arrives: string;
  units: UnitSystem;
}

export function Plan({
  targets,
  projection,
  aside,
  footer,
}: {
  targets: Targets;
  projection: Projection | null;
  /** Anything that belongs with the button but is not it — see `PlanReminder`. */
  aside?: React.ReactNode;
  footer: React.ReactNode;
}) {
  const colors = useColors();
  const type = useType();
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
    const timer = setTimeout(() => setTarget(targets.kcal), 250);
    return () => clearTimeout(timer);
  }, [targets.kcal]);
  const shown = useCountUp(target, 1400);

  const macros = [
    { key: 'protein', label: tr('macro.protein'), grams: targets.protein_g, color: colors.protein },
    { key: 'carbs', label: tr('macro.carbs'), grams: targets.carbs_g, color: colors.carbs },
    { key: 'fat', label: tr('macro.fat'), grams: targets.fat_g, color: colors.fat },
  ];

  /* The one success beat of the whole walk: when the date lands. */
  useEffect(() => {
    const timer = setTimeout(() => haptics.logged(), reduced ? 0 : 2900);
    return () => clearTimeout(timer);
  }, [reduced]);

  /*
   * The walk ends with the three of them (CAST.md): cheering when the plan
   * lands, for having built it, then settling to a wave. What they cheer is the
   * finished walk, never the number above them.
   */
  const [cheering, setCheering] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setCheering(false), 3200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.flex}>
      <Animated.View
        entering={reduced ? undefined : FadeIn.duration(600).reduceMotion(ReduceMotion.System)}
        style={[styles.plan, column, { paddingTop: insets.top + 36 }]}
      >
        <Text style={[t.eyebrow, { color: colors.caloriesText }]}>{tr('ob.planEyebrow')}</Text>

        <View style={styles.figureGlow}>
          {/* The glow is a pool of light behind the number, not a text shadow:
              a shadow on per-digit slots draws each slot's box on Android. */}
          <View
            pointerEvents="none"
            style={[
              styles.glowPool,
              { experimental_backgroundImage: `radial-gradient(ellipse, ${colors.caloriesWash} 0%, rgba(18,183,106,0) 70%)` },
            ]}
          />
          <Figure value={formatNumber(Math.round(shown), locale)} size={80} color={colors.caloriesText} />
        </View>
        <Serif style={[type.serifTitle, styles.unit, { color: colors.mutedForeground }]}>
          {tr('ob.planCalories')}
        </Serif>

        <View style={styles.chips}>
          {macros.map((macro, i) => (
            <Animated.View
              key={macro.key}
              entering={reduced ? undefined : FadeInDown.delay(900 + i * 120).duration(420)}
            >
              <Glass strong radius={999} style={styles.chip}>
                <View style={[styles.dot, { backgroundColor: macro.color, boxShadow: `0px 0px 8px ${macro.color}` }]} />
                <Text style={[t.footnoteBold, t.tnum, { color: colors.foreground }]}>
                  {formatNumber(Math.round(macro.grams), locale)}
                </Text>
                <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{macro.label}</Text>
              </Glass>
            </Animated.View>
          ))}
        </View>

        {projection && <Trajectory projection={projection} />}

        <Text style={[t.footnote, styles.centred, styles.promise, { color: colors.mutedForeground }]}>
          {tr('ob.planFootnote')}
        </Text>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={column}>
          {aside}
          <Trio
            size={40}
            moods={cheering ? ['cheer', 'cheer', 'cheer'] : ['idle', 'wave', 'idle']}
            gap={4}
            style={styles.trio}
          />
          {footer}
        </View>
      </View>
    </View>
  );
}

function Trajectory({ projection }: { projection: Projection }) {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const locale = useLocale();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const height = 120;

  const line = useSharedValue(reduced ? 1 : 0);
  const after = useSharedValue(reduced ? 1 : 0);
  const ping = useSharedValue(0);
  useEffect(() => {
    if (reduced || width === 0) return;
    line.value = withDelay(500, withTiming(1, { duration: 2200, easing: Easing.bezier(0.4, 0, 0.2, 1) }));
    after.value = withDelay(2300, withTiming(1, { duration: 700 }));
    ping.value = withDelay(2900, withRepeat(withSequence(withTiming(1, { duration: 1600 }), withTiming(0, { duration: 0 })), -1, false));
    return () => cancelAnimation(ping);
  }, [reduced, width, line, after, ping]);

  const losing = projection.toKg < projection.fromKg;
  const pad = 10;
  const x0 = pad;
  const x1 = Math.max(pad * 2, width - pad);
  const top = 16;
  const bottom = height - 16;
  const y0 = losing ? top : bottom;
  const y1 = losing ? bottom : top;
  /* An easing curve rather than a straight line: progress slows as it nears. */
  const curve = `M${x0} ${y0} C ${x0 + (x1 - x0) * 0.35} ${y0}, ${x0 + (x1 - x0) * 0.55} ${y1}, ${x1} ${y1}`;
  const area = `${curve} L ${x1} ${height} L ${x0} ${height} Z`;
  const length = (x1 - x0) * 1.25;

  const drawn = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - line.value) }));
  const faded = useAnimatedProps(() => ({ opacity: after.value }));
  const pinged = useAnimatedProps(() => ({ r: 7 + ping.value * 14, opacity: after.value * (0.6 - ping.value * 0.6) }));
  const chip = useAnimatedStyle(() => ({ opacity: after.value, transform: [{ translateY: (1 - after.value) * 8 }] }));

  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${projection.arrives}T12:00:00Z`),
  );

  return (
    <Glass strong style={styles.trajectory}>
      <Serif style={[type.serifTitle, { color: colors.foreground, fontSize: 19 }]}>{tr('ob.planWhere')}</Serif>
      <View style={styles.meta}>
        <Text style={[t.footnoteBold, { color: colors.mutedForeground }]}>
          {tr('ob.planToday')(formatBodyWeight(projection.fromKg, projection.units))}
        </Text>
        <Text style={[t.footnoteBold, { color: colors.mutedForeground }]}>
          {tr('ob.planGoal')(formatBodyWeight(projection.toKg, projection.units))}
        </Text>
      </View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="curve" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.protein} />
                <Stop offset="1" stopColor={colors.logoRamp} />
              </LinearGradient>
              <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.logoRamp} stopOpacity={0.3} />
                <Stop offset="1" stopColor={colors.logoRamp} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <AnimatedPath d={area} fill="url(#area)" animatedProps={faded} />
            <AnimatedPath
              d={curve}
              stroke="url(#curve)"
              strokeWidth={4}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${length} ${length}`}
              animatedProps={drawn}
            />
            <Circle cx={x0} cy={y0} r={5} fill={colors.protein} />
            <AnimatedCircle cx={x1} cy={y1} fill={colors.logoRamp} animatedProps={pinged} />
            <AnimatedCircle cx={x1} cy={y1} r={6} fill="#ffffff" stroke={colors.logoRamp} strokeWidth={3} animatedProps={faded} />
          </Svg>
        )}
      </View>
      <Animated.View style={[styles.dateChip, chip, { experimental_backgroundImage: `linear-gradient(135deg, ${colors.calories}, ${colors.logoRamp})`, boxShadow: `0px 10px 22px -10px ${colors.ring}` }]}>
        <Text style={[t.footnoteBold, { color: colors.primaryForeground }]}>
          {tr('ob.planArrives')(date, formatBodyWeight(projection.kgPerWeek, projection.units))}
        </Text>
      </Animated.View>
    </Glass>
  );
}

/** Kilograms of body mass per kilocalorie of sustained gap. The conventional figure. */
const KCAL_PER_KG = 7700;

/**
 * The line from here to the goal, or null when there is no line worth drawing.
 * `maintenance` is the TDEE the target was worked out from.
 */
export function projectionFor({
  weightKg,
  targetKg,
  maintenance,
  targetKcal,
  units,
  today = new Date(),
}: {
  weightKg: number | null;
  targetKg: number | null;
  maintenance: number | null;
  targetKcal: number;
  units: UnitSystem;
  today?: Date;
}): Projection | null {
  if (weightKg === null || targetKg === null || maintenance === null) return null;
  const gap = Math.abs(maintenance - targetKcal);
  const distance = Math.abs(weightKg - targetKg);
  if (gap < 50 || distance < 0.5) return null;
  /*
   * The line has to go where the calories do. A floored target — 1,200 kcal for
   * somebody whose maintenance is lower — is a surplus even on a "lose" goal,
   * and drawing a descent with an arrival date over it would be a promise the
   * arithmetic underneath is making in the opposite direction.
   */
  const losing = targetKg < weightKg;
  if (losing !== targetKcal < maintenance) return null;
  const kgPerWeek = (gap * 7) / KCAL_PER_KG;
  const weeks = distance / kgPerWeek;
  if (weeks > 104) return null;
  const arrives = new Date(today.getTime() + weeks * 7 * 86_400_000);
  return {
    fromKg: weightKg,
    toKg: targetKg,
    kgPerWeek: Math.round(kgPerWeek * 10) / 10,
    arrives: arrives.toISOString().slice(0, 10),
    units,
  };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centred: { textAlign: 'center' },

  building: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 24 },
  core: { position: 'absolute', width: 190, height: 190, borderRadius: 95 },
  centreBox: { alignItems: 'center', justifyContent: 'center' },
  orb: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklist: { gap: 12, alignSelf: 'stretch', paddingHorizontal: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { alignSelf: 'stretch', minHeight: 64, paddingHorizontal: 16, paddingVertical: 14, justifyContent: 'center' },

  plan: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 22 },
  figureGlow: { alignItems: 'center', justifyContent: 'center' },
  glowPool: { position: 'absolute', width: 360, height: 180, borderRadius: 180 },
  unit: { marginTop: -4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  trajectory: { alignSelf: 'stretch', marginTop: 18, padding: 16, gap: 6 },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  dateChip: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, marginTop: 6 },

  promise: { marginTop: 14, maxWidth: 320 },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
  trio: { alignSelf: 'center', marginBottom: 6 },
});
