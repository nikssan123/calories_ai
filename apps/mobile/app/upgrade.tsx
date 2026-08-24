import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { PlanName } from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { useToast } from '@/components/Toast';
import { useEntitlements } from '@/lib/entitlements';
import {
  billingAvailable,
  buyables,
  purchase,
  PurchaseCancelled,
  restore,
  type Buyable,
} from '@/lib/billing';
import {
  ALWAYS_FREE,
  carriesFrom,
  TIER_NAMES,
  TIER_PITCHES,
  tierLines,
} from '@/lib/plan-copy';
import { haptics } from '@/lib/haptics';
import { type as t, useColors, withAlpha } from '@/theme';

/**
 * The wall itself — the screen `SUBSCRIPTIONS.md` has had on its build list as
 * "one sentence and two buttons" since the entitlement seam landed.
 *
 * A pushed screen rather than a sheet, because it is a destination: it is
 * reached from the journal, from a locked kitchen and from settings, and a
 * half-height sheet cannot hold two tiers, what each one includes and what
 * stays free without becoming a scroll inside a scroll.
 *
 * The order on the page is the argument. Tiers first, because somebody who
 * arrived here from a wall already knows what they wanted and only needs a
 * price. What stays free goes *last and in full*, which is the unusual choice
 * and the deliberate one: the honest version of this page has to say what
 * happens if you do not pay, and this product has an unusually good answer —
 * the diary keeps working, offline, forever. Hiding that to make the tiers look
 * more necessary would be selling the wrong thing.
 *
 * Everything a card holds is one of three things — a price, a short line on
 * what the tier is for, and at most three lines of what it grants — and that
 * ceiling is the design. The version before this one gave every meter its own
 * row, which made Coach seven rows of near-identical text and made the page
 * something to be scrolled past rather than read. See `tierLines`.
 */
