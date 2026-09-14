import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

/**
 * A surface that lets the light behind it through.
 *
 * `<Chunk>` is an opaque card that happens to be lit; this is the thing it is
 * named after, for the few places where there is something worth seeing through
 * it — the sky over Today, the blobs behind an onboarding question, the mist on
 * the paywall. Over a plain backdrop it would just be a paler card, so it is
 * not used there.
 *
 * No blur. A real backdrop blur is the expensive half of glass, and over a sky
 * made of three soft gradients there is nothing sharp for it to soften — the
 * translucency and the lit edge carry the whole effect for the price of a
 * background colour. `strong` is for surfaces with a paragraph on them, where
 * the words have to win over whatever the sky is doing at that hour.
 */
export function Glass({
  strong = false,
  radius = 22,
  style,
  children,
  ...rest
}: {
  strong?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
} & Omit<React.ComponentProps<typeof View>, 'style' | 'children'>) {
  const { colors } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          borderRadius: radius,
          backgroundColor: strong ? colors.glassStrong : colors.glass,
          borderWidth: 1,
          borderColor: colors.glassEdge,
          boxShadow: `${colors.shadow}, inset 0px 1px 0px ${colors.glassEdge}`,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
