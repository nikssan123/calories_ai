import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Achievement, AchievementKey } from '@ct/shared';
import { ACHIEVEMENT_KEYS, formatDay } from '@ct/shared';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { font, type as t, useColors } from '@/theme';

/**
 * The badge wall.
 *
 * Every cell is drawn, earned or not, because a badge nobody can see is not a
 * goal — it is a surprise, and a grid of surprises teaches nothing about what
 * the app rewards. The unearned ones are greyed and carry the same line of
 * copy explaining how to get them.
 *
 * Which is also the quiet argument for keeping the set at fourteen. Every entry
 * here is two strings in five languages, and a wall long enough to scroll is
 * one nobody reads twice.
 */
const GLYPH: Record<AchievementKey, string> = {
  streak_7: '🔥',
  streak_30: '🌟',
  streak_100: '💯',
  streak_365: '👑',
  exercise_weeks_4: '🏋️',
  exercise_weeks_12: '🏆',
  exercise_weeks_52: '🥇',
  first_photo: '📷',
  first_barcode: '📦',
  first_workout: '💪',
  first_weigh_in: '⚖️',
  days_100: '📅',
  days_365: '🗓️',
  workouts_100: '🎽',
};

export function Achievements({ earned }: { earned: Achievement[] }) {
  const colors = useColors();
  const locale = useLocale();
  const tr = useT();
  /** Which cell is showing its explanation. One at a time — see below. */
  const [open, setOpen] = useState<AchievementKey | null>(null);

  const earnedBy = new Map(earned.map((a) => [a.key, a]));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[t.bodyBold, { color: colors.foreground }]}>{tr('achievements.title')}</Text>
        <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
          {tr('achievements.count')(earnedBy.size, ACHIEVEMENT_KEYS.length)}
        </Text>
      </View>

      <View style={styles.grid}>
        {ACHIEVEMENT_KEYS.map((key) => {
          const got = earnedBy.get(key);
          return (
            <Pressable
              key={key}
              onPress={() => {
                haptics.selected();
                setOpen((current) => (current === key ? null : key));
              }}
              accessibilityRole="button"
              accessibilityLabel={tr(`badge.${key}` as StringKey)}
              accessibilityHint={tr(`badgeHow.${key}` as StringKey)}
              accessibilityState={{ selected: Boolean(got) }}
              style={[
                styles.cell,
                {
                  backgroundColor: got ? colors.accent : colors.mutedField,
                  borderColor: open === key ? colors.foreground : colors.border,
                },
              ]}
            >
              {/*
               * Unearned glyphs keep their own picture at low opacity rather
               * than becoming a padlock. The silhouette is the hint: it says
               * what this one is about before the label is read, and a wall of
               * identical padlocks says only that you have not done things.
               */}
              <Text style={[styles.glyph, got ? null : styles.locked]}>{GLYPH[key]}</Text>
              <Text
                numberOfLines={2}
                style={[
                  styles.name,
                  { color: got ? colors.foreground : colors.mutedForeground },
                ]}
              >
                {tr(`badge.${key}` as StringKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/*
       * One explanation at a time, under the grid rather than inside the cell.
       * A tile big enough to hold a sentence in five languages is a tile four
       * across cannot be, and German needs the room.
       */}
      {open && (
        <View style={[styles.detail, { backgroundColor: colors.mutedWash }]}>
          <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>
            {tr(`badgeHow.${open}` as StringKey)}
          </Text>
          {earnedBy.get(open) && (
            <Text style={[styles.earned, { color: colors.mutedForeground }]}>
              {tr('achievements.earnedOn')(
                formatDay(earnedBy.get(open)!.local_date, locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              )}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    // Four across, computed from the gap rather than fixed, so the row still
    // fits a 320pt handset and a tablet column alike.
    width: '22%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 2,
  },
  glyph: { fontSize: 22 },
  locked: { opacity: 0.3 },
  name: { fontFamily: font.semibold, fontSize: 10, lineHeight: 13, textAlign: 'center' },
  detail: { borderRadius: 12, padding: 12, gap: 4 },
  earned: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
});
