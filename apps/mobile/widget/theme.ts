import type { ColorProp, HexColor } from 'react-native-android-widget';

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
  muted: ColorProp;
  border: ColorProp;
  burn: ColorProp;
  /*
   * The ledge under the ring's track. Split into a colour and an opacity
   * because the app spells it `rgba()` and androidsvg is an SVG 1.1 renderer,
   * where transparency is `stroke-opacity` and a colour is six hex digits.
   */
  ledge: HexColor;
  ledgeOpacity: number;
}

export const LIGHT: WidgetPalette = {
  background: '#fff6ec',
  foreground: '#31261e',
  mutedForeground: '#77685b',
  calories: '#12b76a',
  ramp: '#23d3b0',
  muted: '#f3e8d9',
  border: '#eadcc9',
  burn: '#c13a7a',
  ledge: '#31261e',
  ledgeOpacity: 0.14,
};

export const DARK: WidgetPalette = {
  background: '#1a1512',
  foreground: '#f7efe6',
  mutedForeground: '#a79a8d',
  calories: '#3ddc97',
  ramp: '#2ee6c4',
  muted: '#322822',
  border: '#4d3d33',
  burn: '#ff8fbe',
  ledge: '#000000',
  ledgeOpacity: 0.88,
};

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
