import { useEffect, useId } from 'react';
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
export type CastName = 'ember' | 'skye' | 'plum';

export type Mood = 'idle' | 'hop' | 'wave' | 'thinking' | 'cheer' | 'proud' | 'hopeful' | 'sleepy';

type Ramp = readonly [string, string, string];

interface Figure {
  ramp: Ramp;
  /** Arms and feet. */
  deep: string;
  /** Eye line. */
  fy: number;
  /** Left shoulder; the right one mirrors it about x=60. */
  sx: number;
  sy: number;
  /** Half the distance between the eyes. */
  ex: number;
  cheek: number;
  sheen: readonly [cx: number, cy: number, rx: number, ry: number];
  crown: Ramp | null;
}

const FIGURES: Record<CastName, Figure> = {
  ember: {
    ramp: ['#ffe3a6', '#ffa51f', '#dc740b'],
    deep: '#c4650a',
    fy: 72,
    sx: 30,
    sy: 84,
    ex: 11,
    cheek: 20,
    sheen: [47, 55, 8, 4.5],
    crown: ['#fff2a8', '#ffb43d', '#ff7a3d'],
  },
  skye: {
    ramp: ['#cbe8ff', '#3b9eff', '#2166c9'],
    deep: '#1f5fb8',
    fy: 74,
    sx: 30,
    sy: 85,
    ex: 11,
    cheek: 20,
    sheen: [47, 57, 8, 4.5],
    crown: ['#c6f7dc', '#3ddc97', '#0f9a5a'],
  },
  plum: {
    ramp: ['#ecdaff', '#b06bff', '#7b3bd8'],
    deep: '#6a31bd',
    fy: 81,
    sx: 29,
    sy: 89,
    ex: 12,
    cheek: 22,
    sheen: [48, 64, 6.5, 4],
    crown: null,
  },
};

type Eyes = 'open' | 'up' | 'hope' | 'happy' | 'closed';
type Mouth = 'smile' | 'open' | 'flat' | 'small' | 'o';
type Pose = 'down' | 'up' | 'hip' | 'clasp' | 'chin' | 'wave' | 'flame';
type Fx = 'bubbles' | 'zz' | 'sparkle' | 'flame' | 'confetti';
type Motion = 'breathe' | 'sleep' | 'hop' | 'cheer';

const MOODS: Record<Mood, { eyes: Eyes; mouth: Mouth; arms: readonly [Pose, Pose]; fx?: Fx; motion: Motion }> = {
  idle: { eyes: 'open', mouth: 'smile', arms: ['down', 'down'], motion: 'breathe' },
  hop: { eyes: 'open', mouth: 'smile', arms: ['down', 'down'], motion: 'hop' },
  wave: { eyes: 'open', mouth: 'open', arms: ['down', 'wave'], motion: 'breathe' },
  thinking: { eyes: 'up', mouth: 'flat', arms: ['down', 'chin'], fx: 'bubbles', motion: 'breathe' },
  cheer: { eyes: 'happy', mouth: 'open', arms: ['up', 'up'], fx: 'confetti', motion: 'cheer' },
  proud: { eyes: 'happy', mouth: 'smile', arms: ['hip', 'flame'], fx: 'flame', motion: 'breathe' },
  hopeful: { eyes: 'hope', mouth: 'small', arms: ['clasp', 'clasp'], fx: 'sparkle', motion: 'breathe' },
  sleepy: { eyes: 'closed', mouth: 'o', arms: ['down', 'down'], fx: 'zz', motion: 'sleep' },
};

const INK = '#2a1f18';
const CHEEK = '#ff6f91';
const GRID = 120;

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

type Arm = readonly [number, number, number, number, number, number];

const mirror = (a: Arm): Arm => [GRID - a[0], a[1], GRID - a[2], a[3], GRID - a[4], a[5]];
const q = (a: Arm) => `M${a[0]} ${a[1]}Q${a[2]} ${a[3]} ${a[4]} ${a[5]}`;

