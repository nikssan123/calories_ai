/**
 * The cast, as geometry and nothing else.
 *
 * Every shape Ember, Skye and Plum are made of, on a 120-unit grid, as plain
 * data. Three renderers draw from it:
 * - the phone's `Character`, as react-native-svg layers it can move;
 * - the Android widget, as an SVG string for a launcher to rasterise;
 * - the web, as inline SVG.
 * The figure on the home screen, the site and the app is one drawing, the way
 * `ring.ts` shares its arithmetic with `CalorieRing`.
 *
 * No React and no React Native in here, so the headless widget handler can
 * import it without dragging a UI tree along.
 *
 * Fills are either a colour or one of three gradient names ("body", "crown",
 * "flame"), which each renderer turns into a gradient of its own with an id it
 * controls. Ids are per-view in one renderer and per-document in the other.
 */
export type CastName = 'ember' | 'skye' | 'plum';

/**
 * What they can look like. There is deliberately no mood for being over, or
 * under, or for anything a number came to (CAST.md): a mood that is not in
 * this union cannot be drawn.
 */
export type Mood =
  | 'idle'
  | 'hop'
  | 'wave'
  | 'thinking'
  | 'cheer'
  | 'proud'
  | 'hopeful'
  | 'sleepy'
  /* The small things they do between moods (see `life.ts`), and a poke. */
  | 'stretch'
  | 'yawn'
  | 'giggle'
  /* On an edge, legs over it: the macro card on Today. */
  | 'sit'
  /* Something in the right hand. What, is `Prop`. */
  | 'hold'
  | 'taste'
  /* At the pot, in the kitchen scene. */
  | 'stir'
  /* A packet just read by the scanner. */
  | 'surprised'
  /* Just back from the park path: hands on hips, eyes shut, breathing hard. */
  | 'puffed';

/** What a hand can hold. Only drawn in the moods that hold something. */
export type Prop = 'mug' | 'toast' | 'spoon' | 'bowl' | 'medal' | 'cake';

/**
 * What they wear for the time of year: a scarf in winter, a flower in spring, a
 * leaf in autumn, and nothing in summer. Small and in the same place on each of
 * them, so it reads as the season rather than as a costume.
 */
export type Accessory = 'scarf' | 'flower' | 'leaf';

export type Motion = 'breathe' | 'sleep' | 'hop' | 'cheer' | 'pant';
export type Fx = 'bubbles' | 'zz' | 'sparkle' | 'flame' | 'confetti' | 'hearts' | 'steam' | 'spark';

export const GRID = 120;

type Ramp = readonly [string, string, string];
export type Gradient = 'body' | 'crown' | 'flame';

export type Shape =
  | {
      el: 'path';
      d: string;
      fill?: string | Gradient;
      stroke?: string;
      width?: number;
      round?: boolean;
      opacity?: number;
    }
  | {
      el: 'ellipse';
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill: string | Gradient;
      opacity?: number;
      rotate?: number;
      stroke?: string;
      width?: number;
    }
  | { el: 'circle'; cx: number; cy: number; r: number; fill: string | Gradient; opacity?: number }
  | {
      el: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      rx: number;
      fill: string;
      rotate?: number;
      stroke?: string;
      width?: number;
    }
  /** Translated to (x, y) and scaled — how the flame is held in a hand. */
  | { el: 'group'; x: number; y: number; scale: number; children: Shape[] };

export interface Gradients {
  body: Ramp;
  crown: Ramp | null;
}

export interface Drawing {
  gradients: Gradients;
  /** Everything that moves only with the body. Drawn over `swing`. */
  body: Shape[];
  /**
   * An arm that moves on its own, behind the body, turning about
   * `pivots.shoulder`: the waving one, or the one stirring with a ladle in it.
   */
  swing: { kind: 'wave' | 'stir'; shapes: Shape[] } | null;
  /** Legs hanging over an edge, swinging about `pivots.legs`. Empty unless sitting. */
  legs: Shape[];
  /** Eyes that blink, scaled about the eye line. Empty when the eyes are closed or smiling. */
  eyes: Shape[];
  /** The effect beside them, pulsing about `pivots.fx`. */
  fx: Shape[];
  motion: Motion;
  effect: Fx | null;
  pivots: {
    shoulder: readonly [number, number];
    eyes: readonly [number, number];
    fx: readonly [number, number];
    legs: readonly [number, number];
  };
}

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
  /** Where a scarf sits (its centre line) and how far it reaches either side. */
  scarf: readonly [y: number, half: number];
  /** Where a flower or a leaf is pinned on the head. */
  pin: readonly [x: number, y: number];
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
    scarf: [90, 28],
    pin: [37, 56],
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
    scarf: [92, 27],
    pin: [37, 56],
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
    scarf: [95, 30],
    pin: [44, 62],
  },
};

