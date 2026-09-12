import type { Locale } from '@ct/shared';
import { en } from '@/messages/en';
import { bg } from '@/messages/bg';
import { de } from '@/messages/de';
import { es } from '@/messages/es';
import { fr } from '@/messages/fr';
import { ro } from '@/messages/ro';
import { uk } from '@/messages/uk';
import { sr } from '@/messages/sr';
import { hr } from '@/messages/hr';
import { cs } from '@/messages/cs';
import { hu } from '@/messages/hu';
import { el } from '@/messages/el';
import { sk } from '@/messages/sk';
import type { MessageKey, Messages } from '@/lib/i18n';

/**
 * The catalogues, read on the server.
 *
 * `lib/i18n.ts` opens with `'use client'` and resolves the language from a
 * session and a `localStorage` key, which is the right answer for the app and
 * the wrong one for a page whose language is in its URL. `/bg/blog/...` knows
 * it is Bulgarian before anything renders, and its chrome has to be in the
 * HTML in Bulgarian — a crawler and a reader with no JavaScript both see only
 * what the server wrote.
 *
 * Same catalogues, no hooks. The duplicated import block is the price of the
 * two modules not importing each other across the server/client line.
 */
const CATALOGUES: Record<Locale, Messages> = {
  en,
  bg,
  de,
  es,
  fr,
  ro,
  uk,
  sr,
  hr,
  cs,
  hu,
  el,
  sk,
};

/** The lookup, for a locale that is already known. Falls back to English per key. */
export function messagesFor(locale: Locale) {
  return <K extends MessageKey>(key: K): Messages[K] => CATALOGUES[locale][key] ?? en[key];
}
