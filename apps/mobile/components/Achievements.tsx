import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Polyline } from 'react-native-svg';
import type { Achievement, AchievementFacts, AchievementKey } from '@ct/shared';
import { ACHIEVEMENT_GROUPS, ACHIEVEMENT_KEYS, achievementProgress, formatDay } from '@ct/shared';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { type as t, useColors } from '@/theme';

/**
 * The badge wall, and the one row on Progress that leads to it.
 *
 * The wall used to live inline at the bottom of Progress as fourteen emoji
 * tiles four across. Two things were wrong with that. It was the only block on
 * a screen of measurements that was not a measurement, and it sat fifth — under
 * weight, calories, protein and quality — so the only people who ever saw it
 * had already scrolled past everything they came for. And a grid of fourteen
 * cells can say what exists but never how close anything is: at day 22,
 * "thirty in a row" and "a year unbroken" were the same grey square, and one of
 * them was eight days away.
 *
 * So Progress keeps `AchievementsRow` — a count and a chevron, which is all a
 * measurement screen owes a reward — and the wall gets a screen where a row can
 * be a full line wide. That width is what buys the bar.
 *
 * Every badge is still drawn, earned or not: one nobody can see is a surprise
 * rather than a goal, and a wall of surprises teaches nothing about what the app
 * rewards. Unearned glyphs keep their own picture at low opacity instead of
 * becoming a padlock, because the silhouette is itself the hint — it says what
 * this one is about before the label is read, and a wall of identical padlocks
 * says only that you have not done things.
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

/**
 * The line on Progress. Deliberately one row and deliberately not a grid.
 *
 * The glyphs of whatever has actually been earned ride along, because a bare
 * count is a link nobody follows and three flames is a reason to. Nothing is
 * shown for the unearned ones here — that is what the screen behind it is for.
 */
export function AchievementsRow({ earned }: { earned: Achievement[] }) {
  const colors = useColors();
  const tr = useT();
  const router = useRouter();

  // Newest first, so the row changes on the day a badge is won rather than
  // showing the same four firsts forever.
  const recent = [...earned].reverse().slice(0, 4);

  return (
    <InsetGroup title={tr('achievements.title')}>
      <Pressable
        onPress={() => {
          haptics.selected();
          router.push('/achievements');
        }}
        accessibilityRole="button"
        accessibilityLabel={tr('achievements.title')}
        accessibilityHint={tr('achievements.count')(earned.length, ACHIEVEMENT_KEYS.length)}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <InsetRow first>
          <View style={styles.recent}>
            {recent.length > 0 ? (
              recent.map((badge) => (
                <Text key={badge.key} style={styles.rowGlyph}>
                  {GLYPH[badge.key]}
                </Text>
              ))
            ) : (
              // Nothing earned yet, so the row leads with the first rung rather
              // than an empty space where the prizes go.
              <Text style={[t.body, { color: colors.mutedForeground }]}>
                {tr(`badge.${ACHIEVEMENT_KEYS[0]}` as StringKey)}
              </Text>
            )}
          </View>
          <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
            {tr('achievements.count')(earned.length, ACHIEVEMENT_KEYS.length)}
          </Text>
          <Chevron color={colors.mutedForeground} />
        </InsetRow>
      </Pressable>
    </InsetGroup>
  );
}

/**
 * The wall itself, grouped.
 *
 * A flat run of fourteen is a list read once and never again — "a year of
 * training" and "took a photograph" in identical cells, with nothing saying
 * which is which. Under a heading, the group is the promise and the rows are
 * the ladder, and the ladder is the useful part: it says what comes after the
 * rung you are standing on.
 */
export function AchievementWall({
  earned,
  facts,
}: {
  earned: Achievement[];
  facts: AchievementFacts;
}) {
  const earnedBy = new Map(earned.map((badge) => [badge.key, badge]));

  const tr = useT();

  return (
    <View style={styles.wall}>
      {ACHIEVEMENT_GROUPS.map((group) => (
        <InsetGroup key={group.key} title={tr(`achievements.group.${group.key}` as StringKey)}>
          {group.keys.map((key, index) => (
            <BadgeRow
              key={key}
              badgeKey={key}
              first={index === 0}
              got={earnedBy.get(key)}
              facts={facts}
            />
          ))}
        </InsetGroup>
      ))}
    </View>
  );
}

/**
 * One badge, one row, everything visible.
 *
 * The old tile hid its explanation behind a tap and showed one at a time under
 * the grid — which meant the answer to "what is this one?" cost a tap and moved
 * the page. A full-width row has the space to just say it, and German fits.
 *
 * Earned rows carry the date and drop the bar; a bar to somewhere you have
 * already arrived is decoration. Unearned rows carry the sentence that says how,
 * and the bar underneath it when there is a number to count.
 */
function BadgeRow({
  badgeKey,
  first,
  got,
  facts,
}: {
  badgeKey: AchievementKey;
  first: boolean;
  got: Achievement | undefined;
  facts: AchievementFacts;
}) {
  const colors = useColors();
  const locale = useLocale();
  const tr = useT();

  const toward = got ? null : achievementProgress(badgeKey, facts);

  return (
    <InsetRow first={first} style={styles.badgeRow}>
      <Text style={[styles.glyph, got ? null : styles.locked]}>{GLYPH[badgeKey]}</Text>

      <View style={styles.flex}>
        <Text style={[t.bodyBold, { color: got ? colors.foreground : colors.mutedForeground }]}>
          {tr(`badge.${badgeKey}` as StringKey)}
        </Text>

        <Text style={[t.footnote, styles.how, { color: colors.mutedForeground }]}>
          {got
            ? tr('achievements.earnedOn')(
                formatDay(got.local_date, locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              )
            : tr(`badgeHow.${badgeKey}` as StringKey)}
        </Text>

        {toward && (
          <View style={styles.progress}>
            <View style={[styles.track, { backgroundColor: colors.mutedField }]}>
              <View
                style={[
                  styles.fill,
                  {
                    // A run of nothing still draws a sliver, so the bar reads as
                    // a bar rather than as an empty box somebody forgot to fill.
                    width: `${Math.max(2, (toward.current / toward.goal) * 100)}%`,
                    backgroundColor: colors.caloriesText,
                  },
                ]}
              />
            </View>
            <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
              {tr('achievements.count')(toward.current, toward.goal)}
            </Text>
          </View>
        )}
      </View>
    </InsetRow>
  );
}

function Chevron({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Polyline
        points="9 18 15 12 9 6"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wall: { gap: 20 },
  recent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowGlyph: { fontSize: 20 },
  badgeRow: { alignItems: 'flex-start', paddingVertical: 12 },
  glyph: { fontSize: 24, lineHeight: 30 },
  locked: { opacity: 0.3 },
  how: { marginTop: 1 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  track: { flex: 1, height: 6, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
});
