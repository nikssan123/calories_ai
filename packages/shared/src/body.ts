import type { MuscleGroup } from './muscles.ts';

/**
 * Where a muscle is, so an exercise can draw its own icon.
 *
 * The catalogue has five emoji across two hundred and twenty exercises, which
 * makes 🏋️ a statement about the *category* rather than about the movement:
 * every barbell lift wears the same glyph and the list is a wall of them. There
 * is no emoji for a Romanian deadlift and there never will be.
 *
 * But every row already carries `muscles`, primary first, over fourteen groups.
 * A body with fourteen highlightable regions turns that into an icon that is
 * different for all two hundred and twenty, costs no assets, is correct in both
 * themes, and stays correct when the catalogue grows.
 *
 * It is also the more useful thing to show. Somebody who cannot tell a good
 * morning from a rack pull by name reads "the back of your legs" immediately —
 * which is the same reason the picker lets you tap a body instead of typing.
 *
 * The geometry lives here rather than in either client because there are two of
 * them and a deltoid must not be in one place on the phone and another on the
 * web. Both draw the same numbers; only the rendering differs — `react-native-svg`
 * on mobile, plain SVG on the web.
 */

/** A rounded rectangle: `[x, y, width, height, radius]`. */
export type BodyShape = readonly [number, number, number, number, number];

/** A circle: `[cx, cy, r]`. Only the head needs one. */
export type BodyCircle = readonly [number, number, number];

/**
 * The box one figure is drawn in. Two of them side by side for the full map,
 * which is why the front figure is offset by `FIGURE_GAP` in `BODY_MAP_BOX`.
 */
export const FIGURE_BOX = { width: 44, height: 50 } as const;

/** Both figures, plus a gutter, plus room under them for the two captions. */
export const BODY_MAP_BOX = { width: 96, height: 52 } as const;

/** Where each figure starts inside `BODY_MAP_BOX`. */
export const FIGURE_OFFSET = { front: 2, back: 50 } as const;

/**
 * The silhouette every figure is built from.
 *
 * Blocks rather than anatomy on purpose. At the size this is actually used —
 * twenty-four points in a list row — the only thing that survives is a lit patch
 * in roughly the right place, and a detailed outline at that scale is mud. The
 * large map in the picker uses the same shapes scaled up, so the icon and the
 * thing you tapped to get it are recognisably the same drawing.
 */
export const FIGURE_PARTS: {
  head: BodyCircle;
  blocks: readonly BodyShape[];
} = {
  head: [22, 5.5, 4.2],
  blocks: [
    [20, 8.5, 4, 3, 1], // neck
    [13, 10.5, 18, 10, 5], // upper torso
    [14.5, 19, 15, 9, 3], // abdomen
    [14, 26.5, 16, 6, 3], // pelvis
    [8.5, 11.5, 4.6, 10, 2.3], // upper arm, left
    [30.9, 11.5, 4.6, 10, 2.3], // upper arm, right
    [7.5, 20.8, 4.2, 9.5, 2.1], // forearm, left
    [32.3, 20.8, 4.2, 9.5, 2.1], // forearm, right
    [14.4, 31.5, 6.6, 10.5, 3.2], // thigh, left
    [23, 31.5, 6.6, 10.5, 3.2], // thigh, right
    [15.4, 41.2, 5.2, 7.5, 2.6], // shin, left
    [24, 41.2, 5.2, 7.5, 2.6], // shin, right
  ],
};

/**
 * Which view a muscle is visible from.
 *
 * `both` is not a hedge — the deltoid cap and the forearm genuinely read from
 * either side, and lighting them on both figures is what stops a shoulder press
 * looking like it works only half a body.
 */
export type BodyView = 'front' | 'back';

export interface BodyRegion {
  /** `both` lights the same shapes on each figure. */
  readonly view: BodyView | 'both';
  readonly shapes: readonly BodyShape[];
}

