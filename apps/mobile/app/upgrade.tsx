import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import type { CreditMeter, PlanName } from '@ct/shared';
import { untilWords } from '@ct/shared/words';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { GlowButton } from '@/components/GlowButton';
import { Trio } from '@/components/cast/Character';
import { Serif } from '@/components/Serif';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useToast } from '@/components/Toast';
import { useEntitlements } from '@/lib/entitlements';
import { useAuth } from '@/lib/auth';
import { useSaveAccount } from '@/lib/save-account';
import { api } from '@/lib/api';
import {
  billingAvailable,
  bundles,
  buyables,
  manageSubscription,
  purchase,
  purchaseBundle,
  PurchaseCancelled,
  restore,
  type Buyable,
  type Bundle,
} from '@/lib/billing';
import {
  ALWAYS_FREE,
  carriesFrom,
  TIER_NAMES,
  TIER_PITCHES,
  tierLines,
} from '@/lib/plan-copy';
import { haptics } from '@/lib/haptics';
import { PRIVACY_URL, TERMS_URL } from '@/lib/links';
import { useLocale, useT, type MessageKey } from '@/lib/i18n';
import { type as t, useColors, useTheme, useType, withAlpha } from '@/theme';
import { messageOf } from '@/lib/errors';

/**
 * Which strings each kind of pack is drawn with.
 *
 * A lookup rather than a branch because there are now two of these and the
 * copy is the *only* thing that differs — the button, the wait, the toast and
 * the accessibility label are one code path over a meter. A third pack should
 * be six strings here and nothing else on this screen.
 *
 * Keyed on `CreditMeter` rather than `MeterName`, so the three meters no bundle
 * sells cannot be looked up at all. A five-key map would need entries for
 * `meal_plan` and `recipe` that are unreachable, and unreachable copy is copy
 * nobody ever notices is wrong.
 */
const PACK_COPY = {
  chat: {
    heading: 'plans.messagesHeading',
    body: 'plans.messagesBody',
    count: 'plans.messagesCount',
    added: 'plans.messagesAdded',
    onTheWay: 'plans.messagesOnTheWay',
    buyHint: 'plans.messagesBuyHint',
  },
  photo: {
    heading: 'plans.scansHeading',
    body: 'plans.scansBody',
    count: 'plans.scansCount',
    added: 'plans.scansAdded',
    onTheWay: 'plans.scansOnTheWay',
    buyHint: 'plans.scansBuyHint',
  },
} as const satisfies Record<CreditMeter, Record<string, MessageKey>>;

/** The order the sections are drawn in. See the comment where they render. */
const PACK_SECTIONS = [{ meter: 'chat' }, { meter: 'photo' }] as const satisfies readonly {
  meter: CreditMeter;
}[];

/**
 * What each pack is a pack *of*, drawn rather than said.
 *
 * A row that reads "30 messages … $3.99" and nothing else is three columns of
 * text, and a column of those rows is a price list. The mark is what makes the
 * two sections scannable as different things at a glance — which is the whole
 * job here, since somebody who ran out of messages should not have to read the
 * photo rows to find out they are the wrong ones.
 *
 * Stroked at 2 and sized to the badge rather than to the text, so both marks
 * carry the same weight as each other whatever their shape.
 */
const PACK_ICONS = {
  chat: ({ color }: { color: string }) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  ),
  photo: ({ color }: { color: string }) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22 18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.6-2.4A1 1 0 0 1 9.4 4h5.2a1 1 0 0 1 .8.6L17 7h3a2 2 0 0 1 2 2z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3.4} stroke={color} strokeWidth={2} />
    </Svg>
  ),
} as const satisfies Record<CreditMeter, (props: { color: string }) => React.ReactElement>;

/**
 * How long the close button waits before it appears.
 *
 * Long enough to read the headline and see what a plan costs, short enough
 * that nobody is held. The back gesture and Android's back button wait with
 * it, or the wait would only apply to people who did not know about them.
 */
