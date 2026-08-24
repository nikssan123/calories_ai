import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { DayQuality } from '@ct/shared';
import { QUALITY_COVERAGE_FLOOR, meterSpent } from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { useEntitlements } from '@/lib/entitlements';
import { spentLine, TIER_NAMES, tierFor } from '@/lib/plan-copy';
import { duration, ease, type as t, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Fiber, sodium, saturated fat and sugar, under the macros.
 *
 * Deliberately not four more MacroBars. Three fat tracks is a glance; seven is
 * a dashboard, and the moment this reads as important as protein it starts
 * being the thing people optimise. These are smaller and quieter and sit below
 * the fold of attention on purpose — they are for noticing a pattern over a
 * week, not for scoring a lunch.
 *
 * The two halves of the panel do not mean the same thing and are not drawn
 * alike. Fiber is a floor: filling it is good news, so it takes the app's
 * positive green. The other three are ceilings, which have no good news in them
 * — a full sodium bar is not an achievement — so they run in ink and turn to
 * plain foreground when crossed. Never red: going over is still not an alarm.
 */
const ROWS = [
  { key: 'fiber_g', label: 'Fiber', emoji: '🌱', unit: 'g' },
  { key: 'sodium_mg', label: 'Sodium', emoji: '🧂', unit: 'mg' },
  { key: 'sat_fat_g', label: 'Sat fat', emoji: '🧈', unit: 'g' },
  { key: 'sugar_g', label: 'Sugar', emoji: '🍬', unit: 'g' },
] as const;

export function DietQuality({
  quality,
  logged = true,
  style,
}: {
  quality: DayQuality;
  /**
   * Whether the day has anything in it at all.
   *
   * A blank day already says it is blank, in its own words, a few pixels
   * lower; the panel below explaining that nobody estimated the fiber in
   * nothing is the same news twice.
   */
  logged?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();

  /*
   * Nothing estimated used to mean nothing drawn, and that was wrong for the
   * account it happened to most.
   *
   * These four figures only ever come from a model reading a meal, so a day
   * logged by hand, by repeat or by barcode carries none of them — which is
   * most days on the free tier, once its twenty turns are gone. The panel
   * vanishing left that account with no way to discover the feature existed,
   * let alone that it is what the journal buys them: the app quietly removed
   * its own best argument at exactly the moment it needed to make it.
   *
   * So the tracks stay, empty, with the reason written underneath. The values
   * are dashes rather than blurred numbers on purpose — a blurred figure
   * claims the app knows something it is withholding, and nobody has estimated
   * this. What is being sold is the estimate, not access to it.
   */
  const measured = ROWS.some((row) => quality[row.key] !== null);
  if (!measured && !logged) return null;

  const partial = measured && quality.coverage < QUALITY_COVERAGE_FLOOR;

  return (
    <View style={style}>
      <View style={styles.header}>
        <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>🥦&nbsp;&nbsp;Diet quality</Text>
        {(partial || !measured) && (
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            {measured ? 'partly measured' : 'not estimated'}
          </Text>
        )}
      </View>

      <Chunk
        contentStyle={{
          backgroundColor: colors.card,
          borderWidth: 2,
          borderColor: colors.border,
          paddingHorizontal: 16,
          paddingVertical: 16,
        }}
      >
        <View style={styles.grid}>
          {ROWS.map((row) => (
            <QualityTrack
              key={row.key}
              row={row}
              value={quality[row.key]}
              target={quality.targets[row.key]}
              blank={!measured}
            />
          ))}
        </View>

        {!measured && <QualityBlank style={styles.blank} />}
      </Chunk>

      {partial && (
        <Text style={[t.footnote, styles.footer, { color: colors.mutedForeground }]}>
          Only {Math.round(quality.coverage * 100)}% of today’s calories carry these figures, so
          the totals are a floor rather than the whole day.
        </Text>
      )}
    </View>
  );
}

/**
 * Why the tracks are empty, and what fills them.
 *
 * Exported because Progress has the same hole for the same reason — its quality
 * card is hidden whenever the window measured nothing — and the explanation has
 * to be one sentence written once rather than two that drift.
 *
 * Two states, and which one shows is a fact about the account rather than a
 * guess: while there is any metered way left to log a meal, the answer is to
 * use it, and only when every one of them is spent does the answer cost money.
 * Selling a plan to somebody who still has turns in the one they are on is how
 * a nudge becomes an advert.
 */
export function QualityBlank({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const router = useRouter();
  const { plan, tiers, allowances } = useEntitlements();

  const chat = allowances?.chat ?? null;
  const photo = allowances?.photo ?? null;
  /*
   * Spent on both ways in — text and photo — because either one would fill
   * these, and bought scans count: a bundle sitting unused is a photo this
   * account can still take, whatever the month's grant says.
   *
   * Null while the first fetch is out, which reads as *not* spent. A paying
   * account must never see a frame of this offering to sell it something it
   * already has, and the cost of being wrong the other way is one quiet
   * sentence that stays true a second later.
   */
  const stuck =
    chat !== null &&
    photo !== null &&
    meterSpent(chat) &&
    meterSpent(photo) &&
    photo.credits === 0;
  const next = stuck ? tierFor('chat', tiers, plan) : null;
  const carried = next
    ? tiers.find((tier) => tier.plan === next)?.meters.find((entry) => entry.meter === 'chat')
    : undefined;

  /*
   * The second sentence, and it is the whole point of the panel staying on
   * screen: never end on what is missing. Either there is a free way to fill
   * these in — which there usually is — or there is a number to compare
   * against the one that ran out.
   */
  const tail =
    next && chat && carried?.allowed
      ? `${spentLine(chat)} — ${TIER_NAMES[next]} includes ${carried.allowed} a month.`
      : 'Tell the journal what you ate and they fill themselves in.';

  return (
    <View style={[styles.blankBody, style]}>
      <Text style={[t.footnote, styles.blankLine, { color: colors.mutedForeground }]}>
        These four are the model’s estimate, so only meals the journal logs carry them — typed,
        repeated and scanned ones leave them blank. {tail}
      </Text>

      {next && (
        <PressableChunk
          depth={3}
          radius={999}
          /* The tier the sentence names is the one the paywall opens on — see
             the note in `PlanWall`. */
          onPress={() => router.push({ pathname: '/upgrade', params: { plan: next } })}
          accessibilityRole="button"
          style={styles.blankAction}
          contentStyle={[
            styles.blankButton,
            { backgroundColor: colors.secondary, borderColor: colors.border },
          ]}
        >
          <Text style={[t.footnoteBold, { color: colors.secondaryForeground }]}>
            See what {TIER_NAMES[next]} adds
          </Text>
        </PressableChunk>
      )}
    </View>
  );
}

function QualityTrack({
  row,
  value,
  target,
  blank,
}: {
  row: (typeof ROWS)[number];
  value: number | null;
  target: { value: number; direction: 'floor' | 'ceiling' };
  /** The whole panel is empty, so the cell shows the target it would be read
      against rather than repeating "not estimated" four times over a sentence
      that already says it once. */
  blank?: boolean;
}) {
  const colors = useColors();
  const floor = target.direction === 'floor';
  const pct = value === null ? 0 : Math.min(100, (value / target.value) * 100);

  // A floor reached is good; a ceiling crossed is worth seeing but is not an
  // alarm, so both land on a colour rather than on a warning.
  const marked = value !== null && (floor ? value >= target.value : value > target.value);
  const fillColor = marked && !floor ? colors.foreground : floor ? colors.calories : colors.mutedForeground;

  const width = useSharedValue(pct);
  const reduced = useReducedMotion();
  useEffect(() => {
    width.value = withTiming(pct, {
      duration: reduced ? 0 : duration.spring,
      easing: ease.spring,
    });
  }, [pct, width, reduced]);

  const fill = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, width.value))}%`,
  }));

  /*
   * Label, figure and bar stacked rather than laid out across the row — the
   * same rhythm as MacroBars above, which is what lets this sit under them
   * without reading as a different kind of object.
   */
  return (
    <View style={styles.cell}>
      <View style={styles.labelRow}>
        <Text style={styles.emoji}>{row.emoji}</Text>
        <Text
          numberOfLines={1}
          style={[t.footnoteSemibold, styles.label, { color: colors.mutedForeground }]}
        >
          {row.label}
        </Text>
      </View>

      <View style={styles.figureRow}>
        {value === null ? (
          blank ? (
            <>
              <Text style={[t.figure, styles.figure, { color: colors.mutedForeground }]}>—</Text>
              <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
                /{target.value.toLocaleString()}
                {row.unit}
              </Text>
            </>
          ) : (
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>not estimated</Text>
          )
        ) : (
          <>
            <Text
              style={[
                t.figure,
                styles.figure,
                { color: marked && floor ? colors.caloriesText : colors.foreground },
              ]}
            >
              {Math.round(value).toLocaleString()}
            </Text>
            <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
              /{target.value.toLocaleString()}
              {row.unit}
            </Text>
          </>
        )}
      </View>

      <View style={[styles.bar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Animated.View style={[styles.fill, fill, { backgroundColor: fillColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 20 },
  // Two columns, with the row gap already spent by `rowGap` above.
  cell: { width: '46%', flexGrow: 1, gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emoji: { fontSize: 11, lineHeight: 13 },
  label: { flexShrink: 1 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  // `leading-none`, less the amount RN would clip off the top. See MacroBars.
  figure: { fontSize: 13, lineHeight: 17 },
  bar: { height: 6, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  footer: { paddingHorizontal: 6, paddingTop: 2 },
  blank: { marginTop: 14 },
  blankBody: { gap: 10 },
  blankLine: { lineHeight: 19 },
  blankAction: { alignSelf: 'flex-start' },
  blankButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 14,
  },
});
