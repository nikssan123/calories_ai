import { useEffect, useId, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
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
import { useColors, useTheme } from '@/theme';
import { useSky } from '@/components/Sky';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Character, type CastName, type Mood, type Prop } from './Character';
import { useDayPart } from './life';

/**
 * Somewhere for them to be, at the hour it is.
 *
 * One small scene under a tab's title. Cook gets a kitchen, Exercise a path in
 * a park. The light is the sky from `sky.ts` for this hour, the same keyframes as
 * Today's header, so a kitchen window at dusk is the colour dusk is up there.
 * There's no sun and no moon in it either.
 *
 * Who's there and what they're doing follows the part of the day. Morning is a
 * coffee at the window, the middle of the day is somebody at the pot, and late
 * at night the lamp is on and Plum is asleep on the counter.
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
}

/** A box on the grid, scaled to the width the scene was laid out at. */
function useWidth() {
  const [width, setWidth] = useState(0);
  return [
    width,
    (event: { nativeEvent: { layout: { width: number } } }) => setWidth(event.nativeEvent.layout.width),
  ] as const;
}

function Cast({ placed, scale, ground }: { placed: Placed[]; scale: number; ground: number }) {
  return (
    <>
      {placed.map((figure, i) => (
        <Character
          key={`${figure.name}-${figure.mood}`}
          name={figure.name}
          mood={figure.mood}
          prop={figure.prop}
          size={figure.size * scale}
          delay={i * 500}
          style={{
            position: 'absolute',
            left: figure.x * scale,
            top: (ground - figure.size) * scale,
          }}
        />
      ))}
    </>
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

function kitchenPalette(part: DayPart, dark: boolean) {
  if (part === 'night' || dark) {
    return {
      wall: ['#4a4262', '#3b3553'],
      counter: '#7a5f6e',
      front: '#5e4858',
      frame: '#6c6488',
      jars: 0.7,
    };
  }
  const walls: Record<Exclude<DayPart, 'night'>, [string, string]> = {
    morning: ['#fbe6d0', '#f6d7b8'],
    afternoon: ['#fff1e0', '#fbe3c8'],
    evening: ['#f7dcc0', '#eec7a3'],
  };
  return {
    wall: walls[part],
    counter: '#ecc594',
    front: '#d9a570',
    frame: '#ffffff',
    jars: 1,
  };
}

export function KitchenScene({ style }: { style?: StyleProp<ViewStyle> }) {
  const [width, onLayout] = useWidth();
  const colors = useColors();
  const { scheme } = useTheme();
  const sky = useSky();
  const part = useDayPart();
  const id = useId().replace(/:/g, '');
  const scale = width / KW;
  const pal = kitchenPalette(part, scheme === 'dark');
  const lamp = part === 'night';
  const pot = part === 'afternoon' || part === 'evening';

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
              {sky.inkLight && <Stars left={224} top={26} width={76} height={50} />}
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
              <G x={292} y={78}>
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

            <Cast placed={KITCHEN_CAST[part]} scale={scale} ground={COUNTER} />

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
  if (part === 'night')
    return {
      far: '#3b4466',
      mid: '#46506a',
      near: '#2e3446',
      path: '#5a607a',
      leaf: ['#4f7a68', '#2f5446'],
    };
  if (dark)
    return {
      far: '#2f4a48',
      mid: '#35584a',
      near: '#2a3a33',
      path: '#4b5a52',
      leaf: ['#4fa07a', '#2d6a4e'],
    };
  if (part === 'evening')
    return {
      far: '#c9a0a8',
      mid: '#d9b48f',
      near: '#f3dcc0',
      path: '#fff3e2',
      leaf: ['#8fc98a', '#4f9a5e'],
    };
  return {
    far: '#9fd6c4',
    mid: '#a9e0b6',
    near: '#e9f2cf',
    path: '#fff8ea',
    leaf: ['#9ff0b8', '#3fbf7f'],
  };
}

export function ParkScene({ style }: { style?: StyleProp<ViewStyle> }) {
  const [width, onLayout] = useWidth();
  const colors = useColors();
  const { scheme } = useTheme();
  const sky = useSky();
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
              {sky.inkLight && <Stars left={12} top={10} width={296} height={50} />}

              <Path d="M0 84C50 64 100 68 150 78C204 90 250 60 320 70V150H0Z" fill={pal.far} opacity={0.85} />
              <Path d="M0 108C70 88 140 92 210 104C260 112 290 98 320 102V150H0Z" fill={pal.mid} />

              <G x={262} y={58}>
                <Rect x={-3} y={26} width={6} height={42} rx={3} fill="#9b6b43" />
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

            <Cast placed={PARK_CAST[part]} scale={scale} ground={PATH} />
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
