import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Allowance, MeterName } from '@ct/shared';
import { meterLocked, meterRemaining } from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { useEntitlements } from '@/lib/entitlements';
import { remainingLine, TIER_NAMES, tierFor, wallBody, wallTitle } from '@/lib/plan-copy';
import { duration, ease, type as t, useColors, withAlpha, type Palette } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * What a limit looks like when it is a price rather than a fault.
 *
 * The whole design problem here is that the app has to ask for money at the
 * exact moment somebody was trying to do something, which is the least welcome
 * moment there is. Three decisions fall out of that:
 *
 * **It is a card, not a dialog.** Nothing is dismissed, nothing is covered, the
 * conversation is not interrupted — the wall lands in the transcript where the
 * reply would have been and scrolls away with it. A modal would make the limit
 * an event; this makes it a message.
 *
 * **It is green, not red.** The palette has a `destructive` and this
 * deliberately does not use it. Running out of a metered allowance is the plan
 * working, and dressing it as a failure teaches people the app is broken.
 *
 * **The free door goes first.** The primary button is always the thing that
 * costs nothing — typing the meal in — and the upgrade is the quiet one beside
 * it. That ordering is not modesty: `plans.ts` sizes the free tier on the
 * argument that the wall stopped being an exit, and a wall whose only button is
 * a checkout puts the exit straight back.
 */
