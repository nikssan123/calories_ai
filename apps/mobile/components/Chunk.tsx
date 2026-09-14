import { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { CHUNK_DEPTH, duration, ease, RADIUS, tint, useColors, useTheme, type Palette } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptics } from '@/lib/haptics';

/**
 * A surface, lit.
 *
 * This was the ledge: a solid, zero-blur slab offset under every card, which
 * made each surface an object you could pick up and made the whole app read as
 * a stack of identical boxes on a flat sheet. The glow-up replaced it with light
 * (GLOW-UP.md, "depth"): a long warm shadow held inside the surface's own
 * footprint, and a one-pixel lit edge along the top. Depth still varies — it is
 * what `depth` now scales — but it varies the way light does rather than by a
 * fixed four pixels of brown.
 *
 * Both are a single `boxShadow`, which is what made the swap cheap. React
 * Native draws CSS box shadows natively on both platforms since the new
 * architecture, inset ones included, so there is no second view to keep in
 * register and nothing that differs between iOS and Android — the property the
 * ledge was built as a real `View` to protect.
 *
 * The API is the ledge's, unchanged, so the hundred and sixty call sites did not
 * have to learn anything: `color` used to be the slab under a green button and
 * is now the tint of its glow, and `reserve` is accepted and means nothing,
 * because a shadow overhangs no neighbour.
 */
export function Chunk({
  depth = CHUNK_DEPTH,
  color,
  radius = RADIUS,
  style,
  contentStyle,
  children,
}: {
  depth?: number;
  /** Tints the glow — a green button glows green. */
  color?: string;
  radius?: number;
  /** Kept for the call sites that held the ledge's travel open. Inert. */
  reserve?: boolean;
  /** Laid on the wrapper. */
  style?: StyleProp<ViewStyle>;
  /** Laid on the surface itself — background, border, padding. */
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const { scheme, colors } = useTheme();
  const lit = useMemo(() => light(colors, scheme, depth, color), [colors, scheme, depth, color]);
  return (
    <View style={style}>
      <View style={[{ borderRadius: radius, boxShadow: lit }, contentStyle]}>{children}</View>
    </View>
  );
}

/**
 * A `Chunk` you can press.
 *
 * The press used to travel the surface down into its own ledge. With no ledge
 * there is nothing to travel into, so it settles instead: the surface gives a
 * few percent under the thumb and its shadow draws in, which is what something
 * lit from above does when it is pushed towards the thing it is lit against.
 *
 * Still animated rather than toggled, still collapsed rather than removed under
 * reduced motion — the give is feedback, not decoration — and it still buzzes.
 * See `lib/haptics` for why that hangs off `onPress` and not the press-in.
 */
export function PressableChunk({
  depth = CHUNK_DEPTH,
  color,
  radius = RADIUS,
  style,
  contentStyle,
  children,
  disabled,
  haptic = true,
  onPress,
  reserve: _reserve,
  ...props
}: Omit<PressableProps, 'children' | 'style'> & {
  depth?: number;
  color?: string;
  radius?: number;
  reserve?: boolean;
  /** Suppress the press buzz, for a control that fires its own instead. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /*
   * Narrowed from `PressableProps`, which also allows a render function of the
   * pressed state. There is nothing for one to do here: the press is expressed
   * by the surface itself, and a second, ad-hoc pressed style at the call site
   * is exactly the drift this component exists to stop.
   */
  children?: React.ReactNode;
}) {
  const { scheme, colors } = useTheme();
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const timing = useMemo(
    () => ({ duration: reduced ? 0 : duration.quick, easing: ease.out }),
    [reduced],
  );
  const lit = useMemo(() => light(colors, scheme, depth, color), [colors, scheme, depth, color]);
  /* Pressed, the shadow is a third of its depth: the surface has come down to meet it. */
  const pushed = useMemo(
    () => light(colors, scheme, Math.max(1, depth / 3), color),
    [colors, scheme, depth, color],
  );

  const surface = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }, { translateY: pressed.value * 1.5 }],
  }));

  return (
    <Pressable
      disabled={disabled}
      /*
       * Flatten before fading, on Android.
       *
       * A disabled surface is drawn at reduced opacity, and Android applies a
       * parent's opacity to each child separately unless it is told to
       * composite the group offscreen first — so the glow and the face would
       * fade at different rates and the glow would show through the face. Only
       * while disabled: the offscreen buffer is not free.
       */
      needsOffscreenAlphaCompositing={disabled === true}
      onPressIn={() => {
        pressed.value = withTiming(1, timing);
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, timing);
      }}
      onPress={
        onPress == null
          ? onPress
          : (event) => {
              if (haptic) haptics.press();
              onPress(event);
            }
      }
      style={[disabled ? styles.disabled : null, style]}
      {...props}
    >
      {({ pressed: down }) => (
        <Animated.View
          style={[{ borderRadius: radius, boxShadow: down ? pushed : lit }, contentStyle, surface]}
        >
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}

/**
 * The shadow and the lit edge, as one CSS `box-shadow`.
 *
 * The outer shadow grows with `depth` the way the ledge used to, so a small chip
 * and a full card are still visibly different objects. A tinted surface — the
 * green button on its green "ledge" — glows in that colour instead of the warm
 * brown every neutral surface casts, which keeps the thing you are meant to
 * press the brightest object on the screen.
 */
function light(colors: Palette, scheme: 'light' | 'dark', depth: number, color?: string): string {
  const y = Math.round(depth * 2.5);
  const blur = Math.round(depth * 5.5);
  const spread = -Math.round(depth * 3);
  const shade = color
    ? tint(color, scheme === 'dark' ? 0.55 : 0.5)
    : scheme === 'dark'
      ? 'rgba(0, 0, 0, 0.7)'
      : tint(colors.chunk, 0.34);
  return `0px ${y}px ${blur}px ${spread}px ${shade}, inset 0px 1px 0px ${colors.glassEdge}`;
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
});
