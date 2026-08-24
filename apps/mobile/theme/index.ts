import { createContext, useContext } from 'react';
import { dark, light, type Palette } from './colors';
import { typeFor } from './typography';
import { useLocale } from '@/lib/i18n';

export type { Palette } from './colors';
export { dark, light, withAlpha } from './colors';
export { DISPLAY_LEADING, displayFacesFor, font, MONO, type, typeFor } from './typography';
export { CHUNK_DEPTH, duration, ease, RADIUS } from './motion';

export type Scheme = 'light' | 'dark';

export interface ThemeValue {
  scheme: Scheme;
  colors: Palette;
}

/**
 * The palette in force, as context rather than as a `useColorScheme()` call per
 * component. The scheme is resolved once at the root so that an in-app override
 * — which the web has as a toggle and this will grow — has one place to live,
 * and so that every component reads the same answer on the same frame.
 */
export const ThemeContext = createContext<ThemeValue>({ scheme: 'light', colors: light });

export const useTheme = (): ThemeValue => useContext(ThemeContext);

/** The palette alone, which is what nearly every call site actually wants. */
export const useColors = (): Palette => useContext(ThemeContext).colors;

/**
 * The type scale for the language in force.
 *
 * The same bargain as `useColors`: a screen reads its scale from here rather
 * than importing the module-level `type`, because the display face depends on
 * the script the same way the palette depends on the scheme — and a component
 * that imported the constant directly would keep drawing Cyrillic headings in
 * a face with no Cyrillic in it.
 *
 * Every call site that only ever renders Latin — a number, an icon label — can
 * keep using `type` directly, and most do.
 */
export const useType = (): ReturnType<typeof typeFor> => typeFor(useLocale());

export const paletteFor = (scheme: Scheme): Palette => (scheme === 'dark' ? dark : light);
