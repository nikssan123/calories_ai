import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
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
import { ALWAYS_FREE, TIER_NAMES, TIER_PITCHES, tierLines } from '@/lib/plan-copy';
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
 */
export default function UpgradeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { plan, tiers, refresh } = useEntitlements();

  const paid = tiers.filter((tier) => tier.plan !== 'free');
  const [offers, setOffers] = useState<Buyable[] | null>(null);
  const [chosen, setChosen] = useState<PlanName | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void buyables().then((found) => live && setOffers(found));
    return () => {
      live = false;
    };
  }, []);

  /*
   * Opens on the cheapest tier they are not already on, which is the one the
   * wall that sent them here would have named. Held until `tiers` arrives so
   * the selection is never a guess that moves under the finger.
   */
  useEffect(() => {
    if (chosen || paid.length === 0) return;
    setChosen(paid.find((tier) => tier.plan !== plan)?.plan ?? paid[0]!.plan);
  }, [chosen, paid, plan]);

  const offerFor = useCallback(
    (candidate: PlanName) => offers?.find((offer) => offer.plan === candidate) ?? null,
    [offers],
  );

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

      <View style={styles.tiers}>
        {paid.map((tier) => (
          <TierCard
            key={tier.plan}
            name={TIER_NAMES[tier.plan]}
            pitch={TIER_PITCHES[tier.plan]}
            lines={tierLines(tier)}
            price={offerFor(tier.plan)?.price ?? null}
            perMonth={offerFor(tier.plan)?.perMonth ?? null}
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
        Billed once a year through the store. Cancel any time from your store account — you keep
        what you paid for until the period ends.
      </Text>
    </ScrollView>
  );
}

/**
 * One tier.
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
  lines,
  price,
  perMonth,
  current,
  selected,
  onPress,
}: {
  name: string;
  pitch: string;
  lines: string[];
  price: string | null;
  perMonth: string | null;
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
          <Text style={[t.title2, { color: colors.foreground }]}>{name}</Text>
          {current ? (
            <View style={[styles.tag, { backgroundColor: withAlpha(colors.primary, 0.2) }]}>
              <Text style={[t.footnoteBold, { color: colors.caloriesText }]}>Your plan</Text>
            </View>
          ) : (
            price && (
              <Text style={[t.bodyBold, { color: colors.foreground }]}>{price}</Text>
            )
          )}
        </View>

        <Text style={[t.footnote, { color: colors.mutedForeground }]}>{pitch}</Text>

        <View style={styles.tierLines}>
          {lines.map((line) => (
            <View key={line} style={styles.freeRow}>
              <Check color={selected ? colors.primary : colors.mutedForeground} />
              <Text style={[t.footnote, styles.freeText, { color: colors.foreground }]}>
                {line}
              </Text>
            </View>
          ))}
        </View>

        {/* The store's own per-month figure, never an annual price divided by
            twelve here — the rounding and the currency are the store's to get
            right, and in most of the world our arithmetic would be wrong. */}
        {perMonth && !current && (
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            {perMonth} a month, billed yearly
          </Text>
        )}
      </Chunk>
    </Pressable>
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
  tiers: { gap: 20, marginTop: 4 },
  tier: { borderWidth: 2, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  tierHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  tierLines: { gap: 5, marginTop: 2 },
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
  freeRow: { flexDirection: 'row', gap: 8 },
  // The tick sits on the first line's optical centre rather than its box centre,
  // which is what keeps a two-line item from hanging its mark in the gutter.
  check: { marginTop: 2 },
  freeText: { flexShrink: 1 },
  smallPrint: { marginTop: 6 },
});