type Eyes = 'open' | 'up' | 'hope' | 'happy' | 'closed' | 'wide';
type Mouth = 'smile' | 'open' | 'flat' | 'small' | 'o' | 'yawn';
type Pose = 'down' | 'up' | 'hip' | 'clasp' | 'chin' | 'wave' | 'flame' | 'rest' | 'hold' | 'stir' | 'startle';

const MOODS: Record<
  Mood,
  { eyes: Eyes; mouth: Mouth; arms: readonly [Pose, Pose]; fx?: Fx; motion: Motion; sit?: boolean }
> = {
  idle: { eyes: 'open', mouth: 'smile', arms: ['down', 'down'], motion: 'breathe' },
  hop: { eyes: 'open', mouth: 'smile', arms: ['down', 'down'], motion: 'hop' },
  wave: { eyes: 'open', mouth: 'open', arms: ['down', 'wave'], motion: 'breathe' },
  thinking: { eyes: 'up', mouth: 'flat', arms: ['down', 'chin'], fx: 'bubbles', motion: 'breathe' },
  cheer: { eyes: 'happy', mouth: 'open', arms: ['up', 'up'], fx: 'confetti', motion: 'cheer' },
  proud: { eyes: 'happy', mouth: 'smile', arms: ['hip', 'flame'], fx: 'flame', motion: 'breathe' },
  hopeful: { eyes: 'hope', mouth: 'small', arms: ['clasp', 'clasp'], fx: 'sparkle', motion: 'breathe' },
  sleepy: { eyes: 'closed', mouth: 'o', arms: ['down', 'down'], fx: 'zz', motion: 'sleep' },
  stretch: { eyes: 'closed', mouth: 'o', arms: ['up', 'up'], motion: 'breathe' },
  yawn: { eyes: 'closed', mouth: 'yawn', arms: ['down', 'down'], motion: 'breathe' },
  giggle: { eyes: 'happy', mouth: 'open', arms: ['up', 'up'], fx: 'hearts', motion: 'cheer' },
  sit: { eyes: 'open', mouth: 'smile', arms: ['rest', 'rest'], motion: 'breathe', sit: true },
  hold: { eyes: 'open', mouth: 'smile', arms: ['down', 'hold'], motion: 'breathe' },
  taste: { eyes: 'happy', mouth: 'o', arms: ['down', 'hold'], motion: 'breathe' },
  stir: { eyes: 'up', mouth: 'small', arms: ['down', 'stir'], motion: 'breathe' },
  surprised: { eyes: 'wide', mouth: 'o', arms: ['startle', 'startle'], fx: 'spark', motion: 'breathe' },
  puffed: { eyes: 'closed', mouth: 'o', arms: ['hip', 'hip'], motion: 'pant' },
};

const INK = '#2a1f18';
const CHEEK = '#ff6f91';

type Arm = readonly [number, number, number, number, number, number];

const mirror = (a: Arm): Arm => [GRID - a[0], a[1], GRID - a[2], a[3], GRID - a[4], a[5]];
const q = (a: Arm) => `M${a[0]} ${a[1]}Q${a[2]} ${a[3]} ${a[4]} ${a[5]}`;

