import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '@/components/Logo';
import { type as t, useColors } from '@/theme';

/**
 * A tab that exists so the bar is real, and says so.
 *
 * The six tabs ship together because a bottom bar with one live tab and five
 * dead ones is worse than no bar: the row is the app's map, and a map with
 * nothing behind five of its six roads teaches the wrong shape. So each of
 * these names the screen it is standing in for and points at the web, which
 * does have it.
 */
export function Placeholder({ title, blurb }: { title: string; blurb: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <Logo size={44} />
      <Text style={[t.title2, styles.centred, { color: colors.foreground }]}>{title}</Text>
      <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>{blurb}</Text>
      <Text style={[t.footnoteSemibold, styles.centred, { color: colors.mutedForeground }]}>
        Not ported yet — it is on daysofar.com.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  centred: { textAlign: 'center' },
});
