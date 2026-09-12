import type { en } from './en';

/**
 * The landing page's copy contract, widened from the English.
 *
 * The same trick as `Messages` in lib/i18n.ts, carried down into nested objects
 * and tuples: `en.ts` is `as const`, so every string is its own literal type,
 * and this maps each of them back to `string`. What survives the widening is
 * the shape — every key, and the *length* of every list — so a translation with
 * three FAQ answers where English has nine does not compile.
 *
 * No functions anywhere in here, unlike the app's catalogues. This object is
 * handed from a server component to a client one, and a function cannot cross
 * that line. Where a sentence needs a figure in it, the figure is written into
 * the sentence by the translator, in the number format of that language.
 */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : { readonly [K in keyof T]: Widen<T[K]> };

export type LandingCopy = Widen<typeof en>;
