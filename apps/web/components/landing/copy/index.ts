import type { Locale } from '@ct/shared';
import type { LandingCopy } from './types';
import { en } from './en';
import { bg } from './bg';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { ro } from './ro';
import { uk } from './uk';
import { sr } from './sr';
import { hr } from './hr';
import { cs } from './cs';
import { hu } from './hu';
import { el } from './el';
import { sk } from './sk';

export type { LandingCopy } from './types';

/**
 * All thirteen, for the server.
 *
 * Imported only by the two page files, which hand one language's copy to the
 * client component as a prop. The client bundle never carries the other twelve
 * — a thousand words each, for a visitor who will read one of them.
 */
const COPY: Record<Locale, LandingCopy> = { en, bg, de, es, fr, ro, uk, sr, hr, cs, hu, el, sk };

export function landingCopy(locale: Locale): LandingCopy {
  return COPY[locale];
}

/**
 * Each language's "this page is also in …" line, in that language.
 *
 * The banner speaks the language it is offering rather than the one on screen:
 * the person it is for is exactly the one who may not read the page they are on.
 */
export function landingSuggestions(): Record<Locale, LandingCopy['switcher']> {
  return Object.fromEntries(
    Object.entries(COPY).map(([locale, copy]) => [locale, copy.switcher]),
  ) as Record<Locale, LandingCopy['switcher']>;
}
