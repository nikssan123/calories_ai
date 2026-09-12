import { BlogIndex, blogIndexMetadata } from '@/components/blog/pages';

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
export const generateMetadata = () => blogIndexMetadata('en');
export default function Page() {
  return <BlogIndex locale="en" />;
}
