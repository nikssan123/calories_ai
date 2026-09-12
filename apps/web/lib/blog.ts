import { LOCALES, type Locale } from '@ct/shared';

/**
 * Where a post lives.
 *
 * English sits at `/blog/<slug>` and every other language at
 * `/<locale>/blog/<slug>`. The asymmetry is deliberate and it is the ordinary
 * shape: one language owns the bare path and is the `x-default`, the rest are
 * subdirectories. The alternative — `/en/blog/...` with `/blog` redirecting —
 * costs a redirect on the most-linked half of the site to buy symmetry nobody
 * sees.
 *
 * Slugs are per-locale and genuinely differ: `how-accurate-is-ai-calorie-
 * counting` in English, `tochnost-ai-broene-na-kalorii` in Bulgarian. That is
 * why an alternate cannot be computed from the current URL and has to be
 * carried by the post, and why `hreflang` here is built from data rather than
 * from a path template.
 */

export const DEFAULT_LOCALE: Locale = 'en';

/** The twelve that take a path segment. */
export const PREFIXED_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

export function blogIndexPath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '/blog' : `/${locale}/blog`;
}

export function blogPostPath(locale: Locale, slug: string): string {
  return `${blogIndexPath(locale)}/${slug}`;
}

/**
 * Whether a path belongs to the blog, in any language.
 *
 * Used by the noindex middleware, so it errs toward recognising: a blog page
 * this does not match is a published page carrying `noindex`, which is a
 * silent and total failure.
 */
export function isBlogPath(pathname: string): boolean {
  if (pathname === '/blog' || pathname.startsWith('/blog/')) return true;
  return PREFIXED_LOCALES.some(
    (locale) => pathname === `/${locale}/blog` || pathname.startsWith(`/${locale}/blog/`),
  );
}

/**
 * The `alternates.languages` map for one post.
 *
 * `x-default` points at English when English exists, and otherwise at whatever
 * this post is — a cluster with no English member still needs one, and pointing
 * it at a language that is not in the cluster would be a lie.
 */
export function hreflangFor(
  alternates: { locale: Locale; slug: string }[],
  current: { locale: Locale; slug: string },
): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const alt of alternates) languages[alt.locale] = blogPostPath(alt.locale, alt.slug);

  const fallback = alternates.find((a) => a.locale === DEFAULT_LOCALE) ?? current;
  languages['x-default'] = blogPostPath(fallback.locale, fallback.slug);
  return languages;
}