function arm(f: Figure, pose: Pose, side: 'L' | 'R'): Arm {
  const { sx, sy, fy } = f;
  const up: Arm = [sx + 1, sy - 6, sx - 11, sy - 16, sx - 9, sy - 30];
  if (pose === 'wave' || pose === 'flame') return mirror(up);
  if (pose === 'chin') return [GRID - sx, sy, GRID - sx - 2, fy + 20, 71, fy + 12];
  // Raised to the pot's rim, so the ladle it holds goes down into the pot.
  if (pose === 'stir') return [GRID - sx, sy, GRID - sx + 14, sy - 5, GRID - sx + 18, sy - 27];
  const left: Record<'down' | 'up' | 'hip' | 'clasp' | 'rest' | 'hold' | 'startle', Arm> = {
    down: [sx, sy, sx - 8, sy + 7, sx - 6, sy + 15],
    up,
    hip: [sx, sy, sx - 10, sy + 2, sx - 3, sy + 11],
    clasp: [sx, sy, sx + 6, sy + 13, 55, sy + 10],
    // Hands in the lap, for sitting.
    rest: [sx, sy, sx - 6, sy + 9, sx + 2, sy + 14],
    // Forward and a little up, with something in the hand.
    hold: [sx, sy, sx - 10, sy - 2, sx - 12, sy - 12],
    // Thrown out and up, for a surprise.
    startle: [sx, sy - 2, sx - 12, sy - 8, sx - 14, sy - 19],
  };
  const a = left[pose];
  return side === 'R' ? mirror(a) : a;
}

const inFront = (pose: Pose) => pose === 'clasp' || pose === 'chin';
const blinking = (eyes: Eyes) => eyes === 'open' || eyes === 'up' || eyes === 'hope' || eyes === 'wide';

function bodyShape(name: CastName): Shape {
  if (name === 'ember') return { el: 'circle', cx: 60, cy: 74, r: 32, fill: 'body' };
  if (name === 'skye') return { el: 'ellipse', cx: 60, cy: 75, rx: 31, ry: 32, fill: 'body' };
  return { el: 'path', d: 'M60 36C66 50 92 62 92 80C92 97 78 106 60 106C42 106 28 97 28 80C28 62 54 50 60 36Z', fill: 'body' };
}

/** The one feature that tells each apart in silhouette. Plum's is the point of the drop itself. */
function crownShapes(name: CastName): Shape[] {
  if (name === 'ember') {
    return [{ el: 'path', d: 'M47 50C46 38 52 30 57 20C59 27 61 30 63 33C65 30 68 28 71 25C74 33 75 42 73 50Z', fill: 'crown' }];
  }
  if (name === 'skye') {
    return [
      { el: 'path', d: 'M60 46C60 40 60 35 61 30', stroke: '#0e9a5a', width: 3, round: true },
      { el: 'path', d: 'M60 36C52 37 45 32 44 23C52 22 59 27 60 36Z', fill: 'crown' },
      { el: 'path', d: 'M61 31C66 25 72 22 79 24C77 31 69 35 61 32Z', fill: 'crown' },
    ];
  }
  return [];
}

function eyeShapes(f: Figure, eyes: Eyes): Shape[] {
  const y = f.fy;
  const xs = [60 - f.ex, 60 + f.ex];
  const line = { stroke: INK, width: 2.8, round: true };
  if (eyes === 'happy') {
    return xs.map((x) => ({ el: 'path', d: `M${x - 4.5} ${y + 1.5}Q${x} ${y - 5} ${x + 4.5} ${y + 1.5}`, ...line }) as Shape);
  }
  if (eyes === 'closed') {
    return xs.map((x) => ({ el: 'path', d: `M${x - 4.5} ${y}Q${x} ${y + 4} ${x + 4.5} ${y}`, ...line }) as Shape);
  }
  const dx = eyes === 'up' ? 1.6 : 0;
  const dy = eyes === 'up' ? -2 : eyes === 'wide' ? -1 : 0;
  const big = eyes === 'hope';
  const wide = eyes === 'wide';
  return xs.flatMap((x): Shape[] => [
    { el: 'ellipse', cx: x + dx, cy: y + dy, rx: wide ? 4.4 : big ? 3.9 : 3.6, ry: wide ? 5.8 : big ? 5.2 : 4.8, fill: INK },
    { el: 'circle', cx: x + dx + 1.3, cy: y + dy - 2.1, r: wide ? 1.8 : big ? 1.6 : 1.3, fill: '#ffffff' },
  ]);
}