const CLOSE_AFTER_MS = 5000;

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
  const type = useType();
  const tr = useT();
  const locale = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const navigation = useNavigation();
  const { guest } = useAuth();
  const save = useSaveAccount();
  const reduced = useReducedMotion();
  const { plan, tiers, allowances, refresh } = useEntitlements();
  /*
   * Where a free account is on its trial — see `TRIAL` in `@ct/shared`. The
   * chat meter carries it; photo says the same thing.
   */
  const chat = plan === 'free' ? (allowances?.chat ?? null) : null;
  const trialOver = chat?.trial === 'ended';
  const trialEndsIn =
    chat?.trial === 'trial' && chat.trial_ends_at ? untilWords(chat.trial_ends_at, locale) : null;

  const [closable, setClosable] = useState(false);
  const closeOpacity = useSharedValue(0);
  useEffect(() => {
    const timer = setTimeout(() => setClosable(true), CLOSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: closable });
    if (closable) {
      closeOpacity.value = reduced ? 1 : withTiming(1, { duration: 320 });
      return;
    }
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => back.remove();
  }, [closable, navigation, reduced, closeOpacity]);
  const closeStyle = useAnimatedStyle(() => ({ opacity: closeOpacity.value }));
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
  const [packs, setPacks] = useState<Bundle[] | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void buyables().then((found) => live && setOffers(found));
    void bundles().then((found) => live && setPacks(found));
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
    // What is bought belongs to an account, so a guest saves one first and
    // comes back here to buy (GUEST-ACCOUNTS.md).
    if (guest) {
      save.open('purchase');
      return;
    }
    setBusy(true);
    try {
      await purchase(offer, refresh);
      /*
       * One destination for both outcomes.
       *
       * `purchase` resolves false when the entitlement has not arrived yet, and
       * that used to be its own toast — a sentence that vanished while the
       * webhook was still in flight, leaving somebody who had just been charged
       * with a wall and no plan. `app/purchased.tsx` draws the wait and the
       * arrival as one screen and goes on polling, so there is nothing left for
       * this branch to decide.
       *
       * `replace` rather than `push`: going back from a plan somebody now owns
       * should not land on the page that was selling it.
       */
      router.replace({ pathname: '/purchased', params: { plan: offer.plan } });
    } catch (error) {
      // Closing the store sheet is an answer, not a failure. Saying anything
      // at all here would be the app arguing with a decision.
      if (!(error instanceof PurchaseCancelled)) toast.error(messageOf(error, tr));
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
        toast.success(tr('plans.restored'));
        router.back();
      } else {
        toast.message(tr('plans.noneFound'));
      }
    } catch (error) {
      toast.error(messageOf(error, tr));
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
  /**
   * Buy a bundle, of scans or of messages.
   *
   * Deliberately not routed through `buy`: that one swaps the plan and leaves
   * for `/purchased`, and neither is true here. A bundle tops up stock on the
   * plan somebody already has, so the screen stays where it is and the only
   * thing that changes is the count — which is also why the wait polls credits
   * rather than the plan. See `purchaseBundle`.
   *
   * The meter comes off the pack rather than being fixed at `photo`, and it has
   * to: polling the photo balance after a message purchase waits out the full
   * ten seconds and then reports "it will appear in a moment" for something
   * that already arrived.
   */
  async function buyPack(pack: Bundle) {
    if (buying) return;
    setBuying(pack.id);
    try {
      const landed = await purchaseBundle(pack, async () => {
        const entitlements = await api.entitlements();
        return entitlements.allowances.find((a) => a.meter === pack.meter)?.credits ?? 0;
      });
      await refresh();
      const copy = PACK_COPY[pack.meter];
      if (landed) toast.success(tr(copy.added)(pack.units));
      else toast.message(tr(copy.onTheWay));
    } catch (error) {
      // Closing the store sheet is an answer, not a failure.
      if (!(error instanceof PurchaseCancelled)) toast.error(messageOf(error, tr));
    } finally {
      setBuying(null);
    }
  }

  const sellable = billingAvailable && offers !== null && offers.length > 0;

  /*
   * The packs this account may actually be offered.
   *
   * `subscriberOnly` is on the message packs, and this is the only place it is
   * enforced: the wall on Free sells the plan, because ten messages a month
   * plus a $3.99 refill is a cheaper product than Plus and would be the one
   * everybody bought. See the note on `BUNDLES` in `@ct/shared`.
   *
   * It is a filter on *offering*, not on spending. A subscriber who buys a
   * hundred messages and later lapses keeps them — credits do not expire — and
   * `requireAllowance` will still spend them. What this hides is the shop, not
   * the shelf.
   */
  const sellablePacks = (packs ?? []).filter(
    (pack) => !(pack.subscriberOnly && plan === 'free'),
  );

  return (
    <View style={styles.flex}>
    <PaywallLight />
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <Animated.View
        style={[styles.topRow, closeStyle]}
        pointerEvents={closable ? 'auto' : 'none'}
        accessibilityElementsHidden={!closable}
        importantForAccessibility={closable ? 'auto' : 'no-hide-descendants'}
      >
        <Pressable
          onPress={() => router.back()}
          disabled={!closable}
          accessibilityRole="button"
          accessibilityLabel={tr('common.close')}
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
      </Animated.View>

      {/*
        The cast, saying hello above the headline rather than the logo breathing
        there. Its own row, never over a word, and the only moving group on the
        page — the light behind is too slow to count as one (CAST.md).
      */}
      <Trio size={72} gap={4} moods={['idle', 'wave', 'hopeful']} style={styles.cast} />
      <Serif accessibilityRole="header" style={[type.hero, styles.centred, { color: colors.foreground }]}>
        {trialOver ? tr('plans.trialOverTitle') : tr('plans.keepItGoing')}
      </Serif>
      <Text style={[t.body, styles.lede, styles.centred, { color: colors.mutedForeground }]}>
        {plan !== 'free'
          ? tr('plans.onPlan')(TIER_NAMES[plan])
          : trialOver
            ? tr('plans.trialOverBody')
            : trialEndsIn
              ? tr('plans.onTrial')(trialEndsIn)
              : tr('plans.onFree')}
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
        <View style={[styles.periods, { backgroundColor: colors.hairline, borderColor: 'transparent' }]}>
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
                  on && { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge, boxShadow: colors.shadow },
                ]}
              >
                <Text
                  style={[
                    t.footnoteBold,
                    { color: on ? colors.foreground : colors.mutedForeground },
                  ]}
                >
                  {option === 'year' ? tr('plans.yearly') : tr('plans.monthly')}
                  {option === 'year' && saving !== null
                    ? tr('plans.savePercent')(String(saving))
                    : ''}
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
            pitch={tr(TIER_PITCHES[tier.plan])}
            // What the tier below already gave them, said once instead of
            // repeated as rows. `index - 1` rather than the whole ladder: the
            // cards are drawn cheapest first, so the previous one is the tier
            // this one contains.
            carries={carriesFrom(paid[index - 1], tr)}
            lines={tierLines(tier, tr, locale, paid[index - 1])}
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
        <GlowButton
          disabled={!offer}
          busy={busy}
          onPress={() => void buy()}
          style={styles.cta}
          label={tr('plans.get')(chosen ? TIER_NAMES[chosen] : '')}
        />
      )}

      {!sellable && (
        <Chunk
          contentStyle={[
            styles.notice,
            { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge },
          ]}
        >
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            {billingAvailable
              ? offers === null
                ? tr('plans.checkingStore')
                : tr('plans.nothingOnSale')
              : tr('plans.noStore')}
          </Text>
        </Chunk>
      )}

      {/*
        Stock, sold by the bundle — messages first, then scans.

        Below the tiers and not among them, because a bundle is not a tier: it
        is stock on whatever plan you are already on, and it does not expire.
        Somebody on Coach can still run out in a heavy month, so this is not
        inside the `chosen !== plan` guard the Get button uses.

        Messages lead because they are the meter people actually reach the end
        of — Plus grants 90 and the account that sized it runs about 115 — and
        because they are only drawn at all for somebody who is already paying,
        which makes them the more specific answer of the two. Scans follow, and
        they show on every plan including Free.

        Each section is hidden on its own empty list rather than the two sharing
        one guard: a store that has approved the photo products and not yet the
        message ones should sell what it can, not nothing.
      */}
      {PACK_SECTIONS.map((section) => {
        const forSale = sellablePacks.filter((pack) => pack.meter === section.meter);
        if (forSale.length === 0) return null;
        const copy = PACK_COPY[section.meter];
        const Icon = PACK_ICONS[section.meter];
        /*
         * The rung that costs least per unit, which the ladder is built to make
         * the largest one — 40c, 32c, 28c a scan.
         *
         * Ranked on the store's own two numbers in one currency, which is the
         * same licence `saving` takes above and is safe for the same reason:
         * comparing a price against another price is arithmetic, *deriving a
         * displayed one* is what gets the rounding and the currency wrong. No
         * per-unit figure is ever shown — only the tag.
         */
        const best = forSale.reduce((cheapest, pack) =>
          pack.product.price / pack.units < cheapest.product.price / cheapest.units
            ? pack
            : cheapest,
        );
        return (
          <View key={section.meter} style={styles.packs}>
            <View style={styles.packHead}>
              <Serif style={[type.serifTitle, { color: colors.foreground }]}>{tr(copy.heading)}</Serif>
              <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr(copy.body)}</Text>
            </View>
            {forSale.map((pack) => {
              const isBest = forSale.length > 1 && pack.id === best.id;
              return (
                <PressableChunk
                  key={pack.id}
                  radius={20}
                  disabled={buying !== null}
                  onPress={() => void buyPack(pack)}
                  accessibilityRole="button"
                  accessibilityLabel={tr(copy.buyHint)(pack.units, pack.price)}
                  style={{ opacity: buying !== null && buying !== pack.id ? 0.5 : 1 }}
                  contentStyle={[
                    styles.pack,
                    {
                      backgroundColor: colors.glassStrong,
                      // The best rung carries the accent edge the selected
                      // tier does, so the eye finds the same signal twice on
                      // one page rather than learning a second one.
                      borderColor: isBest ? colors.primary : colors.glassEdge,
                    },
                  ]}
                >
                  <View style={styles.packLeft}>
                    <View
                      style={[
                        styles.packBadge,
                        {
                          experimental_backgroundImage: `linear-gradient(135deg, ${colors.calories}, ${colors.logoRamp})`,
                          boxShadow: `0px 8px 18px -8px ${colors.calories}, inset 0px 1px 0px rgba(255,255,255,0.55)`,
                        },
                      ]}
                    >
                      <Icon color="#ffffff" />
                    </View>
                    <View style={styles.packText}>
                      <Text style={[t.bodyBold, { color: colors.foreground }]}>
                        {tr(copy.count)(pack.units)}
                      </Text>
                      {isBest && (
                        <Text style={[t.footnoteSemibold, { color: colors.caloriesText }]}>
                          {tr('plans.bestValue')}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View
                    style={[
                      styles.packPrice,
                      { backgroundColor: withAlpha(colors.primary, isBest ? 0.18 : 0.1) },
                    ]}
                  >
                    <Text style={[t.bodyBold, { color: colors.caloriesText }]}>
                      {buying === pack.id ? tr('plans.oneMoment') : pack.price}
                    </Text>
                  </View>
                </PressableChunk>
              );
            })}
          </View>
        );
      })}

      {/*
        Restore, and — for somebody who already pays — the way out.

        "Already paid? Restore it" tested badly and deserved to: it names the
        verb the stores use and not the situation anyone is actually in. Nobody
        arrives here thinking "I would like to restore a transaction"; they
        arrive on a new phone, or after a reinstall, or having paid two minutes
        ago and still looking at a wall. So the control is titled by the
        symptom, and the line under it says plainly what pressing it does —
        which is the part that was missing, not the button.
      */}
      {billingAvailable && (
        <View style={styles.afters}>
          <Pressable
            onPress={() => void restorePurchase()}
            disabled={busy}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.restore, { opacity: pressed || busy ? 0.5 : 1 }]}
          >
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
              {busy ? tr('plans.checkingStore') : tr('plans.paidNotShowing')}
            </Text>
            <Text style={[t.footnote, styles.restoreNote, { color: colors.mutedForeground }]}>
              {tr('plans.restoreNote')}
            </Text>
          </Pressable>

          {plan !== 'free' && (
            <Pressable
              onPress={() => void manageSubscription()}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => [styles.restore, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
                {tr('plans.manage')}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/*
        Last on the page and complete, not a footnote. See the note at the top:
        this is the part of the offer that is actually unusual, and a paywall
        that hides it is arguing for the tiers by making the alternative look
        worse than it is.
      */}
      <View style={styles.free}>
        <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>
          {tr('plans.freeOnEvery')}
        </Text>
        {ALWAYS_FREE.map((key) => (
          <View key={key} style={styles.freeRow}>
            <Check color={colors.primary} />
            <Text style={[t.footnote, styles.freeText, { color: colors.mutedForeground }]}>
              {tr(key)}
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
        {tr('plans.smallPrint')(
          (offer?.period ?? period) === 'year'
            ? tr('plans.billedYearly')
            : tr('plans.billedMonthly'),
        )}
      </Text>

      {/*
        Both documents, on the screen that sells the subscription rather than
        only under Settings.

        This is a rule rather than a courtesy: 3.1.2 wants the title, the
        length, the price and links to these two reachable from the purchase
        flow itself, and App Review names them explicitly when it asks a new
        developer to demonstrate a subscription. The links already existed on
        the You tab and at sign-up — a reviewer opening the paywall directly
        from a locked feature never passes either.
      */}
      <View style={styles.legal}>
        <Text
          accessibilityRole="link"
          onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {})}
          style={[t.footnoteSemibold, { color: colors.mutedForeground }]}
        >
          {tr('setup.termsOfService')}
        </Text>
        <Text style={[t.footnote, { color: colors.mutedForeground }]}>·</Text>
        <Text
          accessibilityRole="link"
          onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {})}
          style={[t.footnoteSemibold, { color: colors.mutedForeground }]}
        >
          {tr('setup.privacyPolicy')}
        </Text>
      </View>
    </ScrollView>
    </View>
  );
}

