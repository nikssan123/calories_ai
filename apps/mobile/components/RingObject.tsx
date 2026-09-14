import { useEffect, useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The logo, as an object.
 *
 * The moment the app opens on is our own mark — the chat bubble that is also a
 * progress ring — given thickness, tilted in space, and turning slowly under
 * the light, with the protein, carbs and fat dots out of the bubble and in
 * orbit around it (GLOW-UP.md, "arrival"). No borrowed symbol: Moonly opens on
 * a moon because a moon is what it is about, and this app is about a day being
 * filled in.
 *
 * **How it is 3D without a 3D renderer.** React Native has perspective and
 * rotation in its transforms but no `preserve-3d`, so there is no depth buffer
 * to put a thick ring in. There does not need to be: a ring with thickness is a
 * stack of flat copies of the same ring, each a little further back, and every
 * copy is a plane parallel to the others. So each layer gets the same rotation
 * and is then moved, in two dimensions, to where its depth would have projected
 * — `(d·sin b, −d·cos b·sin a)`, scaled for perspective — and shaded darker the
 * further back it sits. Fourteen layers of one SVG path on the UI thread is a
 * lighter load than any canvas, and it looks like an extrusion because
 * geometrically it is one.
 *
 * The spheres orbit on a tilted plane in the same way, and pass behind the ring
 * by being drawn twice — once under the layers and once over them — with each
 * copy visible only on its own half of the orbit.
 */
export function RingObject({ size = 220, animate = true }: { size?: number; animate?: boolean }) {
  const reduced = useReducedMotion();
  const moving = animate && !reduced;
  const clock = useSharedValue(0);

  useEffect(() => {
    if (!moving) {
      cancelAnimation(clock);
      clock.value = 0.25;
      return;
    }
    // One long linear clock; every motion below is a function of it, so the
    // tumble, the sheen and the orbit can never drift out of step.
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: 18000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [moving, clock]);

  const depths = useMemo(() => Array.from({ length: LAYERS }, (_, i) => i), []);

  return (
    <View style={{ width: size * 1.5, height: size * 1.2, alignItems: 'center', justifyContent: 'center' }}>
      {SPHERES.map((sphere, i) => (
        <Sphere key={`back-${sphere.color}`} clock={clock} index={i} size={size} front={false} />
      ))}
      {depths
        .slice()
        .reverse()
        .map((layer) => (
          <Layer key={layer} clock={clock} layer={layer} size={size} />
        ))}
      {SPHERES.map((sphere, i) => (
        <Sphere key={`front-${sphere.color}`} clock={clock} index={i} size={size} front />
      ))}
    </View>
  );
}

const LAYERS = 14;
/** The perspective distance, in points. Nearer is more dramatic and less legible. */
const PERSPECTIVE = 800;

/** Tilt and turn at a point on the clock. Two slow sines, out of phase. */
function pose(t: number) {
  'worklet';
  const phase = t * Math.PI * 2 * 2;
  const a = ((34 + 8 * Math.sin(phase)) * Math.PI) / 180;
  const b = ((24 * Math.sin(phase * 0.5)) * Math.PI) / 180;
  const c = ((6 * Math.sin(phase * 0.5 + 1)) * Math.PI) / 180;
  return { a, b, c };
}

function Layer({ clock, layer, size }: { clock: SharedValue<number>; layer: number; size: number }) {
  const colors = useColors();
  const gradient = `ring3d-${useId().replace(/:/g, '')}`;
  /* Front layer at +thickness/2, back at −thickness/2. */
  const thickness = size * 0.085;
  const d = thickness / 2 - (thickness * layer) / (LAYERS - 1);
  const front = layer === 0;

  const style = useAnimatedStyle(() => {
    const { a, b, c } = pose(clock.value);
    const z = d * Math.cos(a) * Math.cos(b);
    const s = PERSPECTIVE / (PERSPECTIVE - z);
    return {
      transform: [
        { translateX: d * Math.sin(b) * s },
        { translateY: -d * Math.cos(b) * Math.sin(a) * s },
        { perspective: PERSPECTIVE },
        { rotateX: `${a}rad` },
        { rotateY: `${b}rad` },
        { rotateZ: `${c}rad` },
        { scale: s },
      ],
    };
  });

  /* Shaded by depth: the face is lit, the sides fall away towards the back. */
  const shade = 1 - (layer / (LAYERS - 1)) * 0.32;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.centre, style]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 64 64" style={{ opacity: front ? 1 : 1 }}>
        <Defs>
          <LinearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="8.5" y1="6.8" x2="55.5" y2="57.2">
            <Stop offset="0" stopColor={mix(colors.calories, '#0b3d27', 1 - shade)} />
            <Stop offset="1" stopColor={mix(colors.logoRamp, '#0b3d2f', 1 - shade)} />
          </LinearGradient>
        </Defs>
        {front && (
          <Circle cx="32" cy="30.3" r="20" fill="none" strokeWidth="7" strokeOpacity="0.22" stroke="#ffffff" />
        )}
        <Path d={TAIL} fill={`url(#${gradient})`} />
        <Path d={ARC} fill="none" stroke={`url(#${gradient})`} strokeWidth="7" strokeLinecap="round" />
        {front && (
          /* The lit edge: a thin highlight riding the top of the face. */
          <Path
            d={ARC}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.55}
            strokeWidth="1.4"
            strokeLinecap="round"
            transform="translate(-0.6 -1.6)"
          />
        )}
      </Svg>
    </Animated.View>
  );
}

const SPHERES = [
  { color: 'protein', offset: 0 },
  { color: 'carbs', offset: 1 / 3 },
  { color: 'fat', offset: 2 / 3 },
] as const;

function Sphere({
  clock,
  index,
  size,
  front,
}: {
  clock: SharedValue<number>;
  index: number;
  size: number;
  front: boolean;
}) {
  const colors = useColors();
  const sphere = SPHERES[index]!;
  const base = colors[sphere.color];
  const diameter = size * 0.13;
  const radius = size * 0.62;
  const tilt = (68 * Math.PI) / 180;

  const style = useAnimatedStyle(() => {
    const theta = (clock.value * 3 + sphere.offset) * Math.PI * 2;
    const x = radius * Math.cos(theta);
    const y = radius * Math.sin(theta) * Math.cos(tilt);
    const z = radius * Math.sin(theta) * Math.sin(tilt);
    const s = PERSPECTIVE / (PERSPECTIVE - z);
    const inFront = z > 0;
    return {
      opacity: inFront === front ? 1 : 0,
      transform: [{ translateX: x * s }, { translateY: y * s + size * 0.02 }, { scale: s }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sphere,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: base,
          experimental_backgroundImage: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${base} 45%, ${mix(base, '#000000', 0.35)} 100%)`,
          boxShadow: `0px 0px ${Math.round(diameter * 0.8)}px ${mix(base, '#ffffff', 0.1)}`,
        },
        style,
      ]}
    />
  );
}

/** The same two paths `<Logo>` draws, on its 64-unit grid. */
const ARC = 'M32 10.3A20 20 0 1 1 14.18 39.38';
const TAIL = 'M27.28 50.76Q19.36 54.29 14.51 56.45A1.9 1.9 0 0 0 11.49 54.15Q12.17 48.71 13.29 39.83Z';

function mix(hex: string, other: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const channel = (shift: number) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  sphere: { position: 'absolute' },
});
