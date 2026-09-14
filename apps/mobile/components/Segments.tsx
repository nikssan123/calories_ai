import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutRectangle, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { duration, ease, font, tint, useColors } from '@/theme';
import { haptics } from '@/lib/haptics';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * A choice between a few, as one glass track with a lit pill that travels.
 *
 * It replaces four hand-drawn copies — the day windows on Progress and Exercise,
 * Cook's "For you / Library", and the pill rows in Settings — which each
 * painted the chosen option solid green on a white chunk and swapped it on the
 * frame of the press. Since the glow-up (GLOW-UP.md) the track is glass and the
 * choice is the logo's ramp with its own glow, and it *moves* to where you
 * pointed, the way the tab bar's does: one selection, so one object, travelling.
 *
 * Options size to their labels, so the pill's geometry is measured off each
 * option's own layout rather than divided out of the track's width.
 */
export function Segments<T extends string>({
  options,
  value,
  onChange,
  style,
  fill = false,
}: {
  options: readonly { value: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Stretch across the row with equal options, rather than hugging the labels. */
  fill?: boolean;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const [layouts, setLayouts] = useState<Record<string, LayoutRectangle>>({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const [placed, setPlaced] = useState(false);

  const current = layouts[value];
  useEffect(() => {
    if (!current) return;
    const timing = { duration: reduced || !placed ? 0 : duration.pop, easing: ease.spring };
    x.value = withTiming(current.x, timing);
    width.value = withTiming(current.width, { ...timing, easing: ease.out });
    if (!placed) setPlaced(true);
  }, [current, reduced, placed, x, width]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: width.value }));

  return (
    <View
      style={[
        styles.track,
        fill && styles.trackFill,
        {
          backgroundColor: colors.glass,
          borderColor: colors.glassEdge,
          boxShadow: `${colors.shadow}, inset 0px 1px 0px ${colors.glassEdge}`,
        },
        style,
      ]}
      accessibilityRole="tablist"
    >
      {placed && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            {
              backgroundColor: colors.primary,
              experimental_backgroundImage: colors.primaryRamp,
              boxShadow: `0px 6px 14px -6px ${tint(colors.calories, 0.8)}, inset 0px 1px 0px rgba(255, 255, 255, 0.45)`,
            },
            pill,
          ]}
        />
      )}
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            onLayout={(event) => {
              const next = event.nativeEvent.layout;
              setLayouts((all) => {
                const had = all[option.value];
                if (had && had.x === next.x && had.width === next.width) return all;
                return { ...all, [option.value]: next };
              });
            }}
            onPress={() => {
              if (on) return;
              haptics.selected();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            style={[styles.option, fill && styles.optionFill]}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, { color: on ? colors.primaryForeground : colors.mutedForeground }]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  trackFill: { alignSelf: 'stretch' },
  // Absolute children start inside the 1pt border and option layouts are measured
  // from outside it, so the pill starts a point further left to land on them.
  pill: { position: 'absolute', top: 3, bottom: 3, left: -1, borderRadius: 999 },
  option: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, alignItems: 'center' },
  optionFill: { flex: 1 },
  label: { fontFamily: font.bold, fontSize: 13, lineHeight: 18 },
});
