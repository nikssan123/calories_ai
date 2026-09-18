import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Dimensions, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Character, GAIT, STAGGER, type CastName, type Mood } from './Character';
import { SeatPresence } from './seatPresence';

/**
 * The stage: one cast, carried between the places they sit (CAST.md, fourth pass).
 *
 * Before this every figure was its own drawing, so nobody ever *got* anywhere —
 * the typing trio vanished as the card landed and a different figure rose from
 * behind it; switching tabs swapped one set of three for another. Now the
 * screens that share the cast (the journal and Today) declare **seats**, each
 * character is in at most one seat at a time, and moving a character from one
 * seat to another flies it there over everything, in its own gait.
 *
 * **Why by hand.** Native shared-element transitions are blocked upstream
 * (MOBILE-UX.md): react-native-screens has no support on this stack. So a seat
 * measures itself in the window, the overlay in `TabsLayout` draws a stand-in
 * that arcs from one rectangle to the other, and the seat's own figure comes
 * back on landing. The destination is measured again part-way through the
 * flight, because a screen gliding in or a list scrolling to its end moves it.
 *
 * **Between tabs, nothing flies** (tried first, and it read wrong: three
 * figures sailing up over a page that is gliding in sideways). A tab switch is
 * an *entrance* instead, played by the seat itself and chosen by the screen:
 * - **Into the journal** they bound in from the side of the tab you came from,
 *   hopping along the composer in their own gaits — Ember in quick little hops
 *   and first, Skye in long floaty ones, Plum in heavy short ones last — and
 *   whoever the newest meal belongs to pops up from behind its card.
 * - **Into Today** they drop onto the shelf from just above it, and land.
 * Flights are for moves within one screen: the ledge, the reply row, a card.
 *
 * Under Reduce Motion a character simply appears in its new seat.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SeatEntry {
  screen: string;
  measure: ((done: (rect: Rect | null) => void) => void) | null;
  /** Where it was last seen, for a seat that unmounted before anybody left it. */
  last: Rect | null;
  /** Where a figure lands relative to the seat, when that is not the seat itself. */
  land: { x: number; y: number };
  mood: Mood;
}

interface Flight {
  id: number;
  from: string | null;
  to: string;
  /** Still measuring: the figure stays where it was until its stand-in is in place. */
  pending: boolean;
}

const seats = new Map<string, SeatEntry>();
const anchors = new Map<string, (done: (rect: Rect | null) => void) => void>();
const occupancy: Record<CastName, string | null> = { ember: null, skye: null, plum: null };
const flying: Record<CastName, Flight | null> = { ember: null, skye: null, plum: null };
const listeners = new Set<() => void>();
const landings = new Set<(seat: string, name: CastName) => void>();
let flightIds = 0;
let current: string | null = null;
let previous: string | null = null;
/** When the tab last changed, and which side the arriving tab's neighbour was on. */
let switchedAt = 0;
let cameFrom = 0;
let reduced = false;

export type Entrance = 'bound' | 'drop' | 'rise';

/** A character arriving in a seat by entrance rather than by flight, until the seat plays it. */
interface ArrivalFor {
  key: string;
  side: number;
  at: number;
}
const arrivals: Partial<Record<CastName, ArrivalFor>> = {};
/** How long after a tab switch a claim still counts as part of arriving. */
const SWITCH_WINDOW_MS = 1500;

interface Overlay {
  fly: (name: CastName, from: Rect, to: Rect, mood: Mood, id: number, retarget: () => void, done?: () => void) => void;
  spark: (from: Rect, to: Rect, colour: string, arrive: () => void) => void;
  origin: () => { x: number; y: number };
}
let overlay: Overlay | null = null;

const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const keyOf = (seat: string, name: CastName) => `${seat}|${name}`;

export { castMemory } from '@/lib/cast-memory';

/**
 * The tab now on show, from `TabScene`'s focus listener. `side` is +1 when the
 * tab just left is to the right of this one and -1 when it is to the left.
 */
export function stageFocus(screen: string, side = 0) {
  if (screen === current) return;
  previous = current;
  current = screen;
  if (previous !== null) {
    switchedAt = Date.now();
    cameFrom = side;
  }
}

/**
 * Where a seat is now. A seat mounted in the same commit as the claim that
 * wants it has not been laid out yet and measures as nothing, so it is asked
 * again for a few frames before its last known place is used instead.
 */
