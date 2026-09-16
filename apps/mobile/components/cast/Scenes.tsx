import { useEffect, useId, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { useIsFocused } from 'expo-router';
import type { DayPart } from '@/theme';
import { dim, useColors, useTheme } from '@/theme';
import { useSceneSky } from '@/components/Sky';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Character, type CastName, type Cue, type Mood, type Prop } from './Character';
import { useDayPart } from './life';

/**
 * Somewhere for them to be, at the hour it is.
 *
 * One small scene under a tab's title. Cook gets a kitchen, Exercise a path in
 * a park, Progress a hill and You a porch. The light is the sky from `sky.ts`
 * for this hour, the same keyframes as Today's header, so a kitchen window at
 * dusk is the colour dusk is up there. There's no sun and no moon in it either.
 *
 * Who's there and what they're doing follows the part of the day. Morning is a
 * coffee at the window, the middle of the day is somebody at the pot, and late
 * at night the lamp is on and Plum is asleep on the counter.
 *
 * Dark mode is the lamp off in the room, not a different hour: the sky through
 * the window is the hour's own sky turned down, and so is every wall, hill and
 * lawn (`dim`). Night's own colours, and the lamp, stay for the hours that are
 * actually night — otherwise a scene at one in the afternoon read as one in the
 * morning in both themes.
 *
 * Laid out on a fixed grid and scaled to the width it's given. The figures are
 * real `Character`s placed on that grid, so they fidget and answer a poke like
 * any other. Anything that stands in front of them (the pot) is a second layer
 * drawn over them that doesn't take touches.
 *
 * A scene sits in its own slot above the content and scrolls away with it. It
 * never sits behind a word.
 */

interface Placed {
  name: CastName;
  mood: Mood;
  prop?: Prop;
  /** Left edge and side, in grid units. */
  x: number;
  size: number;
  /** Where this one's feet are, when the ground isn't flat. Defaults to the scene's. */
  ground?: number;
}

/**
 * A scene's answer to something that just happened on its tab (CAST.md, fifth
 * pass) — the fridge photo came back, a workout was logged, a badge landed.
 *
 * Whoever it names reacts if they are in the scene at this hour, and nobody
 * does if they are not: a scene keeps one of each, so an answer from Ember at
 * two in the morning is an answer nobody is there to give. Passed with a new
 * `key` each time, like any cue.
 */
export interface SceneCue {
  who: CastName;
  mood?: Mood;
  /** Put in the hand for as long as the cue lasts. */
  prop?: Prop;
  ms?: number;
  hop?: boolean;
  /** Runs the length of the scene and comes back, then arrives out of breath. */
  run?: boolean;
  key: number;
}

/**
 * The poses that are just standing there: no loop for these. Everything else
 * either holds something that moves or is a moment of its own.
 */
const STILL = new Set<Mood>(['idle', 'sit']);

/** Out along the path and back, and how long it is out of breath afterwards. */
const RUN_MS = 2600;
const PUFF_MS = 1500;

/** A box on the grid, scaled to the width the scene was laid out at. */
function useWidth() {
  const [width, setWidth] = useState(0);
  return [
    width,
    (event: { nativeEvent: { layout: { width: number } } }) => setWidth(event.nativeEvent.layout.width),
  ] as const;
}

function Cast({
  placed,
  scale,
  ground,
  cue,
  span,
}: {
  placed: Placed[];
  scale: number;
  ground: number;
  /** What just happened on this tab, for whoever in here answers it. */
  cue?: SceneCue | null;
  /** The scene's width in grid units, for a figure that runs across it. */
  span: number;
}) {
  return (
    <>
      {placed.map((figure, i) => (
        <Standing
          key={`${figure.name}-${figure.mood}`}
          figure={figure}
          scale={scale}
          ground={ground}
          delay={i * 500}
          cue={cue && cue.who === figure.name ? cue : null}
          span={span}
        />
      ))}
    </>
  );
}

/**
 * One figure on the grid, and its answer when the scene is given one.
 *
 * A run is the only thing here that moves a figure off its mark: it hops (the
 * pose already loops) while a translation carries it out along the path and
 * back, and it arrives `puffed`. Everything else is an ordinary cue.
 */
