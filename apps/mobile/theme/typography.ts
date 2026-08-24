import { Platform, StyleSheet, type TextStyle } from 'react-native';
import type { Locale } from '@ct/shared';

/**
 * The type scale from `globals.css`, and the one trap in porting it.
 *
 * RN does not synthesise weights across a family. On the web `font-weight: 800`
 * on a variable font is a real instruction; here it is a request the renderer
 * silently declines, leaving regular on screen. So every weight is a *face*,
 * named, bundled and referenced by name — `fontWeight` is never load-bearing.
 * The scale leans hard on 800, so getting this wrong is not subtle: the whole
 * app goes limp.
 *
 * Nunito for everything, Baloo for the shouting. Both are rounded-terminal
 * faces, which is what stops the app reading as instrumentation before a single
 * word has been parsed.
 */
export const font = {
  regular: 'Nunito_400Regular',
  medium: 'Nunito_500Medium',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
  /* Emphasis in a streamed reply. See the note in `app/_layout.tsx`. */
  italic: 'Nunito_500Medium_Italic',
  boldItalic: 'Nunito_800ExtraBold_Italic',
  displaySemibold: 'Baloo2_600SemiBold',
  displayBold: 'Baloo2_700Bold',
  display: 'Baloo2_800ExtraBold',
} as const;

/**
 * The display face, per script.
 *
 * Baloo 2 has no Cyrillic glyphs — 0 codepoints in U+0400–04FF in the font
 * file itself, not merely a subset Google declines to serve. So a Bulgarian
 * heading set in it does not degrade gracefully; it falls back per glyph to
 * whatever the OS offers, on the largest text on every screen. Nunito stands
 * in: same rounded terminals, already bundled, and its 220 Cyrillic glyphs have
 * been shipping in this app since the first build.
 *
 * A step heavier than the Latin face on purpose. Nunito's counters are more
 * open than Baloo's, so at a given weight it reads lighter; 900 against Baloo's
 * 800 is what makes the two look like the same amount of ink.
 *
 * **To try Comfortaa instead**, this table and the `useFonts` call in
 * `app/_layout.tsx` are the only two places to change. Nothing else in the app
 * names the Cyrillic display face. Its web twin is `--font-display-cyrillic` in
 * `apps/web/app/globals.css`. Note that Comfortaa stops at 700, so its heaviest
 * cut is a step *below* Baloo rather than above — look at the ring's figure
 * before committing to it.
 */
const DISPLAY_FACES = {
  latin: {
    semibold: font.displaySemibold,
    bold: font.displayBold,
    extrabold: font.display,
  },
  cyrillic: {
    semibold: 'Nunito_700Bold',
    bold: 'Nunito_800ExtraBold',
    extrabold: 'Nunito_900Black',
  },
} as const;

/** Which of the two a locale needs. Everything not listed draws in Latin. */
const CYRILLIC_LOCALES: ReadonlySet<Locale> = new Set(['bg']);

export const displayFacesFor = (locale: Locale) =>
  CYRILLIC_LOCALES.has(locale) ? DISPLAY_FACES.cyrillic : DISPLAY_FACES.latin;

/**
 * The platform's monospace face, for a code span or fence in a reply.
 * `font-mono` on the web resolves to whatever the OS offers; this is the same
 * bargain, spelled out, since neither face the app bundles has a mono cut.
 */
export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Tabular numerals, so a total does not jitter as it ticks up during a log.
 * `fontVariant` is the RN spelling of `font-variant-numeric: tabular-nums`.
 */
const tnum = { fontVariant: ['tabular-nums'] } satisfies TextStyle;

