import { createContext, useContext } from 'react';
import { dark, light, type Palette } from './colors';

export type { Palette } from './colors';
export { dark, light } from './colors';
export { DISPLAY_LEADING, font, MONO, type } from './typography';
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

export const paletteFor = (scheme: Scheme): Palette => (scheme === 'dark' ? dark : light);