function browShapes(f: Figure): Shape[] {
  const y = f.fy;
  const [l, r] = [60 - f.ex, 60 + f.ex];
  const line = { stroke: INK, width: 2, round: true };
  return [
    { el: 'path', d: `M${l - 5} ${y - 9}Q${l} ${y - 12} ${l + 4} ${y - 10.5}`, ...line },
    { el: 'path', d: `M${r - 4} ${y - 10.5}Q${r} ${y - 12} ${r + 5} ${y - 9}`, ...line },
  ];
}

function mouthShapes(f: Figure, mouth: Mouth): Shape[] {
  const y = f.fy;
  const line = { stroke: INK, width: 2.6, round: true };
  switch (mouth) {
    case 'open':
      return [
        { el: 'path', d: `M54 ${y + 7}Q60 ${y + 18} 66 ${y + 7}Z`, fill: INK, stroke: INK, width: 1.5, round: true },
        { el: 'ellipse', cx: 60, cy: y + 10.8, rx: 2.8, ry: 1.5, fill: '#ff7a8a' },
      ];
    case 'o':
      return [{ el: 'ellipse', cx: 60, cy: y + 9, rx: 2, ry: 2.4, fill: INK }];
    case 'yawn':
      return [
        { el: 'ellipse', cx: 60, cy: y + 10, rx: 3.6, ry: 5, fill: INK },
        { el: 'ellipse', cx: 60, cy: y + 13, rx: 2, ry: 1.2, fill: '#ff7a8a' },
      ];
    case 'flat':
      return [{ el: 'path', d: `M56.5 ${y + 10}Q60.5 ${y + 9} 64 ${y + 10.5}`, ...line }];
    case 'small':
      return [{ el: 'path', d: `M57 ${y + 8}Q60 ${y + 11} 63 ${y + 8}`, ...line }];
    default:
      return [{ el: 'path', d: `M55 ${y + 8}Q60 ${y + 13} 65 ${y + 8}`, ...line }];
  }
}

function effectShapes(fx: Fx, hand: readonly [number, number]): Shape[] {
  switch (fx) {
    case 'spark':
      return [
        { el: 'path', d: 'M20 32L27 38', stroke: '#f0a92a', width: 2.6, round: true },
        { el: 'path', d: 'M11 47L20 48', stroke: '#f0a92a', width: 2.6, round: true },
        { el: 'path', d: 'M33 20L36 28', stroke: '#f0a92a', width: 2.6, round: true },
      ];
    case 'hearts':
      return [
        { el: 'path', d: 'M20 30c-3-4-9 0-5 5l5 5 5-5c4-5-2-9-5-5z', fill: '#ff6f91' },
        { el: 'path', d: 'M100 24c-2.4-3.2-7 0-4 4l4 4 4-4c3-4-1.6-7.2-4-4z', fill: '#ff6f91' },
      ];
    case 'steam': {
      // Off a mug held at `hand`.
      const [x, y] = hand;
      return [
        { el: 'path', d: `M${x - 3} ${y - 16}c-2 -3 2 -5 0 -8`, stroke: '#c9b8a4', width: 1.6, round: true },
        { el: 'path', d: `M${x + 2} ${y - 16}c-2 -3 2 -5 0 -8`, stroke: '#c9b8a4', width: 1.6, round: true },
      ];
    }
    case 'bubbles':
      return [
        { el: 'circle', cx: 90, cy: 44, r: 2.2, fill: '#c2ae96' },
        { el: 'circle', cx: 97, cy: 34, r: 3.2, fill: '#c2ae96' },
        { el: 'circle', cx: 106, cy: 22, r: 4.6, fill: '#c2ae96' },
      ];
    case 'zz':
      return [
        { el: 'path', d: 'M88 40h8l-8 9h8', stroke: '#9aa6f0', width: 2.4, round: true },
        { el: 'path', d: 'M101 22h6l-6 7h6', stroke: '#9aa6f0', width: 2.4, round: true },
      ];
    case 'sparkle':
      return [{ el: 'path', d: 'M97 26Q98 33 105 34Q98 35 97 42Q96 35 89 34Q96 33 97 26Z', fill: '#ffc83d' }];
    case 'confetti':
      return [
        { el: 'circle', cx: 16, cy: 38, r: 2.6, fill: '#ffa51f' },
        { el: 'rect', x: 101, y: 34, w: 5, h: 5, rx: 1, fill: '#3b9eff', rotate: 20 },
        { el: 'circle', cx: 24, cy: 18, r: 2.2, fill: '#12b76a' },
        { el: 'circle', cx: 98, cy: 16, r: 2.4, fill: '#ff5fa2' },
        { el: 'rect', x: 7, y: 66, w: 5, h: 5, rx: 1, fill: '#b06bff', rotate: -18 },
        { el: 'circle', cx: 112, cy: 62, r: 2.2, fill: '#23d3b0' },
      ];
    case 'flame':
      // Held up in the right hand, drawn about its own base so it flickers from there.
      return [
        {
          el: 'group',
          x: hand[0],
          y: hand[1],
          scale: 0.85,
          children: [
            {
              el: 'path',
              d: 'M0 0C-7 0-11-5-11-11C-11-17-6-19-5-25C-2-21-1-19 1-18C1-23 3-27 7-30C7-24 11-20 11-12C11-5 7 0 0 0Z',
              fill: 'flame',
            },
            { el: 'path', d: 'M0-1C-4-1-6-4-6-7C-6-11-2-12 0-16C2-12 6-10 6-7C6-3 4-1 0-1Z', fill: '#fff4b8' },
          ],
        },
      ];
  }
}

