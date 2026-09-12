import { isBlogPath } from '@/lib/blog';
import { isLocalizedLandingPath } from '@/lib/landing';

/**
 * The two facts a crawler needs that nothing else in the app had to state: what
 * this site's address is, and which of its pages are meant to be found.
 *
 * Shared by app/robots.ts, app/sitemap.ts and middleware.ts so the three cannot
 * drift. A sitemap listing a route that middleware noindexes is a page asking
 * to be indexed and refusing in the same breath, and that is exactly the sort of
 * thing that only shows up in Search Console six weeks later.
 */

/**
 * The canonical origin. `metadataBase` in app/layout.tsx already resolves
 * relative URLs against APP_URL for the same reason: self-hosted, so there is
 * no VERCEL_URL to fall back on and a wrong guess points crawlers at localhost.
 */
export const ORIGIN = process.env.APP_URL ?? 'https://daysofar.com';

/**
 * Every page on this site a search engine should hold.
 *
 * The fixed pages only. The recipe library is a subtree rather than a list and
 * is handled separately, in `isIndexableLibraryPath` below and in sitemap.ts.
 *
 * `/how-it-works` and `/accuracy` outrank `/about` deliberately. "How does it
 * work" and "is it accurate" are questions people actually type; "about" is a
 * page they read once they already care.
 */
export const INDEXABLE_ROUTES = [
  { path: '/', changeFrequency: 'monthly', priority: 1 },
  { path: '/how-it-works', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/accuracy', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/support', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
] as const satisfies readonly {
  path: string;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}[];

const INDEXABLE_PATHS: readonly string[] = INDEXABLE_ROUTES.map((route) => route.path);

/**
 * The one indexable subtree, as opposed to the fixed pages above.
 *
 * `/cook/library` and every recipe under it. Deliberately not `/cook`, which is
 * the shelf and needs a session, and deliberately not `/cook/recipe/`, which is
 * somebody's own generated recipe — a prefix test that caught either would put
 * private pages in a search index.
 */
export function isIndexableLibraryPath(pathname: string): boolean {
  return pathname === '/cook/library' || pathname.startsWith('/cook/library/');
}

/**
 * Whether a path should carry `X-Robots-Tag: noindex`.
 *
 * Written as "everything except the ones named" rather than as a list of app
 * routes, so a screen added next month is private by default. Getting that
 * backwards is how a half-finished route ends up in a search result.
 */
export function isNoindexPath(pathname: string): boolean {
  if (INDEXABLE_PATHS.includes(pathname)) return false;
  if (isIndexableLibraryPath(pathname)) return false;
  // Thirteen languages of it, at /blog and /<locale>/blog. Kept in lib/blog.ts
  // beside the path builders, so the matcher and the URLs cannot disagree.
  if (isBlogPath(pathname)) return false;
  // The landing page in the twelve prefixed languages. `/` is on the list above.
  if (isLocalizedLandingPath(pathname)) return false;
  return true;
}
