import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { initialsOf, useCoachLink } from '@/lib/coach';
import { useT } from '@/lib/i18n';
import { type as t, useColors, withAlpha } from '@/theme';

/**
 * The one permanent sign that somebody else can see this log.
 *
 * On Today, above the ring, and nowhere louder: the client agreed to this and
 * can end it in two taps, so the banner's job is to keep the fact visible
 * rather than to nag. "Manage" goes to the section under Settings, which is
 * where the toggles and the stop button live — one place for all of it.
 */
export function CoachBanner() {
  const { link } = useCoachLink();
  const colors = useColors();
  const router = useRouter();
  const tr = useT();

  if (!link) return null;
  const name = link.coach.display_name ?? tr('coach.yourCoach');

  return (
    <Pressable
      onPress={() => router.push('/setup')}
      accessibilityRole="button"
      accessibilityLabel={`${tr('coach.sharedWith')(name)}. ${tr('coach.bannerManage')}`}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: withAlpha(colors.calories, 0.16), opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={[t.footnoteSemibold, { color: colors.primaryForeground }]}>
          {initialsOf(link.coach.display_name)}
        </Text>
      </View>
      <Text numberOfLines={1} style={[t.footnoteSemibold, styles.label, { color: colors.caloriesText }]}>
        {tr('coach.sharedWith')(name)}
      </Text>
      <Text style={[t.footnoteSemibold, styles.manage, { color: colors.caloriesText }]}>
        {tr('coach.bannerManage')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 999,
    marginBottom: 12,
    maxWidth: '100%',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flexShrink: 1 },
  manage: { textDecorationLine: 'underline' },
});