function Standing({
  figure,
  scale,
  ground,
  delay,
  cue,
  span,
}: {
  figure: Placed;
  scale: number;
  ground: number;
  delay: number;
  cue: SceneCue | null;
  span: number;
}) {
  const reduced = useReducedMotion();
  const travel = useSharedValue(0);
  const [playing, setPlaying] = useState<{ cue: Cue; prop?: Prop } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const key = cue?.key;
  useEffect(() => {
    if (!cue) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const stop = (ms: number) => timers.current.push(setTimeout(() => setPlaying(null), ms));
    if (cue.run) {
      setPlaying({ cue: { mood: cue.mood ?? 'hop', ms: RUN_MS, key: cue.key } });
      if (!reduced) {
        const far = (span - figure.x - figure.size - 4) * scale;
        travel.value = withSequence(
          withTiming(far, { duration: RUN_MS / 2, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: RUN_MS / 2, easing: Easing.inOut(Easing.quad) }),
        );
      }
      timers.current.push(
        setTimeout(() => {
          setPlaying({ cue: { mood: 'puffed', ms: PUFF_MS, key: cue.key + 1 } });
          stop(PUFF_MS);
        }, RUN_MS),
      );
      return;
    }
    const ms = cue.ms ?? 900;
    setPlaying({ cue: { mood: cue.mood ?? 'idle', ms, key: cue.key, hop: cue.hop }, prop: cue.prop });
    stop(ms);
    // Once per cue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      cancelAnimation(travel);
    },
    [travel],
  );

  const running = useAnimatedStyle(() => ({ transform: [{ translateX: travel.value }] }));

  return (
    <Animated.View
      collapsable={false}
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          left: figure.x * scale,
          top: ((figure.ground ?? ground) - figure.size) * scale,
        },
        running,
      ]}
    >
      <Character
        name={figure.name}
        mood={figure.mood}
        prop={playing?.prop ?? figure.prop}
        size={figure.size * scale}
        delay={delay}
        cue={playing?.cue ?? null}
        /*
         * Standing about doesn't breathe. A breath at this size is a pixel, and
         * four scenes' worth of them is four loops running behind every tab —
         * the same reason the journal's ledge stopped (CAST.md, performance).
         * A pose that *is* movement keeps its loop: the pot, the Zs, the steam,
         * a wave. Blinks, fidgets and cues are untouched either way.
         */
        loop={STILL.has(playing?.cue?.mood ?? figure.mood) === false}
      />
    </Animated.View>
  );
}

/** Two wisps rising and fading, for steam over the pot. */
function Steam({ x, y, scale }: { x: number; y: number; scale: number }) {
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const drift = useSharedValue(0.4);

  useEffect(() => {
    if (!focused || reduced) {
      cancelAnimation(drift);
      drift.value = 0.4;
      return;
    }
    drift.value = 0;
    drift.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(drift);
  }, [focused, reduced, drift]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(drift.value, [0, 0.4, 1], [0, 0.85, 0]),
    transform: [{ translateY: (4 - drift.value * 12) * scale }],
  }));

  return (
    <Animated.View
      collapsable={false}
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (x - 6) * scale,
          top: (y - 20) * scale,
          width: 30 * scale,
          height: 24 * scale,
        },
        style,
      ]}
    >
      <Svg width={30 * scale} height={24 * scale} viewBox="0 0 30 24">
        <G stroke="#ffffff" strokeWidth={2.4} fill="none" strokeLinecap="round">
          <Path d="M8 22c-4-6 4-10 0-16" />
          <Path d="M20 20c-4-6 4-10 0-16" />
        </G>
      </Svg>
    </Animated.View>
  );
}