function measureSeat(entry: SeatEntry | undefined, done: (rect: Rect | null) => void, tries = 4) {
  if (!entry) return done(null);
  const measure = entry.measure;
  if (!measure) return done(entry.last);
  measure((rect) => {
    if (rect) {
      entry.last = rect;
      return done(rect);
    }
    if (tries > 0 && entry.measure) {
      requestAnimationFrame(() => measureSeat(entry, done, tries - 1));
      return;
    }
    done(entry.last);
  });
}

/** Whether a seat is somewhere the reader can see. Nothing flies to a place off screen. */
function onScreen(rect: Rect) {
  const middle = rect.y + rect.h / 2;
  return middle > 0 && middle < Dimensions.get('window').height;
}

/**
 * Where a seat is going to be, rather than where it happens to be this frame:
 * what a flight has to have before it sets off.
 *
 * A flight is claimed in the commit that makes it, and its destination can still
 * be in motion — a seat that mounted in that same commit has not been laid out,
 * and one inside the conversation is wherever the list is scrolled, which on a
 * cold start is the top of forty messages, a whole history above where
 * `scrollToEnd` is about to put it. Measured there, the flight sets off for a
 * place that is gone by the time it arrives and the mid-flight retarget hauls
 * the figure back across the screen. That is what threw whoever was on the
 * newest card from one end of the journal to the other on the first open.
 *
 * So the destination has to measure on screen and in the same place two frames
 * running. A seat that will not settle in that time is flown to where it was
 * last seen if that is on screen at all, and otherwise is not somewhere to fly
 * to: the figure is simply put there.
 *
 * `first` is where it was on the frame the claim was made, handed back with the
 * answer. The difference between the two is how far the list moved while this
 * was waiting, which is the only measurement of that scroll anybody here gets —
 * see the frozen seat in `claim`.
 */
function settledSeat(
  entry: SeatEntry | undefined,
  done: (rect: Rect | null, first: Rect | null) => void,
  tries = 12,
  before: Rect | null = null,
  first: Rect | null = null,
) {
  const measure = entry?.measure;
  if (!entry || !measure) return done(null, first);
  measure((rect) => {
    if (rect) entry.last = rect;
    const seen = first ?? rect;
    const still = rect !== null && before !== null && rect.x === before.x && rect.y === before.y;
    if (rect && still && onScreen(rect)) return done(rect, seen);
    if (tries > 0 && entry.measure) {
      requestAnimationFrame(() => settledSeat(entry, done, tries - 1, rect, seen));
      return;
    }
    done(rect && onScreen(rect) ? rect : null, seen);
  });
}

/**
 * Whether a figure can still set off from this seat.
 *
 * A mounted seat can always be asked where it is. An unmounted one cannot, but
 * it is not automatically a dead end: it keeps the last place it was seen, and
 * if that is somewhere the reader was looking then the figure was there a frame
 * ago and can leave from there. **This is the whole of the journal's worst
 * moment.** The three wait out a turn in `journal.thinking`, which lives inside
 * the pending reply — so the instant the first word of the reply arrives that
 * row unmounts, and it unmounts in the *same commit* as the claim that sends
 * them on to the card and back to the ledge. React runs every unmount effect in
 * a commit before any of its mount effects, so by the time `claimAll` is asked,
 * the seat they are standing in has already given up its `measure`. Requiring
 * one meant no flight was ever possible out of the waiting row: the carrier
 * stopped being somewhere and started being somewhere else, and the other two
 * blinked back onto the composer. What the reader saw was a figure that had not
 * arrived on the card so much as appeared on it — with its paws already on the
 * rim, since a seat that is simply occupied draws the whole figure at rest, and
 * nothing to watch until it popped up to cheer a second and a half later.
 */
function canLeave(entry: SeatEntry | undefined): entry is SeatEntry {
  if (!entry) return false;
  return entry.measure !== null || (entry.last !== null && onScreen(entry.last));
}

/**
 * Sends `name` to `seat` on `screen`, the tab route asking. A flight within one
 * screen; an entrance when the screen asking is not the one they were last on;
 * and a no-op if they are already sitting there and no tab is arriving.
 *
 * That last clause used to be unconditional, and it quietly cost the app its
 * best small moment. Only the journal and Today claim seats — Cook, Exercise,
 * Progress and You never call `claimAll` — so while a reader is on one of those
 * the stage still has all three on the journal's composer. Coming back re-claimed
 * the seat they already held, hit the no-op, and the journal snapped into place
 * fully formed. Cook hides it especially well: its kitchen draws its own figures
 * (`Scenes.tsx`), so they look like they went there when the stage never moved
 * them.
 *
 * `arriving` is what opens the door, and it is deliberately narrower than
 * `switching`: it means *this* call is the first claim of a tab switch, made
 * while the stage still thinks the old tab is up. A second claim a moment later
 * — the journal re-claiming when a card lands — has `current` caught up by then,
 * so it takes the no-op and nobody enters a seat twice.
 *
 * The screen is passed rather than read from `stageFocus`, because a screen's
 * own focus reaches its effects a moment before `TabScene`'s listener hears of
 * it: the journal claims its seats while the stage still thinks Today is up.
 */
