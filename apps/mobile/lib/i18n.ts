import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localeOf, matchLocale, type Locale } from '@ct/shared';
import { useAuth } from '@/lib/auth';
import { CATALOGUES, deviceLocale, type MessageKey, type Messages } from '@/messages';
import { en } from '@/messages/en';

/**
 * Which language to draw in, and the strings to draw.
 *
 * The same file as `apps/web/lib/i18n.ts` in everything that matters, with two
 * differences that are about the platform rather than the feature:
 *
 * - There is no document, so nothing paints a `lang` attribute. The display
 *   face is swapped through `useType()` in `@/theme` instead.
 * - The pre-account default comes from the device rather than from a browser,
 *   and it is read through `Intl` rather than `expo-localization`. Hermes on
 *   this SDK ships full ICU — `lib/voice.ts` has been reading the device locale
 *   this way since it was written — so the dependency would buy nothing.
 */

/*
 * The catalogues, the lookup and the device's language now live in
 * `@/messages`, which the widget can import without dragging a session and a
 * network client into a headless draw. Re-exported here so every screen keeps
 * asking `@/lib/i18n` for them.
 */
export type { Messages, MessageKey, StringKey } from '@/messages';

const STORAGE_KEY = 'nutrition-locale';

/**
 * A preference is global to the app, so the screens that care share one value
 * rather than each holding a copy that can drift. Same shape as the web's, and
 * for the same reason — too small to want a provider around the whole tree.
 *
 * Seeded synchronously from the device so the very first frame is already in
 * the right language; `AsyncStorage` corrects it a tick later if a choice was
 * made and remembered. That ordering is the point: a splash screen that paints
 * English and swaps to Bulgarian is worse than one that starts correct for
 * almost everybody.
 */
const listeners = new Set<(locale: Locale) => void>();
let current: Locale = deviceLocale();
let restored = false;

async function restore(): Promise<void> {
  if (restored) return;
  restored = true;
  try {
    const stored = matchLocale(await AsyncStorage.getItem(STORAGE_KEY));
    if (stored && stored !== current) {
      current = stored;
      for (const listener of listeners) listener(stored);
    }
  } catch {
    // Storage unavailable. The device's language is still a good answer.
  }
}

/**
 * Records a language chosen before there is an account to hang it on.
 *
 * The sign-in screen calls this. It does not reach the server on its own —
 * signup sends the same value as its `locale` field, which is what makes the
 * confirmation email arrive in the language the person was reading when they
 * asked for it.
 */
export function setPreferredLocale(locale: Locale): void {
  current = locale;
  void AsyncStorage.setItem(STORAGE_KEY, locale).catch(() => {
    // Not being able to remember it is not a reason to refuse to apply it.
  });
  for (const listener of listeners) listener(locale);
}

/** What signup should send. Read at submit time, outside React. */
export function preferredLocale(): Locale {
  return current;
}

/**
 * The language this session is being read in.
 *
 * The profile wins whenever it has one. `profile.locale` being null is the
 * interesting case: nobody has ever asked this account, so the device's answer
 * is still the best available and this keeps using it — which is also what lets
 * the journal set it later from how somebody writes, without ever having
 * interrupted them to ask.
 */
export function useLocale(): Locale {
  const { profile } = useAuth();
  const [preferred, setPreferred] = useState<Locale>(current);

  useEffect(() => {
    void restore();
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
 * alone does not compile into a template.
 */
export function useT(): <K extends MessageKey>(key: K) => Messages[K] {
  const locale = useLocale();
  return useCallback(
    <K extends MessageKey>(key: K): Messages[K] => CATALOGUES[locale][key] ?? en[key],
    [locale],
  );
}
