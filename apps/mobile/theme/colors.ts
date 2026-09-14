/**
 * The palette, lifted whole from `apps/web/app/globals.css`.
 *
 * Two hand-tuned sets rather than one computed from the other. The dark macros
 * are lifted for chroma against ink and the greens move furthest — grass at
 * #12b76a is nearly invisible on #1a1512, so on dark it becomes a mint — and
 * deriving them would lose exactly the thing that makes them work.
 *
 * Every value here is flat hex or rgba, which is why the port is a copy rather
 * than a translation: there is no `color-mix`, no `oklch`, nothing RN cannot
 * express. The one exception is the tinted lozenge under an active tab, which
 * the web builds with `color-mix(in oklch, var(--calories), transparent 84%)`;
 * that is spelled here as `caloriesWash` with the alpha baked in.
 */
export interface Palette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  /** `bg-muted/40` — the wash under an expanded entry, not a second surface. */
  mutedWash: string;
  /** `bg-muted/60` — a text field sunk into a card, one step darker than the wash. */
  mutedField: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;

  calories: string;
  caloriesText: string;
  caloriesDeep: string;
  /** The active tab's lozenge: the accent at 16%, over either ground. */
  caloriesWash: string;
  protein: string;
  proteinText: string;
  carbs: string;
  carbsText: string;
  fat: string;
  fatText: string;
  exercise: string;
  exerciseText: string;
  positive: string;
  logoRamp: string;

  /** The translucent header and tab bar. See <Material>. */
  material: string;
  /**
   * What used to be the ledge colour, and is now only the tint of a surface's
   * shadow. See `<Chunk>` for why the slab went.
   */
  chunk: string;

  /*
   * Light, rather than edges. Everything below arrived with the glow-up
   * (GLOW-UP.md) and has no twin in `globals.css` yet — the web still draws
   * the ledge, and these are the values to port when it stops.
   */
  /** A surface that lets the ground through: the sky, the blobs, the mist. */
  glass: string;
  /** The same surface where the words on it have to win over what is behind. */
  glassStrong: string;
  /** The one-pixel lit edge along the top of a glass surface. */
  glassEdge: string;
  /** A divider inside a surface. Quieter than `border`, which still outlines fields. */
  hairline: string;
  /** The resting shadow under a surface, as a CSS `box-shadow`. */
  shadow: string;
  /** The ambient washes behind a whole screen, as a CSS `background-image`. */
  ambient: string;
  /** The ink for words set directly on a sky that has gone dark. */
  skyInk: string;
  /**
   * The logo's ramp, as a CSS `background-image`, for anything filled with the
   * primary. Always laid over `backgroundColor: primary`, which stays the solid
   * colour for anything that cannot draw a gradient.
   */
  primaryRamp: string;
}

export const light: Palette = {
  background: '#fff6ec',
  foreground: '#31261e',
  card: '#ffffff',
  cardForeground: '#31261e',
  primary: '#12b76a',
  primaryForeground: '#31261e',
  secondary: '#f5ebdd',
  secondaryForeground: '#31261e',
  muted: '#f3e8d9',
  mutedWash: 'rgba(243, 232, 217, 0.4)',
  mutedField: 'rgba(243, 232, 217, 0.6)',
  mutedForeground: '#77685b',
  accent: '#f5ebdd',
  accentForeground: '#31261e',
  destructive: '#ce3527',
  destructiveForeground: '#ffffff',
  border: '#eadcc9',
  input: '#e0cfb8',
  ring: 'rgba(18, 183, 106, 0.55)',

  calories: '#12b76a',
  caloriesText: '#07804f',
  caloriesDeep: '#0a7a48',
  caloriesWash: 'rgba(18, 183, 106, 0.16)',
  protein: '#ffa51f',
  proteinText: '#a85a08',
  carbs: '#3b9eff',
  carbsText: '#1a66c2',
  fat: '#b06bff',
  fatText: '#7c3ee0',
  exercise: '#ff5fa2',
  exerciseText: '#c13a7a',
  positive: '#07804f',
  logoRamp: '#23d3b0',

  material: 'rgba(255, 246, 236, 0.85)',
  chunk: 'rgba(49, 38, 30, 0.14)',

  glass: 'rgba(255, 255, 255, 0.62)',
  glassStrong: 'rgba(255, 255, 255, 0.84)',
  glassEdge: 'rgba(255, 255, 255, 0.95)',
  hairline: 'rgba(49, 38, 30, 0.08)',
  /*
   * Warm, long and faint: a brown shadow rather than a grey one, because a
   * neutral shadow on cream reads as dirt. The negative spread keeps it inside
   * the surface's own footprint, so a column of cards does not merge into one
   * smudge the way a plain blur would.
   */
  shadow: '0px 14px 30px -18px rgba(120, 80, 20, 0.42)',
  ambient:
    'radial-gradient(120% 60% at 0% 0%, rgba(35, 211, 176, 0.13) 0%, rgba(35, 211, 176, 0) 60%), ' +
    'radial-gradient(110% 55% at 100% 8%, rgba(255, 178, 80, 0.20) 0%, rgba(255, 178, 80, 0) 62%), ' +
    'radial-gradient(120% 50% at 50% 100%, rgba(255, 150, 120, 0.10) 0%, rgba(255, 150, 120, 0) 70%)',
  skyInk: '#f6efe4',
  primaryRamp: 'linear-gradient(135deg, #12b76a 0%, #23d3b0 100%)',
};

