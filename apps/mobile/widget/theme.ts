import type { ColorProp, HexColor, RgbaColor } from 'react-native-android-widget';

/**
 * The palette, written out where a widget can reach it.
 *
 * A widget is painted by the launcher in a process with no React context and no
 * theme provider, so `useColors()` is not available and never will be. These
 * are copies of `theme/colors.ts`, and the two have to be kept in step by hand
 * — which is the standing price of drawing outside the app.
 *
 * Both schemes, because the library can hand the launcher a light *and* a dark
 * rendition and let it choose. A widget that ignored that would be the one
 * bright rectangle on a dark home screen, or an unreadable dark one on a light
 * one — and unlike a screen inside the app, nobody can navigate away from it.
 *
 * What is copied here is the app *after* the glow-up (GLOW-UP.md), which is a
 * different app from the one this file first copied. The old one drew edges:
 * two-point tan outlines, opaque beige tracks, a flat cream sheet behind
 * everything. The new one draws light — a hairline outline with a lit top edge,
 * wells rather than slabs, and a ground that stands in three faint washes. A
 * widget still wearing the edges is a tile from the previous version of the
 * product sitting next to the icon of this one.
 */
export interface WidgetPalette {
  /**
   * The ground a widget is drawn on — the app's own, not the app's card.
   *
   * Inside the app a card is white because it is lifted off the cream; on a
   * home screen there is no cream to lift off, and a white rectangle beside the
   * app's cream icon reads as somebody else's widget. Android at least draws a
   * border around it, but iOS deliberately does not — the system already clips
   * every widget to its own rounded rectangle — so there it was a bare white
   * slab. The ground the app opens on is what makes the tile look like the app.
   */
  background: ColorProp;
  foreground: ColorProp;
  mutedForeground: ColorProp;
  calories: ColorProp;
  /** The far end of the arc's ramp, from the logo's own gradient. */
  ramp: ColorProp;
  /**
   * The app's outline, and the ground of every bar track it draws.
   *
   * One token for both because that is how the app spells it: since the
   * glow-up a card is `borderWidth: 1` in `hairline` and a macro track is
   * `backgroundColor: hairline`, and both are a whisper of the ink rather than
   * a colour of their own. What was here before was `border` at two points —
   * `#eadcc9`, a tan line the app no longer draws anywhere — and `muted`, the
   * opaque beige slab it no longer fills anything with.
   */
  hairline: RgbaColor;
  /**
   * The lit line along the top of every surface in the app.
   *
   * `Chunk`'s `inset 0px 1px 0px`, and `Glass`'s border. A widget cannot cast
   * the shadow that is the other half of that lift — the launcher composites
   * the tile onto a wallpaper this process never sees — so the edge carries it
   * alone, which is also the half that survives being drawn on anything.
   */
  glassEdge: RgbaColor;
  burn: ColorProp;
  /*
   * How much of the accent the ring's track is made of.
   *
   * A number rather than a colour because the app spells this `rgba()` and
   * androidsvg is an SVG 1.1 renderer, where transparency is `stroke-opacity`
   * and a colour is six hex digits — and because SwiftUI on the iOS face takes
   * the same split.
   *
   * The track is the day's budget, not a neutral band, and there is no ledge
   * under it any more. A ledge here was `#000000` at 0.88, and on a dark widget
   * that is a hole — on the one surface in the app where what shows through a
   * hole is somebody's wallpaper.
   *
   * It is painted from `track`, not from `calories`, because dark wants the
   * deep green nearly solid: a whisper of mint over ink composites to a slate,
   * and a washed-out ring is what this replaced. See `ringTrack` in the app's
   * own palette, which makes the same call.
   */
  track: HexColor;
  trackOpacity: number;
  /**
   * The ring's lit rim — `RingRim` in the app, split into a tone and two
   * weights for the same reason `track` is.
   *
   * On dark the light has the ring's own colour in it: a white highlight on a
   * dark band is the fastest way to grey it, and the logo's ramp is the mint
   * the arc already ends on. On light the ground is cream and light on cream is
   * plain white.
   */
  rimGlint: HexColor;
  rimLit: number;
  rimShade: number;
  /**
   * The washes the app's ground stands in — `Backdrop`, which is behind every
   * screen in the app and is why none of them is a flat sheet.
   *
   * Structured rather than a CSS string, because neither renderer out here
   * takes one: androidsvg wants a `<radialGradient>` and SwiftUI wants a
   * `RadialGradient`. See `Wash`.
   */
  ambient: Wash[];
  /** The shadow a figure from the cast stands on, split the same way as the ledge. */
  shadow: HexColor;
  shadowOpacity: number;
}

/**
 * One of the ambient washes, as an ellipse rather than as a gradient string.
 *
 * `colors.ts` spells these `radial-gradient(120% 60% at 0% 0%, C 0%, transparent 60%)`
 * — an ellipse sized against the box, with the colour running out partway along
 * it. Everything here is already multiplied through to the point where the
 * colour reaches nothing, so a renderer only has to place an ellipse and fade
 * one stop to the next.
 *
 * All four numbers are fractions of the tile, so the same wash is right on a
 * one-cell square and on a four-cell row.
 */
