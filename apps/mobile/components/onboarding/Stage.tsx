import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The warm light behind every onboarding question.
 *
 * Three soft pools of colour — apricot, mint, peach — drifting slowly enough
 * that nobody watches them move, only notices that the page is alive. It is the
 * "nothing sits on a flat background" rule at its most literal, on the screens
 * where somebody is deciding what kind of app this is.
 *
 * Each pool is one view with a radial gradient fading to transparent, which is
 * what a blurred circle looks like without paying for a blur. They sit behind
 * everything and are never over a word: the questions and the options are laid
 * out above them in the normal flow.
 */
/*
 * Placed as fractions of the screen rather than in points, so the light lands in
 * the same corners on an iPad as on a phone — the first version put all three
 * pools in the left 400pt, which on a 1032pt tablet left half the page flat.
 */
const POOLS = {
  light: [
    { color: 'rgba(255, 196, 120, 0.75)', size: 1.1, x: 0.0, y: 0.02, dx: 40, dy: 30, period: 14000 },
    { color: 'rgba(160, 236, 210, 0.70)', size: 0.95, x: 0.95, y: 0.3, dx: -30, dy: 40, period: 17000 },
    { color: 'rgba(255, 190, 160, 0.55)', size: 1.0, x: 0.3, y: 0.82, dx: 36, dy: -30, period: 20000 },
  ],
  dark: [
    { color: 'rgba(255, 150, 60, 0.20)', size: 1.1, x: 0.0, y: 0.02, dx: 40, dy: 30, period: 14000 },
    { color: 'rgba(46, 230, 196, 0.16)', size: 0.95, x: 0.95, y: 0.3, dx: -30, dy: 40, period: 17000 },
    { color: 'rgba(255, 120, 90, 0.12)', size: 1.0, x: 0.3, y: 0.82, dx: 36, dy: -30, period: 20000 },
  ],
} as const;

export function Stage({ style }: { style?: StyleProp<ViewStyle> }) {
  const { scheme, colors } = useTheme();
  const { width, height } = useWindowDimensions();
  /* A pool's diameter is a share of the shorter side, so a tablet gets pools in
     proportion to its page rather than three phone-sized spots on it. */
  const unit = Math.min(width, height) * 0.9;
  const pools = POOLS[scheme].map((pool) => ({
    color: pool.color,
    size: unit * pool.size,
    left: width * pool.x - (unit * pool.size) / 2,
    top: height * pool.y - (unit * pool.size) / 2,
    dx: pool.dx,
    dy: pool.dy,
    period: pool.period,
  }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, overflow: 'hidden' }, style]}>
      {pools.map((pool, i) => (
        <Pool key={i} {...pool} />
      ))}
    </View>
  );
}

function Pool({
  color,
  size,
  left,
  top,
  dx,
  dy,
  period,
}: {
  color: string;
  size: number;
  left: number;
  top: number;
  dx: number;
  dy: number;
  period: number;
}) {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(drift);
      drift.value = 0;
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(drift);
  }, [reduced, drift, period]);

  const moving = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift.value * dx },
      { translateY: drift.value * dy },
      { scale: 1 + drift.value * 0.1 },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left,
          top,
          width: size,
          height: size,
          borderRadius: size / 2,
          experimental_backgroundImage: `radial-gradient(circle, ${color} 0%, ${transparent(color)} 68%)`,
        },
        moving,
      ]}
    />
  );
}

const transparent = (rgba: string) => rgba.replace(/[\d.]+\)$/, '0)');