function arm(f: Figure, pose: Pose, side: 'L' | 'R'): Arm {
  const { sx, sy, fy } = f;
  const up: Arm = [sx + 1, sy - 6, sx - 11, sy - 16, sx - 9, sy - 30];
  if (pose === 'wave' || pose === 'flame') return mirror(up);
  if (pose === 'chin') return [GRID - sx, sy, GRID - sx - 2, fy + 20, 71, fy + 12];
  const left: Record<'down' | 'up' | 'hip' | 'clasp', Arm> = {
    down: [sx, sy, sx - 8, sy + 7, sx - 6, sy + 15],
    up,
    hip: [sx, sy, sx - 10, sy + 2, sx - 3, sy + 11],
    clasp: [sx, sy, sx + 6, sy + 13, 55, sy + 10],
  };
  const a = left[pose];
  return side === 'R' ? mirror(a) : a;
}

const inFront = (pose: Pose) => pose === 'clasp' || pose === 'chin';
const blinks = (eyes: Eyes) => eyes === 'open' || eyes === 'up' || eyes === 'hope';

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
  const f = FIGURES[name];
  const m = MOODS[mood];
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

  const motion = m.motion;
  const fx = m.fx;
  const waving = m.arms[1] === 'wave';

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
    if (!live || !blinks(m.eyes)) {
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
  }, [live, m.eyes, lids]);

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

  const [left, right] = m.arms;
  const stroke = { stroke: f.deep, strokeWidth: 7.5, strokeLinecap: 'round' as const, fill: 'none' };
  const hand = arm(f, 'flame', 'R');
  const shoulder = arm(f, 'wave', 'R');
  const box = { width: size, height: size };
  const layer = [StyleSheet.absoluteFill, box];
  const svg = { width: size, height: size, viewBox: `0 0 ${GRID} ${GRID}` };

  const fxOrigin = fx === 'flame' ? at(hand[4], hand[5] - 2) : fx === 'sparkle' ? at(97, 34) : at(60, 60);

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
          <Animated.View style={[layer, { transformOrigin: at(shoulder[0], shoulder[1]) }, armStyle]}>
            <Svg {...svg}>
              <Path d={q(shoulder)} {...stroke} />
            </Svg>
          </Animated.View>
        )}

        <Svg {...svg} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={`${id}-b`} cx="0.36" cy="0.3" r="0.8">
              <Stop offset="0" stopColor={f.ramp[0]} />
              <Stop offset="0.55" stopColor={f.ramp[1]} />
              <Stop offset="1" stopColor={f.ramp[2]} />
            </RadialGradient>
            {f.crown && (
              <LinearGradient id={`${id}-c`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={f.crown[0]} />
                <Stop offset="0.5" stopColor={f.crown[1]} />
                <Stop offset="1" stopColor={f.crown[2]} />
              </LinearGradient>
            )}
          </Defs>

          {!inFront(left) && <Path d={q(arm(f, left, 'L'))} {...stroke} />}
          {!inFront(right) && right !== 'wave' && <Path d={q(arm(f, right, 'R'))} {...stroke} />}

          <Ellipse cx={49} cy={105} rx={7.5} ry={4} fill={f.deep} />
          <Ellipse cx={71} cy={105} rx={7.5} ry={4} fill={f.deep} />

          <Crown name={name} fill={`url(#${id}-c)`} />
          <Body name={name} fill={`url(#${id}-b)`} />

          <Ellipse
            cx={f.sheen[0]}
            cy={f.sheen[1]}
            rx={f.sheen[2]}
            ry={f.sheen[3]}
            rotation={-28}
            origin={`${f.sheen[0]}, ${f.sheen[1]}`}
            fill="#ffffff"
            opacity={0.55}
          />
          <Ellipse cx={60 - f.cheek} cy={f.fy + 9} rx={5} ry={3} fill={CHEEK} opacity={0.38} />
          <Ellipse cx={60 + f.cheek} cy={f.fy + 9} rx={5} ry={3} fill={CHEEK} opacity={0.38} />

          {!blinks(m.eyes) && <EyeShapes f={f} eyes={m.eyes} />}
          {m.eyes === 'hope' && <Brows f={f} />}
          <MouthShape f={f} mouth={m.mouth} />

          {inFront(left) && <Path d={q(arm(f, left, 'L'))} {...stroke} />}
          {inFront(right) && <Path d={q(arm(f, right, 'R'))} {...stroke} />}
        </Svg>

        {blinks(m.eyes) && (
          <Animated.View style={[layer, { transformOrigin: at(60, f.fy) }, eyeStyle]}>
            <Svg {...svg}>
              <EyeShapes f={f} eyes={m.eyes} />
            </Svg>
          </Animated.View>
        )}

        {fx && (
          <Animated.View style={[layer, { transformOrigin: fxOrigin }, fxStyle]}>
            <Svg {...svg}>
              <Effect fx={fx} hand={hand} id={id} />
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

function Body({ name, fill }: { name: CastName; fill: string }) {
  if (name === 'ember') return <Circle cx={60} cy={74} r={32} fill={fill} />;
  if (name === 'skye') return <Ellipse cx={60} cy={75} rx={31} ry={32} fill={fill} />;
  return (
    <Path d="M60 36C66 50 92 62 92 80C92 97 78 106 60 106C42 106 28 97 28 80C28 62 54 50 60 36Z" fill={fill} />
  );
}

/** The one feature that tells each of them apart in silhouette. Plum's is the point of the drop itself. */
function Crown({ name, fill }: { name: CastName; fill: string }) {
  if (name === 'ember') {
    return <Path d="M47 50C46 38 52 30 57 20C59 27 61 30 63 33C65 30 68 28 71 25C74 33 75 42 73 50Z" fill={fill} />;
  }
  if (name === 'skye') {
    return (
      <G>
        <Path d="M60 46C60 40 60 35 61 30" stroke="#0e9a5a" strokeWidth={3} strokeLinecap="round" fill="none" />
        <Path d="M60 36C52 37 45 32 44 23C52 22 59 27 60 36Z" fill={fill} />
        <Path d="M61 31C66 25 72 22 79 24C77 31 69 35 61 32Z" fill={fill} />
      </G>
    );
  }
  return null;
}

function EyeShapes({ f, eyes }: { f: Figure; eyes: Eyes }) {
  const y = f.fy;
  const xs = [60 - f.ex, 60 + f.ex];
  const line = { stroke: INK, strokeWidth: 2.8, strokeLinecap: 'round' as const, fill: 'none' };

  if (eyes === 'happy') {
    return (
      <G>
        {xs.map((x) => (
          <Path key={x} d={`M${x - 4.5} ${y + 1.5}Q${x} ${y - 5} ${x + 4.5} ${y + 1.5}`} {...line} />
        ))}
      </G>
    );
  }
  if (eyes === 'closed') {
    return (
      <G>
        {xs.map((x) => (
          <Path key={x} d={`M${x - 4.5} ${y}Q${x} ${y + 4} ${x + 4.5} ${y}`} {...line} />
        ))}
      </G>
    );
  }

  const dx = eyes === 'up' ? 1.6 : 0;
  const dy = eyes === 'up' ? -2 : 0;
  const big = eyes === 'hope';
  return (
    <G>
      {xs.map((x) => (
        <G key={x}>
          <Ellipse cx={x + dx} cy={y + dy} rx={big ? 3.9 : 3.6} ry={big ? 5.2 : 4.8} fill={INK} />
          <Circle cx={x + dx + 1.2} cy={y + dy - 1.9} r={big ? 1.6 : 1.3} fill="#ffffff" />
        </G>
      ))}
    </G>
  );
}

function Brows({ f }: { f: Figure }) {
  const y = f.fy;
  const [l, r] = [60 - f.ex, 60 + f.ex];
  const line = { stroke: INK, strokeWidth: 2, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <G>
      <Path d={`M${l - 5} ${y - 9}Q${l} ${y - 12} ${l + 4} ${y - 10.5}`} {...line} />
      <Path d={`M${r - 4} ${y - 10.5}Q${r} ${y - 12} ${r + 5} ${y - 9}`} {...line} />
    </G>
  );
}

function MouthShape({ f, mouth }: { f: Figure; mouth: Mouth }) {
  const y = f.fy;
  const line = { stroke: INK, strokeWidth: 2.6, strokeLinecap: 'round' as const, fill: 'none' };
  switch (mouth) {
    case 'open':
      return (
        <G>
          <Path d={`M54 ${y + 7}Q60 ${y + 18} 66 ${y + 7}Z`} fill={INK} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
          <Ellipse cx={60} cy={y + 10.8} rx={2.8} ry={1.5} fill="#ff7a8a" />
        </G>
      );
    case 'o':
      return <Ellipse cx={60} cy={y + 9} rx={2} ry={2.4} fill={INK} />;
    case 'flat':
      return <Path d={`M56.5 ${y + 10}Q60.5 ${y + 9} 64 ${y + 10.5}`} {...line} />;
    case 'small':
      return <Path d={`M57 ${y + 8}Q60 ${y + 11} 63 ${y + 8}`} {...line} />;
    default:
      return <Path d={`M55 ${y + 8}Q60 ${y + 13} 65 ${y + 8}`} {...line} />;
  }
}

function Effect({ fx, hand, id }: { fx: Fx; hand: Arm; id: string }) {
  switch (fx) {
    case 'bubbles':
      return (
        <G fill="#c2ae96">
          <Circle cx={90} cy={44} r={2.2} />
          <Circle cx={97} cy={34} r={3.2} />
          <Circle cx={106} cy={22} r={4.6} />
        </G>
      );
    case 'zz':
      return (
        <G stroke="#9aa6f0" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M88 40h8l-8 9h8" />
          <Path d="M101 22h6l-6 7h6" />
        </G>
      );
    case 'sparkle':
      return <Path d="M97 26Q98 33 105 34Q98 35 97 42Q96 35 89 34Q96 33 97 26Z" fill="#ffc83d" />;
    case 'confetti':
      return (
        <G>
          <Circle cx={16} cy={38} r={2.6} fill="#ffa51f" />
          <Rect x={101} y={34} width={5} height={5} rx={1} fill="#3b9eff" rotation={20} origin="103, 36" />
          <Circle cx={24} cy={18} r={2.2} fill="#12b76a" />
          <Circle cx={98} cy={16} r={2.4} fill="#ff5fa2" />
          <Rect x={7} y={66} width={5} height={5} rx={1} fill="#b06bff" rotation={-18} origin="9, 68" />
          <Circle cx={112} cy={62} r={2.2} fill="#23d3b0" />
        </G>
      );
    case 'flame': {
      // Held up in the right hand. Drawn about its own base so it flickers from there.
      const [x, y] = [hand[4], hand[5] - 2];
      return (
        <G>
          <Defs>
            <LinearGradient id={`${id}-f`} x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor="#ff5fa2" />
              <Stop offset="0.45" stopColor="#ffa51f" />
              <Stop offset="1" stopColor="#ffe27a" />
            </LinearGradient>
          </Defs>
          <G x={x} y={y} scale={0.85}>
            <Path
              d="M0 0C-7 0-11-5-11-11C-11-17-6-19-5-25C-2-21-1-19 1-18C1-23 3-27 7-30C7-24 11-20 11-12C11-5 7 0 0 0Z"
              fill={`url(#${id}-f)`}
            />
            <Path d="M0-1C-4-1-6-4-6-7C-6-11-2-12 0-16C2-12 6-10 6-7C6-3 4-1 0-1Z" fill="#fff4b8" />
          </G>
        </G>
      );
    }
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