export interface Wash {
  color: HexColor;
  /** The colour's weight at the centre; it reaches zero at the edge. */
  opacity: number;
  /** The centre, 0–1 across and down the tile. */
  x: number;
  y: number;
  /** The radii it fades out over, as fractions of the tile's width and height. */
  rx: number;
  ry: number;
}

export const LIGHT: WidgetPalette = {
  background: '#fff6ec',
  foreground: '#31261e',
  mutedForeground: '#77685b',
  calories: '#12b76a',
  ramp: '#23d3b0',
  hairline: 'rgba(49, 38, 30, 0.08)',
  glassEdge: 'rgba(255, 255, 255, 0.95)',
  burn: '#c13a7a',
  track: '#12b76a',
  trackOpacity: 0.2,
  rimGlint: '#ffffff',
  rimLit: 0.85,
  rimShade: 0.12,
  ambient: [
    { color: '#23d3b0', opacity: 0.13, x: 0, y: 0, rx: 0.72, ry: 0.36 },
    { color: '#ffb250', opacity: 0.2, x: 1, y: 0.08, rx: 0.682, ry: 0.341 },
    { color: '#ff9678', opacity: 0.1, x: 0.5, y: 1, rx: 0.84, ry: 0.35 },
  ],
  shadow: '#784f14',
  shadowOpacity: 0.16,
};

export const DARK: WidgetPalette = {
  background: '#1a1512',
  foreground: '#f7efe6',
  mutedForeground: '#a79a8d',
  calories: '#3ddc97',
  ramp: '#2ee6c4',
  hairline: 'rgba(255, 255, 255, 0.07)',
  glassEdge: 'rgba(255, 255, 255, 0.09)',
  burn: '#ff8fbe',
  track: '#17945f',
  trackOpacity: 0.62,
  /* The ring's own mint, not white — see `rimGlint`. */
  rimGlint: '#2ee6c4',
  rimLit: 0.3,
  rimShade: 0.3,
  /*
   * Two, where light has three. The warmth rising from the bottom is a light
   * effect on a pale ground; after dark `colors.ts` drops it rather than
   * dimming it, and so does this.
   */
  ambient: [
    { color: '#2ee6c4', opacity: 0.08, x: 0, y: 0, rx: 0.72, ry: 0.36 },
    { color: '#ffaa46', opacity: 0.07, x: 1, y: 0.08, rx: 0.682, ry: 0.341 },
  ],
  shadow: '#000000',
  shadowOpacity: 0.32,
};

/**
 * The gloss along the top of a filled bar.
 *
 * `MacroBars` paints every fill with `linear-gradient(180deg,
 * rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%)` over its own colour, which
 * is what stops a bar being a flat coloured stub. One pair for both schemes,
 * because the app does not vary it either: it is a highlight on a saturated
 * colour, and those behave the same whatever is behind them.
 *
 * What does not come across is the lift underneath — `boxShadow` in the app,
 * and there is no shadow to be had inside a `RemoteViews` tree or a widget's
 * SwiftUI subset. The gloss is the half that reads at this size anyway.
 */
export const GLOSS: { from: RgbaColor; to: RgbaColor } = {
  from: 'rgba(255, 255, 255, 0.5)',
  to: 'rgba(255, 255, 255, 0)',
};

/**
 * The same colour split into a tone and a weight, which is what SVG takes.
 *
 * androidsvg is an SVG 1.1 renderer: a `stop-color` is six hex digits and the
 * alpha is a `stop-opacity` beside it. Same split `track`/`trackOpacity` is
 * written out by hand for; this is for the entries that are still spelled the
 * way `colors.ts` spells them.
 */
export function split(color: RgbaColor | HexColor): { color: HexColor; opacity: number } {
  if (color.startsWith('#')) return { color: color as HexColor, opacity: 1 };
  const channels = color.match(/[\d.]+/g);
  if (!channels || channels.length < 4) return { color: '#000000', opacity: 0 };
  const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  const [r, g, b, a] = channels.map(Number) as [number, number, number, number];
  return { color: `#${hex(r)}${hex(g)}${hex(b)}`, opacity: a };
}

/**
 * The display face, shipped as a widget resource.
 *
 * The app already loads Baloo through `expo-font`, but that lives in the JS
 * bundle and the launcher cannot see it — a widget draws from Android's own
 * resources. So the file is copied into `assets/fonts` and declared to the
 * config plugin, which is a second copy of the same 420KB and worth it: every
 * figure that reports progress in this app is set in this face, and a ring with
 * Roboto numerals under it reads as a different product.
 */
/*
 * The filename without its extension, and it has to be exactly that: the
 * library matches with `file.startsWith(fontName + ".")` against the names in
 * `assets/fonts`, and anything else falls back to `Typeface.DEFAULT` without a
 * word. A widget quietly drawn in Roboto is the kind of bug you only catch by
 * knowing what it should have looked like.
 */
export const DISPLAY = 'Baloo2_800ExtraBold';

/** Tapping anything opens the journal, which is where a thought about food goes. */
export const OPEN_JOURNAL = {
  clickAction: 'OPEN_URI',
  clickActionData: { uri: 'daysofar:///' },
} as const;
