import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { PressableChunk } from '@/components/Chunk';
import { useT } from '@/lib/i18n';
import { useOnboarding } from '@/lib/onboarding';
import { type as t, useColors } from '@/theme';

/**
 * The line that stops a screen asserting a number it has not earned.
 *
 * Until setup is finished every target in the app is a generic default — a
 * calorie figure computed for nobody in particular, because sex, height, age
 * and goal are all still unknown. Today drew a ring against it, Progress
 * plotted a line against it and Cook planned meals to it, and the only place in
 * the product that said so was one grey sentence on the journal, which is the
 * screen somebody who skipped setup had already left.
 *
 * It renders nothing at all once setup is done, which is almost always — so it
 * costs a finished account one hook and no pixels, and can be dropped at the
 * top of any screen that shows a target without a condition around it.
 *
 * Pressable, and it goes to the journal rather than to the settings form. The
 * conversation is where setup happens; the form is where somebody who does not
 * want to be asked can fill it in, and they can already reach that from the
 * tab bar.
 */
export function SetupBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { pending } = useOnboarding();
  const colors = useColors();
  const router = useRouter();
  const tr = useT();

  if (!pending) return null;

  return (
    <PressableChunk
      depth={3}
      radius={18}
      style={style}
      onPress={() => router.navigate('/')}
      accessibilityRole="button"
      accessibilityLabel={`${tr('setup.placeholder')} ${tr('setup.placeholderAction')}`}
      contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.text}>
        <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>
          {tr('setup.placeholder')}
        </Text>
        <Text style={[t.footnote, { color: colors.mutedForeground }]}>
          {tr('setup.placeholderAction')}
        </Text>
      </View>
      {/* lucide `chevron-right`, at lucide's 24-unit grid — see `<Glyph>` for
          why the path is copied rather than imported. */}
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path
          d="M9 18l6-6-6-6"
          stroke={colors.mutedForeground}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </PressableChunk>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  text: { flex: 1, gap: 2 },
});
