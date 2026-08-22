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
import { CHUNK_DEPTH, duration, ease, RADIUS, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The ledge.
 *
 * On the web `--chunk` is a solid, *zero-blur*, offset shadow, and that is the
 * one decision the whole design rests on: nothing here is a hairline, every
 * surface has an edge you could pick up. RN cannot express it as a shadow on
 * both platforms — iOS can, with `shadowRadius: 0`, but Android has only
 * `elevation`, which is always blurred and always centred. Faking it twice
 * would split the platforms on the single thing that must not vary.
 *
 * So the ledge is a real `View`: same radius, `--chunk` colour, offset down by
 * its own depth, with the card laid on top. That is what the CSS is imitating
 * anyway, it is identical on both platforms, and the press falls out for free —
 * translating the card down by the depth consumes the ledge exactly the way
 * `:active` does on the web, because there is nothing left underneath.
 *
 * `chunk-slot`'s reserved travel becomes this wrapper's bottom padding, so a
 * pressed control never shifts its neighbours.
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
  /** Overrides `--chunk` — a green button sits on a dark green ledge. */
  color?: string;
  radius?: number;
  /** Laid on the wrapper that reserves the travel. */
  style?: StyleProp<ViewStyle>;
  /** Laid on the surface itself — background, border, padding. */
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={[{ marginBottom: depth }, style]}>
      <Ledge depth={depth} radius={radius} color={color ?? colors.chunk} />
      <View style={[{ borderRadius: radius }, contentStyle]}>{children}</View>
    </View>
  );
}

/**
 * A `Chunk` you can press. The surface travels exactly its own depth and lands
 * flush with the page, rather than sliding around on top of it.
 *
 * The travel is animated rather than toggled because the web transitions it
 * over `--dur-quick`; an instant snap reads as a glitch at the top of the
 * motion and as a dropped frame at the bottom. Reduced motion collapses the
 * duration, which leaves the press correct and immediate rather than absent —
 * the sink is feedback, not decoration, and removing it would leave a control
 * that does not answer.
 */
export function PressableChunk({
  depth = CHUNK_DEPTH,
  color,
  radius = RADIUS,
  style,
  contentStyle,
  children,
  disabled,
  ...props
}: Omit<PressableProps, 'children' | 'style'> & {
  depth?: number;
  color?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /*
   * Narrowed from `PressableProps`, which also allows a render function of the
   * pressed state. There is nothing for one to do here: the press is expressed
   * by the surface travelling into its own ledge, and a second, ad-hoc pressed
   * style at the call site is exactly the drift this component exists to stop.
   */
  children?: React.ReactNode;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const timing = useMemo(
    () => ({ duration: reduced ? 0 : duration.quick, easing: ease.out }),
    [reduced],
  );

  const surface = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * depth }],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        pressed.value = withTiming(1, timing);
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, timing);
      }}
      style={[{ marginBottom: depth }, disabled ? styles.disabled : null, style]}
      {...props}
    >
      <Ledge depth={depth} radius={radius} color={color ?? colors.chunk} />
      <Animated.View style={[{ borderRadius: radius }, contentStyle, surface]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * The slab under the surface. Inset to the top by its own depth so only the
 * bottom edge shows — a full-height copy would paint a dark halo out of the
 * sides on any surface with a transparent corner.
 */
function Ledge({ depth, radius, color }: { depth: number; radius: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { top: depth, bottom: -depth, borderRadius: radius, backgroundColor: color },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
});
