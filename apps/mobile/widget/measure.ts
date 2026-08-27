/**
 * How wide a figure is going to be, before anything is drawn.
 *
 * A widget gets one measurement pass from the launcher and no second chance: it
 * is handed a rectangle in dp, it returns a tree, and whatever does not fit is
 * clipped without a word. There is no `onLayout`, no scroll, no ellipsis unless
 * asked for. So the only way to set a number at the size the room can actually
 * take is to know how wide the glyphs are before choosing the size.
 *
 * These are the real advance widths out of `Baloo2_800ExtraBold.ttf`, read off
 * the font's own `hmtx` table rather than guessed at. They matter because the
 * face is proportional, not tabular: a "1" is 0.393em and a "0" is 0.606em, so
 * "1,110" and "8,000" differ by a fifth of their width at the same size. A
 * single average would set both to fit the wider one and leave the narrower one
 * looking timid inside the ring.
 */

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

/*
 * Anything not in the table — a locale that groups with a narrow no-break
 * space, a currency-ish separator — is charged at the widest digit. Guessing
 * high costs a point of type size; guessing low costs a clipped number.
 */
const WIDEST = 0.606;

/** The width, in dp, that `text` will occupy when set in the display face. */
export function displayWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const character of text) em += BALOO[character] ?? WIDEST;
  return em * fontSize;
}

/**
 * The largest size at which `text` still fits `width`, or 0 if even `min` does
 * not fit — which is the answer the caller wants, because a number crushed to
 * eight points inside a ring is worse than a ring on its own.
 */
export function fitFontSize({
  text,
  width,
  min,
  max,
}: {
  text: string;
  width: number;
  min: number;
  max: number;
}): number {
  if (max < min) return 0;
  const em = displayWidth(text, 1);
  const fits = Math.floor(width / em);
  return fits < min ? 0 : Math.min(max, fits);
}
