import { Easing } from 'react-native-reanimated';

/**
 * The three easings, verbatim.
 *
 * `--ease-spring`, `--ease-pop` and `--ease-out` are cubic-béziers in
 * `globals.css`, and `Easing.bezier` takes the same four numbers — so these are
 * a copy, not a retune. Deliberately not `withSpring`: matching the web is the
 * point, and the overshoot is the entire brief. A physical spring with
 * plausible-looking constants lands somewhere near these curves and never on
 * them, which is how two clients of one product start to feel like two products.
 *
 * Three, and only three. One spring with real overshoot for anything reporting
 * a number changing, one sharper pop for anything you just touched, and one
 * plain ease for chrome that should not draw attention to itself. Motion is the
 * cheapest playfulness there is and the easiest to overdo.
 */
export const ease = {
  spring: Easing.bezier(0.2, 1.7, 0.4, 1),
  pop: Easing.bezier(0.3, 2.2, 0.5, 1),
  out: Easing.bezier(0.22, 1, 0.36, 1),
} as const;

export const duration = {
  spring: 700,
  quick: 180,
  /** The one-shot acknowledgement — `@keyframes pop` runs 420ms. */
  pop: 420,
} as const;

/** The default ledge depth. `chunk-sm` is 2. */
export const CHUNK_DEPTH = 4;

/** `--radius`: 24px. Cards are properly round. */
export const RADIUS = 24;