export const dark: Palette = {
  background: '#1a1512',
  foreground: '#f7efe6',
  card: '#241d19',
  cardForeground: '#f7efe6',
  primary: '#3ddc97',
  primaryForeground: '#1a1512',
  secondary: '#322822',
  secondaryForeground: '#f7efe6',
  muted: '#322822',
  mutedWash: 'rgba(50, 40, 34, 0.4)',
  mutedField: 'rgba(50, 40, 34, 0.6)',
  mutedForeground: '#a79a8d',
  accent: '#322822',
  accentForeground: '#f7efe6',
  destructive: '#ff6a5c',
  destructiveForeground: '#1a1512',
  border: '#4d3d33',
  input: '#5c4a3e',
  ring: 'rgba(61, 220, 151, 0.55)',

  calories: '#3ddc97',
  caloriesText: '#3ddc97',
  caloriesDeep: '#17945f',
  caloriesWash: 'rgba(61, 220, 151, 0.16)',
  protein: '#ffbe4d',
  proteinText: '#ffbe4d',
  carbs: '#6fb4ff',
  carbsText: '#6fb4ff',
  fat: '#bc9bff',
  fatText: '#bc9bff',
  exercise: '#ff8fbe',
  exerciseText: '#ff8fbe',
  positive: '#3ddc97',
  logoRamp: '#2ee6c4',

  material: 'rgba(36, 29, 25, 0.85)',
  /*
   * Opaque black. The ledge works by being darker than everything around it,
   * and on a #1a1512 ground half-black is only a few percent darker — the slabs
   * read as flat until this is pushed most of the way down.
   */
  chunk: 'rgba(0, 0, 0, 0.88)',

  glass: 'rgba(48, 38, 32, 0.62)',
  glassStrong: 'rgba(40, 32, 27, 0.88)',
  glassEdge: 'rgba(255, 255, 255, 0.09)',
  hairline: 'rgba(255, 255, 255, 0.07)',
  /*
   * A shadow barely registers on a ground this dark, so on dark the lit top
   * edge does the separating and this only has to stop a surface looking
   * pasted on.
   */
  shadow: '0px 16px 32px -16px rgba(0, 0, 0, 0.75)',
  ambient:
    'radial-gradient(120% 60% at 0% 0%, rgba(46, 230, 196, 0.08) 0%, rgba(46, 230, 196, 0) 60%), ' +
    'radial-gradient(110% 55% at 100% 8%, rgba(255, 170, 70, 0.07) 0%, rgba(255, 170, 70, 0) 62%)',
  skyInk: '#f6efe4',
  primaryRamp: 'linear-gradient(135deg, #3ddc97 0%, #2ee6c4 100%)',
};

/**
 * A flat palette hex at an alpha.
 *
 * The web reaches for `color-mix(in oklch, …, transparent N%)` for this, and
 * mixing with `transparent` is premultiplied — so the result is the same colour
 * at a lower alpha rather than a hue shift, and it ports as arithmetic instead
 * of as a precomputed value. Only for the flat hex entries above; the `rgba`
 * ones are already carrying an alpha of their own.
 */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * A colour at an alpha, whichever way the palette spelled it.
 *
 * `withAlpha` is for the flat hex entries; a glow tint is often handed one of
 * the `rgba` ones — a ledge colour, a wash — so this re-alphas those instead of
 * returning NaN channels.
 */
export function tint(color: string, alpha: number): string {
  if (color.startsWith('#')) return withAlpha(color, alpha);
  const channels = color.match(/[\d.]+/g);
  if (!channels || channels.length < 3) return color;
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}