/* Shared between the two views: the same shape means the same place. */
const SHOULDER_CAPS: readonly BodyShape[] = [
  [8.6, 10.7, 6.4, 5.6, 2.8],
  [29, 10.7, 6.4, 5.6, 2.8],
];
/* Biceps from the front, triceps from the back — the same piece of arm. */
const UPPER_ARMS: readonly BodyShape[] = [
  [8.7, 15.4, 4.3, 6.2, 2.1],
  [30.9, 15.4, 4.3, 6.2, 2.1],
];
const FOREARMS: readonly BodyShape[] = [
  [7.6, 21, 4, 9, 2],
  [32.4, 21, 4, 9, 2],
];

export const BODY_REGIONS: Record<MuscleGroup, BodyRegion> = {
  chest: { view: 'front', shapes: [[13.6, 11.8, 16.8, 6.6, 3]] },
  core: { view: 'front', shapes: [[15, 19.4, 14, 8.2, 2.6]] },
  biceps: { view: 'front', shapes: UPPER_ARMS },
  quads: {
    view: 'front',
    shapes: [
      [14.5, 32, 6.4, 8.5, 3.1],
      [23.1, 32, 6.4, 8.5, 3.1],
    ],
  },
  adductors: { view: 'front', shapes: [[19.2, 32, 5.6, 7, 2.6]] },
  shoulders: { view: 'both', shapes: SHOULDER_CAPS },
  forearms: { view: 'both', shapes: FOREARMS },
  traps: { view: 'back', shapes: [[14.8, 10.6, 14.4, 5, 2.4]] },
  back: { view: 'back', shapes: [[13.6, 15, 16.8, 7.4, 3]] },
  lower_back: { view: 'back', shapes: [[15.4, 21.8, 13.2, 5.6, 2.6]] },
  triceps: { view: 'back', shapes: UPPER_ARMS },
  glutes: { view: 'back', shapes: [[14, 26.6, 16, 5.8, 2.8]] },
  hamstrings: {
    view: 'back',
    shapes: [
      [14.5, 33, 6.4, 8, 3.1],
      [23.1, 33, 6.4, 8, 3.1],
    ],
  },
  calves: {
    view: 'back',
    shapes: [
      [15.4, 41.4, 5.2, 7.2, 2.6],
      [24, 41.4, 5.2, 7.2, 2.6],
    ],
  },
};

/** Whether this muscle is drawn on that figure. */
export function muscleOnView(muscle: MuscleGroup, view: BodyView): boolean {
  const region = BODY_REGIONS[muscle];
  return region.view === view || region.view === 'both';
}

/**
 * Which single figure an exercise's icon should show.
 *
 * The primary muscle decides, and a muscle visible from both sides does not get
 * a vote — an overhead press is `shoulders, triceps` and belongs on the back
 * view where the triceps are, not on a front view where only the caps light up
 * and it looks like a lateral raise.
 */
export function viewForMuscles(muscles: readonly MuscleGroup[]): BodyView {
  for (const muscle of muscles) {
    const region = BODY_REGIONS[muscle];
    if (region.view !== 'both') return region.view;
  }
  return 'front';
}

/**
 * The regions to paint on one figure, in draw order, with their emphasis.
 *
 * The primary is solid and everything else is faded, because an exercise that
 * lit four muscles equally would say "compound" and nothing else. Secondaries
 * are what makes a chin-up distinguishable from a lat pulldown at a glance.
 *
 * A muscle appearing twice — `shoulders` on both views — is painted once, at its
 * strongest emphasis, so a secondary never overpaints a primary.
 */
export function litRegions(
  muscles: readonly MuscleGroup[],
  view: BodyView,
): { shapes: readonly BodyShape[]; primary: boolean }[] {
  const seen = new Set<MuscleGroup>();
  const out: { shapes: readonly BodyShape[]; primary: boolean }[] = [];
  muscles.forEach((muscle, i) => {
    if (seen.has(muscle) || !BODY_REGIONS[muscle] || !muscleOnView(muscle, view)) return;
    seen.add(muscle);
    out.push({ shapes: BODY_REGIONS[muscle].shapes, primary: i === 0 });
  });
  // Primaries last so they land on top of an overlapping secondary — `quads`
  // and `adductors` share the inner thigh, and a leg press must not have its
  // primary erased by its own secondary.
  return out.sort((a, b) => Number(a.primary) - Number(b.primary));
}
