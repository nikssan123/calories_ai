import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { duration, ease } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The same arrival every card in the conversation uses: down, in, one bounce.
 *
 * It lived in `PlanWall` as a copy of `ChatCard`'s, with a note saying the two
 * were the same three lines and that a third caller was the moment to move it.
 * Two things happened: `ChatCard`'s grew a stagger and a laid-out gate that
 * only a gallery of cards needs, and `SaveAsk` became the third caller. So this
 * is the plain one — the wall's and the ask's — and `ChatCard` keeps its own.
 *
 * The overshoot is the easing's, not a second keyframe: `ease.spring` passes 1
 * and comes back, so scale is driven straight from the progress value and
 * allowed past 1. Opacity is the one channel clamped, because a card brighter
 * than opaque is not a thing.
 */
export function Land({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration: duration.spring, easing: ease.spring });
  }, [reduced, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value / 0.6),
    transform: [
      { translateY: -14 * (1 - progress.value) },
      { scale: 0.94 + 0.06 * progress.value },
    ],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
