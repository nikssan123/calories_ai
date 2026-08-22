import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { duration, ease, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The web's switch, drawn rather than delegated.
 *
 * React Native ships a `Switch`, and it is the wrong control for this app on
 * both platforms at once: on iOS it is Apple's capsule and on Android it is
 * Material's, so the same screen has two different switches depending on the
 * phone, and neither is the one on daysofar.com. This is the web's — a 52×30
 * outlined track, a white thumb with the same hard two-pixel shadow everything
 * else in the app has, and the accent filling the track when it is on.
 *
 * The travel uses `--ease-pop`, which overshoots: the thumb passes the end and
 * settles back, so flipping it feels like a switch rather than like a value
 * changing.
 */
export function Switch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const on = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    on.value = reduced
      ? (value ? 1 : 0)
      : withTiming(value ? 1 : 0, { duration: duration.quick, easing: ease.pop });
  }, [value, reduced, on]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: on.value * TRAVEL }] }));

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        {
          backgroundColor: value ? colors.calories : colors.muted,
          borderColor: value ? colors.caloriesDeep : colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Animated.View style={[styles.thumbWrap, thumb]}>
        {/* The same ledge as every other object in the app, at the size a
            22px thumb can carry. */}
        <View style={styles.thumbLedge} />
        <View style={styles.thumb} />
      </Animated.View>
    </Pressable>
  );
}

/** `translate-x-[22px]` — the track's inner width less the thumb. */
const TRAVEL = 22;

const styles = StyleSheet.create({
  track: {
    width: 52,
    height: 30,
    borderRadius: 999,
    borderWidth: 2,
    padding: 2,
    justifyContent: 'center',
  },
  thumbWrap: { width: 22, height: 22 },
  thumbLedge: {
    position: 'absolute',
    top: 2,
    left: 0,
    right: 0,
    bottom: -2,
    borderRadius: 999,
    backgroundColor: 'rgba(49, 38, 30, 0.2)',
  },
  thumb: { width: 22, height: 22, borderRadius: 999, backgroundColor: '#ffffff' },
});