export default function UpgradeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { plan, tiers, refresh } = useEntitlements();
  /*
   * The tier the screen that sent us here was talking about.
   *
   * A wall that says "See what Coach adds" and opens on Plus is the app
   * answering a different question than the one that was asked — and it did,
   * because the default below picks the cheapest tier that is not the current
   * one. Every caller that names a tier in its button passes it (`PlanWall`,
   * `LockedPanel`); the ones that do not are the general "see the plans" links,
   * and the default is right for those.
   */
  const { plan: asked } = useLocalSearchParams<{ plan?: string }>();

  const paid = tiers.filter((tier) => tier.plan !== 'free');
  const [offers, setOffers] = useState<Buyable[] | null>(null);
  const [chosen, setChosen] = useState<PlanName | null>(null);
  /*
   * Monthly first.
   *
   * Yearly was the opening default and the argument for it was that it is the
   * cheaper of the two per month. That is true and it is still not the right
   * first number to show: the first thing somebody wants from a paywall is what
   * this costs, and "$249.99" is the answer to a question nobody asked on the
   * day they are deciding whether to pay at all. The month is what `plans.ts`
   * markets; the year is the discount taken once they know they want it, which
   * is what the toggle's own saving badge is for.
   */
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void buyables().then((found) => live && setOffers(found));
    return () => {
      live = false;
    };
  }, []);

  /*
   * What the wall that sent them here named, and failing that the cheapest tier
   * they are not already on. Held until `tiers` arrives so the selection is
   * never a guess that moves under the finger.
   */
  useEffect(() => {
    if (chosen || paid.length === 0) return;
    const named = paid.find((tier) => tier.plan === asked)?.plan;
    setChosen(named ?? paid.find((tier) => tier.plan !== plan)?.plan ?? paid[0]!.plan);
  }, [asked, chosen, paid, plan]);

  const offerFor = useCallback(
    (candidate: PlanName, want: 'month' | 'year' = period) =>
      offers?.find((offer) => offer.plan === candidate && offer.period === want) ??
      // A tier configured for only one period still sells. The toggle is hidden
      // in that case (see `periods`), so this is the single option, not a
      // silent substitution of one billing cycle for another.
      offers?.find((offer) => offer.plan === candidate) ??
      null,
    [offers, period],
  );

  /** Which periods the store actually offers, so a toggle with one side is not drawn. */
  const periods = new Set(offers?.map((offer) => offer.period) ?? []);

  /**
   * What a year saves against twelve of the monthly charge, as a percentage.
   *
   * Arithmetic on two of the store's own figures in one currency, which is
   * safe — unlike deriving a *displayed* price, which is why `perMonth` is
   * still the store's string and never a division done here.
   */
  const saving = (() => {
    if (!chosen) return null;
    const year = offerFor(chosen, 'year');
    const month = offerFor(chosen, 'month');
    if (!year || !month || month.amount <= 0) return null;
    const pct = Math.round((1 - year.amount / (month.amount * 12)) * 100);
    return pct >= 5 ? pct : null;
  })();

  async function buy() {
    const offer = chosen ? offerFor(chosen) : null;
    if (!offer || busy) return;
    setBusy(true);
    try {
      const landed = await purchase(offer, refresh);
      if (landed) {
        haptics.logged();
        toast.success(`You're on ${TIER_NAMES[offer.plan]}. Thank you.`);
        router.back();
      } else {
        /*
         * Bought, but the entitlement has not arrived yet. Not an error and
         * carefully not worded as one — the receipt exists, the webhook is in
         * flight, and `expirePlans` on the API is the backstop if it is lost.
         * Telling somebody who has just paid that something failed is the worst
         * sentence on this screen.
         */
        toast.message('Payment received — your plan will unlock in a moment.');
        router.back();
      }
    } catch (error) {
      // Closing the store sheet is an answer, not a failure. Saying anything
      // at all here would be the app arguing with a decision.
      if (!(error instanceof PurchaseCancelled)) toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restorePurchase() {
    if (busy) return;
    setBusy(true);
    try {
      const found = await restore(refresh);
      if (found) {
        toast.success('Restored. Welcome back.');
        router.back();
      } else {
        toast.message('No subscription found on this store account.');
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const offer = chosen ? offerFor(chosen) : null;
  /*
   * Whether anything on this screen can actually be bought right now. False on
   * a build with no store key — a simulator, a local API — and false while the
   * offerings are still in flight. The tiers render either way: what each one
   * holds is worth reading even when the price is not there yet, and a screen
   * that is blank until a network call lands looks broken.
   */
  const sellable = billingAvailable && offers !== null && offers.length > 0;

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <View style={styles.topRow}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          style={({ pressed }) => [styles.close, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              d="M18 6 6 18M6 6l12 12"
              stroke={colors.mutedForeground}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Pressable>
      </View>

      <Text style={[t.largeTitle, { color: colors.foreground }]}>Keep it going.</Text>
      <Text style={[t.body, styles.lede, { color: colors.mutedForeground }]}>
        {plan === 'free'
          ? "You're on Free. Everything you type in stays free — these buy the parts that think."
          : `You're on ${TIER_NAMES[plan]}.`}
      </Text>

      {/*
        Monthly or yearly, and only when both exist. A segmented control rather
        than a checkbox on each card: the period applies to whichever tier they
        end up choosing, so putting it on the cards would ask the same question
        twice and allow two answers.

        Monthly is first and is the one that opens — see `period`. The saving is
        on the yearly side rather than in a banner, which is where it belongs:
        it is the reason to press that half, and it is the only place on the
        page arguing for the longer commitment.
      */}
      {periods.has('month') && periods.has('year') && (
        <View style={[styles.periods, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          {(['month', 'year'] as const).map((option) => {
            const on = period === option;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  haptics.selected();
                  setPeriod(option);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[
                  styles.period,
                  on && { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    t.footnoteBold,
                    { color: on ? colors.foreground : colors.mutedForeground },
                  ]}
                >
                  {option === 'year' ? 'Yearly' : 'Monthly'}
                  {option === 'year' && saving !== null ? ` · save ${saving}%` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.tiers}>
        {paid.map((tier, index) => (
          <TierCard
            key={tier.plan}
            name={TIER_NAMES[tier.plan]}
            pitch={TIER_PITCHES[tier.plan]}
            // What the tier below already gave them, said once instead of
            // repeated as rows. `index - 1` rather than the whole ladder: the
            // cards are drawn cheapest first, so the previous one is the tier
            // this one contains.
            carries={carriesFrom(paid[index - 1])}
            lines={tierLines(tier, paid[index - 1])}
            price={offerFor(tier.plan)?.price ?? null}
            perMonth={offerFor(tier.plan)?.perMonth ?? null}
            period={offerFor(tier.plan)?.period ?? null}
            current={tier.plan === plan}
            selected={tier.plan === chosen}
            onPress={() => {
              haptics.selected();
              setChosen(tier.plan);
            }}
          />
        ))}
      </View>

      {sellable && chosen !== plan && (
        <PressableChunk
          color={colors.caloriesDeep}
          radius={999}
          disabled={busy || !offer}
          haptic={false}
          onPress={() => void buy()}
          accessibilityRole="button"
          style={{ opacity: busy || !offer ? 0.5 : 1 }}
          contentStyle={[styles.cta, { backgroundColor: colors.primary }]}
        >
          <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
            {busy ? 'One moment…' : `Get ${chosen ? TIER_NAMES[chosen] : ''}`}
          </Text>
        </PressableChunk>
      )}

      {!sellable && (
        <Chunk
          contentStyle={[
            styles.notice,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            {billingAvailable
              ? offers === null
                ? 'Checking the store…'
                : "The store has nothing on sale for this app yet. Nothing is locked that wasn't before — come back and it'll be here."
              : "This build can't reach the store, so there's nothing to buy from here yet."}
          </Text>
        </Chunk>
      )}

      {billingAvailable && (
        <Pressable
          onPress={() => void restorePurchase()}
          disabled={busy}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.restore, { opacity: pressed || busy ? 0.5 : 1 }]}
        >
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            Already paid? Restore it
          </Text>
        </Pressable>
      )}

      {/*
        Last on the page and complete, not a footnote. See the note at the top:
        this is the part of the offer that is actually unusual, and a paywall
        that hides it is arguing for the tiers by making the alternative look
        worse than it is.
      */}
      <View style={styles.free}>
        <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>Free on every plan</Text>
        {ALWAYS_FREE.map((line) => (
          <View key={line} style={styles.freeRow}>
            <Check color={colors.primary} />
            <Text style={[t.footnote, styles.freeText, { color: colors.mutedForeground }]}>
              {line}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[t.footnote, styles.smallPrint, { color: colors.mutedForeground }]}>
        {/*
          The period of the package actually selected, not the toggle's. They
          can differ: `offerFor` falls back to a tier's only configured period,
          so a Coach sold monthly-only under a "Yearly" toggle would otherwise
          be described here as billed once a year — which is the one sentence on
          this screen that has to be literally true.
        */}
        {(offer?.period ?? period) === 'year' ? 'Billed once a year' : 'Billed monthly'} through
        the store, and it renews until you stop it. Cancel any time from your store account — you
        keep what you paid for until the period ends.
      </Text>
    </ScrollView>
  );
}

/**
 * One tier.
 *
 * Four zones, in the order somebody shopping reads them: which one this is and
 * what it costs on one line, what it is for on the next, then a rule, then what
 * it grants. The rule is doing real work — it is what separates the sales line
 * from the contents, and without it the pitch reads as the first bullet.
 *
 * The price is `null` until the store answers and stays null on a build that
 * cannot reach one — and the card is drawn either way, because what the tier
 * holds is generated from the server's own ceilings and is true regardless. A
 * card that waits for a price to render is a screen that is empty for the first
 * second on every launch and empty forever in the simulator.
 */
function TierCard({
  name,
  pitch,
  carries,
  lines,
  price,
  perMonth,
  period,
  current,
  selected,
  onPress,
}: {
  name: string;
  pitch: string;
  /** "Everything in Plus", on the tier that contains the one below it. */
  carries: string | null;
  lines: string[];
  price: string | null;
  perMonth: string | null;
  /** What `price` buys, so the sub-line cannot claim the wrong billing cycle. */
  period: 'month' | 'year' | null;
  current: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <Chunk
        depth={selected ? 5 : 3}
        contentStyle={[
          styles.tier,
          {
            // Selection is the border and the ledge, not a fill — see the
            // note in `PlanWall` on what a green wash does over cream.
            backgroundColor: colors.card,
            borderColor: selected ? colors.primary : colors.border,
          },
        ]}
      >
        <View style={styles.tierHead}>
          <View style={styles.tierName}>
            {/* The dot, because a border and a slightly deeper ledge are a
                difference somebody has to look for. Which tier is armed decides
                what the button at the bottom buys, so it is worth a glyph. */}
            <Radio on={selected} />
            <Text style={[t.title2, { color: colors.foreground }]}>{name}</Text>
          </View>

          {current ? (
            <View style={[styles.tag, { backgroundColor: withAlpha(colors.primary, 0.2) }]}>
              <Text style={[t.footnoteBold, { color: colors.caloriesText }]}>Your plan</Text>
            </View>
          ) : (
            price && (
              <View style={styles.price}>
                <Text style={[t.title2, t.tnum, { color: colors.foreground }]}>{price}</Text>
                <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                  {period === 'year' ? 'a year' : 'a month'}
                </Text>
              </View>
            )
          )}
        </View>

        <Text style={[t.footnote, { color: colors.mutedForeground }]}>{pitch}</Text>

        <View style={[styles.rule, { backgroundColor: colors.border }]} />

        <View style={styles.tierLines}>
          {carries && (
            <View style={styles.line}>
              <Check color={colors.primary} />
              <Text style={[t.footnoteBold, styles.lineText, { color: colors.foreground }]}>
                {carries}
              </Text>
            </View>
          )}
          {lines.map((line) => (
            <View key={line} style={styles.line}>
              <Check color={colors.primary} />
              <Text style={[t.footnote, styles.lineText, { color: colors.foreground }]}>
                {line}
              </Text>
            </View>
          ))}
        </View>

        {/* The store's own per-month figure, never an annual price divided by
            twelve here — the rounding and the currency are the store's to get
            right, and in most of the world our arithmetic would be wrong.

            Only on a yearly package: on a monthly one it would restate the
            price directly above it. */}
        {period === 'year' && perMonth && !current && (
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            Works out at {perMonth} a month.
          </Text>
        )}
      </Chunk>
    </Pressable>
  );
}

/** Which tier the button at the bottom would buy. */
function Radio({ on }: { on: boolean }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.radio,
        on
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: 'transparent', borderColor: colors.input },
      ]}
    >
      {on && (
        <Svg width={12} height={12} viewBox="0 0 24 24">
          <Path
            d="M20 6 9 17l-5-5"
            stroke={colors.primaryForeground}
            strokeWidth={3.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      )}
    </View>
  );
}

/** Lucide's `check`. */
function Check({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" style={styles.check}>
      <Path
        d="M20 6 9 17l-5-5"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 20, gap: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: { padding: 6, marginRight: -6 },
  lede: { marginTop: -6 },
  periods: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    gap: 2,
  },
  period: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 2,
    // Transparent rather than absent, so selecting one does not resize the row.
    borderColor: 'transparent',
  },
  tiers: { gap: 20, marginTop: 4 },
  tier: { borderWidth: 2, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  tierHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tierName: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The cadence sits under the figure rather than beside it, so two cards'
  // prices line up on the same baseline whatever their currency is worth.
  price: { alignItems: 'flex-end' },
  rule: { height: 2, borderRadius: 999, marginTop: 2 },
  tierLines: { gap: 6, marginTop: 2 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  cta: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  notice: { borderWidth: 2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12 },
  restore: { alignItems: 'center', paddingVertical: 10 },
  free: { gap: 7, marginTop: 10 },
  line: { flexDirection: 'row', gap: 8 },
  freeRow: { flexDirection: 'row', gap: 8 },
  // The tick sits on the first line's optical centre rather than its box centre,
  // which is what keeps a two-line item from hanging its mark in the gutter.
  check: { marginTop: 2 },
  lineText: { flexShrink: 1 },
  freeText: { flexShrink: 1 },
  smallPrint: { marginTop: 6 },
});