function propShapes(prop: Prop, hand: readonly [number, number]): Shape[] {
  const [x, y] = hand;
  switch (prop) {
    case 'mug':
      return [
        { el: 'path', d: `M${x + 6} ${y - 9}q5 0 5 4t-5 4`, stroke: '#e3d6c4', width: 2, round: true },
        { el: 'rect', x: x - 7, y: y - 13, w: 13, h: 14, rx: 3, fill: '#fffaf2', stroke: '#e3d6c4', width: 1.2 },
        { el: 'rect', x: x - 6, y: y - 11, w: 11, h: 3, rx: 1.5, fill: '#b07a4a' },
      ];
    case 'toast':
      return [
        {
          el: 'path',
          d: `M${x - 9} ${y + 3}V${y - 8}Q${x - 10} ${y - 15} ${x - 4} ${y - 15}Q${x} ${y - 18} ${x + 4} ${y - 15}Q${x + 10} ${y - 15} ${x + 9} ${y - 8}V${y + 3}Z`,
          fill: '#f0bf72',
          stroke: '#c8883e',
          width: 1.4,
        },
        {
          el: 'path',
          d: `M${x - 6} ${y + 1}V${y - 7}Q${x - 6} ${y - 12} ${x - 2} ${y - 12}Q${x} ${y - 14} ${x + 2} ${y - 12}Q${x + 6} ${y - 12} ${x + 6} ${y - 7}V${y + 1}Z`,
          fill: '#ffe2ad',
        },
      ];
    case 'spoon':
      return [
        { el: 'path', d: `M${x} ${y + 3}L${x + 2} ${y - 8}`, stroke: '#aab2bd', width: 2.6, round: true },
        { el: 'ellipse', cx: x + 3, cy: y - 13, rx: 4.2, ry: 5.6, fill: '#dfe4ea', stroke: '#aab2bd', width: 1 },
      ];
    case 'medal':
      return [
        { el: 'path', d: `M${x - 6} ${y - 24}L${x} ${y - 12}L${x + 6} ${y - 24}`, stroke: '#ff5fa2', width: 3.2, round: true },
        { el: 'circle', cx: x, cy: y - 7, r: 7.5, fill: '#ffc83d' },
        { el: 'circle', cx: x, cy: y - 7, r: 4, fill: '#fff2a8' },
        { el: 'ellipse', cx: x - 2.5, cy: y - 10, rx: 2, ry: 1.2, fill: '#ffffff', opacity: 0.7 },
      ];
    case 'cake':
      // A slice of birthday cake with one candle: the only day it turns up is theirs.
      return [
        { el: 'ellipse', cx: x, cy: y + 2, rx: 12, ry: 2.8, fill: '#ffffff', stroke: '#e3d6c4', width: 1 },
        { el: 'rect', x: x - 9, y: y - 9, w: 18, h: 10, rx: 2.5, fill: '#f7c9a0' },
        { el: 'rect', x: x - 9, y: y - 10, w: 18, h: 4, rx: 2, fill: '#fff4f8' },
        { el: 'rect', x: x - 9, y: y - 4.5, w: 18, h: 1.8, rx: 0.9, fill: '#ff8fbe' },
        { el: 'path', d: `M${x} ${y - 10}V${y - 17}`, stroke: '#8ec5ff', width: 2.2, round: true },
        { el: 'ellipse', cx: x, cy: y - 20, rx: 1.8, ry: 2.8, fill: '#ffc83d' },
      ];
    case 'bowl':
      return [
        {
          el: 'path',
          d: `M${x - 11} ${y - 8}H${x + 11}Q${x + 10} ${y + 4} ${x} ${y + 4}Q${x - 10} ${y + 4} ${x - 11} ${y - 8}Z`,
          fill: '#ffffff',
          stroke: '#e3d6c4',
          width: 1.2,
        },
        { el: 'ellipse', cx: x, cy: y - 8, rx: 10, ry: 2.6, fill: '#9fd46b' },
        { el: 'circle', cx: x - 4, cy: y - 10, r: 2, fill: '#ff7a5c' },
        { el: 'circle', cx: x + 3, cy: y - 10.5, r: 1.8, fill: '#ffd36a' },
      ];
  }
}

