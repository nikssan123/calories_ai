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
 * It is four entries long, and the shortness is the point rather than an
 * oversight — the web half of this product is a landing page and three
 * documents. Everything else at daysofar.com is an app screen behind a session.
 */
export const INDEXABLE_ROUTES = [
  { path: '/', changeFrequency: 'monthly', priority: 1 },
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
 * Whether a path should carry `X-Robots-Tag: noindex`.
 *
 * Written as "everything except the four" rather than as a list of app routes,
 * so a screen added next month is private by default. Getting that backwards is
 * how a half-finished route ends up in a search result.
 */
export function isNoindexPath(pathname: string): boolean {
  return !INDEXABLE_PATHS.includes(pathname);
}
