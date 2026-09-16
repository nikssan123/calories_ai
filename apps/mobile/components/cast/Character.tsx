import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useIsFocused } from 'expo-router';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import {
  BODY_STOPS,
  CROWN_STOPS,
  FLAME_RAMP,
  FLAME_STOPS,
  GRID,
  drawing,
  isGradient,
  type CastName,
  type Gradients,
  type Mood,
  type Motion,
  type Prop,
  type Shape,
} from './figure';
import { poked, useLife, useSeason, type Actor, type Fidget } from './life';
import { SeatPresence } from './seatPresence';

/**
 * Ember, Skye and Plum — the logo's three dots, standing up (CAST.md).
 *
 * The mark already had a cast: three dots that are protein, carbs and fat, and
 * that read at once as somebody typing. These are those dots with faces. They
 * are named for their colours and not their nutrients, so that none of them is
 * the one you are meant to cut, and each has a silhouette of its own — a flame
 * tuft, a sprout, a drop — so they still tell apart at 20pt, in greyscale, and
 * for anyone who cannot separate amber from violet.
 *
 * **Moods answer what somebody did, never what the number came to.** There is a
 * mood for writing, for coming back, for keeping a run, for being up late.
 * There is deliberately none for being over, and the type below is the place
 * that promise is kept: a mood that is not in `Mood` cannot be drawn.
 *
 * **How it moves.** Everything is drawn once, on a 120-unit grid, and moved as
 * whole layers — the body breathes or hops as one view, the eyes blink as a
 * second, the waving arm turns about its shoulder as a third. No path is ever
 * re-tessellated per frame, all motion is transform and opacity on the UI
 * thread, and the loops stop when the screen loses focus. Under Reduce Motion
 * the character holds its pose: the picture is kept and only the loop goes,
 * because a still drawing is not "less" of anything.
 *
 * **Between moods** (the living-cast layer): they glance about, stretch and
 * yawn now and then (`life.ts`), and a tap gets a jump, a giggle and a haptic.
 * A passing mood plays over the one they were given and hands it back.
 *
 * Decorative throughout. Every place one appears already says in words what it
 * is about, so the whole figure is hidden from screen readers.
 */
export type { CastName, Mood, Prop } from './figure';

/**
 * How each of them moves (CAST.md, fourth pass).
 *
 * They used to share one set of keyframes and differ only by a start delay, so
 * in motion the three were one sprite in three colours. Now each has a gait you
 * could pick out in silhouette:
 * - **Ember** is quick and springy: a short, snappy hop with a hard squash at
 *   both ends, and a stiff spring.
 * - **Skye** is floaty: the longest hang at the top, a little sway on the way,
 *   a soft landing that bounces once, and a loose spring.
 * - **Plum** is heavy: gathers itself, barely leaves the ground, lands with the
 *   deepest squash and wobbles it out.
 *
 * Keyframes are fractions of one loop; heights are in grid units. Everything
 * that carries a figure from one place to another — a poke, a flight between
 * seats (`stage.tsx`), a peek (`Presence.tsx`) — reads its timing from here, so
 * a figure moves like itself wherever it is.
 */
export interface Gait {
  hop: { t: number[]; y: number[]; sx: number[]; sy: number[]; r: number[]; duration: number; height: number };
  cheer: { t: number[]; y: number[]; sx: number[]; sy: number[]; duration: number };
  breathe: number;
  sleep: number;
  /** A poke or an arrival: the rise, the fall, and how high, in grid units. */
  jump: { up: number; down: number; height: number };
  spring: { damping: number; stiffness: number };
  /** A trip between seats: how long, how high the arc, and how far behind Ember it leaves. */
  flight: { duration: number; lift: number; delay: number };
}

