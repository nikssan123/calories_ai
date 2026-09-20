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
 * The share card, named explicitly for pages that set their own `openGraph`.
 *
 * `app/opengraph-image.png` is file-based metadata and is inherited by every
 * route under it — but only by routes that do not declare an `openGraph` object
 * of their own. Declaring one with a title, a description and a url and no
 * `images` silently drops the inherited image, which is how `/about`,
 * `/accuracy`, `/how-it-works` and `/cook/library` ended up unfurling as bare
 * links while `/privacy`, `/support` and `/terms` — which set no `openGraph` at
 * all — kept their card.
 *
 * Passed explicitly rather than by deleting those `openGraph` blocks, because
 * the blocks are doing real work: the card's title is not the page's title tag.
 */
export const OG_IMAGE = '/opengraph-image.png';

/**
 * The brand suffix, added only when it fits.
 *
 * Every title on the site read `<something> — Day So Far`, and on the blog the
 * something is already a full headline: eighty-three of ninety-one posts came
 * out over sixty characters, up to eighty-four, so Google truncated them — and
 * what it truncated was the end, which is where the suffix was. Paying thirteen
 * characters for a brand name nobody gets to read, at the cost of the last words
 * of the headline, is the wrong trade on exactly those pages.
 *
 * So the suffix is a nicety, not a rule: it goes on when the whole thing still
 * fits in the roughly sixty characters a result actually shows, and is dropped
 * when the page's own title needs the room. Short titles — `Accuracy`, `Recipes`
 * — keep it, which is where it was doing real work anyway.
 */
const TITLE_BUDGET = 60;
const BRAND = 'Day So Far';

export function withBrand(title: string): string {
  // A title that already says the name does not need it twice. `/about` is
  // "Who builds Day So Far", which this would otherwise render as
  // "Who builds Day So Far — Day So Far".
  if (title.includes(BRAND)) return title;
  const full = `${title} — ${BRAND}`;
  return full.length <= TITLE_BUDGET ? full : title;
}

/**
 * A meta description clamped to what a result will show.
 *
 * The recipe summaries come from USDA MyPlate Kitchen and are written as
 * introductions rather than as descriptions — twenty-five of the ninety-nine ran
 * past a hundred and sixty characters and one reached three hundred and
 * ninety-six, so Google cut them mid-sentence. Cut at a word instead, and only
 * when there is something to cut.
 */
export function clampDescription(text: string, limit = 155): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  // A single unbroken run longer than the limit has no word to break on; take
  // the hard cut rather than returning the whole overlong string.
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.!—-]+$/, '')}…`;
}

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
  { path: '/', updated: '2026-09-20' },
  { path: '/how-it-works', updated: '2026-09-12' },
  { path: '/accuracy', updated: '2026-09-12' },
  { path: '/about', updated: '2026-09-12' },
  { path: '/support', updated: '2026-09-12' },
  { path: '/privacy', updated: '2026-09-04' },
  { path: '/terms', updated: '2026-09-04' },
] as const satisfies readonly { path: string; updated: string }[];

/**
 * When the recipe library last changed.
 *
 * The ninety-nine recipes are seeded from a file, so the honest answer is "when
 * somebody deployed a new seed" — a constant, edited by hand on the day it
 * happens. `LibraryCard` carries no `updated_at` to read instead, and the
 * alternative that was here before was `new Date()`, which is worse than
 * useless: see the note in app/sitemap.ts.
 */
export const LIBRARY_UPDATED = '2026-09-12';

/**
 * `changeFrequency` and `priority` are deliberately absent from the two above.
 *
 * Google has ignored both since 2023 and says so plainly; Bing gives them close
 * to nothing. What they were costing was not bytes so much as consistency — a
 * six-tier priority scheme (1 / 0.9 / 0.8 / 0.7 / 0.6 / 0.5 / 0.3) that had to
 * be kept internally sensible while nothing on the other end read a single
 * value of it.
 */

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