function accessoryShapes(f: Figure, accessory: Accessory): Shape[] {
  switch (accessory) {
    case 'scarf': {
      const [y, half] = f.scarf;
      return [
        {
          el: 'path',
          d: `M${60 - half} ${y - 3}Q60 ${y + 6} ${60 + half} ${y - 3}L${60 + half - 1} ${y + 4}Q60 ${y + 13} ${60 - half + 1} ${y + 4}Z`,
          fill: '#e8553f',
        },
        {
          el: 'path',
          d: `M${60 - half + 2} ${y}Q60 ${y + 8.5} ${60 + half - 2} ${y}`,
          stroke: '#ffffff',
          width: 1.4,
          opacity: 0.55,
        },
        { el: 'path', d: `M${60 + 12} ${y + 5}l4 14l-7 1l-2 -13Z`, fill: '#d4452f' },
      ];
    }
    case 'flower': {
      const [x, y] = f.pin;
      return [
        ...[0, 72, 144, 216, 288].map(
          (deg): Shape => ({
            el: 'circle',
            cx: x + Math.cos((deg * Math.PI) / 180) * 4,
            cy: y + Math.sin((deg * Math.PI) / 180) * 4,
            r: 3.2,
            fill: '#ffd3e5',
          }),
        ),
        { el: 'circle', cx: x, cy: y, r: 2.4, fill: '#ffc83d' },
      ];
    }
    case 'leaf': {
      const [x, y] = f.pin;
      return [
        {
          el: 'path',
          d: `M${x} ${y + 6}C${x - 8} ${y + 2} ${x - 8} ${y - 6} ${x} ${y - 9}C${x + 8} ${y - 6} ${x + 8} ${y + 2} ${x} ${y + 6}Z`,
          fill: '#e8833a',
        },
        { el: 'path', d: `M${x} ${y + 8}L${x} ${y - 6}`, stroke: '#b85a1e', width: 1.2, round: true },
      ];
    }
  }
}

/** The ladle in a stirring hand, reaching down into the pot. */
function ladleShapes(hand: readonly [number, number]): Shape[] {
  const [x, y] = hand;
  return [
    { el: 'path', d: `M${x} ${y}L${x + 6} ${y + 28}`, stroke: '#aab2bd', width: 2.8, round: true },
    { el: 'ellipse', cx: x + 7, cy: y + 31, rx: 5, ry: 3, fill: '#dfe4ea', stroke: '#aab2bd', width: 1 },
  ];
}

/** The flame's ramp, bottom to top. Shared because both renderers need it and neither owns it. */
export const FLAME_RAMP = ['#ff5fa2', '#ffa51f', '#ffe27a'] as const;
export const FLAME_STOPS = [0, 0.45, 1] as const;
/** Where the body's highlight gives way to its colour, and its colour to its rim. */
export const BODY_STOPS = [0, 0.55, 1] as const;
/** The crown runs light to dark down its height. */
export const CROWN_STOPS = [0, 0.5, 1] as const;

