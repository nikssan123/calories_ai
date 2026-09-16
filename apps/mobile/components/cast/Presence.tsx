import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useIsFocused } from 'expo-router';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptics } from '@/lib/haptics';
import { Character, GAIT, STAGGER, type CastName, type Cue, type Mood } from './Character';
import { castMemory, Seat, useLanding, useSeated } from './stage';
import { useTheme } from '@/theme';
import Svg, { Ellipse, G } from 'react-native-svg';
import { drawing } from './figure';

/**
 * The cast where people actually look, not only at the edges of the app.
 *
 * The first version put them in empty states, the typing indicator and a moment
 * every seven days, so they disappeared the moment anybody used the app. These
 * are the places on the everyday path where a figure earns its room without
 * taking any from a number or a word: sitting on Today's macro card, sitting on
 * the journal's composer, and peeking over the newest card in the journal.
 *
 * **One of each, per screen** (CAST.md, fourth pass). These are seats on the
 * stage (`stage.tsx`), so a character is in one of them at a time and travels
 * between them. The meal sections on Today used to hold a character each as well,
 * which put three Embers on a full day; they have their glossy icons back.
 */

const NAMES: CastName[] = ['ember', 'skye', 'plum'];

/** From the top of a sitting figure's box to where it sits, in points. */
const SITTER = 44;
/** How far below the edge the legs hang. Inside the card's own top padding, never over a label. */
const OVERHANG = 10;

/**
 * Today's macro card, with the three sitting on its top edge, each above its own bar.
 *
 * Their mood never follows the bars. Ember sits over protein at 30% the same
 * way it sits there at 130%, because a figure that looked pleased at a full bar
 * would be grading somebody's eating (STREAKS.md §1). What they *do* answer is
 * showing up: Ember hopes when the run needs a meal today, Plum sleeps after
 * midnight, and whoever caught the last meal in the journal cheers it once when
 * Today opens.
 *
 * `inset` is the card's border plus its horizontal padding, so each figure lines
 * up with the column under it.
 */
