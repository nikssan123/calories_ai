import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { PressableChunk } from '@/components/Chunk';
import { type as t, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The one button a screen is for.
 *
 * Green running into teal — the logo's own ramp — with a glow in the same
 * colour under it and a sheen that crosses it once every few seconds. It is
 * the brightest object on any screen it appears on, which is its entire job:
 * the onboarding Continue, the plan's "Save my plan", the paywall's purchase.
 * Everything else on those screens is glass, so there is never a second
 * candidate for where the thumb goes.
 *
 * The label stays in the dark ink the rest of the app puts on green. White on
 * this green is under 3:1, and the button that matters most is not the place to
 * trade legibility for a look.
 *
 * The sheen waits for the layout so it knows how far to travel, and does not
 * run at all under reduced motion — it carries no information, so there is no
 * end state to jump to.
 */
export function GlowButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduced || disabled || width === 0) {
      cancelAnimation(sweep);
      sweep.value = 0;
      return;
    }
    sweep.value = withRepeat(
      withSequence(
        withDelay(2600, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) })),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(sweep);
  }, [reduced, disabled, width, sweep]);

  const sheen = useAnimatedStyle(() => ({
    transform: [{ translateX: -120 + sweep.value * (width + 240) }, { skewX: '-20deg' }],
  }));

  return (
    <PressableChunk
      onPress={onPress}
      disabled={disabled || busy}
      color={colors.calories}
      depth={6}
      radius={20}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      accessibilityHint={accessibilityHint}
      style={[{ opacity: disabled ? 0.45 : 1 }, style]}
      contentStyle={[
        styles.face,
        {
          backgroundColor: colors.primary,
          experimental_backgroundImage: `linear-gradient(135deg, ${colors.calories} 0%, ${colors.logoRamp} 100%)`,
        },
      ]}
    >
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 && (
          <Animated.View
            style={[
              styles.sheen,
              {
                experimental_backgroundImage:
                  'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0) 100%)',
              },
              sheen,
            ]}
          />
        )}
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primaryForeground} />
      ) : (
        <Text style={[t.bodyBold, styles.label, { color: colors.primaryForeground }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </PressableChunk>
  );
}

const styles = StyleSheet.create({
  face: {
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  sheen: { position: 'absolute', top: -10, bottom: -10, width: 90 },
  label: { fontSize: 17 },
});
