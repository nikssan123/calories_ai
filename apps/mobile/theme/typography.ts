import { Platform, StyleSheet, type TextStyle } from 'react-native';

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