export function CastShelf({
  inset,
  gap,
  moods,
  cues: outside,
  style,
  children,
}: {
  inset: number;
  gap: number;
  /** A resting mood other than sitting, drawn with the legs still over the edge. */
  moods?: Partial<Record<CastName, Mood>>;
  /** Passing moods asked for by Today: a streak milestone. */
  cues?: Partial<Record<CastName, Cue>>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const room = SITTER - OVERHANG;
  const focused = useIsFocused();
  const [cue, setCue] = useState<{ name: CastName; cue: Cue } | null>(null);

  /*
   * The meal the journal caught, cheered once on Today. On landing if they flew
   * here; a beat after Today opens if they were already sitting.
   */
  const greet = (name: CastName) => {
    const caught = castMemory.lastCatch;
    if (!caught || caught.name !== name || castMemory.greeted === caught.entryId) return;
    castMemory.greeted = caught.entryId;
    setCue({ name, cue: { mood: 'cheer', ms: 1300, key: Date.now() } });
  };
  useLanding((seat, name) => {
    if (seat === 'day.shelf') greet(name);
  });
  useEffect(() => {
    if (!focused) return;
    const timer = setTimeout(() => {
      const caught = castMemory.lastCatch;
      if (caught) greet(caught.name);
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  return (
    <View style={[{ paddingTop: room }, style]}>
      {children}
      <View pointerEvents="box-none" style={[styles.shelf, { left: inset, right: inset, gap }]}>
        {NAMES.map((name, i) => {
          const mood = moods?.[name] ?? 'sit';
          return (
            <View key={name} pointerEvents="box-none" style={styles.seat}>
              <Seat
                seat="day.shelf"
                name={name}
                screen="today"
                size={SITTER}
                entrance="drop"
                ground={<ContactShadow style={styles.shelfContact} />}
              >
                <Character
                  name={name}
                  mood={mood}
                  sitting
                  size={SITTER}
                  delay={i * 450}
                  arrive={false}
                  cue={latest(cue?.name === name ? cue.cue : null, outside?.[name] ?? null)}
                />
              </Seat>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Whichever of two cues was asked for last. */
const latest = (a: Cue | null, b: Cue | null): Cue | null => (!a ? b : !b ? a : a.key > b.key ? a : b);

/** The journal ledge's figures, a little smaller than the shelf's: the composer is a single line. */
export const LEDGE_SITTER = 30;
/** How far their legs hang past the strip, down over the composer's top edge. */
export const LEDGE_OVERHANG = 15;

/** What the ledge's figures are doing, beyond sitting. See `CastLedge`. */
export interface LedgeState {
  /** Somebody is typing: they lean in toward the field. */
  typing: boolean;
  /** A turn is out and nothing has come back: they bounce where they sit. */
  waiting: boolean;
  /** The reply is arriving above them: they look up at it. */
  streaming: boolean;
  night: boolean;
  /** After dinner: Plum sits with a mug, as in the kitchen scene. */
  evening: boolean;
  /** The profile's birthday: Skye holds a slice of cake all day. */
  birthday: boolean;
  /** Who has dozed off with the phone left on the counter. */
  dozing: readonly CastName[];
}

/** How far each leans against a scroll: Skye sways, Plum barely moves. */
const LEAN: Record<CastName, number> = { ember: 10, skye: 15, plum: 4 };

/**
 * Memoised: the journal re-renders on every word of a streamed reply, and three
 * drawings redrawn per token is work nobody sees.
 *
 * The journal's home seat: the three sitting on the composer, over the right
 * end of the field, where the conversation ends and the next sentence starts
 * (CAST.md, fourth pass). What they do there, in order of precedence:
 * - **bounce** while a turn is out and silent — they are the typing indicator;
 * - **doze** once the phone has been left alone a while, Plum first;
 * - **sleep** after dark (Plum, who keeps late hours);
 * - **hold** a slice of cake on a birthday (Skye) or a mug after dinner (Plum);
 * - otherwise **sit**, leaning in toward the field while somebody types and
 *   looking up while a reply arrives.
 *
 * `cues` play passing moods on top — perking up at a word being typed, the
 * morning stretch. `lean` tilts each of them against a scroll, on their own spring.
 */
export const CastLedge = memo(function CastLedge({
  state,
  cues,
  lean,
  right,
}: {
  state: LedgeState;
  cues: Partial<Record<CastName, Cue>>;
  lean: SharedValue<number>;
  right: number;
}) {
  const { typing, waiting, streaming, night, evening, birthday, dozing } = state;
  return (
    <View pointerEvents="box-none" style={styles.ledge}>
      <View pointerEvents="box-none" style={[styles.ledgeRow, { right }]}>
        {NAMES.map((name, i) => {
          const asleep = dozing.includes(name);
          const sleepy = asleep || (night && name === 'plum');
          const holding = birthday && name === 'skye' ? 'cake' : evening && name === 'plum' ? 'mug' : undefined;
          const mood: Mood = waiting ? 'hop' : sleepy ? 'sleepy' : holding ? 'hold' : 'sit';
          return (
            <Seat
              key={name}
              seat="journal.ledge"
              name={name}
              screen="index"
              size={LEDGE_SITTER}
              entrance="bound"
              // A soft shadow on the field's top edge. Without it the edge — a
              // bright line against the cream — ran straight into their bodies
              // and read as them being cut off there.
              ground={<ContactShadow />}
            >
              <Leaning lean={lean} name={name}>
                <Character
                  name={name}
                  mood={mood}
                  prop={mood === 'hold' ? holding : undefined}
                  sitting
                  size={LEDGE_SITTER}
                  delay={waiting ? STAGGER[name] : i * 380}
                  // No breath at this size: a pixel, and still a loop apiece on the
                  // screen people keep open. The bounce is the point, and a night
                  // sleeper keeps its slow breath and Zs; a figure dozing because the
                  // phone was left alone holds still, which is also the battery saver.
                  loop={waiting || (sleepy && !asleep)}
                  fidget={!waiting && !asleep}
                  shadow={false}
                  arrive={false}
                  gaze={typing ? -1 : undefined}
                  gazeUp={streaming && !waiting}
                  cue={cues[name] ?? null}
                />
              </Leaning>
            </Seat>
          );
        })}
      </View>
    </View>
  );
});

/** The shadow a sitting figure casts on the edge under it. A seat's `ground`. */
function ContactShadow({ style }: { style?: StyleProp<ViewStyle> }) {
  const { scheme } = useTheme();
  const ink = scheme === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(110, 70, 30, 0.38)';
  return (
    <View
      pointerEvents="none"
      style={[
        styles.contact,
        style,
        {
          experimental_backgroundImage: `radial-gradient(closest-side, ${ink} 0%, rgba(0, 0, 0, 0) 100%)`,
        },
      ]}
    />
  );
}

/** A ledge figure tilted against the scroll, from its seat. */
function Leaning({ lean, name, children }: { lean: SharedValue<number>; name: CastName; children: React.ReactNode }) {
  const factor = LEAN[name];
  const tilt = useAnimatedStyle(() => ({ transform: [{ rotate: `${lean.value * factor}deg` }] }));
  return (
    <Animated.View collapsable={false} pointerEvents="box-none" style={[styles.fill, { transformOrigin: 'bottom' }, tilt]}>
      {children}
    </Animated.View>
  );
}


/**
 * One of them in a section header's icon slot, at the glossy icon's scale.
 *
 * Pulled into the header by its margins so the header keeps its height, and
 * without a breathing loop, since a breath at this size is invisible and still
 * costs a loop. It still blinks, fidgets and answers a poke.
 */
export function CastIcon({ name, mood, prop }: { name: CastName; mood: Mood; prop?: Parameters<typeof Character>[0]['prop'] }) {
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
    up.value = reduced ? (shown ? 1 : 0) : withSpring(shown ? 1 : 0, GAIT[name].spring);
  }, [shown, reduced, up, name]);

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
export function dominant(card: { protein_g: number; carbs_g: number; fat_g: number }): CastName {
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
/** How far above its resting peek a carrier lands, before it settles. */
const POPPED = 12;

/**
 * One of them peeking over the newest food card, and catching it as it lands.
 *
 * Who is decided by what the meal is mostly made of. The peek is a seat
 * (`journal.peek:<entry>`), so the carrier *arrives*: from the reply row when
 * the card is the answer to what was just said, from the ledge or the card
 * before when it isn't. They land a little above the card, cheer once with a
 * tap if this is the catch, and sink back to the top of a head.
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
const NODDED = new Set<string>();

export function CardPeek({
  card,
  entryId,
  active,
  landing,
  correcting,
  cue,
  onCatch,
  children,
}: {
  card: { protein_g: number; carbs_g: number; fat_g: number };
  entryId: string;
  active: boolean;
  landing: boolean;
  /**
   * This card is a correction that just happened ("there was more rice"). The
   * carrier thinks and nods rather than cheering: cheering a fix reads as praise
   * for having got it wrong.
   */
  correcting?: boolean;
  /**
   * A cue for whoever is on this card — the journal's ledge life reaching the
   * one of them who is up here instead. Without it a food word perking up the
   * carrier perked up an empty seat.
   */
  cue?: Cue | null;
  /** The carrier has caught this card and is cheering it. */
  onCatch?: (who: CastName, entryId: string) => void;
  children: React.ReactNode;
}) {
  // A plain view either way, so the card inside is never remounted. Everything
  // that animates lives in `Peeker` and `PeekHands`, which only the active card
  // mounts. The ref is how the hands, drawn after the card, move with the figure
  // drawn before it: it holds no animation of its own.
  const rise = useRef<SharedValue<number> | null>(null);
  return (
    <View style={active ? styles.peekRow : null}>
      {active && (
        <Peeker
          card={card}
          entryId={entryId}
          landing={landing}
          correcting={correcting ?? false}
          outside={cue ?? null}
          onCatch={onCatch}
          riseOut={rise}
        />
      )}
      {children}
      {active && <PeekHands who={dominant(card)} seat={`journal.peek:${entryId}`} riseRef={rise} />}
    </View>
  );
}

/**
 * The carrier's two hands, resting on the card's top edge — drawn in front of
 * the card, where the rest of them is behind it.
 *
 * Without them the card's edge cut straight through the figure, a hard line
 * across its middle that read as a clipping mistake. With them it reads as
 * somebody holding on and looking over the top. They lift away as the figure
 * pops up to cheer, and are not drawn while the carrier is anywhere else.
 */
function PeekHands({
  who,
  seat,
  riseRef,
}: {
  who: CastName;
  seat: string;
  riseRef: React.MutableRefObject<SharedValue<number> | null>;
}) {
  const here = useSeated(seat, who);
  const still = useSharedValue(0);
  // Read here rather than passed as a value: `Peeker`, the sibling before this one,
  // has set it by the time this renders.
  const source = riseRef.current ?? still;
  const hold = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, 1 + source.value / 0.35)),
    transform: [{ translateY: source.value * POPPED }],
  }));
  const { gradients } = drawing(who, 'idle');
  const [light, mid, dark] = gradients.body;
  return (
    <Animated.View collapsable={false} pointerEvents="none" style={[styles.hands, { opacity: here ? 1 : 0 }]}>
      <Animated.View collapsable={false} style={hold}>
        <Svg width={PEEK} height={HANDS_H} viewBox={`0 0 ${PEEK} ${HANDS_H}`}>
          {[13, 27].map((cx) => (
            <G key={cx}>
              <Ellipse cx={cx} cy={HANDS_H / 2 + 0.6} rx={4.8} ry={3.3} fill={dark} opacity={0.35} />
              <Ellipse cx={cx} cy={HANDS_H / 2} rx={4.6} ry={3.2} fill={mid} stroke={dark} strokeWidth={0.9} />
              <Ellipse cx={cx - 1.4} cy={HANDS_H / 2 - 1} rx={1.6} ry={0.9} fill={light} opacity={0.8} />
            </G>
          ))}
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/** The hands' box: centred on the card's top edge. */
const HANDS_H = 10;

function Peeker({
  card,
  entryId,
  landing,
  correcting,
  outside,
  onCatch,
  riseOut,
}: {
  card: { protein_g: number; carbs_g: number; fat_g: number } & { kcal?: number };
  entryId: string;
  landing: boolean;
  correcting: boolean;
  /** A cue from the screen, for the figure that happens to be up here. */
  outside: Cue | null;
  onCatch?: (who: CastName, entryId: string) => void;
  /** Handed the rise, so the hands in front of the card move with the figure behind it. */
  riseOut: React.MutableRefObject<SharedValue<number> | null>;
}) {
  // A correction is acknowledged once per new figure it lands on.
  const fix = `${entryId}:${card.kcal ?? ''}:${card.protein_g}:${card.carbs_g}:${card.fat_g}`;
  const nodding = useRef(correcting && !NODDED.has(fix));
  const [cue, setCue] = useState<Cue | null>(null);
  const acknowledge = () => {
    if (!nodding.current) return;
    nodding.current = false;
    NODDED.add(fix);
    setCue({ mood: 'thinking', ms: 900, nod: true, key: Date.now() });
  };
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const who = dominant(card);
  /* The screen's own cue, played here unless this figure is in a moment of its own. */
  const outsideKey = outside?.key;
  useEffect(() => {
    if (!outside || nodding.current) return;
    setCue(outside);
    // Once per cue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outsideKey]);
  const seat = `journal.peek:${entryId}`;
  const catching = useRef(landing && !CAUGHT.has(entryId));
  // 0 = peeking, -1 = popped up over it.
  const rise = useSharedValue(0);
  riseOut.current = rise;
  const [cheering, setCheering] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const arrived = useRef(false);
  // Read inside timers, where the values from the first render would be stale.
  const now = useRef({ reduced, focused, onCatch });
  now.current = { reduced, focused, onCatch };

  const settle = (after: number) => {
    timers.current.push(
      setTimeout(() => {
        setCheering(false);
        rise.value = now.current.reduced
          ? 0
          : withTiming(0, { duration: 420, easing: Easing.inOut(Easing.quad) });
      }, after),
    );
  };

  const popUp = (cheer: boolean) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    rise.value = now.current.reduced ? -1 : withSpring(-1, GAIT[who].spring);
    if (cheer) setCheering(true);
    settle(cheer ? 1900 : 900);
  };

  const catchIt = () => {
    if (!catching.current) return false;
    catching.current = false;
    CAUGHT.add(entryId);
    castMemory.lastCatch = { name: who, entryId };
    if (!now.current.focused) return true;
    haptics.press();
    now.current.onCatch?.(who, entryId);
    return true;
  };

  /* Flown in: they land popped up, and either cheer the catch or just settle. */
  useLanding((landedSeat, name) => {
    if (landedSeat !== seat || name !== who) return;
    arrived.current = true;
    acknowledge();
    rise.value = -1;
    const caught = catchIt();
    if (caught && now.current.focused) {
      setCheering(true);
      settle(1900);
    } else {
      settle(500);
    }
  });

  /* Already here, or put here without a flight (Reduce Motion, another tab): the old catch. */
  useEffect(() => {
    if (nodding.current) {
      timers.current.push(setTimeout(() => !arrived.current && acknowledge(), 1400));
    }
    if (catching.current) {
      timers.current.push(
        setTimeout(() => {
          if (arrived.current || !catching.current) return;
          const caught = catchIt();
          if (caught && now.current.focused) popUp(true);
        }, 1400),
      );
    }
    return () => timers.current.forEach(clearTimeout);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: rise.value * POPPED }],
  }));

  return (
    <View pointerEvents="box-none" style={styles.peek}>
      <Seat seat={seat} name={who} screen="index" size={PEEK} land={{ x: 0, y: -POPPED }} entrance="rise">
        <Animated.View collapsable={false} pointerEvents="box-none" style={lift}>
          <Character
            name={who}
            mood={cheering ? 'cheer' : 'idle'}
            size={PEEK}
            shadow={false}
            arrive={false}
            cue={cue}
            onPoke={() => popUp(false)}
          />
        </Animated.View>
      </Seat>
    </View>
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
  hands: { position: 'absolute', right: 22, top: -HANDS_H / 2 - 1, width: PEEK, height: HANDS_H },
  ledge: { height: LEDGE_SITTER - LEDGE_OVERHANG + 3, zIndex: 2 },
  ledgeRow: { position: 'absolute', bottom: -LEDGE_OVERHANG, flexDirection: 'row', gap: 2 },
  shelfContact: { left: -2, right: -2, bottom: -2, height: 14, borderRadius: 7 },
  // On the field just under its top edge (7pt above the bottom of the seat), where
  // the legs hang: a shadow on the surface they sit on, not a halo in the air.
  contact: { position: 'absolute', left: -1, right: -1, bottom: -2, height: 11, borderRadius: 6 },
  fill: { flex: 1 },
});