export const GAIT: Record<CastName, Gait> = {
  ember: {
    hop: {
      t: [0, 0.08, 0.13, 0.18, 0.22, 0.27, 0.31, 0.34, 0.4, 1],
      y: [0, 0, -8, -12, -13, -12, -6, 0, 0, 0],
      sx: [1, 1.1, 1.02, 0.98, 0.97, 0.98, 1.02, 1.1, 1, 1],
      sy: [1, 0.86, 0.98, 1.03, 1.05, 1.03, 0.98, 0.88, 1, 1],
      r: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      duration: 1100,
      height: 13,
    },
    cheer: { t: [0, 0.16, 0.36, 0.55, 1], y: [0, -9, 0, 0, 0], sx: [1, 0.97, 1.07, 1, 1], sy: [1, 1.05, 0.93, 1, 1], duration: 950 },
    breathe: 1500,
    sleep: 2400,
    jump: { up: 170, down: 260, height: 14 },
    spring: { damping: 11, stiffness: 240 },
    flight: { duration: 440, lift: 64, delay: 0 },
  },
  skye: {
    hop: {
      t: [0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.54, 0.6, 0.66, 1],
      y: [0, 0, -10, -17, -20, -19, -12, 0, -2, 0, 0],
      sx: [1, 1.05, 0.97, 0.96, 0.97, 0.98, 1, 1.05, 0.99, 1, 1],
      sy: [1, 0.93, 1.04, 1.06, 1.04, 1.02, 1, 0.94, 1.01, 1, 1],
      r: [0, 0, -5, -3, 4, 2, -2, 0, 0, 0, 0],
      duration: 1750,
      height: 20,
    },
    cheer: { t: [0, 0.22, 0.45, 0.6, 0.75, 1], y: [0, -12, -9, 0, -1.5, 0], sx: [1, 0.97, 0.98, 1.05, 1, 1], sy: [1, 1.05, 1.03, 0.95, 1, 1], duration: 1250 },
    breathe: 2100,
    sleep: 2900,
    jump: { up: 260, down: 420, height: 18 },
    spring: { damping: 9, stiffness: 150 },
    flight: { duration: 600, lift: 96, delay: 70 },
  },
  plum: {
    hop: {
      t: [0, 0.12, 0.21, 0.29, 0.36, 0.41, 0.46, 0.51, 0.56, 0.62, 1],
      y: [0, 0, 0, -6, -7, 0, 0, 0, 0, 0, 0],
      sx: [1, 1, 1.15, 0.98, 0.97, 1.2, 0.93, 1.05, 0.99, 1, 1],
      sy: [1, 1, 0.8, 1.04, 1.05, 0.76, 1.07, 0.96, 1.01, 1, 1],
      r: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      duration: 2200,
      height: 7,
    },
    cheer: { t: [0, 0.2, 0.4, 0.52, 0.64, 1], y: [0, -5, 0, 0, 0, 0], sx: [1, 0.98, 1.14, 0.94, 1.03, 1], sy: [1, 1.03, 0.82, 1.06, 0.98, 1], duration: 1300 },
    breathe: 2600,
    sleep: 3200,
    jump: { up: 240, down: 380, height: 8 },
    spring: { damping: 14, stiffness: 170 },
    flight: { duration: 540, lift: 44, delay: 140 },
  },
};

/**
 * What a tap gets, per character (CAST.md, fifth pass).
 *
 * Every figure used to answer a poke the same way — hearts, arms up, a hop in
 * its own gait — so three characters shared one expression between them and the
 * only difference was in the thumb. Each now has three rungs: the first answer,
 * a louder one if the taps keep coming, and something else again for a finger
 * that stays down. The poses are the ones already drawn.
 */
interface Poke {
  /** The pose it takes, and for how long. Only a figure at ease takes one. */
  mood?: Mood;
  ms?: number;
  /** Jumps: how many, how far apart, how high, and how much shorter each is. */
  jumps?: number;
  gap?: number;
  lift?: number;
  decay?: number;
  /** A squash instead of a jump, and how deep. Held while the finger is down. */
  squash?: number;
  /** Eyes closed for this long. */
  shut?: number;
  /** Turns its back and comes round again. */
  flip?: boolean;
  /** Tilts toward the finger, in degrees, until it is let go. */
  tilt?: number;
  /** Blinks twice. */
  blinks?: boolean;
}

export const POKE: Record<CastName, { first: Poke; again: Poke; hold: Poke }> = {
  // It flares, then it is too much fire, then it leans on you.
  ember: {
    first: { mood: 'proud', ms: 640, jumps: 2, gap: 150 },
    again: { mood: 'proud', ms: 1060, jumps: 3, gap: 140, decay: 0.55 },
    hold: { mood: 'proud', tilt: 9 },
  },
  // Floats further than it meant to, hiccups bubbles, tips its sprout at you.
  skye: {
    first: { mood: 'hopeful', ms: 840, jumps: 1, lift: 1.55 },
    again: { mood: 'thinking', ms: 780, jumps: 1, lift: 0.4 },
    hold: { tilt: 13, blinks: true },
  },
  // Unimpressed, then annoyed, and it answers pressure with pressure.
  plum: {
    first: { squash: 1, shut: 460 },
    again: { mood: 'sleepy', ms: 1500, flip: true },
    hold: { squash: 0.78 },
  },
};

