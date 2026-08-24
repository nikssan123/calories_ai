'use client';

import { useCallback, useEffect, useState } from 'react';
import { localeOf, matchLocale, type Locale } from '@ct/shared';
import { useAuth } from '@/components/AuthGate';
import { en } from '@/messages/en';
import { bg } from '@/messages/bg';
import { de } from '@/messages/de';
import { es } from '@/messages/es';
import { fr } from '@/messages/fr';

/**
 * Which language to draw in, and the strings to draw.
 *
 * Mirrors `lib/units.ts` in the part that matters — a rendering preference read
 * off the profile, resolved once, with a fallback that is the identity rather
 * than a guess — and then adds the thing units never needed: an answer for the
 * screens that come *before* there is a profile.
 *
 * ---
 *
 * **Why there is no i18n library here.** 66 of 79 components under `apps/web`
 * are `'use client'`. This is a client-rendered app behind `<AuthGate>`, and
 * the locale arrives on the profile from `/me` — not from the URL. `next-intl`
 * solves routing, server components and middleware, none of which this app has
 * a problem with, and would drag a `[locale]` segment through every page to do
 * it. A dictionary and a hook is the whole requirement.
 *
 * The completeness check is the compiler. `MessageKey` is `keyof typeof en`,
 * and every other catalogue is typed `Messages`, so a Bulgarian string that has
 * not been written yet is a typecheck failure rather than a blank label in
 * production. `pnpm -r typecheck` is worth more here than any extraction tool.
 */

/**
 * The catalogue contract, widened.
 *
 * `en.ts` is `as const`, which makes every value its own literal type — useful
 * there, because it is what lets `MessageKey` be the exact set of keys. Used
 * directly as the type of the *other* catalogues it would demand they contain
 * the English strings verbatim, which is the opposite of the point. So this
 * maps each entry to what it actually has to be: a string, or a function of the
 * same shape as the English one. A message that takes a number keeps its
 * signature, so a translation cannot quietly drop the argument.
 */
export type Messages = {
  [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};
export type MessageKey = keyof Messages;

/**
 * The keys whose messages are plain strings.
 *
 * Anywhere a key is stored in a table and resolved later — the tab bar's
 * labels, the meal headings — the value has to be something React can render.
 * `MessageKey` alone is not that: it includes the handful of messages that take
 * an argument, and `t(someUnionOfKeys)` widens to `string | ((n: string) =>
 * string)`, which is not a ReactNode. This narrows the table to the keys that
 * cannot be functions, so the mistake is caught where the table is written
 * rather than where it is rendered.
 */
export type StringKey = {
  [K in MessageKey]: Messages[K] extends string ? K : never;
}[MessageKey];

const CATALOGUES: Record<Locale, Messages> = { en, bg, de, es, fr };

const STORAGE_KEY = 'nutrition-locale';

/**
 * The locale to use before anyone has signed in.
 *
 * Three sources, in the order they deserve: a choice made on the sign-in screen
 * and remembered, then the browser's own language, then English. This is only
 * ever the *pre-account* answer — the moment a profile arrives it wins, because
 * a preference somebody set on this account beats one their browser inferred.
 */
function readPreferred(): Locale {
  try {
    const stored = matchLocale(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Private mode, or storage disabled. The browser's language still answers.
  }
  return matchLocale(typeof navigator === 'undefined' ? null : navigator.language) ?? 'en';
}

/**
 * A preference is global to the document, so the components that care about it
 * share one value rather than each holding a copy that can drift. Same shape as
 * the theme store in `ThemeSync` and for the same reason — small enough not to
 * want a context provider around the whole tree.
 */
const listeners = new Set<(locale: Locale) => void>();
let current: Locale | null = null;

/** Sets `<html lang>`, which is what swaps the display face. See globals.css. */
function applyToDocument(locale: Locale): void {
  document.documentElement.lang = locale;
}

/**
 * Records a language chosen before there is an account to hang it on.
 *
 * The sign-in screen calls this. It does not reach the server — signup sends
 * the same value as its `locale` field, which is what makes the confirmation
 * email arrive in the language the person was reading when they asked for it.
 */
export function setPreferredLocale(locale: Locale): void {
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not being able to remember it is not a reason to refuse to apply it.
  }
  applyToDocument(locale);
  for (const listener of listeners) listener(locale);
}

/** What signup should send. Read at submit time, outside React. */
export function preferredLocale(): Locale {
  return (current ??= readPreferred());
}

/**
 * The language this session is being read in.
 *
 * The profile wins whenever there is one — including when it is null, which
 * `localeOf` resolves to English. `profile.locale` being null is the interesting
 * case: it means nobody has ever asked this account, so the browser's answer is
 * still the best one available and this keeps using it.
 */
export function useLocale(): Locale {
  const { profile } = useAuth();
  const [preferred, setPreferred] = useState<Locale>('en');

  useEffect(() => {
    current ??= readPreferred();
    setPreferred(current);
    listeners.add(setPreferred);
    return () => {
      listeners.delete(setPreferred);
    };
  }, []);

  return profile?.locale ? localeOf(profile) : preferred;
}

/**
 * The lookup.
 *
 * Generic in the key so a message that takes an argument stays a function on
 * the way out — `t('today.burned')('320')` typechecks and `t('today.burned')`
 * alone does not compile into a template. That is the whole reason this is not
 * `(key: string) => string`: ICU MessageFormat exists to make interpolation
 * safe inside a string, and a plain function is already safe.
 */
export function useT(): <K extends MessageKey>(key: K) => Messages[K] {
  const locale = useLocale();
  return useCallback(
    <K extends MessageKey>(key: K): Messages[K] => CATALOGUES[locale][key] ?? en[key],
    [locale],
  );
}

/**
 * Keeps `<html lang>` in step with whoever is signed in.
 *
 * First paint is handled by LOCALE_INIT_SCRIPT below; this corrects it once the
 * session resolves, for the case where the account's language is not the one
 * the browser guessed.
 */
export function LocaleSync() {
  const locale = useLocale();
  useEffect(() => {
    applyToDocument(locale);
  }, [locale]);
  return null;
}

/**
 * Runs before first paint so no heading is drawn in the wrong face.
 *
 * Deliberately duplicates `readPreferred` rather than importing it: this string
 * is inlined into <head> and executes before any bundle has loaded. It also
 * cannot know the account's language — that arrives with `/me` — so it settles
 * for the browser's, which is right for a first visit and right for everyone
 * whose account language matches their browser. `<LocaleSync>` fixes the rest,
 * and swapping a face after paint is a reflow rather than a flash of fallback.
 */
export const LOCALE_INIT_SCRIPT = `try{
  var l = null;
  try { l = localStorage.getItem('${STORAGE_KEY}'); } catch (e) {}
  l = l || navigator.language || 'en';
  l = String(l).toLowerCase().split(/[-_]/)[0];
  document.documentElement.lang = ${JSON.stringify(Object.keys(CATALOGUES))}.indexOf(l) === -1 ? 'en' : l;
}catch(e){}`;
