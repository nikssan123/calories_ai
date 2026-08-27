/**
 * How wide a figure is going to be, before anything is drawn.
 *
 * Both rings and the home-screen widget set a number inside a circle, which is
 * the one place in this app where type has to fit a shape rather than a box.
 * A circle gives less room than its diameter everywhere except its middle, and
 * a figure with a caption under it is never in the middle — so a size picked as
 * a fraction of the dial is a size that fits some numbers and not others.
 * `1,240` at a quarter of a 184pt ring runs its last digit into the arc; `480`
 * at the same size sits comfortably inside. The difference is the digits, so
 * the digits are what gets measured.
 *
 * Two faces, because the app sets figures in two. `baloo` is the real advance
 * table out of `Baloo2_800ExtraBold.ttf`, read off the font's own `hmtx`, and
 * it is worth having exactly: the face is proportional, not tabular, so a "1"
 * is 0.393em against a "0" at 0.606em and `1,110` is a fifth narrower than
 * `8,000` at the same size. `any` is for the screens, where Bulgarian swaps the
 * display face for one with Cyrillic in it — a different face means different
 * advances, so there the answer is the widest a digit gets in either.
 */

import type { Locale } from './locale.ts';

export type Face = 'baloo' | 'any';

const BALOO: Record<string, number> = {
  '0': 0.606,
  '1': 0.393,
  '2': 0.522,
  '3': 0.518,
  '4': 0.602,
  '5': 0.522,
  '6': 0.558,
  '7': 0.482,
  '8': 0.56,
  '9': 0.558,
  ',': 0.243,
  '.': 0.238,
  '+': 0.545,
  '−': 0.505,
  '-': 0.354,
  '/': 0.343,
  ' ': 0.2,
};

/** The widest a digit gets in any face the app sets a figure in. */
const WIDEST = 0.62;
/** And the widest a thousands separator gets, whichever glyph it is. */
const SEPARATOR = 0.32;

const SEPARATORS = new Set([',', '.', ' ', ' ', ' ', "'"]);

function advance(character: string, face: Face): number {
  if (face === 'baloo') return BALOO[character] ?? 0.606;
  return SEPARATORS.has(character) ? SEPARATOR : WIDEST;
}

/** The width, in the same unit as `fontSize`, that `text` will occupy. */
export function displayWidth(text: string, fontSize: number, face: Face = 'any'): number {
  let em = 0;
  for (const character of text) em += advance(character, face);
  return em * fontSize;
}

/**
 * The largest size at which `text` still fits `width`.
 *
 * Returns 0 when even `min` does not fit, which is the answer a widget wants —
 * a number crushed to eight points inside a ring is worse than a ring on its
 * own. Callers with nowhere else to put the number pass `min: 1` and always
 * get a size back.
 */
export function fitFontSize({
  text,
  width,
  min,
  max,
  face = 'any',
}: {
  text: string;
  width: number;
  min: number;
  max: number;
  face?: Face;
}): number {
  if (max < min) return 0;
  const fits = Math.floor(width / displayWidth(text, 1, face));
  return fits < min ? 0 : Math.min(max, fits);
}

/**
 * Which of the two a figure in this language will be set in.
 *
 * Baloo 2 has no Cyrillic, so Bulgarian falls back to the face that does and
 * every advance changes with it. Mirrors `CYRILLIC_LOCALES` in the native
 * app's `theme/typography.ts` and `:root:lang(bg)` in the web's `globals.css`
 * — the same rule, in the one place both of them can ask about it.
 */
export function figureFace(locale: Locale): Face {
  return locale === 'bg' ? 'any' : 'baloo';
}

/**
 * The largest square that fits inside a circle has a side of `d / √2`. Text
 * stacked inside that square cannot reach the ring however tall the stack is,
 * which is what makes this the one measurement that does not have to know how
 * many lines are going under the figure or how far up they push it.
 */
export const INSCRIBED = 0.707;