/**
 * The paywall's light: daylight, not a different app.
 *
 * Moonly sells in the dark; this sells in the brand at its warmest (GLOW-UP.md,
 * "paywall"). A sun-warm pool at the top, and two slow mists — teal on one side,
 * amber on the other — drifting behind the glass cards. Radial gradients, no
 * blur, and behind everything: the prices and the small print are never under
 * anything that moves.
 */
function PaywallLight() {
  const { scheme, colors } = useTheme();
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    drift.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [reduced, drift]);
  const left = useAnimatedStyle(() => ({ transform: [{ translateX: drift.value * 40 }, { translateY: drift.value * 30 }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ translateX: -drift.value * 36 }, { translateY: -drift.value * 24 }] }));
  const dark = scheme === 'dark';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, overflow: 'hidden' }]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: dark
              ? 'radial-gradient(90% 45% at 50% 0%, rgba(255,190,110,0.20) 0%, rgba(255,190,110,0) 100%)'
              : 'radial-gradient(95% 50% at 50% 0%, #ffe0a8 0%, rgba(255,239,214,0.8) 45%, rgba(255,246,236,0) 100%)',
          },
        ]}
      />
      <Animated.View
        style={[
          styles.mist,
          { left: -160, top: 220, experimental_backgroundImage: `radial-gradient(circle, ${dark ? 'rgba(46,230,196,0.12)' : 'rgba(35,211,176,0.26)'} 0%, rgba(35,211,176,0) 62%)` },
          left,
        ]}
      />
      <Animated.View
        style={[
          styles.mist,
          { right: -170, top: 520, experimental_backgroundImage: `radial-gradient(circle, ${dark ? 'rgba(255,170,70,0.10)' : 'rgba(255,165,31,0.24)'} 0%, rgba(255,165,31,0) 62%)` },
          right,
        ]}
      />
    </View>
  );
}