export function claim(name: CastName, seat: string, screen: string) {
  const to = keyOf(seat, name);
  // This screen is the one arriving: the stage has not caught up with the tab yet.
  const arriving = current !== null && screen !== current;
  if (occupancy[name] === to && !arriving) return;
  const from = occupancy[name];
  occupancy[name] = to;

  const fromEntry = from ? seats.get(from) : undefined;
  const toEntry = seats.get(to);
  const sameScreen = fromEntry !== undefined && toEntry !== undefined && fromEntry.screen === toEntry.screen;

  // `from === to` is a re-claim on a tab switch. There is no distance to fly, so
  // it takes the entrance path rather than a flight to its own seat.
  if (reduced || !overlay || from === to || !sameScreen || !canLeave(fromEntry)) {
    flying[name] = null;
    // Part of a tab switch — this screen is arriving, or has only just — so the
    // seat plays its entrance when it has them. The journal is the first tab, so
    // anybody arriving there comes from its right.
    const switching = arriving || (current !== null && Date.now() - switchedAt < SWITCH_WINDOW_MS);
    if (!reduced && from !== null && switching) {
      arrivals[name] = { key: to, side: screen === 'index' ? 1 : cameFrom, at: Date.now() };
    } else {
      delete arrivals[name];
    }
    emit();
    return;
  }

  const id = ++flightIds;
  flying[name] = { id, from, to, pending: true };
  /*
   * Whether the seat they are leaving can still be asked where it is. A seat
   * that has already gone answers with the last place it was seen, and that
   * answer is frozen at whatever the list was scrolled to when it went — see
   * the correction below.
   */
  const frozen = fromEntry.measure === null;
  emit();

  /*
   * The destination first, and the seat they are leaving only once it has
   * settled: waiting for the list to stop moving can take a few frames, and the
   * stand-in has to set off from where the figure is in *that* frame, not from
   * where it was before the scroll. Nothing is visible meanwhile — the flight is
   * still `pending`, so the seat they are leaving is still drawing them, unless
   * it is `frozen`, in which case nobody is: those few frames are the price of
   * aiming properly, and they are the ones right after a row disappeared anyway.
   *
   * A frozen seat was given half the patience at first, on the grounds that the
   * wait is the one thing costing something here. Measured on the emulator, it
   * cost a flight instead: a destination inside the conversation while the
   * reply is landing needs most of those twelve frames to hold still twice, and
   * at six the carrier fell through to being *placed* on its card — the exact
   * thing this was fixing. Twelve for everybody. Two hundred milliseconds of
   * nobody on screen is cheaper than a teleport, and it is only ever spent in
   * the frames right after the row they were standing in disappeared.
   */
  settledSeat(toEntry, (toRect, firstSeen) => {
    if (flying[name]?.id !== id) return;
    measureSeat(fromEntry, (measured) => {
      if (flying[name]?.id !== id) return;
      /*
       * A frozen seat cannot follow the list. Both seats are in the same
       * scrolling column, so how far the destination moved between the claim
       * and settling is how far out of date the frozen rectangle now is —
       * usually the height of the row that just replaced the waiting one, and
       * on a turn that lands its card in the same commit, the height of the
       * card. Uncorrected, the carrier sets off from a place the conversation
       * has already carried away. Only trusted while it lands somewhere the
       * reader can see; a correction that throws it off screen is worse than
       * the staleness it was fixing.
       */
      const drifted =
        frozen && measured && toRect && firstSeen
          ? { ...measured, x: measured.x + (toRect.x - firstSeen.x), y: measured.y + (toRect.y - firstSeen.y) }
          : null;
      const fromRect = drifted && onScreen(drifted) ? drifted : measured;
      if (!fromRect || !toRect || !overlay) {
        flying[name] = null;
        emit();
        return;
      }
      const origin = overlay.origin();
      const local = (rect: Rect, land = { x: 0, y: 0 }): Rect => ({
        x: rect.x - origin.x + land.x,
        y: rect.y - origin.y + land.y,
        w: rect.w,
        h: rect.h,
      });
      // A correction for a destination that drifted, never a jump: a seat that
      // has gone off screen mid-flight (the list scrolled away under it) is left
      // where it was aimed rather than dragged after.
      const retarget = () =>
        measureSeat(seats.get(to), (again) => {
          if (again && onScreen(again) && overlay && flying[name]?.id === id) {
            overlay.fly(name, local(fromRect), local(again, toEntry.land), toEntry.mood, -id, () => {});
          }
        });
      overlay.fly(name, local(fromRect), local(toRect, toEntry.land), toEntry.mood, id, retarget);
      // The stand-in is in place: now the seat it left can let go.
      flying[name] = { id, from, to, pending: false };
      emit();
    });
  });
}

