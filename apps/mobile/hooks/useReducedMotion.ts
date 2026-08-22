import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether this person has asked for less motion.
 *
 * On the web one `prefers-reduced-motion` block kills every animation in the
 * app from a single place. RN has no such switch — `AccessibilityInfo` has to
 * be asked, per component, and it can change while the app is open. So this
 * exists *before* the first animated component rather than after the fortieth:
 * a rule that has to be remembered at forty call sites is a rule that will be
 * missed, and the one it will be missed at is the celebration.
 *
 * The contract every animated component here honours:
 *
 *   - The spring is decoration, not information. Every animated value is also
 *     present as text, so reduced motion means jumping to the end state, never
 *     showing less.
 *   - The celebration does not fire at all. Confetti has no end state worth
 *     arriving at; for someone who asked for less motion the correct amount is
 *     none.
 *
 * Starts `false` and corrects on the first tick. The alternative — starting
 * `true` and relaxing — would flash the end state at everybody else, which is
 * the same bug pointed the other way.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/**
 * A duration that collapses to nothing when motion is reduced — the shape every
 * `withTiming` in the app takes. Zero rather than one millisecond: Reanimated
 * treats 0 as "be there already", which is the intent.
 */
export function useMotionDuration(ms: number): number {
  return useReducedMotion() ? 0 : ms;
}
