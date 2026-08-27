import { useEffect, useId, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { DISPLAY_LEADING, duration, ease, useColors, useType } from '@/theme';
import { INSCRIBED, figureFace, fitFontSize, formatNumber } from '@ct/shared';
import { useLocale, useT } from '@/lib/i18n';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useCountUp } from '@/hooks/useCountUp';

/**
 * The day, as one fat shape. Ported from `apps/web/components/CalorieRing.tsx`,
 * where the three choices it makes are argued at length. In short:
 *
 * The ring has a ledge — a second track offset down in the same shadow colour
 * every card uses, so it reads as a dial sitting on the page rather than a
 * stroke drawn on it. One extra circle, and the single change that does most of
 * the work on this screen.
 *
 * The ring springs and the number does not. A shape that overshoots reads as
 * energy; a *number* that overshoots reads as a bug — 450 briefly showing 438
 * on its way to settling would look like the total was wrong. So the arc gets
 * the spring, the figure gets a plain ease, and the figure gets a one-shot pop
 * on arrival instead, which is the same feeling without the same lie.
 *
 * Over target turns the ring to ink rather than to red. Unmissable either way,
 * but one of those is information and the other is a telling-off.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function CalorieRing({
  consumed,
  target,
  burned = 0,
  size = 184,
  strokeWidth = 22,
  style,
}: {
  consumed: number;
  target: number;
  burned?: number;
  size?: number;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useType();
  const tr = useT();
  const locale = useLocale();
  const colors = useColors();
  const reduced = useReducedMotion();
  const gradient = `ring-${useId().replace(/:/g, '')}`;

  // The ledge, scaled with the stroke so a small ring in the day rail does not
  // wear a shadow half as thick as its own track.
  const depth = Math.max(3, Math.round(strokeWidth * 0.22));
  const radius = (size - strokeWidth - depth) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? consumed / target : 0;
  const dash = circumference * Math.min(1, Math.max(0, ratio));
  const over = consumed > target;
  const remaining = target - consumed;
  /*
   * The figure is a fraction of the dial, and then as much less as its own
   * digits need. A quarter of the diameter is exactly the 46px the default ring
   * has always used and is right for most days — but a quarter is a statement
   * about the ring, not about the number, and `1,240` at 46px is 109pt of type
   * in a circle whose clear middle is 135pt across. That fits only at the
   * centre line, and the figure is never on the centre line: "to go" and the
   * burn sit under it and push it up, into the part of the circle that is
   * narrower. The last digit ends up drawn over the arc.
   *
   * So the size is measured against the largest square the circle can hold,
   * which is the one bound that does not depend on how many lines end up under
   * the figure or how far up they push it. Short totals still get the full 46.
   */
  const clear = size - 2 * strokeWidth - depth;
  const figure = fitFontSize({
    text: formatNumber(Math.round(Math.abs(remaining)), locale),
    face: figureFace(locale),
    width: clear * INSCRIBED,
    /* Never zero: unlike the widget, the ring has nowhere else to put it. */
    min: 1,
    max: Math.round(size * 0.25),
  });

  const shown = useCountUp(Math.round(Math.abs(remaining)), 900);

  const progress = useSharedValue(dash);
  useEffect(() => {
    progress.value = withTiming(dash, {
      duration: reduced ? 0 : duration.spring,
      easing: ease.spring,
    });
  }, [dash, progress, reduced]);

  const arc = useAnimatedProps(() => ({
    // The spring overshoots, and past 100% the dash would run back over its own
    // start — clamped here rather than in the easing, which would flatten it.
    strokeDasharray: [Math.max(0, Math.min(circumference, progress.value)), circumference],
  }));

  /*
   * The pop. On the web this is a remount, because an animation already on the
   * element will not restart from a class toggle; here the shared value can
   * simply be re-run, so the figure stays mounted and the count-up above is not
   * interrupted.
   */
  const pop = useSharedValue(1);
  const lastConsumed = useRef(consumed);
  useEffect(() => {
    if (lastConsumed.current === consumed) return;
    lastConsumed.current = consumed;
    if (reduced) return;
    pop.value = withSequence(
      withTiming(1.18, { duration: duration.pop * 0.4, easing: ease.pop }),
      withTiming(1, { duration: duration.pop * 0.6, easing: ease.pop }),
    );
  }, [consumed, pop, reduced]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <View style={[styles.wrap, style]}>
      <Svg width={size} height={size}>
        <Defs>
          {/* The arc ramps across its own length, so a full day is visibly a
              richer green at the end than at the start. */}
          <LinearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size} y2={size}>
            <Stop offset="0" stopColor={colors.calories} />
            <Stop offset="1" stopColor={colors.logoRamp} />
          </LinearGradient>
        </Defs>

        {/* The ledge: the track again, pushed down by its own depth. */}
        <Circle
          cx={centre}
          cy={centre + depth}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke={colors.chunk}
        />
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke={colors.muted}
        />

        <G rotation={-90} originX={centre} originY={centre}>
          <AnimatedCircle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            // A round cap on a zero-length dash still paints — an empty day
            // would otherwise wear a coloured dot at twelve o'clock as if
            // something had been logged.
            strokeLinecap={dash > 0 ? 'round' : 'butt'}
            stroke={over ? colors.foreground : `url(#${gradient})`}
            animatedProps={arc}
          />
        </G>
      </Svg>

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.centre}>
          <Animated.Text
            style={[
              t.figure,
              popStyle,
              // `leading-none` on the web. Here it is the display face's floor,
              // or the biggest number in the app loses the tops of its digits.
              { fontSize: figure, lineHeight: figure * DISPLAY_LEADING, color: colors.foreground },
            ]}
          >
            {formatNumber(Math.round(shown), locale)}
          </Animated.Text>
          <Text style={[t.footnoteBold, styles.caption, { color: colors.mutedForeground }]}>
            {over ? tr('today.over') : tr('today.toGo')}
          </Text>
          {/* Tabular but not at figure weight: the burn is context for the
              number above it, and set heavy it read as the louder of the two. */}
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

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  caption: { marginTop: 4 },
});
