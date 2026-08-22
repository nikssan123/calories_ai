import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/theme';

/**
 * `--material`: the translucent header and tab bar.
 *
 * On the web this is `backdrop-filter: saturate(180%) blur(20px)` over an 85%
 * ground. iOS has the real thing, so it gets `expo-blur`. Android's blur is
 * weak where it works and expensive everywhere, and a bad blur is worse than
 * none — it reads as a rendering fault rather than as glass — so it falls back
 * to a near-opaque solid. The alpha is pushed to 0.97 rather than reused at
 * 0.85: without a blur behind it, 85% is just a bar you can see the list
 * through.
 */
export function Material({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const { scheme, colors } = useTheme();

  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={60}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={[styles.base, style]}
      >
        {/* The tint alone is grey glass; the ground colour is what makes it
            cream. Kept light enough that the blur is still doing the work. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.material }]} />
        {children}
      </BlurView>
    );
  }

  return (
    <View style={[styles.base, { backgroundColor: opaque(colors.material) }, style]}>
      {children}
    </View>
  );
}

/** Re-alphas an `rgba(…)` string to 0.97. */
function opaque(rgba: string): string {
  return rgba.replace(/[\d.]+\)$/, '0.97)');
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});