/**
 * The frame around the armed tier: a band of the logo's ramp, turning slowly.
 *
 * React Native draws linear and radial gradients but not a conic one, so the
 * sweep is a square of linear gradient twice the card's size rotating behind a
 * card inset by two points — which, through a rounded two-point gap, is exactly
 * what a conic border looks like. One rotating view, on the UI thread.
 */
function Sweep({ radius }: { radius: number }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    turn.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduced, turn]);
  const spinning = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius + 2, overflow: 'hidden' }]}>
      <Animated.View
        style={[
          styles.sweep,
          {
            experimental_backgroundImage: `linear-gradient(90deg, ${colors.calories} 0%, ${colors.logoRamp} 30%, ${colors.protein} 50%, ${colors.logoRamp} 70%, ${colors.calories} 100%)`,
          },
          spinning,
        ]}
      />
    </View>
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
  const type = useType();
  const tr = useT();

  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      {/* The armed tier sits in a turning band of the logo's own colours. */}
      {selected && <Sweep radius={24} />}
      <Chunk
        depth={selected ? 7 : 3}
        color={selected ? colors.calories : undefined}
        style={styles.armed}
        contentStyle={[
          styles.tier,
          {
            // Selection is the band and the glow, not a fill — see the note in
            // `PlanWall` on what a green wash does over cream.
            backgroundColor: selected ? colors.card : colors.glassStrong,
            borderColor: selected ? 'transparent' : colors.glassEdge,
          },
        ]}
      >
        <View style={styles.tierHead}>
          <View style={styles.tierName}>
            {/* The dot, because a border and a slightly deeper ledge are a
                difference somebody has to look for. Which tier is armed decides
                what the button at the bottom buys, so it is worth a glyph. */}
            <Radio on={selected} />
            <Serif style={[type.serifTitle, styles.tierTitle, { color: colors.foreground }]}>{name}</Serif>
          </View>

          {current ? (
            <View style={[styles.tag, { backgroundColor: withAlpha(colors.primary, 0.2) }]}>
              <Text style={[t.footnoteBold, { color: colors.caloriesText }]}>
                {tr('plans.yourPlan')}
              </Text>
            </View>
          ) : (
            price && (
              <View style={styles.price}>
                <Text style={[type.serifFigure, styles.priceFigure, { color: colors.foreground }]}>{price}</Text>
                <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                  {period === 'year' ? tr('plans.aYear') : tr('plans.aMonth')}
                </Text>
              </View>
            )
          )}
        </View>

        <Text style={[t.footnote, { color: colors.mutedForeground }]}>{pitch}</Text>

        <View style={[styles.rule, { backgroundColor: colors.hairline }]} />

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
            {tr('plans.worksOutAt')(perMonth)}
          </Text>
        )}
      </Chunk>
    </Pressable>
  );
}