/** A second tap inside this climbs a rung; the loud rung then rests for `POKE_REST_MS`. */
const POKE_WINDOW_MS = 1200;
const POKE_REST_MS = 6000;

const loopFor = (gait: Gait, motion: Motion): { duration: number; reverse: boolean } => {
  switch (motion) {
    case 'breathe':
      return { duration: gait.breathe, reverse: true };
    // Out of breath: the same squeeze as a breath, three times as fast.
    case 'pant':
      return { duration: 520, reverse: true };
    case 'sleep':
      return { duration: gait.sleep, reverse: true };
    case 'hop':
      return { duration: gait.hop.duration, reverse: false };
    case 'cheer':
      return { duration: gait.cheer.duration, reverse: false };
  }
};

/** How far behind Ember each of them starts anything done together. */
export const STAGGER: Record<CastName, number> = { ember: 0, skye: 90, plum: 180 };

/**
 * A passing mood asked for from outside — the shelf's figure cheering the meal
 * it caught in the journal, say. A new `key` plays it again.
 */
export interface Cue {
  mood: Mood;
  ms: number;
  key: number;
  /** A hop in this figure's gait as the mood starts: perking up. */
  hop?: boolean;
  /** A small nod once the mood has passed: "got it". */
  nod?: boolean;
}