/** A handful of stars, where there is a night sky to put them in. */
function Stars({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  return (
    <G>
      {Array.from({ length: 9 }, (_, i) => (
        <Circle
          key={i}
          cx={left + ((i * 29) % width)}
          cy={top + ((i * 17) % height)}
          r={0.9 + (i % 3) * 0.4}
          fill="#ffffff"
          opacity={0.6 + (i % 2) * 0.35}
        />
      ))}
    </G>
  );
}

// ---- The kitchen ------------------------------------------------------------

const KW = 320;
const KH = 170;
/** Where a figure's box ends, so its shadow falls on the counter top. */
const COUNTER = 140;

/**
 * While something is cooking the kitchen takes its afternoon places, whatever
 * the hour: that arrangement is the one built around the pot, and the hour is
 * still in the light. Asking for a recipe at one in the morning is somebody up
 * late cooking, which is the truth of it.
 */
const COOKING: Placed[] = [
  { name: 'ember', mood: 'hold', prop: 'bowl', x: 14, size: 58 },
  { name: 'skye', mood: 'stir', x: 96, size: 60 },
  { name: 'plum', mood: 'idle', x: 236, size: 54 },
];

const KITCHEN_CAST: Record<DayPart, Placed[]> = {
  morning: [
    { name: 'skye', mood: 'idle', x: 22, size: 58 },
    { name: 'plum', mood: 'idle', x: 106, size: 54 },
    { name: 'ember', mood: 'hold', prop: 'mug', x: 188, size: 62 },
  ],
  afternoon: [
    { name: 'ember', mood: 'hold', prop: 'bowl', x: 14, size: 58 },
    { name: 'skye', mood: 'stir', x: 96, size: 60 },
    { name: 'plum', mood: 'idle', x: 236, size: 54 },
  ],
  evening: [
    { name: 'ember', mood: 'idle', x: 14, size: 58 },
    { name: 'skye', mood: 'stir', x: 96, size: 60 },
    { name: 'plum', mood: 'taste', prop: 'spoon', x: 232, size: 56 },
  ],
  night: [{ name: 'plum', mood: 'sleepy', x: 132, size: 56 }],
};

/*
 * How much light dark takes out of each kind of surface. A wall or a lawn is a
 * big flat field and can lose the most; paint and leaves keep more of theirs,
 * or the scene goes to mud; night's own colours are already dark and only lose
 * their edge.
 */
const WALL_DOWN = 0.6;
const GROUND_DOWN = 0.58;
const TRIM_DOWN = 0.62;
const LEAF_DOWN = 0.45;
const NIGHT_DOWN = 0.3;

/**
 * Dark takes the hour's own kitchen and turns the lights down on it. A wall is
 * a big flat field, so it goes furthest down; the jars lose a little of their
 * glare rather than their colour.
 */
function kitchenPalette(part: DayPart, dark: boolean) {
  const d = (hex: string, amount = WALL_DOWN) => (dark ? dim(hex, amount) : hex);
  if (part === 'night') {
    return {
      wall: [d('#4a4262', NIGHT_DOWN), d('#3b3553', NIGHT_DOWN)],
      counter: d('#7a5f6e', NIGHT_DOWN),
      front: d('#5e4858', NIGHT_DOWN),
      frame: d('#6c6488', NIGHT_DOWN),
      jars: 0.7,
    };
  }
  const walls: Record<Exclude<DayPart, 'night'>, [string, string]> = {
    morning: ['#fbe6d0', '#f6d7b8'],
    afternoon: ['#fff1e0', '#fbe3c8'],
    evening: ['#f7dcc0', '#eec7a3'],
  };
  return {
    wall: [d(walls[part][0]), d(walls[part][1])],
    counter: d('#ecc594', TRIM_DOWN),
    front: d('#d9a570'),
    frame: d('#ffffff', TRIM_DOWN),
    jars: dark ? 0.82 : 1,
  };
}

/**
 * `thinking` puts that character's mind on it: while Cook has no ideas to show,
 * Skye stops what it is doing in the kitchen and thinks, rather than a second
 * Skye doing the thinking under the scene (CAST.md, fourth pass: one of each).
 */
export function KitchenScene({
  style,
  thinking,
  busy = false,
  cue,
}: {
  style?: StyleProp<ViewStyle>;
  thinking?: CastName;
  /**
   * A recipe is being written. Whoever is at the pot stirs while it is, at
   * whatever hour it is — the wait is the one moment the kitchen is about
   * something, and a still kitchen through it says nothing is happening.
   */
  busy?: boolean;
  cue?: SceneCue | null;
}) {
  const [width, onLayout] = useWidth();
  const colors = useColors();
  const { scheme } = useTheme();
  const sky = useSceneSky();
  const part = useDayPart();
  const id = useId().replace(/:/g, '');
  const scale = width / KW;
  const pal = kitchenPalette(part, scheme === 'dark');
  const lamp = part === 'night';
  // Something on the hob whenever there is something to stir, whatever the hour.
  const pot = part === 'afternoon' || part === 'evening' || busy;

  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      style={[styles.scene, { height: width > 0 ? KH * scale : KH, boxShadow: colors.shadow }, style]}
    >
      <View pointerEvents="box-none" style={styles.clip}>
        {width > 0 && (
          <>
            <Svg
              width={width}
              height={KH * scale}
              viewBox={`0 0 ${KW} ${KH}`}
              style={StyleSheet.absoluteFill}
            >
              <Defs>
                <LinearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={pal.wall[0]} />
                  <Stop offset="1" stopColor={pal.wall[1]} />
                </LinearGradient>
                <LinearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={sky.top} />
                  <Stop offset="0.6" stopColor={sky.mid} />
                  <Stop offset="1" stopColor={sky.low} />
                </LinearGradient>
                <RadialGradient id={`${id}-lamp`} cx="0.5" cy="0.5" r="0.5">
                  <Stop offset="0" stopColor="#ffd98a" stopOpacity={0.7} />
                  <Stop offset="1" stopColor="#ffd98a" stopOpacity={0} />
                </RadialGradient>
              </Defs>

              <Rect width={KW} height={KH} fill={`url(#${id}-wall)`} />

              {/* The window, lit by the hour's own sky. */}
              <Rect x={214} y={18} width={94} height={76} rx={12} fill={`url(#${id}-sky)`} />
              {sky.starlit && <Stars left={224} top={26} width={76} height={50} />}
              <Rect
                x={214}
                y={18}
                width={94}
                height={76}
                rx={12}
                fill="none"
                stroke={pal.frame}
                strokeWidth={6}
              />
              <Path d="M261 18V94M214 56H308" stroke={pal.frame} strokeWidth={4} />
              <Rect x={208} y={92} width={106} height={7} rx={3} fill={pal.front} />
              <G x={292} y={78} opacity={pal.jars}>
                <Path d="M-7 14H7L5 2H-5Z" fill="#e87b54" />
                <Path d="M0 2C-6 -4 -8 -10 -3 -12C0 -8 0 -4 0 2Z" fill="#3fbf7f" />
                <Path d="M0 2C5 -6 9 -9 11 -6C8 -2 4 0 0 2Z" fill="#5fd394" />
              </G>

              {/* The shelf of jars: what's in the kitchen, roughly. */}
              <Rect x={16} y={44} width={120} height={6} rx={3} fill={pal.front} />
              <G opacity={pal.jars}>
                <Rect x={26} y={20} width={18} height={24} rx={5} fill="#ffd9a0" opacity={0.9} />
                <Rect x={28} y={16} width={14} height={6} rx={2} fill="#c8883e" />
                <Rect x={52} y={24} width={16} height={20} rx={5} fill="#bfeee0" opacity={0.9} />
                <Rect x={54} y={20} width={12} height={6} rx={2} fill="#0f9478" />
                <Rect x={76} y={18} width={20} height={26} rx={6} fill="#e3cffc" opacity={0.9} />
                <Rect x={79} y={14} width={14} height={6} rx={2} fill="#7b3bd8" />
                <Circle cx={114} cy={34} r={9} fill="#ff8a8a" />
                <Circle cx={111} cy={31} r={3} fill="#ffffff" opacity={0.5} />
              </G>

              {lamp && (
                <G>
                  <Circle cx={160} cy={62} r={92} fill={`url(#${id}-lamp)`} />
                  <Path d="M160 0V24" stroke="#2a2540" strokeWidth={2} />
                  <Path d="M146 36Q160 20 174 36Z" fill="#ffcf7a" />
                </G>
              )}

              <Rect x={0} y={132} width={KW} height={KH - 132} fill={pal.front} />
              <Rect x={0} y={128} width={KW} height={8} rx={2} fill={pal.counter} />
            </Svg>

            <Cast
              placed={(busy ? COOKING : KITCHEN_CAST[part]).map((figure) =>
                !busy && figure.name === thinking
                  ? { ...figure, mood: 'thinking', prop: undefined }
                  : figure,
              )}
              scale={scale}
              ground={COUNTER}
              cue={cue}
              span={KW}
            />

            {pot && (
              <>
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Svg width={width} height={KH * scale} viewBox={`0 0 ${KW} ${KH}`}>
                    <Defs>
                      <RadialGradient id={`${id}-pot`} cx="0.35" cy="0.3" r="0.9">
                        <Stop offset="0" stopColor="#ffb38f" />
                        <Stop offset="0.6" stopColor="#ff7a5c" />
                        <Stop offset="1" stopColor="#c8432c" />
                      </RadialGradient>
                    </Defs>
                    <Rect x={146} y={106} width={42} height={28} rx={8} fill={`url(#${id}-pot)`} />
                    <Rect x={141} y={103} width={52} height={6} rx={3} fill="#c8432c" />
                    <Ellipse cx={156} cy={115} rx={6} ry={3} fill="#ffffff" opacity={0.35} />
                  </Svg>
                </View>
                <Steam x={158} y={100} scale={scale} />
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ---- The park -----------------------------------------------------------------

const PW = 320;
const PH = 150;
const PATH = 132;

const PARK_CAST: Record<DayPart, Placed[]> = {
  morning: [
    { name: 'skye', mood: 'wave', x: 70, size: 54 },
    { name: 'ember', mood: 'hop', x: 150, size: 54 },
  ],
  afternoon: [
    { name: 'ember', mood: 'hop', x: 104, size: 56 },
    { name: 'plum', mood: 'idle', x: 196, size: 50 },
  ],
  evening: [
    { name: 'skye', mood: 'idle', x: 64, size: 52 },
    { name: 'ember', mood: 'idle', x: 132, size: 54 },
  ],
  night: [{ name: 'plum', mood: 'sleepy', x: 204, size: 50 }],
};

function parkPalette(part: DayPart, dark: boolean) {
  const d = (hex: string, amount = GROUND_DOWN) => (dark ? dim(hex, amount) : hex);
  if (part === 'night')
    return {
      far: d('#3b4466', NIGHT_DOWN),
      mid: d('#46506a', NIGHT_DOWN),
      near: d('#2e3446', NIGHT_DOWN),
      path: d('#5a607a', NIGHT_DOWN),
      leaf: [d('#4f7a68', NIGHT_DOWN), d('#2f5446', NIGHT_DOWN)],
      trunk: d('#9b6b43', NIGHT_DOWN),
    };
  if (part === 'evening')
    return {
      far: d('#c9a0a8'),
      mid: d('#d9b48f'),
      near: d('#f3dcc0'),
      path: d('#fff3e2', TRIM_DOWN),
      leaf: [d('#8fc98a', LEAF_DOWN), d('#4f9a5e', LEAF_DOWN)],
      trunk: d('#9b6b43', LEAF_DOWN),
    };
  return {
    far: d('#9fd6c4'),
    mid: d('#a9e0b6'),
    near: d('#e9f2cf'),
    path: d('#fff8ea', TRIM_DOWN),
    leaf: [d('#9ff0b8', LEAF_DOWN), d('#3fbf7f', LEAF_DOWN)],
    trunk: d('#9b6b43', LEAF_DOWN),
  };
}

export function ParkScene({ style, cue }: { style?: StyleProp<ViewStyle>; cue?: SceneCue | null }) {
  const [width, onLayout] = useWidth();
  const colors = useColors();
  const { scheme } = useTheme();
  const sky = useSceneSky();
  const part = useDayPart();
  const id = useId().replace(/:/g, '');
  const scale = width / PW;
  const pal = parkPalette(part, scheme === 'dark');

  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      style={[styles.scene, { height: width > 0 ? PH * scale : PH, boxShadow: colors.shadow }, style]}
    >
      <View pointerEvents="box-none" style={styles.clip}>
        {width > 0 && (
          <>
            <Svg
              width={width}
              height={PH * scale}
              viewBox={`0 0 ${PW} ${PH}`}
              style={StyleSheet.absoluteFill}
            >
              <Defs>
                <LinearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={sky.top} />
                  <Stop offset="0.6" stopColor={sky.mid} />
                  <Stop offset="1" stopColor={sky.low} />
                </LinearGradient>
                <RadialGradient id={`${id}-tree`} cx="0.38" cy="0.3" r="0.8">
                  <Stop offset="0" stopColor={pal.leaf[0]} />
                  <Stop offset="1" stopColor={pal.leaf[1]} />
                </RadialGradient>
              </Defs>

              <Rect width={PW} height={PH} fill={`url(#${id}-sky)`} />
              {sky.starlit && <Stars left={12} top={10} width={296} height={50} />}

              <Path d="M0 84C50 64 100 68 150 78C204 90 250 60 320 70V150H0Z" fill={pal.far} opacity={0.85} />
              <Path d="M0 108C70 88 140 92 210 104C260 112 290 98 320 102V150H0Z" fill={pal.mid} />

              <G x={262} y={58}>
                <Rect x={-3} y={26} width={6} height={42} rx={3} fill={pal.trunk} />
                <Circle cx={0} cy={20} r={24} fill={`url(#${id}-tree)`} />
                <Circle cx={-17} cy={32} r={13} fill={`url(#${id}-tree)`} />
                <Circle cx={16} cy={34} r={12} fill={`url(#${id}-tree)`} />
              </G>

              <Path d="M0 126C80 114 170 118 240 124C290 128 310 124 320 124V150H0Z" fill={pal.near} />
              <Path
                d="M40 150C70 138 130 134 180 132C230 130 270 136 320 132"
                stroke={pal.path}
                strokeWidth={9}
                fill="none"
                strokeLinecap="round"
              />
            </Svg>

            <Cast placed={PARK_CAST[part]} scale={scale} ground={PATH} cue={cue} span={PW} />
          </>
        )}
      </View>
    </View>
  );
}

// ---- The hill ------------------------------------------------------------------

const HW = 320;
const HH = 150;

/*
 * A hill they're climbing, for Progress. It's scenery and not a chart: nobody's
 * height on the path means anything, and it never moves with the numbers
 * below it.
 */
const HILL_CAST: Record<DayPart, Placed[]> = {
  morning: [
    { name: 'skye', mood: 'wave', x: 16, size: 44, ground: 146 },
    { name: 'ember', mood: 'hop', x: 118, size: 44, ground: 112 },
    { name: 'plum', mood: 'idle', x: 206, size: 40, ground: 66 },
  ],
  afternoon: [
    { name: 'plum', mood: 'idle', x: 18, size: 44, ground: 146 },
    { name: 'skye', mood: 'idle', x: 120, size: 44, ground: 112 },
    { name: 'ember', mood: 'idle', x: 238, size: 42, ground: 52 },
  ],
  evening: [
    { name: 'plum', mood: 'idle', x: 118, size: 42, ground: 112 },
    { name: 'skye', mood: 'idle', x: 196, size: 40, ground: 74 },
    { name: 'ember', mood: 'wave', x: 238, size: 42, ground: 52 },
  ],
  night: [{ name: 'plum', mood: 'sleepy', x: 236, size: 42, ground: 52 }],
};

function hillPalette(part: DayPart, dark: boolean) {
  const d = (hex: string, amount = GROUND_DOWN) => (dark ? dim(hex, amount) : hex);
  if (part === 'night')
    return {
      far: d('#3b4466', NIGHT_DOWN),
      hill: [d('#46506a', NIGHT_DOWN), d('#2e3446', NIGHT_DOWN)],
      path: d('#5a607a', NIGHT_DOWN),
      flag: d('#c9a0c8', LEAF_DOWN),
    };
  if (part === 'evening')
    return {
      far: d('#c9a0a8'),
      hill: [d('#e3bf98'), d('#f3dcc0')],
      path: d('#fff3e2', TRIM_DOWN),
      flag: d('#ff5fa2', LEAF_DOWN),
    };
  return {
    far: d('#9fd6c4'),
    hill: [d('#9fdcb0'), d('#e9f2cf')],
    path: d('#fff8ea', TRIM_DOWN),
    flag: d('#ff5fa2', LEAF_DOWN),
  };
}

export function HillScene({ style, cue }: { style?: StyleProp<ViewStyle>; cue?: SceneCue | null }) {
  const [width, onLayout] = useWidth();
  const colors = useColors();
  const { scheme } = useTheme();
  const sky = useSceneSky();
  const part = useDayPart();
  const id = useId().replace(/:/g, '');
  const scale = width / HW;
  const pal = hillPalette(part, scheme === 'dark');

  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      style={[styles.scene, { height: width > 0 ? HH * scale : HH, boxShadow: colors.shadow }, style]}
    >
      <View pointerEvents="box-none" style={styles.clip}>
        {width > 0 && (
          <>
            <Svg width={width} height={HH * scale} viewBox={`0 0 ${HW} ${HH}`} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={sky.top} />
                  <Stop offset="0.6" stopColor={sky.mid} />
                  <Stop offset="1" stopColor={sky.low} />
                </LinearGradient>
                <LinearGradient id={`${id}-hill`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={pal.hill[0]} />
                  <Stop offset="1" stopColor={pal.hill[1]} />
                </LinearGradient>
              </Defs>

              <Rect width={HW} height={HH} fill={`url(#${id}-sky)`} />
              {sky.starlit && <Stars left={12} top={10} width={200} height={40} />}

              <Path d="M0 110C60 96 110 100 160 106C210 112 260 94 320 98V150H0Z" fill={pal.far} opacity={0.7} />
              <Path
                d="M0 150V136C50 130 90 120 130 108C170 96 200 74 236 56C250 49 262 46 274 48C292 52 306 62 320 70V150Z"
                fill={`url(#${id}-hill)`}
              />
              <Path
                d="M14 146C58 136 100 122 138 110C176 98 206 76 240 58C252 52 262 50 270 50"
                stroke={pal.path}
                strokeWidth={6}
                fill="none"
                strokeLinecap="round"
              />
              <Path d="M276 48V22" stroke="#8a6a4a" strokeWidth={2} strokeLinecap="round" />
              <Path d="M277 22L292 27L277 32Z" fill={pal.flag} />
            </Svg>

            <Cast placed={HILL_CAST[part]} scale={scale} ground={146} cue={cue} span={HW} />
          </>
        )}
      </View>
    </View>
  );
}

// ---- The porch -----------------------------------------------------------------

const RW = 320;
const RH = 150;
/** The porch boards, where anybody standing on the porch stands. */
const PORCH = 128;

/**
 * A sitting figure's feet hang below its seat, so it's placed by where it sits:
 * the seat is 34/44 of the way down its box, as on the macro card (`CastShelf`).
 */
const seated = (seat: number, size: number) => seat + (size * 10) / 44;

/*
 * The front of their house, for You. The page is about the person, so the scene
 * is somewhere to come home to: somebody at the door in the morning, the three
 * of them on the porch edge in the evening, the lamp on at night. Nothing on it
 * follows a setting or a target below it.
 */
const PORCH_CAST: Record<DayPart, Placed[]> = {
  morning: [
    { name: 'skye', mood: 'wave', x: 146, size: 50, ground: PORCH },
    { name: 'ember', mood: 'hold', prop: 'mug', x: 262, size: 52, ground: PORCH },
  ],
  afternoon: [
    { name: 'ember', mood: 'hop', x: 12, size: 52 },
    { name: 'skye', mood: 'idle', x: 146, size: 50, ground: PORCH },
    { name: 'plum', mood: 'sit', x: 270, size: 46, ground: seated(108, 46) },
  ],
  evening: [
    { name: 'ember', mood: 'sit', x: 94, size: 46, ground: seated(PORCH, 46) },
    { name: 'skye', mood: 'sit', x: 136, size: 46, ground: seated(PORCH, 46) },
    { name: 'plum', mood: 'sit', x: 178, size: 44, ground: seated(PORCH, 44) },
  ],
  night: [{ name: 'plum', mood: 'sleepy', x: 266, size: 50, ground: PORCH }],
};

function porchPalette(part: DayPart, dark: boolean) {
  const lit = part === 'evening' || part === 'night';
  const d = (hex: string, amount = WALL_DOWN) => (dark ? dim(hex, amount) : hex);
  if (part === 'night') {
    return {
      wall: [d('#4a4262', NIGHT_DOWN), d('#3b3553', NIGHT_DOWN)],
      eave: d('#352f48', NIGHT_DOWN),
      trim: d('#6c6488', NIGHT_DOWN),
      door: d('#8a5a78', NIGHT_DOWN),
      boards: d('#7a5f6e', NIGHT_DOWN),
      front: d('#5e4858', NIGHT_DOWN),
      grass: d('#46506a', NIGHT_DOWN),
      stripes: [d('#8a5a78', NIGHT_DOWN), d('#5a5070', NIGHT_DOWN)],
      bench: d('#6e5360', NIGHT_DOWN),
      iron: d('#2a2540', NIGHT_DOWN),
      mailbox: d('#5a7aa8', NIGHT_DOWN),
      // The lamp and the window are the light in this scene, so they keep it.
      glass: '#ffd98a',
      lantern: '#ffd98a',
      bloom: 0.8,
    };
  }
  const walls: Record<Exclude<DayPart, 'night'>, [string, string]> = {
    morning: ['#ffeedd', '#fadfc2'],
    afternoon: ['#fff1e0', '#fbe3c8'],
    evening: ['#f7dcc0', '#eec7a3'],
  };
  return {
    wall: [d(walls[part][0]), d(walls[part][1])],
    eave: d('#c98f5a'),
    trim: d('#ffffff', TRIM_DOWN),
    door: d('#ff8a6a', LEAF_DOWN),
    boards: d('#ecc594', TRIM_DOWN),
    front: d('#d9a570'),
    grass: d(part === 'evening' ? '#d9b48f' : '#a9e0b6', GROUND_DOWN),
    stripes: [d('#ff8a8a', LEAF_DOWN), d('#fff4ea', TRIM_DOWN)],
    bench: d('#9b6b43', LEAF_DOWN),
    iron: d('#6b5a4a', LEAF_DOWN),
    mailbox: d('#5aa9e6', LEAF_DOWN),
    glass: lit ? '#ffd98a' : d('#dff3f0', TRIM_DOWN),
    lantern: d('#fff3d6', TRIM_DOWN),
    bloom: dark ? 0.82 : 1,
  };
}

const FLOWERS = ['#ff8fbe', '#ffd166', '#b9a3ff'];

export function PorchScene({ style, cue }: { style?: StyleProp<ViewStyle>; cue?: SceneCue | null }) {
  const [width, onLayout] = useWidth();
  const colors = useColors();
  const { scheme } = useTheme();
  const sky = useSceneSky();
  const part = useDayPart();
  const id = useId().replace(/:/g, '');
  const scale = width / RW;
  const pal = porchPalette(part, scheme === 'dark');
  const lit = part === 'evening' || part === 'night';

  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      style={[styles.scene, { height: width > 0 ? RH * scale : RH, boxShadow: colors.shadow }, style]}
    >
      <View pointerEvents="box-none" style={styles.clip}>
        {width > 0 && (
          <>
            <Svg width={width} height={RH * scale} viewBox={`0 0 ${RW} ${RH}`} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={sky.top} />
                  <Stop offset="0.6" stopColor={sky.mid} />
                  <Stop offset="1" stopColor={sky.low} />
                </LinearGradient>
                <LinearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={pal.wall[0]} />
                  <Stop offset="1" stopColor={pal.wall[1]} />
                </LinearGradient>
                <RadialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
                  <Stop offset="0" stopColor="#ffd98a" stopOpacity={0.75} />
                  <Stop offset="1" stopColor="#ffd98a" stopOpacity={0} />
                </RadialGradient>
              </Defs>

              <Rect width={RW} height={RH} fill={`url(#${id}-sky)`} />
              {sky.starlit && <Stars left={8} top={8} width={70} height={60} />}

              {/* The garden: a few flowers and the mailbox, with nothing written on it. */}
              <Path d="M0 118C30 108 70 110 100 116V150H0Z" fill={pal.grass} />
              {FLOWERS.map((flower, i) => (
                <G key={flower} opacity={pal.bloom}>
                  <Path d={`M${10 + i * 12} 136V${124 - i * 2}`} stroke="#3fbf7f" strokeWidth={2} />
                  <Circle cx={10 + i * 12} cy={122 - i * 2} r={4} fill={flower} />
                </G>
              ))}
              <Rect x={74} y={104} width={5} height={40} rx={2} fill="#9b6b43" />
              <Rect x={62} y={92} width={28} height={16} rx={8} fill={pal.mailbox} />
              <Rect x={88} y={86} width={3} height={12} rx={1} fill="#ff5fa2" />

              {/* The house front. */}
              <Rect x={92} y={22} width={228} height={110} fill={`url(#${id}-wall)`} />
              <Rect x={84} y={13} width={240} height={11} rx={3} fill={pal.eave} />

              {lit && <Circle cx={144} cy={69} r={44} fill={`url(#${id}-glow)`} opacity={0.55} />}
              <Rect x={116} y={46} width={56} height={44} rx={8} fill={pal.glass} />
              <Rect x={116} y={46} width={56} height={44} rx={8} fill="none" stroke={pal.trim} strokeWidth={5} />
              <Path d="M144 46V90M116 68H172" stroke={pal.trim} strokeWidth={3} />
              <Rect x={110} y={89} width={68} height={5} rx={2} fill={pal.boards} />

              {/* The awning over the door, scalloped. */}
              {Array.from({ length: 6 }, (_, i) => {
                const x = 196 + i * 11.4;
                const fill = pal.stripes[i % 2];
                return (
                  <G key={i}>
                    <Rect x={x} y={28} width={11.4} height={9} fill={fill} />
                    <Circle cx={x + 5.7} cy={37} r={5.7} fill={fill} />
                  </G>
                );
              })}
              <Path d="M208 128V66a22 22 0 0 1 44 0V128Z" fill={pal.door} />
              <Path d="M208 128V66a22 22 0 0 1 44 0V128" fill="none" stroke={pal.trim} strokeWidth={4} />
              <Circle cx={230} cy={68} r={8} fill={pal.glass} opacity={0.9} />
              <Circle cx={245} cy={98} r={2.6} fill="#ffd98a" />

              {/* The porch lamp, on after dark. */}
              {part === 'night' && <Circle cx={267} cy={64} r={48} fill={`url(#${id}-glow)`} />}
              <Rect x={255} y={44} width={4} height={12} rx={2} fill={pal.iron} />
              <Path d="M259 48H267.5V52" stroke={pal.iron} strokeWidth={2} fill="none" />
              <Path d="M260 57H275L267.5 51Z" fill={pal.iron} />
              <Rect x={262} y={56} width={11} height={15} rx={3} fill={pal.lantern} />

              {/* The bench. */}
              <Rect x={272} y={88} width={42} height={4} rx={2} fill={pal.bench} />
              <Rect x={275} y={92} width={3} height={14} fill={pal.bench} />
              <Rect x={308} y={92} width={3} height={14} fill={pal.bench} />
              <Rect x={268} y={105} width={48} height={5} rx={2} fill={pal.bench} />
              <Rect x={272} y={110} width={3} height={18} fill={pal.bench} />
              <Rect x={309} y={110} width={3} height={18} fill={pal.bench} />

              {/* The porch and its steps. */}
              <Rect x={88} y={126} width={232} height={8} fill={pal.boards} />
              <Rect x={88} y={134} width={232} height={16} fill={pal.front} />
              <Rect x={196} y={136} width={68} height={6} rx={1} fill={pal.boards} />
              <Rect x={190} y={143} width={80} height={7} rx={1} fill={pal.boards} />
            </Svg>

            <Cast placed={PORCH_CAST[part]} scale={scale} ground={146} cue={cue} span={RW} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The shadow on the outside view and the clip on the inside one: a view that
  // clips its own children clips its own shadow too, on iOS.
  scene: { borderRadius: 22 },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22, overflow: 'hidden' },
});