export const isGradient = (fill: string): fill is Gradient => fill === 'body' || fill === 'crown' || fill === 'flame';

export function drawing(
  name: CastName,
  mood: Mood,
  options: {
    prop?: Prop;
    /** Keep the legs over the edge while a passing mood plays on a sitting figure. */
    sit?: boolean;
    accessory?: Accessory;
  } = {},
): Drawing {
  const f = FIGURES[name];
  const m = MOODS[mood];
  const [left, right] = m.arms;
  const sitting = Boolean(m.sit || options.sit);
  const stroke = { stroke: f.deep, width: 7.5, round: true };
  const limb = (pose: Pose, side: 'L' | 'R'): Shape => ({ el: 'path', d: q(arm(f, pose, side)), ...stroke });
  const moving = right === 'wave' || right === 'stir';

  const flameHand = arm(f, 'flame', 'R');
  const hand = [flameHand[4], flameHand[5] - 2] as const;
  const holdArm = arm(f, 'hold', 'R');
  const holding = [holdArm[4], holdArm[5]] as const;
  const stirArm = arm(f, 'stir', 'R');
  const shoulder = arm(f, right === 'stir' ? 'stir' : 'wave', 'R');
  const effect: Fx | null = m.fx ?? (right === 'hold' && options.prop === 'mug' ? 'steam' : null);

  const body: Shape[] = [
    ...(!inFront(left) ? [limb(left, 'L')] : []),
    ...(!inFront(right) && !moving ? [limb(right, 'R')] : []),
    ...(sitting
      ? []
      : ([
          { el: 'ellipse', cx: 49, cy: 105, rx: 7.5, ry: 4, fill: f.deep },
          { el: 'ellipse', cx: 71, cy: 105, rx: 7.5, ry: 4, fill: f.deep },
        ] as Shape[])),
    ...crownShapes(name),
    bodyShape(name),
    { el: 'ellipse', cx: f.sheen[0], cy: f.sheen[1], rx: f.sheen[2], ry: f.sheen[3], rotate: -28, fill: '#ffffff', opacity: 0.55 },
    { el: 'ellipse', cx: 60 - f.cheek, cy: f.fy + 9, rx: 5, ry: 3, fill: CHEEK, opacity: 0.38 },
    { el: 'ellipse', cx: 60 + f.cheek, cy: f.fy + 9, rx: 5, ry: 3, fill: CHEEK, opacity: 0.38 },
    ...(options.accessory ? accessoryShapes(f, options.accessory) : []),
    ...(!blinking(m.eyes) ? eyeShapes(f, m.eyes) : []),
    ...(m.eyes === 'hope' ? browShapes(f) : []),
    ...mouthShapes(f, m.mouth),
    ...(inFront(left) ? [limb(left, 'L')] : []),
    ...(inFront(right) ? [limb(right, 'R')] : []),
    ...(right === 'hold' && options.prop ? propShapes(options.prop, holding) : []),
  ];

  const legs: Shape[] = sitting
    ? [
        { el: 'path', d: 'M50 100L47 114', stroke: f.deep, width: 6.5, round: true },
        { el: 'path', d: 'M70 100L73 114', stroke: f.deep, width: 6.5, round: true },
      ]
    : [];

  return {
    gradients: { body: f.ramp, crown: f.crown },
    body,
    swing:
      right === 'wave'
        ? { kind: 'wave', shapes: [limb('wave', 'R')] }
        : right === 'stir'
          ? { kind: 'stir', shapes: [limb('stir', 'R'), ...ladleShapes([stirArm[4], stirArm[5]])] }
          : null,
    legs,
    eyes: blinking(m.eyes) ? eyeShapes(f, m.eyes) : [],
    fx: effect ? effectShapes(effect, effect === 'steam' ? holding : hand) : [],
    motion: m.motion,
    effect,
    pivots: {
      shoulder: [shoulder[0], shoulder[1]],
      eyes: [60, f.fy],
      fx: effect === 'flame' ? hand : effect === 'sparkle' ? [97, 34] : effect === 'spark' ? [24, 34] : [60, 60],
      legs: [60, 100],
    },
  };
}

