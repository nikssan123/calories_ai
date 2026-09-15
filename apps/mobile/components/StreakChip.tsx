import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Glossy } from '@/components/icons/Glossy';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useIsFocused, useRouter } from 'expo-router';
import type { Streak } from '@ct/shared';
import { useT } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { font, type as t, useColors } from '@/theme';
import { Character } from '@/components/cast/Character';

/**
 * The logging run, under the ring that earns it.
 *
 * Deliberately small and deliberately not a card. This sits beneath a figure
 * somebody opens the app to read, and a streak that competed with the calorie
 * number for attention would be the tail wagging the dog — the run is a reason
 * to come back tomorrow, not the thing today is about.
 *
 * Nothing is drawn at all below the fourth day. A "1 day streak" is not an
 * achievement, it is a sentence about having opened the app, and putting it
 * under the ring on day one sets the expectation that this app keeps score of
 * everything. Let it appear once it means something.
 *
 * It is also the badge wall's door on the screen people actually open. The wall
 * lives off Progress and four of its fourteen badges are this exact run at 7,
 * 30, 100 and 365 days — so the flame is the honest place to ask "and what does
 * this get me". Nothing marks it as tappable beyond the press feedback, which
 * is deliberate: a chevron here would make a link out of something whose first
 * job is to be read.
 */
const WORTH_DRAWING = 4;

export function StreakChip({
  streak,
  figure = true,
}: {
  streak: Streak;
  /**
   * Ember hoping beside the nudge. Off on Today, where Ember is already on the
   * shelf a little below and does the hoping there — one of each on a screen
   * (CAST.md, fourth pass).
   */
  figure?: boolean;
}) {
  if (streak.state === 'none' || streak.current < WORTH_DRAWING) return null;

  /*
   * The at-risk case is the whole reason this component knows about `state`.
   * The run is intact and has nothing in it today — which is true for most of
   * every morning — so it is drawn in full and given the one line that says
   * what to do about it, rather than being hidden. (The flame dims; the words
   * and the count stay at full strength.)
   */
  const atRisk = streak.state === 'at_risk';

  return <Chip streak={streak} atRisk={atRisk} figure={figure} />;
}

/**
 * The chip itself, split out so the early return above stays ahead of the hooks.
 *
 * The flame is the app's own icon now, and it is alive when today is logged —
 * a slow flicker, drawn from its base — and still and dimmed while the run is
 * at risk. The dim flame says "log today to keep it" before the words do.
 */
function Chip({ streak, atRisk, figure }: { streak: Streak; atRisk: boolean; figure: boolean }) {
  const colors = useColors();
  const tr = useT();
  const router = useRouter();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const flicker = useSharedValue(0);

  useEffect(() => {
    if (reduced || atRisk || !focused) {
      cancelAnimation(flicker);
      flicker.value = 0;
      return;
    }
    flicker.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(flicker);
  }, [reduced, atRisk, focused, flicker]);

  const alive = useAnimatedStyle(() => ({
    transform: [
      { translateY: 9 },
      { scaleY: 1 + flicker.value * 0.1 },
      { scaleX: 1 - flicker.value * 0.05 },
      { translateY: -9 },
    ],
  }));

  return (
    <Pressable
      onPress={() => {
        haptics.selected();
        router.push('/achievements');
      }}
      accessibilityRole="button"
      accessibilityLabel={tr('streak.days')(streak.current)}
      accessibilityHint={tr('achievements.title')}
      hitSlop={8}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View
        style={[
          styles.row,
          styles.pill,
          {
            backgroundColor: colors.glassStrong,
            boxShadow: `0px 8px 20px -12px ${colors.protein}, inset 0px 1px 0px ${colors.glassEdge}`,
          },
        ]}
      >
        <Animated.View style={[{ opacity: atRisk ? 0.45 : 1 }, alive]}>
          <Glossy name="streak" size={18} />
        </Animated.View>
        {/* `streak.days` goes through `plural()`, which returns "21 days" —
            the count already formatted for the locale. Putting the number in
            front of it as well is how this first read "21 21 days". */}
        <Text style={[t.footnoteBold, t.tnum, { color: colors.foreground }]}>
          {tr('streak.days')(streak.current)}
        </Text>
        {/*
         * `best` only once it is genuinely behind them. Showing "best 7" beside
         * a live run of 7 is the app telling somebody their record is the thing
         * they are currently doing, which reads as a bug.
         */}
        {streak.best > streak.current && (
          <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
            {tr('streak.best')(streak.best)}
          </Text>
        )}
      </View>
      {atRisk && (
        <View style={styles.row}>
          {/* Ember, hands clasped, hoping. About showing up today, never about
              the number (CAST.md). No poke: the whole chip is a button. */}
          {figure && <Character name="ember" mood="hopeful" size={26} loop={false} shadow={false} poke={false} />}
          <Text style={[styles.nudge, { color: colors.mutedForeground }]}>{tr('streak.atRisk')}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  nudge: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
});
