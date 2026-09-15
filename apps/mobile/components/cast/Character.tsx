import { useEffect, useId, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
  type Shape,
} from './figure';

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
 * Decorative throughout. Every place one appears already says in words what it
 * is about, so the whole figure is hidden from screen readers.
 */
export type { CastName, Mood } from './figure';

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
  size = 96,
  delay = 0,
  shadow = true,
  style,
}: {
  name: CastName;
  mood?: Mood;
  size?: number;
  /** Milliseconds before the loop starts — how three figures stay out of step. */
  delay?: number;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const d = useMemo(() => drawing(name, mood), [name, mood]);
  const { scheme } = useTheme();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const id = useId().replace(/:/g, '');
  const live = focused && !reduced;
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

  const motion = d.motion;
  const fx = d.effect;
  const waving = d.wave.length > 0;
  const blinks = d.eyes.length > 0;

  useEffect(() => {
    if (!live) {
      cancelAnimation(clock);
      clock.value = 0;
      return;
    }
    const loop = LOOPS[motion];
    clock.value = 0;
    clock.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration: loop.duration,
          easing: loop.reverse ? Easing.inOut(Easing.sin) : Easing.linear,
        }),
        -1,
        loop.reverse,
      ),
    );
    return () => cancelAnimation(clock);
  }, [live, motion, delay, clock]);

  useEffect(() => {
    if (!live || (!fx && !waving)) {
      cancelAnimation(pulse);
      pulse.value = fx === 'zz' ? 0.3 : 1;
      return;
    }
    // The drifting Zs rise and fade in one direction; everything else sways.
    const once = fx === 'zz';
    const duration = waving ? 650 : fx === 'flame' ? 420 : once ? 3200 : 1100;
    pulse.value = 0;
    pulse.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration, easing: once ? Easing.linear : Easing.inOut(Easing.sin) }),
        -1,
        !once,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [live, fx, waving, delay, pulse]);

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

  const bodyStyle = useAnimatedStyle(() => {
    const c = clock.value;
    if (motion === 'hop') {
      return {
        transform: [
          { translateY: interpolate(c, HOP_T, HOP_Y) * unit },
          { scaleX: interpolate(c, HOP_T, HOP_SX) },
          { scaleY: interpolate(c, HOP_T, HOP_SY) },
        ],
      };
    }
    if (motion === 'cheer') {
      return {
        transform: [
          { translateY: interpolate(c, CHEER_T, CHEER_Y) * unit },
          { scaleX: interpolate(c, CHEER_T, CHEER_SX) },
          { scaleY: interpolate(c, CHEER_T, CHEER_SY) },
        ],
      };
    }
    return { transform: [{ scaleX: 1 + c * 0.018 }, { scaleY: 1 + c * 0.035 }] };
  });

  const shadowStyle = useAnimatedStyle(() => {
    if (motion !== 'hop') return { opacity: 1, transform: [{ scale: 1 }] };
    const lift = interpolate(clock.value, [0, 0.1, 0.24, 0.36, 1], [0, 0, 1, 0, 0]);
    return { opacity: 1 - lift * 0.45, transform: [{ scale: 1 - lift * 0.28 }] };
  });

  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: lids.value }] }));

  const armStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-10 + pulse.value * 26}deg` }],
  }));

  const fxStyle = useAnimatedStyle(() => {
    const p = pulse.value;
    switch (fx) {
      case 'zz':
        return {
          opacity: interpolate(p, [0, 0.3, 1], [0, 1, 0]),
          transform: [{ translateX: p * 3 * unit }, { translateY: (4 - p * 10) * unit }],
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

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[box, style]}
    >
      {shadow && (
        <Animated.View style={[layer, { transformOrigin: at(60, 109) }, shadowStyle]}>
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

      <Animated.View style={[layer, { transformOrigin: at(60, 107) }, bodyStyle]}>
        {waving && (
          <Animated.View style={[layer, { transformOrigin: at(...d.pivots.shoulder) }, armStyle]}>
            <Svg {...svg}>
              <Shapes shapes={d.wave} id={id} />
            </Svg>
          </Animated.View>
        )}

        <Svg {...svg} style={StyleSheet.absoluteFill}>
          <BodyGradients id={id} gradients={d.gradients} />
          <Shapes shapes={d.body} id={id} />
        </Svg>

        {blinks && (
          <Animated.View style={[layer, { transformOrigin: at(...d.pivots.eyes) }, eyeStyle]}>
            <Svg {...svg}>
              <Shapes shapes={d.eyes} id={id} />
            </Svg>
          </Animated.View>
        )}

        {fx && (
          <Animated.View style={[layer, { transformOrigin: at(...d.pivots.fx) }, fxStyle]}>
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
    </View>
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
  style,
}: {
  size: number;
  moods?: readonly [Mood, Mood, Mood];
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.trio, { gap }, style]}
    >
      <Character name="ember" mood={moods[0]} size={size} delay={0} />
      <Character name="skye" mood={moods[1]} size={size} delay={180} />
      <Character name="plum" mood={moods[2]} size={size} delay={360} />
    </View>
  );
}

const styles = StyleSheet.create({
  trio: { flexDirection: 'row', alignItems: 'flex-end' },
});
