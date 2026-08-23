import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { duration, ease, RADIUS, useColors, withAlpha } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * `@keyframes entry-touched`: a one-shot green ring on an entry the agent has
 * just corrected.
 *
 * The web spells it as a `box-shadow` animated from `color-mix(in oklch,
 * var(--calories), transparent 15%)` out to fully transparent over 1500ms. RN
 * cannot animate box-shadow at all — not slowly, not badly, at all — so the
 * ring is a real `View` laid over the card with an animated opacity, which is
 * the same picture reached the other way round. The inset and the 3px width are
 * the shadow's spread, and the extra radius keeps the ring concentric with the
 * corner it is drawn around rather than pinching it.
 *
 * `pointerEvents="none"` because it is a mark on a card, not a lid over one:
 * the card underneath stays as tappable during the ring as it was before it.
 *
 * What it says, and what it does not. It fires on a `food_updated` action —
 * "there was more rice" — and it is the only thing that tells a correction
 * apart from a fresh log, since both arrive as a card with a number on it.
 * What it does *not* do is reach back up the conversation and restate the
 * earlier card for the same entry, which still shows what that meal was worth
 * before the correction. That is deliberate and it is the web's behaviour too:
 * the actions are stored with the message they belong to, so a card rewritten
 * here would disagree with the same conversation reopened tomorrow. A log that
 * says what was true at each point is worth more than one that quietly agrees
 * with itself.
 */
export function Touched({
  active,
  radius = RADIUS,
  style,
  children,
}: {
  /** Read once, when this mounts. The ring is an event, not a state. */
  active?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();

  /*
   * Nothing at all under reduced motion, rather than a ring that fades more
   * slowly or one that stays.
   *
   * The web kills this from a single `prefers-reduced-motion` block, and the
   * honest port of "no animation" for a mark whose entire content is its
   * disappearance is to leave it out. A permanent green ring would be a new
   * piece of state that nobody asked for and nothing clears.
   */
  if (!active || reduced) return <>{children}</>;

  return (
    <View style={style}>
      {children}
      <Ring radius={radius} />
    </View>
  );
}

function Ring({ radius }: { radius: number }) {
  const colors = useColors();
  const fade = useSharedValue(1);

  useEffect(() => {
    /*
     * Held until the card has finished arriving.
     *
     * These cards land with `@keyframes land` — a drop and a bounce — and the
     * ring is drawn by this wrapper rather than inside the animated surface, so
     * starting them together would pulse a ring around where the card is about
     * to be. Waiting one spring also puts the two sentences in the right order:
     * here is the meal, and *that one was a correction*.
     */
    fade.value = withDelay(
      duration.spring,
      withTiming(0, { duration: 1500, easing: ease.out }),
    );
  }, [fade]);

  const animated = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          borderRadius: radius + SPREAD,
          // `transparent 15%` — the ring never starts fully opaque on the web
          // either, and at full strength it reads as a selection rather than as
          // an acknowledgement.
          borderColor: withAlpha(colors.calories, 0.85),
        },
        animated,
      ]}
    />
  );
}

/** `0 0 0 3px`: the shadow's spread, which is the ring's width and its inset. */
const SPREAD = 3;

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: -SPREAD,
    left: -SPREAD,
    right: -SPREAD,
    bottom: -SPREAD,
    borderWidth: SPREAD,
  },
});
