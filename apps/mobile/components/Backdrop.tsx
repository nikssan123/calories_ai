import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/theme';

/**
 * The light a screen stands in.
 *
 * The flat cream sheet was the single largest reason the app read as dull:
 * glass needs something behind it to be glass, and a surface on a uniform
 * ground is just a white box. So every screen now stands in the same faint
 * washes — teal from the top left, sun from the top right, a little warmth
 * rising from the bottom — which is the ground the sky on Today fades into.
 *
 * Static on purpose. The places that move (the sky, the onboarding blobs, the
 * paywall's mist) move because they are moments; a background that drifted on
 * every screen would be a tax on the battery and on attention, all day.
 *
 * Native CSS gradients, drawn by the view itself: no canvas, no image, no
 * library, and nothing on the JS thread after the first frame.
 */
export function Backdrop({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: colors.background, experimental_backgroundImage: colors.ambient },
        style,
      ]}
    />
  );
}
