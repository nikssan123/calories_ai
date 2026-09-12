import type { MetadataRoute } from 'next';
import { INDEXABLE_ROUTES, ORIGIN } from '@/lib/seo';

/**
 * Served at /sitemap.xml, which did not exist.
 *
 * Four URLs, because four is how many public pages this site has. The starter
 * library is ninety-nine more — a recipe per URL, each with a title, an image,
 * ingredients, steps and real macros — and none of them are here yet: the page
 * fetches its recipe client-side through an endpoint that needs a session, so
 * there is nothing for a crawler to be sent to. Adding the slugs before that is
 * fixed would be ninety-nine invitations to an empty room. See SEO.md §5.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_ROUTES.map(({ path, changeFrequency, priority }) => ({
    // `/` is dropped rather than appended, so these match the canonical tags
    // exactly — Next resolves `canonical: '/'` against metadataBase to a bare
    // origin, and a sitemap that disagreed with the page would be one more
    // thing for Search Console to have an opinion about.
    url: path === '/' ? ORIGIN : `${ORIGIN}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
