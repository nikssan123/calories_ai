import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * A shape standing in for something still loading.
 *
 * It used to pulse its own opacity, which reads as *waiting* — a thing sitting
 * there, dimming and brightening, with nothing to say about whether anything is
 * happening. A band sweeping across reads as *working*, and the two are worth
 * distinguishing on the one screen where the wait is genuinely long: a recipe
 * run takes the better part of a minute, and a pulse over half a minute starts
 * to look like something has hung.
 *
 * The sweep is the one animation here that repeats forever, which makes it the
 * one most worth switching off: a loop has no end state to jump to, so reduced
 * motion gets a plain, still block rather than a shape that never settles.
 */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const travel = useSharedValue(0);

  /*
   * The sweep is drawn at three times the width and slid across, so the
   * gradient's soft ends are always outside the shape and only the band itself
   * is ever visible inside it. Measured rather than done in percentages because
   * an SVG gradient cannot be offset by a transform on its own coordinates.
   */
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (reduced) return;
    travel.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.linear }),
      -1,
      false,
    );
  }, [travel, reduced]);

  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + travel.value * (width * 2) }],
  }));

  function measure(event: LayoutChangeEvent) {
    const next = event.nativeEvent.layout.width;
    setWidth((previous) => (previous === next ? previous : next));
  }

  return (
    <View style={[{ backgroundColor: colors.muted, overflow: 'hidden' }, style]} onLayout={measure}>
      {!reduced && width > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, sweep]} pointerEvents="none">
          <Svg width={width} height="100%">
            <Defs>
              <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.card} stopOpacity="0" />
                <Stop offset="0.5" stopColor={colors.card} stopOpacity="0.65" />
                <Stop offset="1" stopColor={colors.card} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#sweep)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}
