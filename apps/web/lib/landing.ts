import { LOCALES, type Locale } from '@ct/shared';
import { DEFAULT_LOCALE, PREFIXED_LOCALES, isBlogPath } from '@/lib/blog';

/**
 * Where the landing page lives, in each of the thirteen.
 *
 * The blog's shape, for the blog's reasons (see lib/blog.ts): English owns `/`
 * and is the `x-default`, every other language takes one path segment — `/bg`,
 * `/de`. No cookie and no `Accept-Language` redirect decides which one a visitor
 * gets. A URL that answers differently depending on who asks is a URL a crawler
 * can only ever index one version of, and a link pasted into a Bulgarian group
 * chat has to open in Bulgarian for everyone in it.
 */
export function landingPath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '/' : `/${locale}`;
}

/** `/bg`, `/de` — the twelve that are always the landing page, signed in or not. */
export function isLocalizedLandingPath(pathname: string): boolean {
  return (PREFIXED_LOCALES as readonly string[]).includes(pathname.slice(1));
}

/**
 * `/` and the twelve. `/` is only the landing page to a visitor — to an account
 * it is the journal — so callers that care about that still check `/` apart.
 */
export function isLandingPath(pathname: string): boolean {
  return pathname === '/' || isLocalizedLandingPath(pathname);
}

/** `alternates.languages` for the landing page: every language, plus `x-default`. */
export function landingHreflang(): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[locale] = landingPath(locale);
  languages['x-default'] = landingPath(DEFAULT_LOCALE);
  return languages;
}

/**
 * The language a public page is written in, when its URL says so.
 *
 * The landing page and the blog carry their language in the path, and that has
 * to beat both the account's language and the browser's for `<html lang>`: the
 * attribute is what swaps the display face to one that can draw Cyrillic, and a
 * Bulgarian page declared as German draws its headings in a face with no
 * Cyrillic in it. `null` for every other route, which keeps the session's
 * answer. `/` is not decided here — who is looking decides what `/` is.
 */
export function pathLocale(pathname: string): Locale | null {
  const first = pathname.split('/')[1] ?? '';
  if ((PREFIXED_LOCALES as readonly string[]).includes(first)) {
    if (pathname === `/${first}` || isBlogPath(pathname)) return first as Locale;
    return null;
  }
  return isBlogPath(pathname) ? DEFAULT_LOCALE : null;
}
