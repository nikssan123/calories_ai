import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Where to put the packet, lit.
 *
 * The white-bordered rectangle said the same thing, and said it flatly: a
 * window over a camera. This is the same window in the app's teal (GLOW-UP.md,
 * "scanner glow") — four glowing corners rather than a whole outline, so the
 * packet inside is framed rather than boxed in, a slow breath of light around
 * the edge, and a scan line sweeping top to bottom so the screen visibly is
 * looking. While a code is being looked up the line runs faster, which is the
 * one piece of state this has to say without words.
 *
 * Dark is right here, and it is the one place in the app that is dark on
 * purpose: it is a camera. The edges of the preview fall away into a vignette,
 * which puts the eye on the window without a mask cutting the picture up.
 *
 * Nothing in it takes a touch, and the hint and the confirmation sit below it
 * rather than across it — the packet is the thing being aimed.
 */
const TEAL = '#23d3b0';

export function ScanWindow({ looking }: { looking: boolean }) {
  const reduced = useReducedMotion();
  const sweep = useSharedValue(0);
  const breath = useSharedValue(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(sweep);
      cancelAnimation(breath);
      return;
    }
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: looking ? 700 : 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    breath.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(sweep);
      cancelAnimation(breath);
    };
  }, [reduced, looking, sweep, breath]);

  const laser = useAnimatedStyle(() => ({ transform: [{ translateY: 10 + sweep.value * Math.max(0, height - 22) }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.55 + breath.value * 0.45 }));

  return (
    <>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { experimental_backgroundImage: 'radial-gradient(75% 55% at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)' },
        ]}
      />
      <View style={styles.window} pointerEvents="none" onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.halo, glow]} />
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
        {!reduced && height > 0 && (
          <Animated.View
            style={[
              styles.laser,
              {
                experimental_backgroundImage: `linear-gradient(90deg, rgba(35,211,176,0) 0%, ${TEAL} 30%, #8ff7dd 50%, ${TEAL} 70%, rgba(35,211,176,0) 100%)`,
              },
              laser,
            ]}
          />
        )}
      </View>
    </>
  );
}

const CORNER = 38;
const EDGE = 3.5;

const styles = StyleSheet.create({
  window: { width: '76%', aspectRatio: 1.6 },
  halo: {
    borderRadius: 26,
    boxShadow: `0px 0px 0px 1px rgba(35,211,176,0.28), 0px 0px 40px 0px rgba(35,211,176,0.28), inset 0px 0px 36px 0px rgba(35,211,176,0.12)`,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: TEAL,
    boxShadow: `0px 0px 10px 0px rgba(35,211,176,0.9)`,
  },
  tl: { left: 0, top: 0, borderLeftWidth: EDGE, borderTopWidth: EDGE, borderTopLeftRadius: 24 },
  tr: { right: 0, top: 0, borderRightWidth: EDGE, borderTopWidth: EDGE, borderTopRightRadius: 24 },
  bl: { left: 0, bottom: 0, borderLeftWidth: EDGE, borderBottomWidth: EDGE, borderBottomLeftRadius: 24 },
  br: { right: 0, bottom: 0, borderRightWidth: EDGE, borderBottomWidth: EDGE, borderBottomRightRadius: 24 },
  laser: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 0,
    height: 2,
    borderRadius: 1,
    boxShadow: '0px 0px 12px 3px rgba(35,211,176,0.7)',
  },
});
