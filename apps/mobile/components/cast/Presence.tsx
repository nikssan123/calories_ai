import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Meal } from '@ct/shared';
import { useIsFocused } from 'expo-router';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptics } from '@/lib/haptics';
import { Character, type CastName, type Mood, type Prop } from './Character';

/**
 * The cast where people actually look, not only at the edges of the app.
 *
 * The first version put them in empty states, the typing indicator and a moment
 * every seven days, so they disappeared the moment anybody used the app. These
 * are the places on the everyday path where a figure earns its room without
 * taking any from a number or a word: sitting on the macro card, standing in
 * for a meal's icon, and peeking over the newest card in the journal.
 */

/** From the top of a sitting figure's box to where it sits, in points. */
const SITTER = 44;
/** How far below the edge the legs hang. Inside the card's own top padding, never over a label. */
const OVERHANG = 10;

/**
 * The macro card, with the three sitting on its top edge, each above its own bar.
 *
 * Their mood never follows the bars. Ember sits over protein at 30% the same
 * way it sits there at 130%, because a figure that looked pleased at a full bar
 * would be grading somebody's eating (STREAKS.md §1).
 *
 * `inset` is the card's border plus its horizontal padding, so each figure lines
 * up with the column under it.
 */
export function CastShelf({
  inset,
  gap,
  style,
  children,
}: {
  inset: number;
  gap: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const room = SITTER - OVERHANG;
  return (
    <View style={[{ paddingTop: room }, style]}>
      {children}
      <View pointerEvents="box-none" style={[styles.shelf, { left: inset, right: inset, gap }]}>
        {(['ember', 'skye', 'plum'] as const).map((name, i) => (
          <View key={name} pointerEvents="box-none" style={styles.seat}>
            <Character name={name} mood="sit" size={SITTER} delay={i * 450} />
          </View>
        ))}
      </View>
    </View>
  );
}

const MEAL_CAST: Record<Meal, { name: CastName; prop: Prop }> = {
  breakfast: { name: 'ember', prop: 'mug' },
  lunch: { name: 'skye', prop: 'toast' },
  dinner: { name: 'plum', prop: 'bowl' },
  snack: { name: 'ember', prop: 'spoon' },
};

/**
 * A meal section's icon: one of them, holding the meal.
 *
 * Drawn a little bigger than the glossy icon it replaces and pulled into the
 * header by its margins, so the header keeps its height. It doesn't breathe (a
 * breath at this size is invisible and still costs a loop), but it blinks,
 * fidgets and answers a poke.
 */
export function MealCast({ meal }: { meal: Meal }) {
  const { name, prop } = MEAL_CAST[meal];
  return <CastIcon name={name} mood="hold" prop={prop} />;
}

/**
 * One of them in a section header's icon slot, at the glossy icon's scale.
 *
 * Pulled into the header by its margins so the header keeps its height, and
 * without a breathing loop, since a breath at this size is invisible and still
 * costs a loop. It still blinks, fidgets and answers a poke.
 */
export function CastIcon({ name, mood, prop }: { name: CastName; mood: Mood; prop?: Prop }) {
  return <Character name={name} mood={mood} prop={prop} size={34} loop={false} shadow={false} style={styles.icon} />;
}

/**
 * A figure looking over the top edge of a translucent card: an onboarding
 * option once it's picked.
 *
 * A glass card lets through whatever is behind it, so the figure can't simply
 * stand behind the card the way `CardPeek` does. It stands in a box that ends
 * exactly at the card's top edge and clips everything below it instead. Picking
 * the option springs it up into view, and unpicking sinks it back out of sight.
 */
export function EdgePeek({ shown, name = 'skye' }: { shown: boolean; name?: CastName }) {
  const reduced = useReducedMotion();
  const up = useSharedValue(shown ? 1 : 0);

  useEffect(() => {
    up.value = reduced ? (shown ? 1 : 0) : withSpring(shown ? 1 : 0, { damping: 12, stiffness: 190 });
  }, [shown, reduced, up]);

  const rise = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - up.value) * EDGE_PEEK }],
  }));

  return (
    <View pointerEvents="none" style={styles.edge}>
      <Animated.View collapsable={false} style={rise}>
        <Character name={name} mood={shown ? 'wave' : 'idle'} size={EDGE_PEEK} shadow={false} poke={false} fidget={shown} />
      </Animated.View>
    </View>
  );
}

/** The side of an `EdgePeek` figure, and so the height of the box it's clipped to. */
const EDGE_PEEK = 34;

/** Whoever the meal is mostly made of, by calories. Never by the day's total. */
function dominant(card: { protein_g: number; carbs_g: number; fat_g: number }): CastName {
  const protein = card.protein_g * 4;
  const carbs = card.carbs_g * 4;
  const fat = card.fat_g * 9;
  if (fat > protein && fat > carbs) return 'plum';
  if (carbs > protein) return 'skye';
  return 'ember';
}

