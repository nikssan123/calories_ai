import { useCallback, useEffect, useState } from 'react';
import { formatDay } from '@ct/shared';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { AdaptiveProposal, Locale, WeeklyReview as Review } from '@ct/shared';
import { PressableChunk } from '@/components/Chunk';
import { InsetGroup } from '@/components/InsetGroup';
import { api, planLimitOf } from '@/lib/api';
import { useEntitlements } from '@/lib/entitlements';
import { TIER_NAMES } from '@/lib/plan-copy';
import { font, type as t, useColors } from '@/theme';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import { useLocale } from '@/lib/i18n';

/**
 * Last week, and what it did to the target.
 *
 * The point of showing the adaptive proposal even when it cannot act is that an
 * unexplained calorie target is one people ignore. If the number is about to
 * move, they should be able to see it coming; if it is stuck, they should know
 * what it is waiting for.
 */
export function WeeklyReview({ onError }: { onError: (message: string) => void }) {
  const locale = useLocale();
  const colors = useColors();
  const router = useRouter();
  const { plan, tiers } = useEntitlements();
  /*
   * Whether writing one is on this plan at all.
   *
   * Read off the tier rather than hardcoded to `free`, because the ceiling is
   * `reviewsPerDay` in `plans.ts` and that is where it should stay decided —
   * this component should not be the second place that knows which tiers
   * include a review.
   *
   * Undefined while the tiers are still in flight, which is treated as *not*
   * locked: a paying account must never see a frame of this offering to sell
   * them something they already have.
   */
  const locked = tiers.find((tier) => tier.plan === plan)?.reviews_per_day === 0;
  const upsell = tiers.find((tier) => tier.plan !== plan && tier.reviews_per_day > 0);
  const [review, setReview] = useState<Review | null>(null);
  const [adaptive, setAdaptive] = useState<AdaptiveProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    const [latest, proposal] = await Promise.allSettled([api.latestReview(), api.adaptiveTargets()]);
    // A 404 here is the ordinary state of a new account, not an error.
    setReview(latest.status === 'fulfilled' ? latest.value : null);
    setAdaptive(proposal.status === 'fulfilled' ? proposal.value : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * And again whenever this screen is returned to.
   *
   * The one fetch on mount is not enough for this panel in particular: the
   * review it is showing is written by a Monday-morning pass on the server, and
   * the push announcing it opens `/progress` — a tab that has been mounted
   * since launch and will happily go on showing the empty state under a
   * notification that just said the week was ready. Same for the adaptive
   * proposal beneath it, which moves on the same schedule.
   */
  useRefreshOnReturn(load);

  async function writeNow() {
    setWriting(true);
    try {
      setReview(await api.runReview());
      await load();
    } catch (e) {
      // A 402 here means the tiers arrived late or the plan changed under us.
      // Sending them to the wall is a better answer than a red sentence about
      // a feature that is simply not bought — see `planLimitOf`.
      if (planLimitOf(e)) router.push({ pathname: '/upgrade', params: { plan: upsell?.plan } });
      else onError((e as Error).message);
    } finally {
      setWriting(false);
    }
  }

  if (loading) return null;

  // The target change reported by the review it came with, if it is still the
  // most recent one — otherwise the live proposal.
  const change = review?.stats.adaptive ?? adaptive;

  return (
    <InsetGroup title={review ? '📅  Last week' : '📅  Weekly review'}>
      {review ? (
        <View style={styles.body}>
          <Text style={[t.footnoteBold, { color: colors.mutedForeground }]}>
            {formatRange(review.week_start, review.week_end, locale)}
          </Text>
          {/* The review is prose the model wrote, and it comes with its own
              paragraph breaks — RN keeps them, so nothing has to parse it. */}
          <Text style={[t.body, styles.prose, { color: colors.foreground }]}>
            {review.content}
          </Text>
          {change?.eligible && <TargetChange proposal={change} tense="past" />}
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={[t.body, { color: colors.foreground }]}>
            Every Monday morning you&apos;ll get a short read on how the week went — what the
            numbers actually showed, and whether your target needs to move. No lectures, just
            the picture.
          </Text>
          {/*
            The one button, and which one it is depends on whether this is
            bought. Same shape, same place, same weight — a locked feature that
            visibly rearranges the screen makes the limit feel like damage,
            where swapping the verb makes it feel like a choice.
          */}
          <PressableChunk
            depth={3}
            radius={999}
            onPress={() =>
              // The tier this button names — "Part of Plus" — is the one the
              // paywall should open on.
              locked
                ? router.push({ pathname: '/upgrade', params: { plan: upsell?.plan } })
                : void writeNow()
            }
            disabled={writing}
            accessibilityRole="button"
            style={styles.writeWrap}
            contentStyle={[
              styles.write,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
          >
            <Svg width={15} height={15} viewBox="0 0 24 24">
              <Path
                d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"
                stroke={colors.secondaryForeground}
                strokeWidth={2.2}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
            <Text style={[t.footnoteBold, { color: colors.secondaryForeground }]}>
              {locked
                ? `Part of ${upsell ? TIER_NAMES[upsell.plan] : 'Plus'}`
                : writing
                  ? 'Writing…'
                  : 'Write one now'}
            </Text>
          </PressableChunk>
        </View>
      )}

      {adaptive && !adaptive.eligible && (
        <View style={[styles.waiting, { borderTopColor: colors.border, backgroundColor: colors.mutedWash }]}>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            <Text style={{ fontFamily: font.extrabold, color: colors.foreground }}>
              Target {adaptive.current.kcal.toLocaleString()} kcal.
            </Text>
            {` ${adaptive.explanation}`}
          </Text>
        </View>
      )}

      {adaptive?.eligible && !review && (
        <View style={styles.body}>
          <TargetChange proposal={adaptive} tense="future" />
        </View>
      )}
    </InsetGroup>
  );
}

function TargetChange({
  proposal,
  tense,
}: {
  proposal: AdaptiveProposal;
  tense: 'past' | 'future';
}) {
  const colors = useColors();
  return (
    <View style={[styles.change, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <View style={styles.changeRow}>
        <Text style={[t.bodyBold, t.tnum, { color: colors.mutedForeground }]}>
          {proposal.current.kcal.toLocaleString()}
        </Text>
        <Svg width={14} height={14} viewBox="0 0 24 24">
          <Path
            d="M5 12h14M13 6l6 6-6 6"
            stroke={colors.mutedForeground}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
        <Text style={[t.bodyBold, t.tnum, { color: colors.caloriesText }]}>
          {proposal.proposed.kcal.toLocaleString()} kcal
        </Text>
      </View>
      <Text style={[t.footnote, styles.changeWhy, { color: colors.mutedForeground }]}>
        {tense === 'future' ? 'Next review will apply this. ' : ''}
        {proposal.explanation}
      </Text>
    </View>
  );
}

function formatRange(start: string, end: string, locale: Locale): string {
  // The month is named once when both ends share it and twice when they do not.
  const format = (iso: string, withMonth: boolean) =>
    formatDay(iso, locale, { day: 'numeric', ...(withMonth ? { month: 'long' } : {}) });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${format(start, !sameMonth)} – ${format(end, true)}`;
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  prose: { lineHeight: 26 },
  writeWrap: { alignSelf: 'flex-start' },
  write: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 16,
  },
  waiting: { borderTopWidth: 2, paddingHorizontal: 16, paddingVertical: 12 },
  change: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  changeWhy: { marginTop: 6, lineHeight: 20 },
});