/**
 * The shortest line box the display face can be given before iOS crops it.
 *
 * CSS lets a glyph overflow a short line box; RN does not, and iOS puts the
 * baseline at `lineHeight - descent` and clips whatever is taller above it.
 * Baloo 2 ExtraBold has an unusually deep descender — 0.524em, read off the
 * font's own `hhea` table — against a cap height of 0.602em, so the shortest
 * line that still draws a whole digit is 1.126em. This is that, plus a little
 * for the overshoot on Baloo's very round numerals.
 *
 * Which means `leading-none` cannot be ported literally anywhere the display
 * face is set: on the web it is a tight line box with the glyph hanging out of
 * it, and here it is a crop. Android is more forgiving — it pads the line box
 * by default — so this only ever shows up on an iPhone, which is exactly why it
 * is written down rather than tuned by eye at each call site.
 */
export const DISPLAY_LEADING = 1.15;

export const type = StyleSheet.create({
  largeTitle: {
    fontFamily: font.display,
    fontSize: 36,
    // The web sets 40 (`leading-10`), which is 1.111em — just under the floor,
    // and enough to shave the top off a capital or a figure. See DISPLAY_LEADING.
    lineHeight: 42,
    letterSpacing: -0.54,
  },
  title2: {
    fontFamily: font.display,
    fontSize: 23,
    lineHeight: 28,
    letterSpacing: -0.23,
  },
  /*
   * The app's default reading size. The body runs at 500 rather than 400:
   * rounded faces have open counters and look thin next to a grotesque at the
   * same weight, so the whole app sits one step up from regular.
   */
  body: {
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  bodySemibold: {
    fontFamily: font.semibold,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyBold: {
    fontFamily: font.bold,
    fontSize: 16,
    lineHeight: 24,
  },
  footnote: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  footnoteSemibold: {
    fontFamily: font.semibold,
    fontSize: 13,
    lineHeight: 18,
  },
  footnoteBold: {
    fontFamily: font.bold,
    fontSize: 13,
    lineHeight: 18,
  },
  /*
   * Every number that reports progress — the ring's centre, a meal's kcal, a
   * macro total — is set in the display face at 800, so a column of them lines
   * up and a glance can compare them without reading.
   */
  figure: {
    fontFamily: font.display,
    letterSpacing: -0.16,
    ...tnum,
  },
  /*
   * A small all-caps section label. The tracking is what stops 800-weight
   * rounded caps clotting at this size.
   *
   * Nunito, not Baloo: `text-eyebrow` sets a weight but no family, so on the
   * web it inherits the body face. Reaching for the display face here because
   * everything else heavy uses it would quietly change every section heading
   * in the app.
   */
  eyebrow: {
    fontFamily: font.extrabold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.72,
    textTransform: 'uppercase',
  },
  tnum,
});

/**
 * The type scale in a given language.
 *
 * `type` above is the Latin scale and stays exported: it is what a StyleSheet
 * at module scope can use, and it is still correct for every screen an English
 * reader sees. This is the same scale with the display face swapped for one
 * that can draw the script — which is only ever the three styles that use the
 * display face, because the body face has covered Cyrillic all along.
 *
 * Built once per locale rather than per render. A `StyleSheet.create` per frame
 * would allocate a new style object every time and defeat RN's style
 * registry — every `Text` in the app would re-reconcile on any state change.
 */
/**
 * The scale's shape with the face names widened.
 *
 * `type` is a `StyleSheet.create` over object literals, so TypeScript infers
 * `fontFamily: "Baloo2_800ExtraBold"` — the literal, not `string`. Useful
 * nowhere, and it makes a scale carrying a different face fail to be the same
 * type as the one it is standing in for. `TextStyle` is what these are.
 */
export type TypeScale = { [K in keyof typeof type]: TextStyle };

const SCALES = new Map<Locale, TypeScale>();

export function typeFor(locale: Locale): TypeScale {
  const cached = SCALES.get(locale);
  if (cached) return cached;

  const faces = displayFacesFor(locale);
  const scale =
    faces === DISPLAY_FACES.latin
      ? type
      : StyleSheet.create({
          ...type,
          largeTitle: { ...type.largeTitle, fontFamily: faces.extrabold },
          title2: { ...type.title2, fontFamily: faces.extrabold },
          figure: { ...type.figure, fontFamily: faces.extrabold },
        });

  SCALES.set(locale, scale);
  return scale;
}