// ---- The string renderer -----------------------------------------------------

const num = (value: number) => Number(value.toFixed(2));

function paint(fill: string | undefined, prefix: string): string {
  if (!fill) return 'none';
  return isGradient(fill) ? `url(#${prefix}${fill})` : fill;
}

function shapeString(shape: Shape, prefix: string): string {
  switch (shape.el) {
    case 'path': {
      const stroke = shape.stroke
        ? ` stroke="${shape.stroke}" stroke-width="${shape.width ?? 1}"${shape.round ? ' stroke-linecap="round" stroke-linejoin="round"' : ''}`
        : '';
      const opacity = shape.opacity !== undefined ? ` opacity="${shape.opacity}"` : '';
      return `<path d="${shape.d}" fill="${paint(shape.fill, prefix)}"${stroke}${opacity}/>`;
    }
    case 'ellipse': {
      const rotate = shape.rotate ? ` transform="rotate(${shape.rotate} ${num(shape.cx)} ${num(shape.cy)})"` : '';
      const opacity = shape.opacity !== undefined ? ` opacity="${shape.opacity}"` : '';
      const stroke = shape.stroke ? ` stroke="${shape.stroke}" stroke-width="${shape.width ?? 1}"` : '';
      return `<ellipse cx="${num(shape.cx)}" cy="${num(shape.cy)}" rx="${shape.rx}" ry="${shape.ry}" fill="${paint(shape.fill, prefix)}"${rotate}${opacity}${stroke}/>`;
    }
    case 'circle': {
      const opacity = shape.opacity !== undefined ? ` opacity="${shape.opacity}"` : '';
      return `<circle cx="${num(shape.cx)}" cy="${num(shape.cy)}" r="${shape.r}" fill="${paint(shape.fill, prefix)}"${opacity}/>`;
    }
    case 'rect': {
      const rotate = shape.rotate
        ? ` transform="rotate(${shape.rotate} ${num(shape.x + shape.w / 2)} ${num(shape.y + shape.h / 2)})"`
        : '';
      const stroke = shape.stroke ? ` stroke="${shape.stroke}" stroke-width="${shape.width ?? 1}"` : '';
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.rx}" fill="${shape.fill}"${rotate}${stroke}/>`;
    }
    case 'group':
      return `<g transform="translate(${num(shape.x)} ${num(shape.y)}) scale(${shape.scale})">${shape.children
        .map((child) => shapeString(child, prefix))
        .join('')}</g>`;
  }
}

function stops(ramp: readonly string[], offsets: readonly number[] = [0, 0.5, 1]): string {
  return ramp.map((colour, i) => `<stop offset="${offsets[i]}" stop-color="${colour}"/>`).join('');
}

/**
 * The inner markup for one figure at rest, with its gradients, for an SVG
 * document that places it.
 *
 * `prefix` keeps gradient ids apart when several figures share one document,
 * which in SVG they otherwise would: ids are global to the file.
 */
export function figureMarkup(
  name: CastName,
  mood: Mood,
  prefix: string,
  prop?: Prop,
): { defs: string; shapes: string } {
  const d = drawing(name, mood, { prop });
  const defs = [
    `<radialGradient id="${prefix}body" cx="0.36" cy="0.3" r="0.8">${stops(d.gradients.body, BODY_STOPS)}</radialGradient>`,
    d.gradients.crown ? `<linearGradient id="${prefix}crown" x1="0" y1="0" x2="0" y2="1">${stops(d.gradients.crown)}</linearGradient>` : '',
    d.effect === 'flame' ? `<linearGradient id="${prefix}flame" x1="0" y1="1" x2="0" y2="0">${stops(FLAME_RAMP, FLAME_STOPS)}</linearGradient>` : '',
  ].join('');
  // At rest a moving arm is behind the body, like every other arm, and legs hang below it.
  const shapes = [...(d.swing?.shapes ?? []), ...d.legs, ...d.body, ...d.eyes, ...d.fx]
    .map((shape) => shapeString(shape, prefix))
    .join('');
  return { defs, shapes };
}
