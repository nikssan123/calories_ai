import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { useLife, useSeason, type Fidget } from './life';

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

/** The hop, as keyframes of a 1.5s loop: squash, rise, fall, squash, rest. */
const HOP_T = [0, 0.1, 0.14, 0.17, 0.2, 0.24, 0.28, 0.31, 0.34, 0.36, 0.46, 1];
const HOP_Y = [0, 0, -6, -10, -12.8, -14, -12.8, -10, -6, 0, 0, 0];
const HOP_SX = [1, 1.07, 1.02, 0.99, 0.97, 0.96, 0.97, 0.99, 1.02, 1.06, 1, 1];
const HOP_SY = [1, 0.9, 0.98, 1.02, 1.04, 1.05, 1.04, 1.02, 0.98, 0.92, 1, 1];
const CHEER_T = [0, 0.18, 0.4, 0.6, 1];
const CHEER_Y = [0, -7, 0, 0, 0];
const CHEER_SX = [1, 0.98, 1.04, 1, 1];
const CHEER_SY = [1, 1.04, 0.96, 1, 1];

const LOOPS: Record<Motion, { duration: number; reverse: boolean }> = {
  breathe: { duration: 1800, reverse: true },
  sleep: { duration: 2700, reverse: true },
  hop: { duration: 1500, reverse: false },
  cheer: { duration: 1100, reverse: false },
};

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
  /** Told about a poke, for a parent that moves the figure too (the card peek). */
  onPoke?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [passing, setPassing] = useState<Mood | null>(null);
  const shown = passing ?? mood;
  const season = useSeason();
  const accessory = dressed ? (season ?? undefined) : undefined;
  const d = useMemo(
    () => drawing(name, shown, { prop, sit: mood === 'sit', accessory }),
    [name, shown, prop, mood, accessory],
  );
  const { scheme } = useTheme();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const id = useId().replace(/:/g, '');
  const live = focused && !reduced;
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
    const cycle = LOOPS[motion];
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
  }, [looping, motion, delay, clock]);

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
    if (!live || !blinks) {
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
  }, [live, blinks, lids]);

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

  const hop = () => {
    if (reduced) return;
    jump.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 300, easing: Easing.bounce }),
    );
  };

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
  const actor = useMemo(() => ({ fidget: (kind: Fidget) => act.current(kind) }), []);
  useLife(live && fidget ? actor : null);

  const onPress = () => {
    haptics.press();
    // A figure at ease giggles. One holding something, or in a moment of its
    // own, keeps its pose and just bounces.
    if (atEase) pass('giggle', 850);
    hop();
    onPoke?.();
  };

  /* ---- Styles --------------------------------------------------------------- */

  const bodyStyle = useAnimatedStyle(() => {
    const c = clock.value;
    const lift = { translateY: -jump.value * 14 * unit };
    if (motion === 'hop') {
      return {
        transform: [
          lift,
          { translateY: interpolate(c, HOP_T, HOP_Y) * unit },
          { scaleX: interpolate(c, HOP_T, HOP_SX) },
          { scaleY: interpolate(c, HOP_T, HOP_SY) },
        ],
      };
    }
    if (motion === 'cheer') {
      return {
        transform: [
          lift,
          { translateY: interpolate(c, CHEER_T, CHEER_Y) * unit },
          { scaleX: interpolate(c, CHEER_T, CHEER_SX) },
          { scaleY: interpolate(c, CHEER_T, CHEER_SY) },
        ],
      };
    }
    return { transform: [lift, { scaleX: 1 + c * 0.018 }, { scaleY: 1 + c * 0.035 }] };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const hopLift = motion === 'hop' ? interpolate(clock.value, [0, 0.1, 0.24, 0.36, 1], [0, 0, 1, 0, 0]) : 0;
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
  const sitting = d.legs.length > 0;

  const figure = (
    <>
      {shadow && !sitting && (
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

        {sitting && (
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
      onPress={onPress}
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