/** The figure's size, and how much of it shows above the card at rest. */
const PEEK = 40;
const PEEK_TOP = -31;

/**
 * One of them peeking over the newest food card, and catching it as it lands.
 *
 * Who is decided by what the meal is mostly made of. When the card has just
 * arrived (`landing`), they pop up over its edge, cheer once with a light tap,
 * and sink back to the top of a head. Read back from history, they are simply
 * already peeking.
 *
 * Every food card is wrapped, and only the newest is `active`. The tree stays
 * the same shape when that moves to a newer card, so the older card isn't
 * remounted: no second entrance, no lost edit.
 *
 * A meal is caught once. `CAUGHT` remembers it for the session, so deleting a
 * newer meal (which hands the peek back to this one) never sets off a cheer.
 *
 * The figure is drawn behind the card, so the card's own surface is what hides
 * the rest of them. The row gets `PEEK_ROOM` above the card, so the head sits in
 * its own gap and never over the words above it.
 */
export const PEEK_ROOM = 24;

const CAUGHT = new Set<string>();

export function CardPeek({
  card,
  entryId,
  active,
  landing,
  children,
}: {
  card: { protein_g: number; carbs_g: number; fat_g: number };
  entryId: string;
  active: boolean;
  landing: boolean;
  children: React.ReactNode;
}) {
  // A plain view either way, so the card inside is never remounted. Everything
  // that animates lives in `Peeker`, which only the active card mounts.
  return (
    <View style={active ? styles.peekRow : null}>
      {active && <Peeker card={card} entryId={entryId} landing={landing} />}
      {children}
    </View>
  );
}

function Peeker({
  card,
  entryId,
  landing,
}: {
  card: { protein_g: number; carbs_g: number; fat_g: number };
  entryId: string;
  landing: boolean;
}) {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const who = dominant(card);
  const catching = useRef(landing && !CAUGHT.has(entryId));
  // 1 = hidden behind the card, 0 = peeking, -1 = popped up over it.
  const rise = useSharedValue(catching.current ? 1 : 0);
  const [cheering, setCheering] = useState(false);
  const [hidden, setHidden] = useState(catching.current);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Read inside timers, where the values from the first render would be stale.
  const now = useRef({ reduced, focused });
  now.current = { reduced, focused };

  const popUp = (cheer: boolean) => {
    timers.current.forEach(clearTimeout);
    const still = now.current.reduced;
    setHidden(false);
    rise.value = still ? -1 : withSpring(-1, { damping: 9, stiffness: 180 });
    if (cheer) setCheering(true);
    timers.current = [
      setTimeout(
        () => {
          setCheering(false);
          rise.value = still ? 0 : withTiming(0, { duration: 420, easing: Easing.inOut(Easing.quad) });
        },
        cheer ? 1900 : 900,
      ),
    ];
  };

  useEffect(() => {
    if (catching.current) {
      CAUGHT.add(entryId);
      // After the card has landed, so it is opaque by the time anybody is behind it.
      const timer = setTimeout(() => {
        if (now.current.focused) {
          haptics.press();
          popUp(true);
        } else {
          // Landed while somebody was on another tab: no buzz for an animation nobody saw.
          setHidden(false);
          rise.value = 0;
        }
      }, 600);
      timers.current.push(timer);
    }
    return () => timers.current.forEach(clearTimeout);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lift = useAnimatedStyle(() => ({
    opacity: rise.value > 0.95 ? 0 : 1,
    transform: [{ translateY: rise.value > 0 ? rise.value * 32 : rise.value * 12 }],
  }));

  return (
    <Animated.View collapsable={false} pointerEvents="box-none" style={[styles.peek, lift]}>
      <Character
        name={who}
        mood={cheering ? 'cheer' : 'idle'}
        size={PEEK}
        shadow={false}
        fidget={!hidden}
        onPoke={() => popUp(false)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shelf: { position: 'absolute', top: 0, flexDirection: 'row' },
  seat: { flex: 1, alignItems: 'flex-end', paddingRight: 10 },
  icon: { marginVertical: -10, marginLeft: -6, marginRight: -4 },
  // Its bottom is the card's top edge. The figure's feet sit a little below its
  // box, so the clip lands at the waist and it reads as looking over the top.
  edge: { position: 'absolute', right: 20, top: -EDGE_PEEK * 0.72, width: EDGE_PEEK, height: EDGE_PEEK * 0.72, overflow: 'hidden' },
  peekRow: { marginTop: PEEK_ROOM },
  peek: { position: 'absolute', right: 22, top: PEEK_TOP },
});