export function PlanWall({
  allowance,
  /** The server's own sentence, used when no allowance came back with the 402. */
  message,
  /** The free way out. Absent on walls that have none — the kitchen's. */
  onLogManually,
  style,
}: {
  allowance: Allowance | null;
  message?: string;
  onLogManually?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const router = useRouter();
  const { plan, tiers } = useEntitlements();

  const title = allowance ? wallTitle(allowance) : (message ?? 'Your plan is spent');
  const body = allowance ? wallBody(allowance) : undefined;
  /*
   * Which tier answers this. Without an allowance — a 402 from something that
   * does not send one — it falls back to the cheapest tier above the one they
   * are on rather than to Plus: hardcoding Plus offers a Coach account an
   * upgrade to something it already has.
   */
  const next = allowance
    ? tierFor(allowance.meter, tiers, plan)
    : (tiers.find((tier) => tier.plan !== 'free' && tier.plan !== plan)?.plan ?? null);

  return (
    <Land style={style}>
      <Chunk
        contentStyle={[
          styles.card,
          {
            /*
             * The card surface, with the accent spent entirely on the border.
             *
             * A tinted *fill* was the obvious move and it is wrong here: the
             * ground is cream, so nine per cent of a green over it comes out
             * olive — a colour that is in neither palette, next to a vivid green
             * user bubble that shows up exactly how muddy it is. The border
             * carries the same signal at full chroma and leaves the card
             * reading like every other card in the conversation, which is what
             * it should read like. It is a message, not an alert.
             */
            backgroundColor: colors.card,
            borderColor: withAlpha(colors.primary, 0.55),
          },
        ]}
      >
        <View style={styles.head}>
          <Badge colors={colors} />
          <Text style={[t.title2, styles.title, { color: colors.foreground }]}>{title}</Text>
        </View>

        {body && (
          <Text style={[t.body, { color: colors.mutedForeground }]}>{body}</Text>
        )}

        <View style={styles.actions}>
          {onLogManually && (
            <PressableChunk
              color={colors.caloriesDeep}
              radius={999}
              onPress={onLogManually}
              accessibilityRole="button"
              contentStyle={[styles.button, { backgroundColor: colors.primary }]}
            >
              <PencilGlyph color={colors.primaryForeground} />
              <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
                Log this one myself
              </Text>
            </PressableChunk>
          )}

          {next && (
            <PressableChunk
              depth={3}
              radius={999}
              onPress={() => router.push('/upgrade')}
              accessibilityRole="button"
              contentStyle={[
                styles.button,
                { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border },
              ]}
            >
              <Text style={[t.bodySemibold, { color: colors.foreground }]}>
                {/* Names the tier, because "Upgrade" does not say what for and
                    the tier that answers this meter is not always the top one. */}
                See what {TIER_NAMES[next]} adds
              </Text>
            </PressableChunk>
          )}
        </View>
      </Chunk>
    </Land>
  );
}

/**
 * A whole feature that is not on this plan, drawn where the feature would be.
 *
 * The difference from `PlanWall` is when it appears: this one is on screen
 * *before* anything is pressed. A locked feature that looks unlocked until the
 * button fails is the worst of both — it wastes a tap and it teaches people
 * that buttons in this app sometimes do not work — and it is exactly what the
 * Cook tab did on the free tier, because `used >= allowed` against a null
 * `allowed` is false. See `meterSpent`.
 */
export function LockedPanel({
  title,
  body,
  meter,
  style,
}: {
  title: string;
  body: string;
  /** Which meter this feature spends, so the right tier is named. */
  meter: MeterName;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const router = useRouter();
  const { plan, tiers } = useEntitlements();
  const next = tierFor(meter, tiers, plan);

  return (
    <Chunk
      style={style}
      contentStyle={[
        styles.card,
        { backgroundColor: colors.card, borderColor: withAlpha(colors.primary, 0.55) },
      ]}
    >
      <View style={styles.head}>
        <Badge colors={colors} icon="lock" />
        <Text style={[t.title2, styles.title, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Text style={[t.body, { color: colors.mutedForeground }]}>{body}</Text>
      {next && (
        <PressableChunk
          color={colors.caloriesDeep}
          radius={999}
          onPress={() => router.push('/upgrade')}
          accessibilityRole="button"
          /* Not `actions`: that one is a *container*, and its `gap` lands
             between a chunk's surface and its `Overhang` — which stretches the
             ledge to 14px and reads as a button dropped in mud. */
          style={styles.loneAction}
          contentStyle={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
            See what {TIER_NAMES[next]} adds
          </Text>
        </PressableChunk>
      )}
    </Chunk>
  );
}

/**
 * The quiet one: a count, while there is still a count to give.
 *
 * This is the piece that decides whether the wall is experienced as a trap or
 * as a plan. A ceiling nobody can see is only ever discovered by hitting it —
 * which is the complaint `usage.ts` makes about the client having no way to
 * ask — and by then the app has already refused to do something. Three turns of
 * warning costs a line of small text and turns the same limit into a decision
 * somebody gets to make while nothing is going wrong.
 *
 * Everything about it is calibrated to not be an advert. It appears only inside
 * `SHOW_FROM`, it says a number and a noun, it has no verb, and it is dismissed
 * for the session by tapping it away. Tapping the count itself opens the wall.
 */
const SHOW_FROM = 3;

export function MeterChip({
  meter,
  onDismiss,
  style,
}: {
  meter: MeterName;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const router = useRouter();
  const { allowances } = useEntitlements();
  const allowance = allowances?.[meter] ?? null;

  // Nothing to say while it is unknown, unmetered, comfortable, or already
  // spent — the last because a spent meter has the wall, and a chip repeating
  // the wall's news underneath it is the nagging this component avoids.
  // `meterLocked` covers the unmetered account too: its ceiling is null because
  // there is no bill behind it, and counting down from infinity is not a thing.
  if (!allowance || meterLocked(allowance) || allowance.unlimited) return null;
  const left = meterRemaining(allowance);
  if (left === 0 || left > SHOW_FROM) return null;

  return (
    <View style={[styles.chipRow, style]}>
      <Pressable
        onPress={() => router.push('/upgrade')}
        accessibilityRole="button"
        accessibilityLabel={`${remainingLine(allowance, left)}. See the plans.`}
        hitSlop={6}
        style={({ pressed }) => [styles.chip, { opacity: pressed ? 0.55 : 1 }]}
      >
        <View style={[styles.chipDot, { backgroundColor: colors.primary }]} />
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
          {remainingLine(allowance, left)}
        </Text>
      </Pressable>
      {onDismiss && (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Hide"
          hitSlop={10}
          style={({ pressed }) => [styles.chipClose, { opacity: pressed ? 0.4 : 0.7 }]}
        >
          <Svg width={11} height={11} viewBox="0 0 24 24">
            <Path
              d="M18 6 6 18M6 6l12 12"
              stroke={colors.mutedForeground}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Pressable>
      )}
    </View>
  );
}

/** The round mark. Lucide's `sparkles` and `lock`, on lucide's 24-unit grid. */
function Badge({ colors, icon = 'sparkles' }: { colors: Palette; icon?: 'sparkles' | 'lock' }) {
  const stroke = {
    stroke: colors.caloriesText,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(colors.primary, 0.22) }]}>
      <Svg width={17} height={17} viewBox="0 0 24 24">
        {icon === 'sparkles' ? (
          <>
            <Path
              d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"
              {...stroke}
            />
            <Path d="M5 3v4M3 5h4M19 17v4M17 19h4" {...stroke} />
          </>
        ) : (
          <>
            <Rect x={3} y={11} width={18} height={11} rx={2} {...stroke} />
            <Path d="M7 11V7a5 5 0 0 1 10 0v4" {...stroke} />
          </>
        )}
      </Svg>
    </View>
  );
}

/** Lucide's `pen-line`. */
export function PencilGlyph({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 20h9M16.4 3.6a1 1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-2.9.9a.5.5 0 0 1-.6-.6l.8-2.9a2 2 0 0 1 .5-.9z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * The same arrival every card in the conversation uses.
 *
 * Copied from `ChatCard`'s `Land` rather than shared out of it, because the two
 * are the same three lines and lifting them into a component would put a
 * dependency between the wall and the card gallery for a `withTiming`. If a
 * third caller appears, that is the moment to move it.
 */
function Land({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration: duration.spring, easing: ease.spring });
  }, [reduced, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value / 0.6),
    transform: [
      { translateY: -14 * (1 - progress.value) },
      { scale: 0.94 + 0.06 * progress.value },
    ],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // `flexShrink` rather than `flex: 1`: the title wraps to as many lines as it
  // needs beside a badge that never shrinks.
  title: { flexShrink: 1 },
  badge: { width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 10, marginTop: 4 },
  loneAction: { marginTop: 4 },
  button: {
    height: 46,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  chipDot: { width: 6, height: 6, borderRadius: 999 },
  chipClose: { padding: 4 },
});
