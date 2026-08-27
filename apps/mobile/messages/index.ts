import { type Locale, matchLocale } from '@ct/shared';
import { en } from './en';
import { bg } from './bg';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';

/**
 * The catalogues, and the lookup that does not need React.
 *
 * Split out of `lib/i18n.ts` for the widget's sake. A widget is drawn by the
 * launcher in a process with no tree, no providers and no hooks, so it cannot
 * call `useT()` — but it is still the same app saying the same things, and a
 * home screen that reads "to go" under a Bulgarian journal would be the app
 * forgetting who it was talking to.
 *
 * Deliberately *not* reached through `lib/i18n`, which imports the auth store:
 * the widget handler is registered before the router in `index.js`, and pulling
 * a session and its network client into that path to look up two words would be
 * a poor trade. This file imports nothing but the catalogues themselves.
 */

export type Messages = {
  [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

export type MessageKey = keyof Messages;

/** See the web twin: the keys safe to store in a table and resolve later. */
export type StringKey = {
  [K in MessageKey]: Messages[K] extends string ? K : never;
}[MessageKey];

export const CATALOGUES: Record<Locale, Messages> = { en, bg, de, es, fr };

/** The strings for a language, with English standing in for anything missing. */
export function messagesFor(locale: Locale): Messages {
  return CATALOGUES[locale] ?? en;
}

/**
 * The device's language, as one of ours.
 *
 * `Intl` can throw on a device with a malformed locale setting, which is rare
 * and is not a reason to fail to start. English is the answer when we cannot
 * tell — and null would be worse here, because this is the value the sign-in
 * screen renders with and something has to be drawn.
 */
export function deviceLocale(): Locale {
  try {
    return matchLocale(Intl.DateTimeFormat().resolvedOptions().locale) ?? 'en';
  } catch {
    return 'en';
  }
}