export function Character({
  name,
  mood = 'idle',
  prop,
  size = 96,
  delay = 0,
  shadow = true,
  loop = true,
  poke = true,
  fidget = true,
  dressed = true,
  sitting = false,
  gaze,
  gazeUp = false,
  cue,
  arrive = true,
  blink = true,
  onPoke,
  style,
}: {
  name: CastName;
  mood?: Mood;
  /** What the right hand holds, in `hold` and `taste`. */
  prop?: Prop;
  size?: number;
  /** Milliseconds before the loop starts — how three figures stay out of step. */
  delay?: number;
  shadow?: boolean;
  /**
   * Whether the body breathes. Off for the icon-sized ones, where a breath is
   * too small to see and would still cost a loop apiece; they keep blinking,
   * fidgeting and answering a poke.
   */
  loop?: boolean;
  /** A tap gets a jump, a giggle and a haptic. */
  poke?: boolean;
  /** Takes part in idle life. See `life.ts`. */
  fidget?: boolean;
  /** Wears what the season calls for. See `useSeason`. */
  dressed?: boolean;
  /**
   * On an edge with the legs over it, whatever the mood — Plum asleep on the
   * shelf, Ember hoping on it. `mood="sit"` implies it.
   */
  sitting?: boolean;
  /** Eyes held toward one side, -1 to 1, for as long as it is set: leaning in to the composer. */
  gaze?: number;
  /** Eyes up, for as long as it is set: watching a reply arrive above them. */
  gazeUp?: boolean;
  /** A passing mood asked for from outside. See `Cue`. */
  cue?: Cue | null;
  /**
   * Lands with a hop of its own gait when its screen comes back into focus, so
   * arriving on a tab reads as the three arriving too. Off for figures carried
   * there by the stage, which land on their own.
   */
  arrive?: boolean;
  /**
   * Blinks on its own timer. Off for the stage's stand-ins, which are mounted
   * all the time and invisible nearly all of it.
   */
  blink?: boolean;
  /** Told about a poke, for a parent that moves the figure too (the card peek). */
  onPoke?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [passing, setPassing] = useState<Mood | null>(null);
  const shown = passing ?? mood;
  const season = useSeason();
  const accessory = dressed ? (season ?? undefined) : undefined;
  const seated = mood === 'sit' || sitting;
  const d = useMemo(
    () => drawing(name, shown, { prop, sit: seated, accessory }),
    [name, shown, prop, seated, accessory],
  );
  const gait = GAIT[name];

  const { scheme } = useTheme();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const id = useId().replace(/:/g, '');
  // A seat's hidden copy is mounted but not on show: no loops, blinks or fidgets for it.
  const present = useContext(SeatPresence);
  const live = focused && !reduced && present;
  const looping = live && loop;
  const unit = size / GRID;
  /*
   * A pivot on the grid, in points. RN's string form of `transformOrigin` only
   * reads whole-number percentages — "90.83%" parses as a stray "83%" — so the
   * array form, which takes plain numbers, is the one that survives a grid.
   */
  const at = (x: number, y: number): [number, number, number] => [x * unit, y * unit, 0];

  const clock = useSharedValue(0);
  const pulse = useSharedValue(0);
  const lids = useSharedValue(1);
  const lookX = useSharedValue(0);
  const lookY = useSharedValue(0);
  const jump = useSharedValue(0);
  const nod = useSharedValue(0);
  /* A tap's own three: squashed under a finger, tilted toward one, turned away. */
  const press = useSharedValue(0);
  const tilt = useSharedValue(0);
  const facing = useSharedValue(0);

  /*
   * `delay` staggers figures when they first appear. A passing mood that
   * changes the loop restarts it straight away, or a poke on the last figure in
   * a row would be over before its bounce began.
   */
  const staggered = useRef({ clock: false, pulse: false });

  const motion = d.motion;
  const fx = d.effect;
  const swing = d.swing?.kind ?? null;
  const blinks = d.eyes.length > 0;

  useEffect(() => {
    if (!looping) {
      cancelAnimation(clock);
      clock.value = 0;
      return;
    }
    const cycle = loopFor(gait, motion);
    const wait = staggered.current.clock ? 0 : delay;
    staggered.current.clock = true;
    clock.value = 0;
    clock.value = withDelay(
      wait,
      withRepeat(
        withTiming(1, {
          duration: cycle.duration,
          easing: cycle.reverse ? Easing.inOut(Easing.sin) : Easing.linear,
        }),
        -1,
        cycle.reverse,
      ),
    );
    return () => cancelAnimation(clock);
  }, [looping, motion, delay, clock, gait]);

  useEffect(() => {
    if (!looping || (!fx && !swing)) {
      cancelAnimation(pulse);
      pulse.value = fx === 'zz' || fx === 'steam' ? 0.3 : 1;
      return;
    }
    // Drifting Zs and steam rise and fade in one direction; everything else sways.
    const once = fx === 'zz' || fx === 'steam';
    const duration = swing === 'wave' ? 650 : swing === 'stir' ? 800 : fx === 'flame' ? 420 : once ? 3200 : 1100;
    const wait = staggered.current.pulse ? 0 : delay;
    staggered.current.pulse = true;
    pulse.value = 0;
    pulse.value = withDelay(
      wait,
      withRepeat(
        withTiming(1, { duration, easing: once ? Easing.linear : Easing.inOut(Easing.sin) }),
        -1,
        !once,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [looping, fx, swing, delay, pulse]);

  /*
   * Blinks on a timer rather than a loop, so that three figures side by side
   * never close their eyes together — which is the first thing that makes a row
   * of characters look like one sprite repeated.
   */
  useEffect(() => {
    if (!live || !blinks || !blink) {
      lids.value = 1;
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        lids.value = withSequence(withTiming(0.1, { duration: 60 }), withTiming(1, { duration: 70 }));
        next();
      }, 2600 + Math.random() * 3400);
    };
    next();
    return () => clearTimeout(timer);
  }, [live, blinks, blink, lids]);

  /* ---- Passing moods, fidgets and pokes ---------------------------------- */

  const passingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(passingTimer.current), []);

  const pass = (next: Mood, ms: number) => {
    clearTimeout(passingTimer.current);
    cancelAnimation(lookX);
    cancelAnimation(lookY);
    lookX.value = 0;
    lookY.value = 0;
    setPassing(next);
    passingTimer.current = setTimeout(() => setPassing(null), ms);
  };

  const hop = (after = 0, lift = 1) => {
    if (reduced) return;
    jump.value = withDelay(
      after,
      withSequence(
        withTiming(lift, { duration: gait.jump.up * lift, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: gait.jump.down * lift, easing: Easing.bounce }),
      ),
    );
  };

  /* A cue from outside plays like any passing mood, once per key. */
  const cueKey = cue?.key;
  useEffect(() => {
    if (!cue || reduced) return;
    pass(cue.mood, cue.ms);
    if (cue.hop) hop();
    if (cue.nod) {
      // Down and up once, as the passing mood hands back: a nod is a squash, not a hop.
      nod.value = withDelay(
        cue.ms,
        withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueKey]);

  /* Eyes held to one side while `gaze` is set, up while `gazeUp` — and handed back when neither is. */
  useEffect(() => {
    if (!blinks || passing) return;
    lookX.value = withTiming(gaze ?? 0, { duration: 260 });
    lookY.value = withTiming(gazeUp ? -1 : 0, { duration: 260 });
  }, [gaze, gazeUp, blinks, passing, lookX, lookY]);

  /*
   * Arriving on a tab: a landing hop in this figure's own gait, staggered so the
   * three come down one after another. Not on the first focus, or every launch
   * would open with a screen of figures bouncing at nobody.
   */
  const seenFocus = useRef(focused);
  useEffect(() => {
    const was = seenFocus.current;
    seenFocus.current = focused;
    if (!arrive || reduced || was || !focused) return;
    hop(STAGGER[name] + 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const glance = (x: number, y: number) => {
    lookX.value = withSequence(withTiming(x, { duration: 220 }), withDelay(1200, withTiming(0, { duration: 260 })));
    lookY.value = withSequence(withTiming(y, { duration: 220 }), withDelay(1200, withTiming(0, { duration: 260 })));
  };

  /*
   * Only a figure at ease takes over its whole pose for a fidget. One holding
   * something would drop it for a second, and one in the middle of a moment
   * (a cheer, the streak flame, thinking) would have that moment interrupted.
   * Those still glance about, and the ones with free feet still hop.
   */
  const atEase = mood === 'idle' || mood === 'sit';
  const canHop = mood === 'idle' || mood === 'hold' || mood === 'wave';
  /*
   * A poke is answered more readily than a fidget is offered: an ambient wave or
   * a bounce gives up its pose for one, because the tap was aimed at this figure
   * and a wave is not a moment. A held prop or a moment of its own still wins.
   */
  const takesPose = atEase || mood === 'wave' || mood === 'hop';
  const act = useRef<(kind: Fidget) => boolean>(() => false);
  act.current = (kind) => {
    if (passing) return false;
    switch (kind) {
      case 'lookLeft':
      case 'lookRight':
      case 'lookUp':
        if (!blinks) return false;
        glance(kind === 'lookLeft' ? -1 : kind === 'lookRight' ? 1 : 0.4, kind === 'lookUp' ? -1 : 0);
        return true;
      case 'stretch':
        if (!atEase) return false;
        pass('stretch', 1100);
        return true;
      case 'wave':
        if (!atEase) return false;
        pass('wave', 1600);
        return true;
      case 'yawn':
        if (!atEase) return false;
        pass('yawn', 1300);
        return true;
      case 'hop':
        if (!canHop) return false;
        hop();
        return true;
    }
  };
  /*
   * Where it stands on screen, for the director to aim glances at. Measured on
   * layout, not per frame: a figure that has scrolled a little is still on the
   * same side of its neighbours.
   */
  const root = useRef<View>(null);
  const centre = useRef<number | null>(null);
  const place = () =>
    root.current?.measureInWindow((x, _y, width) => {
      centre.current = width > 0 ? x + width / 2 : null;
    });
  const actor = useMemo<Actor>(
    () => ({ name, fidget: (kind: Fidget) => act.current(kind), x: () => centre.current }),
    [name],
  );
  useLife(live && fidget ? actor : null);

  /*
   * A poke, played from `POKE`. Only a figure at ease takes over its pose for
   * one; one holding something, or in a moment of its own, keeps the pose and
   * answers with the movement alone.
   */
  const pokeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pokeTimer.current), []);

  const play = (p: Poke) => {
    if (p.mood && takesPose) pass(p.mood, p.ms ?? 700);
    if (reduced) return;
    for (let i = 0; i < (p.jumps ?? 0); i++) {
      hop(i * (p.gap ?? 140), (p.lift ?? 1) * (p.decay ? p.decay ** i : 1));
    }
    if (p.squash !== undefined) {
      press.value = withSequence(
        withTiming(p.squash, { duration: 110, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 5.5, stiffness: 200 }),
      );
    }
    if (p.shut) {
      lids.value = withSequence(
        withTiming(0.1, { duration: 70 }),
        withDelay(p.shut, withTiming(1, { duration: 120 })),
      );
    }
    if (p.blinks) {
      lids.value = withSequence(
        withTiming(0.1, { duration: 60 }),
        withTiming(1, { duration: 70 }),
        withDelay(90, withTiming(0.1, { duration: 60 })),
        withTiming(1, { duration: 70 }),
      );
    }
    if (p.flip) {
      // Turned away, and quickly: a flat drawing mirroring passes through no
      // width at all, so the turn is short and rides a small hop, which is what
      // makes it read as hopping round rather than as a figure squeezed flat.
      const turn = (to: number) => {
        facing.value = withTiming(to, { duration: 160, easing: Easing.inOut(Easing.quad) });
        hop(0, 0.45);
      };
      turn(1);
      clearTimeout(pokeTimer.current);
      pokeTimer.current = setTimeout(() => turn(0), Math.max(500, (p.ms ?? 1200) - 240));
    }
  };

  /*
   * A finger that stays down is a different question from a tap, so it gets a
   * different answer: Ember leans into it, Skye tips its sprout, Plum sinks and
   * stays sunk until it is let go.
   */
  const held = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const holdOn = (side: number) => {
    const p = POKE[name].hold;
    held.current = true;
    if (p.mood && takesPose) pass(p.mood, 20_000);
    if (p.blinks) {
      lids.value = withSequence(
        withTiming(0.1, { duration: 60 }),
        withTiming(1, { duration: 70 }),
        withDelay(90, withTiming(0.1, { duration: 60 })),
        withTiming(1, { duration: 70 }),
      );
    }
    if (reduced) return;
    if (p.squash !== undefined) {
      press.value = withTiming(p.squash, { duration: 240, easing: Easing.out(Easing.quad) });
    }
    if (p.tilt) tilt.value = withSpring(p.tilt * side, gait.spring);
  };

  const holdOff = () => {
    if (!held.current) return;
    clearTimeout(passingTimer.current);
    setPassing(null);
    press.value = withSpring(0, { damping: 7, stiffness: 150 });
    tilt.value = withSpring(0, { damping: 5, stiffness: 110 });
  };

  const taps = useRef({ at: 0, loud: 0 });
  const onPress = () => {
    // The hold has already answered; releasing it is not a second question.
    if (held.current) {
      held.current = false;
      return;
    }
    haptics.poke(name);
    onPoke?.();
    const now = Date.now();
    const table = POKE[name];
    if (now - taps.current.at > POKE_WINDOW_MS) {
      play(table.first);
    } else if (now - taps.current.loud > POKE_REST_MS) {
      taps.current.loud = now;
      play(table.again);
    } else {
      // Rung two is resting: the finger still gets an answer, a quiet one.
      hop();
    }
    taps.current.at = now;
    poked(name);
  };

  /* ---- Styles --------------------------------------------------------------- */

  const { hop: hopKeys, cheer: cheerKeys, jump: jumpKeys } = gait;
  const bodyStyle = useAnimatedStyle(() => {
    const c = clock.value;
    const lift = { translateY: -jump.value * jumpKeys.height * unit + nod.value * 3 * unit };
    /*
     * A tap's own three, on top of whatever the mood is doing: pressed down
     * under a finger, tilted toward it, and turned away (`facing` at 1 is a
     * mirror, and the half-way frames are the figure edge-on).
     */
    const lean = { rotate: `${tilt.value}deg` };
    const squash = [
      { scaleX: (1 + press.value * 0.17) * (1 - facing.value * 2) },
      { scaleY: 1 - press.value * 0.2 },
    ];
    if (motion === 'hop') {
      return {
        transform: [
          lift,
          { translateY: interpolate(c, hopKeys.t, hopKeys.y) * unit },
          lean,
          { rotate: `${interpolate(c, hopKeys.t, hopKeys.r)}deg` },
          ...squash,
          { scaleX: interpolate(c, hopKeys.t, hopKeys.sx) },
          { scaleY: interpolate(c, hopKeys.t, hopKeys.sy) },
        ],
      };
    }
    if (motion === 'cheer') {
      return {
        transform: [
          lift,
          { translateY: interpolate(c, cheerKeys.t, cheerKeys.y) * unit },
          lean,
          ...squash,
          { scaleX: interpolate(c, cheerKeys.t, cheerKeys.sx) },
          { scaleY: interpolate(c, cheerKeys.t, cheerKeys.sy) },
        ],
      };
    }
    return {
      transform: [lift, lean, ...squash, { scaleX: 1 + c * 0.018 }, { scaleY: 1 + c * 0.035 }],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const hopLift = motion === 'hop' ? -interpolate(clock.value, hopKeys.t, hopKeys.y) / hopKeys.height : 0;
    const lift = Math.max(hopLift, jump.value);
    return { opacity: 1 - lift * 0.45, transform: [{ scale: 1 - lift * 0.28 }] };
  });

  const eyeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: lookX.value * 2.6 * unit },
      { translateY: lookY.value * 2.2 * unit },
      { scaleY: lids.value },
    ],
  }));

  const swingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: swing === 'stir' ? `${-8 + pulse.value * 18}deg` : `${-10 + pulse.value * 26}deg` }],
  }));

  const legStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-7 + clock.value * 15}deg` }],
  }));

  const fxStyle = useAnimatedStyle(() => {
    const p = pulse.value;
    switch (fx) {
      case 'zz':
        return {
          opacity: interpolate(p, [0, 0.3, 1], [0, 1, 0]),
          transform: [{ translateX: p * 3 * unit }, { translateY: (4 - p * 10) * unit }],
        };
      case 'steam':
        return {
          opacity: interpolate(p, [0, 0.4, 1], [0, 0.9, 0]),
          transform: [{ translateX: 0 }, { translateY: (3 - p * 9) * unit }],
        };
      case 'flame':
        return { opacity: 1, transform: [{ scaleX: 1 - p * 0.08 }, { scaleY: 1 + p * 0.1 }] };
      case 'sparkle':
        return { opacity: 0.35 + p * 0.65, transform: [{ scale: 0.8 + p * 0.3 }] };
      default:
        return { opacity: 0.4 + p * 0.6, transform: [] };
    }
  });

  const box = { width: size, height: size };
  const layer = [StyleSheet.absoluteFill, box];
  const svg = { width: size, height: size, viewBox: `0 0 ${GRID} ${GRID}` };
  const hanging = d.legs.length > 0;

  const figure = (
    <>
      {shadow && !hanging && (
        <Animated.View collapsable={false} style={[layer, { transformOrigin: at(60, 109) }, shadowStyle]}>
          <Svg {...svg}>
            <Ellipse
              cx={60}
              cy={109}
              rx={28}
              ry={4.5}
              fill={scheme === 'dark' ? 'rgba(0, 0, 0, 0.32)' : 'rgba(120, 80, 20, 0.16)'}
            />
          </Svg>
        </Animated.View>
      )}

      <Animated.View collapsable={false} style={[layer, { transformOrigin: at(60, 107) }, bodyStyle]}>
        {d.swing && (
          <Animated.View collapsable={false} style={[layer, { transformOrigin: at(...d.pivots.shoulder) }, swingStyle]}>
            <Svg {...svg}>
              <Shapes shapes={d.swing.shapes} id={id} />
            </Svg>
          </Animated.View>
        )}

        {hanging && (
          <Animated.View collapsable={false} style={[layer, { transformOrigin: at(...d.pivots.legs) }, legStyle]}>
            <Svg {...svg}>
              <Shapes shapes={d.legs} id={id} />
            </Svg>
          </Animated.View>
        )}

        <Svg {...svg} style={StyleSheet.absoluteFill}>
          <BodyGradients id={id} gradients={d.gradients} />
          <Shapes shapes={d.body} id={id} />
        </Svg>

        {blinks && (
          <Animated.View collapsable={false} style={[layer, { transformOrigin: at(...d.pivots.eyes) }, eyeStyle]}>
            <Svg {...svg}>
              <Shapes shapes={d.eyes} id={id} />
            </Svg>
          </Animated.View>
        )}

        {fx && (
          <Animated.View collapsable={false} style={[layer, { transformOrigin: at(...d.pivots.fx) }, fxStyle]}>
            <Svg {...svg}>
              {fx === 'flame' && (
                <Defs>
                  <LinearGradient id={`${id}-flame`} x1="0" y1="1" x2="0" y2="0">
                    {FLAME_RAMP.map((colour, i) => (
                      <Stop key={colour} offset={FLAME_STOPS[i]} stopColor={colour} />
                    ))}
                  </LinearGradient>
                </Defs>
              )}
              <Shapes shapes={d.fx} id={id} />
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </>
  );

  /*
   * A poke is a bonus, not a control: it is not announced to a screen reader,
   * and every figure stays hidden from one, because every place a figure
   * appears already says in words what it is about.
   */
  if (!poke) {
    return (
      <View
        ref={root}
        onLayout={place}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[box, style]}
      >
        {figure}
      </View>
    );
  }
  return (
    <Pressable
      ref={root}
      onLayout={place}
      onPress={onPress}
      onPressIn={(event) => {
        const side = event.nativeEvent.locationX > size / 2 ? 1 : -1;
        clearTimeout(holdTimer.current);
        holdTimer.current = setTimeout(() => holdOn(side), 260);
      }}
      onPressOut={() => {
        clearTimeout(holdTimer.current);
        holdOff();
      }}
      hitSlop={6}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[box, style]}
    >
      {/* The drawing takes no touches of its own: react-native-svg hit-tests its
          painted shapes on Android and would swallow the press before it
          reached the Pressable. */}
      <View pointerEvents="none" style={layer}>
        {figure}
      </View>
    </Pressable>
  );
}

function BodyGradients({ id, gradients }: { id: string; gradients: Gradients }) {
  return (
    <Defs>
      <RadialGradient id={`${id}-body`} cx="0.36" cy="0.3" r="0.8">
        {gradients.body.map((colour, i) => (
          <Stop key={i} offset={BODY_STOPS[i]} stopColor={colour} />
        ))}
      </RadialGradient>
      {gradients.crown && (
        <LinearGradient id={`${id}-crown`} x1="0" y1="0" x2="0" y2="1">
          {gradients.crown.map((colour, i) => (
            <Stop key={i} offset={CROWN_STOPS[i]} stopColor={colour} />
          ))}
        </LinearGradient>
      )}
    </Defs>
  );
}

/** `figure.ts`'s shapes, as react-native-svg elements. The string twin is `figureMarkup`. */
function Shapes({ shapes, id }: { shapes: Shape[]; id: string }) {
  return (
    <>
      {shapes.map((shape, i) => (
        <ShapeElement key={i} shape={shape} id={id} />
      ))}
    </>
  );
}

function ShapeElement({ shape, id }: { shape: Shape; id: string }) {
  const paint = (fill: string | undefined) => (!fill ? 'none' : isGradient(fill) ? `url(#${id}-${fill})` : fill);
  switch (shape.el) {
    case 'path':
      return (
        <Path
          d={shape.d}
          fill={paint(shape.fill)}
          stroke={shape.stroke}
          strokeWidth={shape.width}
          strokeLinecap={shape.round ? 'round' : undefined}
          strokeLinejoin={shape.round ? 'round' : undefined}
          opacity={shape.opacity}
        />
      );
    case 'ellipse':
      return (
        <Ellipse
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
          fill={paint(shape.fill)}
          opacity={shape.opacity}
          stroke={shape.stroke}
          strokeWidth={shape.width}
          rotation={shape.rotate}
          origin={shape.rotate ? `${shape.cx}, ${shape.cy}` : undefined}
        />
      );
    case 'circle':
      return <Circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={paint(shape.fill)} opacity={shape.opacity} />;
    case 'rect':
      return (
        <Rect
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rx={shape.rx}
          fill={shape.fill}
          stroke={shape.stroke}
          strokeWidth={shape.width}
          rotation={shape.rotate}
          origin={shape.rotate ? `${shape.x + shape.w / 2}, ${shape.y + shape.h / 2}` : undefined}
        />
      );
    case 'group':
      return (
        <G x={shape.x} y={shape.y} scale={shape.scale}>
          <Shapes shapes={shape.children} id={id} />
        </G>
      );
  }
}

/**
 * The three in a row, out of step with each other.
 *
 * One mood for all of them, or one each. The stagger is the typing indicator's
 * — 180ms apart — which is what makes three hops read as somebody thinking
 * rather than as one thing bouncing three times.
 */
export function Trio({
  size,
  moods = ['hop', 'hop', 'hop'],
  gap = 0,
  fidget = true,
  poke = true,
  style,
}: {
  size: number;
  moods?: readonly [Mood, Mood, Mood];
  gap?: number;
  fidget?: boolean;
  poke?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      pointerEvents="box-none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.trio, { gap }, style]}
    >
      <Character name="ember" mood={moods[0]} size={size} delay={0} fidget={fidget} poke={poke} />
      <Character name="skye" mood={moods[1]} size={size} delay={180} fidget={fidget} poke={poke} />
      <Character name="plum" mood={moods[2]} size={size} delay={360} fidget={fidget} poke={poke} />
    </View>
  );
}

const styles = StyleSheet.create({
  trio: { flexDirection: 'row', alignItems: 'flex-end' },
});
