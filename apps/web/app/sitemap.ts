import type { MetadataRoute } from 'next';
import { publicLibrary, publicPostSitemap } from '@/lib/public-api';
import { blogIndexPath, blogPostPath } from '@/lib/blog';
import { INDEXABLE_ROUTES, ORIGIN } from '@/lib/seo';

/**
 * Served at /sitemap.xml, which did not exist.
 *
 * Four fixed pages and the whole starter library. The library is the reason
 * this is worth having at all: ninety-nine recipe pages that were, until the
 * index page next to them shipped, reachable from nowhere a crawler could go.
 *
 * Rebuilt on the same hour-long cycle as the pages it lists, rather than baked
 * at build time, because the image has no database to ask while it is being
 * built. If the API cannot be reached the library simply comes back empty and
 * the four fixed pages still ship — a short sitemap is a far smaller problem
 * than a 500 where a sitemap should be.
 */
export const revalidate = 3600;

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
    }),
  );

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

  return [...fixed, ...library, ...blog];
}