/** Nobody sits anywhere: the journal's empty state, where the plate has them. */
export function release(name: CastName) {
  if (occupancy[name] === null) return;
  occupancy[name] = null;
  flying[name] = null;
  emit();
}

function landed(name: CastName, id: number) {
  const flight = flying[name];
  if (!flight || flight.id !== id) return;
  // Heard before the seat shows them, so a seat that lands its figure somewhere
  // other than at rest (the card's peeker, popped up) has set that first.
  const [seat] = flight.to.split('|');
  landings.forEach((listener) => listener(seat!, name));
  flying[name] = null;
  emit();
}

/** Where `name` is sitting, or flying to. */
export function seatOf(name: CastName): string | null {
  return occupancy[name]?.split('|')[0] ?? null;
}

/**
 * A spark from one place to another — a meal's energy tossed into the ring.
 * `arrive` runs when it gets there, or at once when it can't fly.
 */
export function spark(fromSeat: { seat: string; name: CastName }, anchor: string, colour: string, arrive: () => void) {
  const entry = seats.get(keyOf(fromSeat.seat, fromSeat.name));
  const target = anchors.get(anchor);
  if (reduced || !overlay || !entry || !target) return arrive();
  measureSeat(entry, (from) => {
    target((to) => {
      if (!from || !to || !overlay) return arrive();
      const origin = overlay.origin();
      overlay.spark(
        { x: from.x - origin.x + from.w / 2, y: from.y - origin.y + from.h * 0.2, w: 0, h: 0 },
        { x: to.x - origin.x + to.w / 2, y: to.y - origin.y + to.h / 2, w: 0, h: 0 },
        colour,
        arrive,
      );
    });
  });
}

/**
 * A round trip from wherever `name` sits to an anchor and back — Ember hopping
 * down to the Progress tab to show where a new badge went. `arrive` runs at the
 * far end; nothing moves under Reduce Motion, and `arrive` runs at once.
 */
export function visit(name: CastName, anchor: string, arrive: () => void) {
  const key = occupancy[name];
  const entry = key ? seats.get(key) : undefined;
  const target = anchors.get(anchor);
  if (reduced || !overlay || !key || !entry || !target || flying[name]) return arrive();
  measureSeat(entry, (from) => {
    target((to) => {
      if (!from || !to || !overlay || flying[name]) return arrive();
      const origin = overlay.origin();
      const home: Rect = { x: from.x - origin.x, y: from.y - origin.y, w: from.w, h: from.h };
      const perch: Rect = {
        x: to.x - origin.x + to.w / 2 - from.w / 2,
        y: to.y - origin.y - from.h * 0.72,
        w: from.w,
        h: from.h,
      };
      const out = ++flightIds;
      flying[name] = { id: out, from: key, to: key, pending: false };
      overlay.fly(name, home, perch, entry.mood, out, () => {}, () => {
        arrive();
        setTimeout(() => {
          const back = ++flightIds;
          if (flying[name]?.id !== out || !overlay) return;
          flying[name] = { id: back, from: key, to: key, pending: false };
          overlay.fly(name, perch, home, entry.mood, back, () => {});
        }, 700);
      });
      emit();
    });
  });
}

const bouncers = new Set<(tab: string) => void>();
/** Kicks a tab's icon, as a tap on it does. */
export function bounceTab(tab: string) {
  bouncers.forEach((listener) => listener(tab));
}
export function useTabBounce(tab: string, kick: () => void) {
  const latest = useRef(kick);
  latest.current = kick;
  useEffect(() => {
    const listener = (which: string) => which === tab && latest.current();
    bouncers.add(listener);
    return () => {
      bouncers.delete(listener);
    };
  }, [tab]);
}

/** Told when a character lands in a seat. */
export function useLanding(listener: (seat: string, name: CastName) => void) {
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => {
    const relay = (seat: string, name: CastName) => latest.current(seat, name);
    landings.add(relay);
    return () => {
      landings.delete(relay);
    };
  }, []);
}

