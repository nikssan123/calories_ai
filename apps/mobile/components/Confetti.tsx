import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { ease, useColors } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The celebration.
 *
 * Fired when a macro target is met — the one unambiguously good thing that
 * happens in a food tracker several times a day. Deliberately *not* fired for
 * hitting the calorie target: "you have eaten exactly enough" is not a moment,
 * and throwing a party at the point someone crosses their limit is the kind of
 * cheerfulness that reads as sarcasm by dinner.
 *
 * It bursts out of the element it is placed in, so the parent needs to be
 * positioned. Everything is transform and opacity, which Reanimated runs on the
 * UI thread, and the whole thing unmounts itself when it is done rather than
 * leaving fourteen absolutely positioned views behind for the session.
 *
 * Under reduced motion it does not fire at all. That is the one place in this
 * app where less motion means *none* rather than an instant jump to the end
 * state: a burst has no end state worth arriving at, and the information it
 * carries — "you hit your protein" — is already on the bar it came out of.
 */

const PIECES = 14;
const DURATION_MS = 1100;

interface Piece {
  dx: number;
  dy: number;
  dr: number;
  size: number;
  delay: number;
  round: boolean;
  color: string;
}

function burst(colors: string[]): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => {
    // A cone pointing up and outwards, so the pieces arc away from the thing
    // that just succeeded rather than raining onto it.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const distance = 34 + Math.random() * 46;
    return {
      dx: Math.cos(angle) * distance,
      // Gravity, roughly: everything ends lower than it was thrown.
      dy: Math.sin(angle) * distance + 42,
      dr: (Math.random() - 0.5) * 720,
      size: 5 + Math.random() * 5,
      delay: Math.random() * 90,
      round: i % 3 === 0,
      color: colors[i % colors.length]!,
    };
  });
}

export function Confetti({ trigger }: { trigger: number | string | null }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const [pieces, setPieces] = useState<Piece[] | null>(null);

  /*
   * The first value of `trigger` is the state on arrival, not a thing that just
   * happened — an already-met target must not throw confetti every launch.
   */
  const seen = useRef<number | string | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (seen.current === undefined) {
      seen.current = trigger;
      return;
    }
    if (trigger === seen.current) return;
    seen.current = trigger;
    if (trigger === null || reduced) return;

    setPieces(
      burst([colors.calories, colors.protein, colors.carbs, colors.fat, colors.exercise]),
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPieces(null), DURATION_MS + 200);
  }, [trigger, reduced, colors]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!pieces) return null;

  return (
    <View pointerEvents="none" style={styles.stage}>
      {pieces.map((piece, i) => (
        <Piece key={i} piece={piece} />
      ))}
    </View>
  );
}

function Piece({ piece }: { piece: Piece }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, { duration: DURATION_MS, easing: ease.out }),
    );
  }, [piece.delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: piece.dx * progress.value },
      { translateY: piece.dy * progress.value },
      { rotate: `${piece.dr * progress.value}deg` },
      { scale: 1 - progress.value * 0.4 },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: piece.size,
          height: piece.size,
          borderRadius: piece.round ? piece.size / 2 : 1.5,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  /*
   * Centred on the parent and zero-sized, so every piece starts from one point
   * and the stage itself can never intercept a touch or add height to the row
   * it sits in.
   */
  stage: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
