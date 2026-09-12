import type { MetadataRoute } from 'next';
import { publicLibrary, publicPostSitemap } from '@/lib/public-api';
import { blogIndexPath, blogPostPath } from '@/lib/blog';
import { INDEXABLE_ROUTES, ORIGIN } from '@/lib/seo';
import { PREFIXED_LOCALES } from '@/lib/blog';
import { landingHreflang, landingPath } from '@/lib/landing';

/*
 * Rendered on demand, with the upstream call cached for an hour.
 *
 * `export const revalidate` alone was wrong here and silently so. A page with
 * no dynamic segment and a revalidate window is *prerendered at build time* —
 * and the build runs in a container with no API and no database, so the fetch
 * failed, the empty result was baked into the image, and production served a
 * page saying the library would not load while the API beside it answered all
 * ninety-nine. It would have corrected itself an hour after the first request,
 * which is a long time to be wrong on the pages a crawler reads.
 *
 * `force-dynamic` keeps the build from calling anything. `fetchCache` then puts
 * the caching back where it belongs: on the fetch in lib/public-api.ts, which
 * carries its own hour. The render is cheap; the round trip is what was worth
 * caching.
 */
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = INDEXABLE_ROUTES.map(
    ({ path, changeFrequency, priority }) => ({
      // `/` is dropped rather than appended, so these match the canonical tags
      // exactly — Next resolves `canonical: '/'` against metadataBase to a bare
      // origin, and a sitemap that disagreed with the page would be one more
      // thing for Search Console to have an opinion about.
      url: path === '/' ? ORIGIN : `${ORIGIN}${path}`,
      lastModified: new Date(),
      changeFrequency,
      priority,
      ...(path === '/' ? { alternates: { languages: landingAlternates() } } : {}),
    }),
  );

  /*
   * The landing page in the other twelve, each carrying the whole cluster.
   *
   * Every member of an hreflang cluster has to list every other member and
   * itself, in the sitemap as much as in the head — a page that names its
   * siblings but is not named back is ignored as a one-way claim.
   */
  const landings: MetadataRoute.Sitemap = PREFIXED_LOCALES.map((locale) => ({
    url: `${ORIGIN}${landingPath(locale)}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.9,
    alternates: { languages: landingAlternates() },
  }));

  const recipes = await publicLibrary();
  const library: MetadataRoute.Sitemap = recipes.length
    ? [
        {
          url: `${ORIGIN}/cook/library`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        },
        ...recipes.map((recipe) => ({
          url: `${ORIGIN}/cook/library/${recipe.slug}`,
          lastModified: new Date(),
          changeFrequency: 'monthly' as const,
          priority: 0.6,
        })),
      ]
    : [];

  /*
   * The blog, in every language it has been published in.
   *
   * A language appears only once it has a post: a `/de/blog` index listing
   * nothing is a thin page inviting a crawler to remember an empty room, and
   * the whole point of the per-locale layout is that each language earns its
   * own authority rather than being handed a stub.
   */
  const posts = await publicPostSitemap();
  const localesWithPosts = [...new Set(posts.map((post) => post.locale))].sort();

  const blog: MetadataRoute.Sitemap = [
    ...localesWithPosts.map((locale) => ({
      url: `${ORIGIN}${blogIndexPath(locale)}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...posts.map((post) => ({
      url: `${ORIGIN}${blogPostPath(post.locale, post.slug)}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];

  return [...fixed, ...landings, ...library, ...blog];
}

/** Absolute URLs, which a sitemap requires and the head's relative map is not. */
function landingAlternates(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(landingHreflang()).map(([lang, path]) => [
      lang,
      path === '/' ? ORIGIN : `${ORIGIN}${path}`,
    ]),
  );
}
