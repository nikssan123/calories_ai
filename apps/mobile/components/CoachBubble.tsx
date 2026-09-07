import { StyleSheet, Text, View } from 'react-native';
import { initialsOf, useCoachLink } from '@/lib/coach';
import { useT } from '@/lib/i18n';
import { type as t, useColors } from '@/theme';

/**
 * The third voice in the journal. See COACH.md §5.
 *
 * Neither the reader's own bubble nor the assistant's prose: a card with a
 * border, the coach's initials, and their name on a line above it, so a remark
 * written by a person is never mistaken for one the model produced. The name
 * comes from the live link; once a link has ended the words stay and the
 * label falls back to "your coach", which is still true of who wrote it.
 */
export function CoachBubble({ content }: { content: string }) {
  const { link } = useCoachLink();
  const colors = useColors();
  const tr = useT();
  const name = link?.coach.display_name ?? null;

  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={[t.footnoteSemibold, { color: colors.primaryForeground }]}>{initialsOf(name)}</Text>
      </View>
      <View style={styles.stack}>
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
          {name ? `${name} · ${tr('coach.yourCoach')}` : tr('coach.yourCoachCapital')}
        </Text>
        <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[t.body, { color: colors.foreground }]}>{content}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  stack: { flex: 1, gap: 4 },
  bubble: {
    borderWidth: 2,
    borderRadius: 18,
    borderTopLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
