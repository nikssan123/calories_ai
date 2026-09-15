import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { RingObject } from '@/components/RingObject';
import { Stage } from '@/components/onboarding/Stage';
import { useMotionDuration } from '@/hooks/useReducedMotion';
import { useColors } from '@/theme';

/**
 * The ring size here and the native splash image are one decision.
 *
 * `assets/splash-icon.png` is this ring at the first frame of its clock, drawn
 * by `scripts/splash-icon.mjs` onto a canvas `SPLASH_CANVAS` times this size,
 * and `imageWidth` in app.json is that canvas in points. Both are centred on the
 * screen, so the hand-off from the native splash to this view lands the ring on
 * itself and the only thing that visibly changes is that it starts to turn.
 * 130 is also what fits Android's splash icon mask with the dots still inside.
 */
export const BOOT_RING = 130;
export const SPLASH_CANVAS = 1.7;

/**
 * What a cold launch shows while it works out where to go.
 *
 * The native splash can only hold a picture, and it used to hold the flat mark
 * for as long as the session and the setup state took to resolve — on a slow
 * connection, a second or more of the old logo. This takes over as soon as it
 * has laid out: the same warm light as the walk and the ring the app opens on,
 * turning. It is not the arrival moment (GLOW-UP.md keeps that on the welcome
 * screen) and it adds no time — it is only up for the wait that was already
 * there, and fades as soon as the gate has an answer, with the right screen
 * already drawn underneath.
 *
 * One-shot. `settled` goes false again after a sign-in while setup loads, and
 * that wait belongs to the saving screen, not to this.
 */
export function Boot({ settled }: { settled: boolean }) {
  const colors = useColors();
  const [gone, setGone] = useState(false);
  const leaving = useRef(false);
  const out = useMotionDuration(280);
  const fadeIn = useMotionDuration(700);
  const opacity = useSharedValue(1);
  /* The native splash has no light pools, so they come up rather than appear. */
  const light = useSharedValue(0);

  useEffect(() => {
    light.value = withTiming(1, { duration: fadeIn, easing: Easing.out(Easing.quad) });
  }, [light, fadeIn]);

  useEffect(() => {
    if (!settled || leaving.current) return;
    leaving.current = true;
    opacity.value = withTiming(0, { duration: out, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(setGone)(true);
    });
  }, [settled, opacity, out]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const glow = useAnimatedStyle(() => ({ opacity: light.value }));

  if (gone) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }, fade]}
      pointerEvents={settled ? 'none' : 'auto'}
      onLayout={() => void SplashScreen.hideAsync()}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, glow]}>
        <Stage />
      </Animated.View>
      <View style={styles.centre}>
        <RingObject size={BOOT_RING} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centre: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