/**
 * A place one character can sit. Draws its children only while that character
 * is here and not on the way, and lands them with a squash in their own gait.
 */
export function Seat({
  seat,
  name,
  screen,
  size,
  mood = 'idle',
  land,
  entrance,
  offstage,
  ground,
  style,
  children,
}: {
  seat: string;
  name: CastName;
  /** The tab route this seat lives on: `index` or `today`. */
  screen: string;
  size: number;
  /** The pose the stand-in flies in. */
  mood?: Mood;
  land?: { x: number; y: number };
  /** How a character arrives here when a tab switch brings them. See the note at the top. */
  entrance?: Entrance;
  /**
   * Handed how far out of the scene the figure still is — 1 while a `rise`
   * entrance has it stowed behind whatever it sits behind, 0 once it is in its
   * seat. For anything drawn *outside* the seat that belongs to the figure and
   * must not turn up before it: the hands over a card's top edge, which are in
   * front of the card where the rest of them is behind it.
   */
  offstage?: React.MutableRefObject<SharedValue<number> | null>;
  /**
   * What they cast on whatever they sit on — drawn under them, outside their own
   * motion, and moving with the entrance: along the ground under a bound, lighter
   * while they're in the air, gathering under a drop.
   */
  ground?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const key = keyOf(seat, name);
  const ref = useRef<View>(null);
  const here = useSyncExternalStore(subscribe, () => {
    const flight = flying[name];
    return flight ? flight.pending && flight.from === key : occupancy[name] === key;
  });
  const landX = land?.x ?? 0;
  const landY = land?.y ?? 0;

  useEffect(() => {
    const entry: SeatEntry = {
      screen,
      last: seats.get(key)?.last ?? null,
      land: { x: landX, y: landY },
      mood,
      measure: (done) => {
        const view = ref.current;
        if (!view) return done(null);
        view.measureInWindow((x, y, w, h) => done(w > 0 ? { x, y, w, h } : null));
      },
    };
    seats.set(key, entry);
    return () => {
      // Kept with its last position, so a figure can still leave from here.
      entry.measure = null;
    };
  }, [key, screen, landX, landY, mood]);

  /* The squash of arriving, on the frame the stand-in hands over — or the entrance, when a tab brought them. */
  /*
   * Where the figure starts its entrance, set *before* it is drawn: from the
   * store's own notification when the claim lands on a mounted seat, and from
   * the first render's values when the seat mounts with them already here (Today
   * drawing its shelf once its day has loaded). Set in the effect instead, the
   * figure was drawn seated for a frame and then vanished to make its entrance.
   */
  const waiting = (): ArrivalFor | null => {
    const arrival = arrivals[name];
    return entrance && !reduced && arrival && arrival.key === key ? arrival : null;
  };
  const start = useRef(waiting());
  /*
   * Bumped by `prime` when it stages a figure for an entrance, so the landing
   * effect below re-runs even when `here` has not moved. See both.
   */
  const [primed, setPrimed] = useState(0);
  const startsAt = (arrival: ArrivalFor | null) => ({
    travel: arrival && entrance === 'bound' ? 0 : 1,
    offX: arrival && entrance === 'bound' ? (arrival.side || 1) * Dimensions.get('window').width : 0,
    drop: arrival && entrance === 'drop' ? 1 : 0,
    faded: arrival && entrance === 'drop' ? 0 : 1,
    rise: arrival && entrance === 'rise' ? 1 : 0,
  });
  const initial = startsAt(start.current);
  const squash = useSharedValue(0);
  const travel = useSharedValue(initial.travel);
  const offX = useSharedValue(initial.offX);
  const hops = useSharedValue(0);
  const drop = useSharedValue(initial.drop);
  const rise = useSharedValue(initial.rise);
  // In render rather than in an effect: `prime` stages a figure off stage on the
  // notification, before anything draws, and whatever is waiting on this has to
  // read the new value on that same frame or it flashes up without them.
  if (offstage) offstage.current = rise;
  const faded = useSharedValue(initial.faded);
  const lean = useSharedValue(0);
  const wasHere = useRef(false);
  const mounted = useRef(false);
  const gait = GAIT[name];
  const bound = BOUND[name];

  useEffect(() => {
    const prime = () => {
      const arrival = waiting();
      if (!arrival || occupancy[name] !== key || start.current === arrival) return;
      start.current = arrival;
      const at = startsAt(arrival);
      travel.value = at.travel;
      offX.value = at.offX;
      drop.value = at.drop;
      faded.value = at.faded;
      rise.value = at.rise;
      /*
       * Wake the effect below. This half only puts the figure *off-stage* ready
       * to come in; the half that flies it back is an effect keyed on `here`,
       * and a re-claim of a seat somebody is already sitting in never moves
       * `here`. Without this bump they were primed out of the scene and left
       * there — the cast simply gone from the journal.
       */
      setPrimed((n) => n + 1);
    };
    listeners.add(prime);
    return () => {
      listeners.delete(prime);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, entrance]);

  useEffect(() => {
    const arrived = here && !wasHere.current;
    wasHere.current = here;
    const first = !mounted.current;
    mounted.current = true;
    const arrival = arrivals[name];
    /*
     * A re-claim on a tab switch: `here` never moved, because they never left
     * this seat — but `prime` has just set them off-stage for an entrance, so
     * they have to be flown back in or they stay there.
     */
    const replay = here && !arrived && arrival !== undefined && arrival.key === key;
    if ((!arrived && !replay) || reduced) return;
    const land = () => {
      squash.value = withSequence(withTiming(1, { duration: 70 }), withSpring(0, gait.spring));
    };
    if (!entrance || !arrival || arrival.key !== key || Date.now() - arrival.at > 2500) {
      // Arrived by flight: just the landing. Not for a seat that simply
      // mounted with somebody in it, which is nobody arriving — and not on a
      // `primed` re-run, where the entrance below has already been played and
      // the arrival cleared.
      if (arrived && !first && (!arrival || arrival.key !== key)) land();
      return;
    }
    delete arrivals[name];
    const wait = STAGGER[name];

    if (entrance === 'bound') {
      // In from the edge of the side they came from, along the line they sit on.
      const side = arrival.side === 0 ? 1 : arrival.side;
      const width = Dimensions.get('window').width;
      ref.current?.measureInWindow((x, _y, w) => {
        const start = side > 0 ? width - x + 12 : -(x + w + 12);
        const count = Math.max(2, Math.round(Math.abs(start) / bound.length));
        offX.value = start;
        hops.value = count;
        lean.value = -side;
        travel.value = withDelay(
          wait,
          withTiming(1, { duration: count * bound.ms, easing: Easing.bezier(0.3, 0.1, 0.45, 1) }, (finished) => {
            if (finished) runOnJS(land)();
          }),
        );
      });
      return;
    }

    if (entrance === 'drop') {
      // Down onto the edge from just above it: quickest for Ember, floatiest for Skye.
      faded.value = withDelay(wait, withTiming(1, { duration: 120 }));
      drop.value = withDelay(
        wait,
        withTiming(0, { duration: bound.fall, easing: name === 'skye' ? Easing.inOut(Easing.quad) : Easing.in(Easing.quad) }, (finished) => {
          if (finished) runOnJS(land)();
        }),
      );
      return;
    }

    // 'rise': up from behind whatever they sit behind, on their own spring.
    rise.value = withDelay(wait + 260, withSpring(0, gait.spring));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here, primed]);

  const landing = useAnimatedStyle(() => {
    const t = travel.value;
    const phase = t * hops.value;
    const arc = Math.abs(Math.sin(Math.PI * phase));
    const air = t < 1 ? arc * bound.height * (1 - 0.35 * t) : 0;
    const contact = t < 1 ? 1 - Math.min(1, arc * 4) : 0;
    const settle = squash.value + contact * 0.9;
    return {
      opacity: faded.value,
      transform: [
        { translateX: offX.value * (1 - t) },
        { translateY: -air - drop.value * DROP_FROM + rise.value * size * 0.85 },
        { rotate: `${t < 1 ? lean.value * arc * bound.tilt : 0}deg` },
        { scaleX: 1 + settle * 0.1 },
        { scaleY: 1 - settle * 0.14 },
      ],
    };
  });

  const grounded = useAnimatedStyle(() => {
    const t = travel.value;
    const air = t < 1 ? Math.abs(Math.sin(Math.PI * t * hops.value)) * (1 - 0.35 * t) : 0;
    return {
      opacity: (1 - air * 0.7) * (1 - drop.value) * (1 - rise.value) * faded.value,
      transform: [{ translateX: offX.value * (1 - t) }, { scaleX: 1 - air * 0.35 }],
    };
  });

  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="box-none"
      onLayout={() => measureSeat(seats.get(key), () => {})}
      style={[{ width: size, height: size }, style]}
    >
      {/*
        * Always mounted, and hidden rather than removed while its character is
        * elsewhere. Mounting a figure is the expensive part — every shape in it
        * sends a layout event on its first draw, and on Android each of those
        * makes Reanimated re-apply every animated view in the app — and a figure
        * unmounted mid-animation leaves entries behind that fail on every later
        * event. So a seat keeps its drawing, and `SeatPresence` tells it to stop
        * breathing, blinking and fidgeting while nobody can see it.
        */}
      <View pointerEvents={here ? 'box-none' : 'none'} style={[styles.fill, { opacity: here ? 1 : 0 }]}>
        {ground ? (
          <Animated.View collapsable={false} pointerEvents="none" style={[StyleSheet.absoluteFill, grounded]}>
            {ground}
          </Animated.View>
        ) : null}
        <Animated.View collapsable={false} pointerEvents="box-none" style={[styles.fill, { transformOrigin: 'bottom' }, landing]}>
          <SeatPresence.Provider value={here}>{children}</SeatPresence.Provider>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * Each character's entrance, by gait: how long a hop along the ground is and
 * how high and how quick, how much they lean into it, and how long a drop takes.
 */
const BOUND: Record<CastName, { length: number; height: number; ms: number; tilt: number; fall: number }> = {
  ember: { length: 48, height: 15, ms: 150, tilt: 8, fall: 300 },
  skye: { length: 84, height: 26, ms: 270, tilt: 5, fall: 480 },
  plum: { length: 40, height: 8, ms: 230, tilt: 3, fall: 360 },
};

/** How far above the shelf a drop starts. */
const DROP_FROM = 64;

/** Whether `name` is sitting in `seat` right now, on show — what a seat itself draws from. */
export function useSeated(seat: string, name: CastName): boolean {
  const key = keyOf(seat, name);
  return useSyncExternalStore(subscribe, () => {
    const flight = flying[name];
    return flight ? flight.pending && flight.from === key : occupancy[name] === key;
  });
}

/** Somewhere a spark can land: the journal's ring. */
export function useAnchor(id: string) {
  const ref = useRef<View>(null);
  useEffect(() => {
    anchors.set(id, (done) => {
      const view = ref.current;
      if (!view) return done(null);
      view.measureInWindow((x, y, w, h) => done(w > 0 ? { x, y, w, h } : null));
    });
    return () => {
      anchors.delete(id);
    };
  }, [id]);
  return ref;
}

/* ---- The overlay ----------------------------------------------------------- */

/** The size stand-ins are drawn at and scaled from. */
const BASE = 44;
const NAMES: CastName[] = ['ember', 'skye', 'plum'];

/**
 * Drawn once, over the tabs. Holds a stand-in per character and one spark, and
 * nothing at all while nobody is flying.
 */
export function Stage() {
  const isReduced = useReducedMotion();
  reduced = isReduced;
  const ref = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const flyers = useRef<Partial<Record<CastName, FlyerHandle>>>({});
  const sparkHandle = useRef<SparkHandle | null>(null);

  useEffect(() => {
    overlay = {
      origin: () => origin.current,
      fly: (name, from, to, mood, id, retarget, done) => flyers.current[name]?.fly(from, to, mood, id, retarget, done),
      spark: (from, to, colour, arrive) => sparkHandle.current?.fly(from, to, colour, arrive),
    };
    return () => {
      overlay = null;
    };
  }, []);

  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={() =>
        ref.current?.measureInWindow((x, y) => {
          origin.current = { x, y };
        })
      }
    >
      {NAMES.map((name) => (
        <Flyer key={name} name={name} register={(handle) => (flyers.current[name] = handle)} />
      ))}
      <Spark register={(handle) => (sparkHandle.current = handle)} />
    </View>
  );
}

interface FlyerHandle {
  fly: (from: Rect, to: Rect, mood: Mood, id: number, retarget: () => void, done?: () => void) => void;
}

function Flyer({ name, register }: { name: CastName; register: (handle: FlyerHandle) => void }) {
  // Always mounted, so a flight never waits a render for its drawing.
  const [pose, setPose] = useState<Mood>('idle');
  const p = useSharedValue(0);
  const shown = useSharedValue(0);
  const fx = useSharedValue(0);
  const fy = useSharedValue(0);
  const fs = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const ts = useSharedValue(1);
  const gait = GAIT[name];
  const lift = gait.flight.lift;

  const hide = () => {
    setTimeout(() => {
      shown.value = 0;
    }, 60);
  };

  useEffect(() => {
    register({
      fly: (from, to, mood, id, retarget, done) => {
        if (done) finish.current.set(id, done);
        if (id < 0) {
          // A second measurement of where it is going, mid-flight.
          const settle = { duration: 160, easing: Easing.out(Easing.quad) };
          tx.value = withTiming(to.x, settle);
          ty.value = withTiming(to.y, settle);
          ts.value = withTiming(to.w / BASE, settle);
          return;
        }
        cancelAnimation(p);
        setPose(mood);
        fx.value = from.x;
        fy.value = from.y;
        fs.value = from.w / BASE;
        tx.value = to.x;
        ty.value = to.y;
        ts.value = to.w / BASE;
        p.value = 0;
        shown.value = 1;
        const duration = gait.flight.duration;
        p.value = withDelay(
          gait.flight.delay,
          withTiming(1, { duration, easing: Easing.bezier(0.42, 0, 0.3, 1) }, (finished) => {
            if (finished) runOnJS(onArrive)(id);
          }),
        );
        setTimeout(retarget, gait.flight.delay + duration * 0.55);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A leg of a round trip ends in its own callback, and the stand-in stays up for the next. */
  const finish = useRef(new Map<number, () => void>());
  const onArrive = (id: number) => {
    const done = finish.current.get(id);
    if (done) {
      finish.current.delete(id);
      done();
      return;
    }
    landed(name, id);
    hide();
  };

  const style = useAnimatedStyle(() => {
    const t = p.value;
    const peak = Math.min(fy.value, ty.value) - lift;
    const x = fx.value + (tx.value - fx.value) * t;
    const y = (1 - t) * (1 - t) * fy.value + 2 * (1 - t) * t * peak + t * t * ty.value;
    const s = fs.value + (ts.value - fs.value) * t;
    const air = Math.sin(Math.PI * t);
    return {
      opacity: shown.value,
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: s },
        { scaleX: 1 - air * 0.05 },
        { scaleY: 1 + air * 0.08 },
      ],
    };
  });

  return (
    <Animated.View collapsable={false} style={[styles.flyer, { transformOrigin: [0, 0, 0] }, style]}>
      <Character
        name={name}
        mood={pose}
        sitting={false}
        size={BASE}
        shadow={false}
        loop={false}
        poke={false}
        fidget={false}
        arrive={false}
        blink={false}
      />
    </Animated.View>
  );
}

interface SparkHandle {
  fly: (from: Rect, to: Rect, colour: string, arrive: () => void) => void;
}

const SPARK = 14;

function Spark({ register }: { register: (handle: SparkHandle) => void }) {
  const [colour, setColour] = useState('#ffffff');
  const p = useSharedValue(0);
  const shown = useSharedValue(0);
  const from = useSharedValue({ x: 0, y: 0 });
  const to = useSharedValue({ x: 0, y: 0 });
  const arrival = useRef<() => void>(() => {});

  useEffect(() => {
    register({
      fly: (a, b, tint, arrive) => {
        arrival.current = arrive;
        setColour(tint);
        from.value = { x: a.x, y: a.y };
        to.value = { x: b.x, y: b.y };
        cancelAnimation(p);
        p.value = 0;
        shown.value = 1;
        p.value = withTiming(1, { duration: 640, easing: Easing.bezier(0.5, 0, 0.3, 1) }, (finished) => {
          if (finished) runOnJS(arrived)();
        });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const arrived = () => {
    shown.value = 0;
    arrival.current();
  };

  const style = useAnimatedStyle(() => {
    const t = p.value;
    const a = from.value;
    const b = to.value;
    const peak = Math.min(a.y, b.y) - 70;
    return {
      opacity: shown.value * (t > 0.94 ? (1 - t) / 0.06 : 1),
      transform: [
        { translateX: a.x + (b.x - a.x) * t - SPARK / 2 },
        { translateY: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * peak + t * t * b.y - SPARK / 2 },
        { scale: 1.15 - t * 0.45 },
      ],
    };
  });

  return (
    <Animated.View
      collapsable={false}
      style={[
        styles.spark,
        {
          backgroundColor: '#ffffff',
          experimental_backgroundImage: `radial-gradient(circle, #ffffff 0%, ${colour} 60%)`,
          boxShadow: `0px 0px 14px 4px ${colour}`,
        },
        style,
      ]}
    />
  );
}

/** Claims for all three at once, for `screen`; each leaves on its own gait's delay. */
export function claimAll(screen: string, seatFor: (name: CastName) => string | null) {
  NAMES.forEach((name) => {
    const seat = seatFor(name);
    if (seat) claim(name, seat, screen);
    else release(name);
  });
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flyer: { position: 'absolute', left: 0, top: 0, width: BASE, height: BASE },
  spark: { position: 'absolute', left: 0, top: 0, width: SPARK, height: SPARK, borderRadius: SPARK / 2 },
});
