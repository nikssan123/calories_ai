import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { formatNumber } from '@ct/shared';
import { Figure } from '@/components/Figure';
import { duration, ease, type as t, useColors, useTheme } from '@/theme';
import { useLocale, useT } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useCountUp } from '@/hooks/useCountUp';

/**
 * The day, as the one object in the sky.
 *
 * `CalorieRing` with the lights on (GLOW-UP.md). Everything it decided still
 * holds — the figure is what is left rather than what is eaten, the arc springs
 * and the number does not, over target turns the arc to ink rather than to red
 * — and three things are added, each doing one job:
 *
 * - **Its own light.** A wider, faint copy of the arc under the arc is the bloom,
 *   and the haze the header draws behind it is centred here. The ring is the
 *   light source of the screen, which is what lets the sky above it be
 *   atmosphere rather than a scene.
 * - **The logo's three dots, in orbit.** Protein, carbs and fat go round the
 *   ring slowly, outside it, so no dot ever crosses the figure.
 * - **The logged moment.** When the total rises while the same day is on screen,
 *   food-coloured sparks gather onto the arc from just outside it, the arc
 *   sweeps to its new value under a flash of its own light, and the phone gives
 *   one firm tap on the beat. Once, and then the screen is calm again. A day
 *   changing, a screen opening or a total going down is not a moment and plays
 *   nothing.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function GlowRing({
  consumed,
  target,
  burned = 0,
  day,
  size = 208,
  strokeWidth = 16,
  onSky = true,
  style,
}: {
  consumed: number;
  target: number;
  burned?: number;
  /** Which day is on screen; a change of day is never a logged moment. */
  day?: string;
  size?: number;
  strokeWidth?: number;
  /** Drawn over the sky, where the track is light, rather than on a card. */
  onSky?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tr = useT();
  const locale = useLocale();
  const { scheme, colors } = useTheme();
  const reduced = useReducedMotion();
  const gradient = `glow-${useId().replace(/:/g, '')}`;

  const radius = (size - strokeWidth) / 2 - 10;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? consumed / target : 0;
  const dash = circumference * Math.min(1, Math.max(0, ratio));
  const over = consumed > target;
  const remaining = Math.round(Math.abs(target - consumed));
  const shown = useCountUp(remaining, 900);

  const progress = useSharedValue(dash);
  useEffect(() => {
    progress.value = withTiming(dash, { duration: reduced ? 0 : duration.spring, easing: ease.spring });
  }, [dash, progress, reduced]);

  const arc = useAnimatedProps(() => ({
    strokeDasharray: [Math.max(0, Math.min(circumference, progress.value)), circumference],
  }));

  /* ---- The logged moment ---------------------------------------------- */
  const flash = useSharedValue(0);
  const [burst, setBurst] = useState(0);
  const last = useRef({ day, consumed });
  useEffect(() => {
    const previous = last.current;
    last.current = { day, consumed };
    if (previous.day !== day || consumed <= previous.consumed) return;
    haptics.logged();
    if (reduced) return;
    setBurst((n) => n + 1);
    flash.value = withSequence(
      withDelay(520, withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) })),
      withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) }),
    );
  }, [consumed, day, reduced, flash]);

  const flashing = useAnimatedStyle(() => ({
    opacity: flash.value,
    transform: [{ scale: 0.85 + flash.value * 0.3 }],
  }));

  /* ---- The orbit -------------------------------------------------------- */
  /*
   * Only while the screen is the one on show. Tabs stay mounted for the life of
   * the app, and an orbit left turning behind the Journal is a frame a second
   * of work for a picture nobody can see. It resumes from where it stopped.
   */
  const focused = useIsFocused();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduced || !focused) {
      cancelAnimation(turn);
      return;
    }
    const from = turn.value % 1;
    turn.value = from;
    turn.value = withRepeat(withTiming(from + 1, { duration: 24000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduced, focused, turn]);

  const track = onSky
    ? scheme === 'dark'
      ? 'rgba(255, 255, 255, 0.10)'
      : 'rgba(255, 255, 255, 0.45)'
    : colors.hairline;
  /*
   * The figure fills the clear middle and no more. Measured in digit slots —
   * `<Figure>` gives every digit the widest digit's width — against the largest
   * line the circle's inner edge leaves room for above the caption.
   */
  const text = formatNumber(remaining, locale);
  const digits = text.replace(/[^0-9]/g, '').length;
  const separators = text.length - digits;
  const clear = (radius - strokeWidth / 2) * 2 * 0.8;
  const figure = Math.round(Math.min(size * 0.25, clear / (digits * 0.665 + separators * 0.3)));
  const orbitRadius = radius + strokeWidth / 2 + 12;

  return (
    <View style={[{ width: size + 40, height: size + 40, alignItems: 'center', justifyContent: 'center' }, style]}>
      {/* The flash: the ring's own light, swelling behind it. Never over the figure's ink. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.flash,
          {
            width: size + 30,
            height: size + 30,
            borderRadius: (size + 30) / 2,
            experimental_backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.0) 34%, ${colors.logoRamp}88 52%, rgba(255,255,255,0) 72%)`,
          },
          flashing,
        ]}
      />

      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size} y2={size}>
            <Stop offset="0" stopColor={colors.calories} />
            <Stop offset="1" stopColor={colors.logoRamp} />
          </LinearGradient>
        </Defs>
        <Circle cx={centre} cy={centre} r={radius} fill="none" strokeWidth={strokeWidth} stroke={track} />
        <G rotation={-90} originX={centre} originY={centre}>
          {/* The bloom: the arc again, wider and faint. */}
          {!over && dash > 0 && (
            <AnimatedCircle
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              strokeWidth={strokeWidth * 1.7}
              strokeLinecap="round"
              stroke={`url(#${gradient})`}
              strokeOpacity={scheme === 'dark' ? 0.2 : 0.14}
              animatedProps={arc}
            />
          )}
          <AnimatedCircle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap={dash > 0 ? 'round' : 'butt'}
            stroke={over ? colors.foreground : `url(#${gradient})`}
            animatedProps={arc}
          />
        </G>
      </Svg>

      {!reduced && <Orbit turn={turn} radius={orbitRadius} />}
      {burst > 0 && <Sparks key={burst} radius={radius} centre={(size + 40) / 2} />}

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.centre}>
          <Figure value={formatNumber(Math.round(shown), locale)} size={figure} color={colors.foreground} />
          <Text style={[t.eyebrow, styles.caption, { color: colors.mutedForeground }]}>
            {over ? tr('today.over') : tr('today.toGo')}
          </Text>
          {burned > 0 && (
            <Text style={[t.footnoteSemibold, t.tnum, styles.caption, { color: colors.exerciseText }]}>
              {tr('today.burned')(String(Math.round(burned)))}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function Orbit({ turn, radius }: { turn: SharedValue<number>; radius: number }) {
  const colors = useColors();
  const dots = useMemo(
    () => [
      { color: colors.protein, offset: 0 },
      { color: colors.carbs, offset: 1 / 3 },
      { color: colors.fat, offset: 2 / 3 },
    ],
    [colors],
  );
  return (
    <>
      {dots.map((dot) => (
        <OrbitDot key={dot.color} turn={turn} radius={radius} color={dot.color} offset={dot.offset} />
      ))}
    </>
  );
}

function OrbitDot({
  turn,
  radius,
  color,
  offset,
}: {
  turn: SharedValue<number>;
  radius: number;
  color: string;
  offset: number;
}) {
  const moving = useAnimatedStyle(() => {
    const angle = (turn.value + offset) * Math.PI * 2 - Math.PI / 2;
    return { transform: [{ translateX: radius * Math.cos(angle) }, { translateY: radius * Math.sin(angle) }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.dot,
        {
          backgroundColor: color,
          experimental_backgroundImage: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${color} 55%)`,
          boxShadow: `0px 0px 10px ${color}`,
        },
        moving,
      ]}
    />
  );
}

/**
 * Sparks gathering onto the arc. Sixteen, spawned just outside the ring and
 * travelling inward to it — never across the middle, where the figure is.
 */
const SPARK_COLOURS = ['protein', 'carbs', 'fat', 'logoRamp'] as const;

function Sparks({ radius, centre }: { radius: number; centre: number }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const angle = Math.PI * (0.15 + 0.7 * Math.random()) + (i % 2 === 0 ? 0 : Math.PI);
        return {
          angle,
          from: radius + 46 + Math.random() * 30,
          delay: Math.random() * 260,
          colour: SPARK_COLOURS[i % SPARK_COLOURS.length]!,
        };
      }),
    [radius],
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {sparks.map((spark, i) => (
        <Spark key={i} {...spark} to={radius} centre={centre} />
      ))}
    </View>
  );
}

function Spark({
  angle,
  from,
  to,
  delay,
  colour,
  centre,
}: {
  angle: number;
  from: number;
  to: number;
  delay: number;
  colour: (typeof SPARK_COLOURS)[number];
  centre: number;
}) {
  const colors = useColors();
  const colour_ = colors[colour];
  const travel = useSharedValue(0);
  useEffect(() => {
    travel.value = withDelay(delay, withTiming(1, { duration: 620, easing: Easing.bezier(0.5, 0, 0.3, 1) }));
  }, [delay, travel]);
  const style = useAnimatedStyle(() => {
    const r = from + (to - from) * travel.value;
    const fade = travel.value < 0.15 ? travel.value / 0.15 : travel.value > 0.85 ? (1 - travel.value) / 0.15 : 1;
    return {
      opacity: fade,
      transform: [
        { translateX: centre + r * Math.cos(angle) - 5 },
        { translateY: centre + r * Math.sin(angle) - 5 },
        { scale: 1 - travel.value * 0.5 },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.spark,
        {
          backgroundColor: colour_,
          experimental_backgroundImage: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${colour_} 60%)`,
          boxShadow: `0px 0px 8px ${colour_}`,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  caption: { marginTop: 2 },
  flash: { position: 'absolute' },
  dot: { position: 'absolute', width: 11, height: 11, borderRadius: 6 },
  spark: { position: 'absolute', left: 0, top: 0, width: 10, height: 10, borderRadius: 5 },
});