/** Which tier the button at the bottom would buy. */
function Radio({ on }: { on: boolean }) {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  return (
    <View
      style={[
        styles.radio,
        on
          ? {
              borderColor: 'transparent',
              experimental_backgroundImage: `linear-gradient(135deg, ${colors.calories}, ${colors.logoRamp})`,
              boxShadow: `0px 0px 10px ${colors.ring}`,
            }
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
  packs: { gap: 10, marginTop: 30 },
  // The heading and its line sit tighter to each other than to the rows they
  // introduce, so the pair reads as one block rather than as three.
  packHead: { gap: 3, marginBottom: 2 },
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 12,
  },
  packLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  packBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packText: { gap: 1, flexShrink: 1 },
  // A pill rather than bare text, because pressing the row is a purchase and
  // the price is the only thing on it that says so.
  packPrice: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  flex: { flex: 1 },
  centred: { textAlign: 'center' },
  page: { paddingHorizontal: 20, gap: 14 },
  mist: { position: 'absolute', width: 440, height: 440, borderRadius: 220 },
  cast: { alignSelf: 'center', marginTop: -4, marginBottom: 2 },
  sweep: { position: 'absolute', left: '-50%', top: '-120%', width: '200%', height: '340%' },
  armed: { margin: 2 },
  tierTitle: { fontSize: 24, lineHeight: 28 },
  priceFigure: { fontSize: 22, lineHeight: 26 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: { padding: 6, marginRight: -6 },
  lede: { marginTop: -6, paddingHorizontal: 12 },
  periods: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: 999,
    borderWidth: 1,
    gap: 2,
  },
  period: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    // Transparent rather than absent, so selecting one does not resize the row.
    borderColor: 'transparent',
  },
  tiers: { gap: 20, marginTop: 4 },
  tier: { borderWidth: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  tierHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tierName: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The cadence sits under the figure rather than beside it, so two cards'
  // prices line up on the same baseline whatever their currency is worth.
  price: { alignItems: 'flex-end' },
  rule: { height: 1, borderRadius: 999, marginTop: 2 },
  tierLines: { gap: 6, marginTop: 2 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  cta: { marginTop: 6 },
  notice: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12 },
  afters: { marginTop: 2 },
  restore: { alignItems: 'center', paddingVertical: 10 },
  restoreNote: { textAlign: 'center', marginTop: 3, paddingHorizontal: 24 },
  free: { gap: 7, marginTop: 10 },
  line: { flexDirection: 'row', gap: 8 },
  freeRow: { flexDirection: 'row', gap: 8 },
  // The tick sits on the first line's optical centre rather than its box centre,
  // which is what keeps a two-line item from hanging its mark in the gutter.
  check: { marginTop: 2 },
  lineText: { flexShrink: 1 },
  freeText: { flexShrink: 1 },
  smallPrint: { marginTop: 6 },
  legal: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 },
});
