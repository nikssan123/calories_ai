import { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * A shape standing in for something still loading.
 *
 * The pulse is the one animation here that repeats forever, which makes it the
 * one most worth switching off: a loop has no end state to jump to, so reduced
 * motion gets a plain, still block at the dimmer end of the pulse rather than a
 * shape that never settles.
 */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      pulse.value = 0.6;
      return;
    }
    pulse.value = withRepeat(withTiming(0.45, { duration: 900 }), -1, true);
  }, [pulse, reduced]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return <Animated.View style={[{ backgroundColor: colors.muted }, style, animated]} />;
}
