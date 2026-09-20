import type { MetadataRoute } from 'next';
import type { Locale } from '@ct/shared';
import { publicLibrary, publicPostSitemap } from '@/lib/public-api';
import { blogIndexPath, blogPostPath } from '@/lib/blog';
import { INDEXABLE_ROUTES, LIBRARY_UPDATED, ORIGIN } from '@/lib/seo';
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
 *
 * Note that this reasoning is specific to a route with no dynamic segment. The
 * `[slug]` pages were carrying the same flag for the same stated reason and it
 * was doing nothing for them but harm — see app/cook/library/[slug]/page.tsx.
 */
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';

/*
 * `lastModified` is a claim about the content, not about the request.
 *
 * Every entry here used to call `new Date()`. Because this route is
 * `force-dynamic`, that ran afresh on every fetch of /sitemap.xml — so two
 * crawls nine minutes apart saw different "last modified" dates for an unchanged
 * homepage, and 132 of the 223 URLs were stamped with the moment the crawler
 * happened to ask. That is worse than omitting the field: a domain whose
 * `lastmod` moves while its content does not teaches Google to stop reading
 * `lastmod` for the whole site, including the ninety-one blog posts where the
 * value was real and useful all along.
 *
 * So each group now answers with something that actually changes when the page
 * does: a hand-kept constant for copy that changes on a deploy, the post's own
 * `updated_at` for a post, and the newest of a set for a page that is a list of
 * that set.
 */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = INDEXABLE_ROUTES.map(({ path, updated }) => ({
    // `/` is dropped rather than appended, so these match the canonical tags
    // exactly — Next resolves `canonical: '/'` against metadataBase to a bare
    // origin, and a sitemap that disagreed with the page would be one more
    // thing for Search Console to have an opinion about.
    url: path === '/' ? ORIGIN : `${ORIGIN}${path}`,
    lastModified: updated,
    ...(path === '/' ? { alternates: { languages: landingAlternates() } } : {}),
  }));

  /*
   * The landing page in the other twelve, each carrying the whole cluster.
   *
   * Every member of an hreflang cluster has to list every other member and
   * itself, in the sitemap as much as in the head — a page that names its
   * siblings but is not named back is ignored as a one-way claim.
   */
  const landingUpdated = INDEXABLE_ROUTES.find((route) => route.path === '/')!.updated;
  const landings: MetadataRoute.Sitemap = PREFIXED_LOCALES.map((locale) => ({
    url: `${ORIGIN}${landingPath(locale)}`,
    lastModified: landingUpdated,
    alternates: { languages: landingAlternates() },
  }));

  /*
   * One failing subsystem must not empty the other.
   *
   * Both of these resolve to `[]` rather than throwing when the API is
   * unreachable (see lib/public-api.ts), which is the gentler failure but still
   * a bad one here: a sitemap that silently drops ninety-nine URLs reads to
   * Google as ninety-nine URLs withdrawn. Settled per subsystem so that a blog
   * outage cannot also un-list the recipes, and neither can take the seven fixed
   * pages down with it.
   */
  const [recipes, posts] = await Promise.all([
    publicLibrary().catch(() => []),
    publicPostSitemap().catch(() => []),
  ]);

  const library: MetadataRoute.Sitemap = recipes.length
    ? [
        {
          url: `${ORIGIN}/cook/library`,
          lastModified: LIBRARY_UPDATED,
        },
        ...recipes.map((recipe) => ({
          url: `${ORIGIN}/cook/library/${recipe.slug}`,
          lastModified: LIBRARY_UPDATED,
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
  const localesWithPosts = [...new Set(posts.map((post) => post.locale))].sort();

  /** The newest post in a language, which is when its index last changed. */
  const newestIn = (locale: Locale): string =>
    posts
      .filter((post) => post.locale === locale)
      .reduce((newest, post) => (post.updated_at > newest ? post.updated_at : newest), '');

  /*
   * The hreflang cluster for each post, rebuilt from the topic.
   *
   * The head has carried these all along; the sitemap never did, even though the
   * comment above about one-way claims was written to describe exactly this and
   * then only applied to the thirteen landing pages. One topic is one subject
   * with one post per language, so grouping the rows by `topic_id` is the
   * cluster — which is why `publicPostSitemap` now asks for it.
   */
  const byTopic = new Map<string, typeof posts>();
  for (const post of posts) {
    const group = byTopic.get(post.topic_id) ?? [];
    group.push(post);
    byTopic.set(post.topic_id, group);
  }

  const blog: MetadataRoute.Sitemap = [
    ...localesWithPosts.map((locale) => ({
      url: `${ORIGIN}${blogIndexPath(locale)}`,
      lastModified: newestIn(locale),
      alternates: { languages: blogIndexAlternates(localesWithPosts) },
    })),
    ...posts.map((post) => {
      const cluster = byTopic.get(post.topic_id) ?? [post];
      return {
        url: `${ORIGIN}${blogPostPath(post.locale, post.slug)}`,
        lastModified: post.updated_at,
        // Only worth stating when there is more than one language of it; a
        // cluster of one is a page naming itself and nothing else.
        ...(cluster.length > 1
          ? { alternates: { languages: postAlternates(cluster) } }
          : {}),
      };
    }),
  ];

  return [...fixed, ...landings, ...library, ...blog];
}

/** Absolute URLs, which a sitemap requires and the head's relative map is not. */
function landingAlternates(): Record<string, string> {
  return absolutise(landingHreflang());
}

function blogIndexAlternates(locales: Locale[]): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[locale] = blogIndexPath(locale);
  // `x-default` at the English index when English is in the set, which it is
  // whenever anything has been published — see hreflangFor in lib/blog.ts for
  // the same fallback and the reason it cannot point outside the cluster.
  languages['x-default'] = blogIndexPath(locales.includes('en') ? 'en' : locales[0]!);
  return absolutise(languages);
}

function postAlternates(cluster: { locale: Locale; slug: string }[]): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const post of cluster) languages[post.locale] = blogPostPath(post.locale, post.slug);
  const fallback = cluster.find((post) => post.locale === 'en') ?? cluster[0]!;
  languages['x-default'] = blogPostPath(fallback.locale, fallback.slug);
  return absolutise(languages);
}

function absolutise(paths: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(paths).map(([lang, path]) => [lang, path === '/' ? ORIGIN : `${ORIGIN}${path}`]),
  );
}
