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
  /** The ledge. Alpha, so one value works over cream, over white and over a photo. */
  chunk: string;
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
};
