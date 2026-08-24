import { useWindowDimensions } from 'react-native';
import type { ViewStyle } from 'react-native';

/**
 * The width above which this stops being a phone.
 *
 * Every iPad in portrait clears it — the mini is 744pt, the 11" 834, the 12.9"
 * 1024 — and nothing held in one hand does. Half of a split view (~570pt on an
 * 11" landscape) deliberately does not: at that width a second column is two
 * cramped ones, and the reader has already told the OS they want this app
 * narrow.
 *
 * It is a width test and not a device test on purpose. `Platform.isPad` is
 * wrong the moment the app is resized, and on Android it does not exist at all
 * — which matters more than it sounds, because the manifest's portrait lock
 * stops being honoured on large screens for anything targeting SDK 36, and
 * Expo 57 does. A tablet will hand this app landscape whether or not it asked.
 */
export const WIDE = 700;

/**
 * How wide a single column of content is ever allowed to get.
 *
 * A phone never reaches it, so this costs nothing on the device the app was
 * designed for and everything is unchanged there. On a tablet it is the whole
 * difference between the app and a blown-up phone: the web caps its prose at
 * `max-w-5xl` for the same reason, and a line of body text 900pt long is not
 * read, it is scanned and abandoned.
 */
export const COLUMN = 620;

/** Both columns plus the gutter between them, once there are two. */
export const SPREAD = 1000;

/**
 * A single column, centred once the screen is wider than one.
 *
 * Applied unconditionally rather than behind `useWide()` — `maxWidth` is inert
 * below its own value, so a phone lays out exactly as it did before, and a
 * screen that opts in here needs no re-render when the window resizes.
 */
export const column: ViewStyle = { width: '100%', maxWidth: COLUMN, alignSelf: 'center' };

/** The same bargain for a page that puts two columns side by side. */
export const spread: ViewStyle = { width: '100%', maxWidth: SPREAD, alignSelf: 'center' };

/**
 * Whether there is room for two columns.
 *
 * `useWindowDimensions` and not a one-off `Dimensions.get`, because the answer
 * changes while the app is open — a rotation, a split view being dragged, a
 * fold being opened — and a screen that read the width once draws the tablet
 * layout in a phone-width window until something else re-renders it.
 */
export function useWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE;
}
