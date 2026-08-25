import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import type { PlanName } from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { useEntitlements } from '@/lib/entitlements';
import { carriesFrom, TIER_NAMES, TIER_PITCHES, tierLines } from '@/lib/plan-copy';
import { haptics } from '@/lib/haptics';
import { type as t, useColors, withAlpha } from '@/theme';
import { useLocale, useT } from '@/lib/i18n';

/**
 * What somebody sees immediately after paying.
 *
 * This replaced a toast, and the reason is the case the toast was worst at.
 * `purchase()` resolves in one of two ways — the server agreed inside ten
 * seconds, or it has not agreed *yet* — and the second one is a receipt in the
 * store, no plan on the account, and a sentence that disappears after three
 * seconds. Somebody who has just been charged and can no longer find what they
 * were told has every reason to assume it failed, and the next thing they do is
 * buy it again or ask for their money back. A screen stays put and can go on
 * watching, which is the whole argument for it.
 *
 * So there are two states here and one screen: `pending` while the entitlement
 * is in flight, `landed` once the server names the tier. The screen upgrades
 * itself in place when the webhook arrives — no navigation, no second toast —
 * because the two are the same event a few seconds apart and drawing them as
 * two destinations would be inventing a step nobody took.
 *
 * The contents are `tierLines`, which is what the wall used to sell it. Saying
 * it again on the far side of the payment is deliberate: a purchase is the
 * moment somebody most wants to be told they chose right, and repeating the
 * list they just read costs nothing next to the alternative of a screen that
 * only says thank you. It is also generated from the server's own ceilings, so
 * it cannot promise something the account does not actually have.
 */
export default function PurchasedScreen() {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { plan, tiers, refresh } = useEntitlements();

  /*
   * The tier that was bought, from the caller rather than from `plan`.
   *
   * `plan` is what the server currently says, which on arrival here is still
   * the *old* tier whenever the webhook is in flight — so reading the headline
   * off it would greet somebody who has just bought Coach with "You're on
   * Free". The param is what the store took money for; `plan` is only ever
   * consulted to decide whether it has landed.
   */
  const { plan: boughtParam } = useLocalSearchParams<{ plan?: string }>();
  /* The param is the answer; the fallback is for any caller that arrives
     without one — a restore, which knows a plan landed but not which. */
  const bought =
    (boughtParam as PlanName | undefined) ?? (plan !== 'free' ? plan : null);
  const landed = bought !== null && plan === bought;

  /*
   * Keep asking, slower than `awaitPlan` did and for much longer.
   *
   * That poll runs while a spinner is on screen, so it is a ten-second ceiling
   * on somebody's patience. This one runs behind a screen that has already said
   * something reassuring, which makes a slower cadence free — and the thing it
   * is waiting for is a webhook that is either seconds away or lost, with
   * nothing in between worth optimising for.
   */
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (landed) return;
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (tries >= 20) {
        setWaited(true);
        return;
      }
      tries += 1;
      // A failed read is a reason to try again, not to conclude anything.
      try {
        await refresh();
      } catch {}
      if (alive) timer = setTimeout(() => void tick(), 3000);
    };
    timer = setTimeout(() => void tick(), 3000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [landed, refresh]);

  /* The buzz belongs to the plan arriving, not to the screen mounting — those
     are the same instant on a fast webhook and half a minute apart on a slow
     one, and it is the arrival that is worth feeling. */
  const buzzed = useRef(false);
  useEffect(() => {
    if (landed && !buzzed.current) {
      buzzed.current = true;
      haptics.logged();
    }
  }, [landed]);

  const tier = tiers.find((candidate) => candidate.plan === bought) ?? null;
  const paid = tiers.filter((candidate) => candidate.plan !== 'free');
  const below = tier ? paid[paid.indexOf(tier) - 1] : undefined;

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <Mark landed={landed} />

      <Text style={[t.largeTitle, styles.title, { color: colors.foreground }]}>
        {landed && bought
          ? tr('plans.youreOnPlan')(TIER_NAMES[bought])
          : tr('plans.paymentReceived')}
      </Text>

      <Text style={[t.body, styles.lede, { color: colors.mutedForeground }]}>
        {landed && bought
          ? tr(TIER_PITCHES[bought])
          : waited
            ? // Deliberately not an apology and not an instruction. There is
              // nothing for them to do, `expirePlans` is not involved, and the
              // honest shape of this is "it is coming, you are not out of pocket".
              tr('plans.pendingLong')
            : tr('plans.pendingShort')}
      </Text>

      {landed && tier && (
        <Chunk
          depth={5}
          contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>
            {tr('plans.whatThatOpens')}
          </Text>

          <View style={styles.lines}>
            {(() => {
              const carries = carriesFrom(below, tr);
              return [
                ...(carries ? [carries] : []),
                ...tierLines(tier, tr, locale, below),
              ].map((line) => (
                <View key={line} style={styles.line}>
                  <Check color={colors.primary} />
                  <Text style={[t.footnote, styles.lineText, { color: colors.foreground }]}>
                    {line}
                  </Text>
                </View>
              ));
            })()}
          </View>
        </Chunk>
      )}

      <PressableChunk
        color={colors.caloriesDeep}
        radius={999}
        onPress={() => router.back()}
        accessibilityRole="button"
        contentStyle={[styles.cta, { backgroundColor: colors.primary }]}
      >
        <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
          {landed ? tr('plans.startLogging') : tr('plans.backToJournal')}
        </Text>
      </PressableChunk>

      <Text style={[t.footnote, styles.fine, { color: colors.mutedForeground }]}>
        {tr('plans.manageOnStore')}
      </Text>
    </ScrollView>
  );
}

/**
 * The tick, or the clock that precedes it.
 *
 * Two glyphs rather than a spinner that becomes a tick: a spinner says "working"
 * and the app is not working — it is waiting on somebody else's webhook, and the
 * quiet dial is the more honest picture of that.
 */
function Mark({ landed }: { landed: boolean }) {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  return (
    <View style={[styles.mark, { backgroundColor: withAlpha(colors.primary, 0.2) }]}>
      <Svg width={40} height={40} viewBox="0 0 24 24">
        {landed ? (
          <Path
            d="M20 6 9 17l-5-5"
            stroke={colors.primary}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : (
          <>
            <Circle
              cx={12}
              cy={12}
              r={9}
              stroke={colors.primary}
              strokeWidth={2.4}
              fill="none"
              opacity={0.5}
            />
            <Path
              d="M12 7v5l3.5 2"
              stroke={colors.primary}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        )}
      </Svg>
    </View>
  );
}

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
  page: { paddingHorizontal: 20, gap: 16 },
  mark: {
    width: 72,
    height: 72,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 4 },
  lede: { marginTop: -8 },
  card: { padding: 16, borderWidth: 2, borderRadius: 20, gap: 12 },
  lines: { gap: 10 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check: { marginTop: 3 },
  lineText: { flex: 1 },
  cta: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  fine: { textAlign: 'center' },
});
