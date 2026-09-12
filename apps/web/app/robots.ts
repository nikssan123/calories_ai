import type { MetadataRoute } from 'next';
import { ORIGIN } from '@/lib/seo';

/**
 * Served at /robots.txt, which until now was a 404 rendered as the app's own
 * HTML error page — seventeen kilobytes of React shell where a crawler expected
 * four lines of text.
 *
 * Almost nothing is disallowed here, and that is deliberate rather than lax.
 * `Disallow` stops a crawl, not an index: a URL nobody is allowed to fetch can
 * still be listed from a link alone, and blocking it guarantees the
 * `X-Robots-Tag: noindex` that middleware.ts puts on every app route is never
 * read. So the app routes stay crawlable, get fetched once, say noindex, and
 * drop out. That is the combination that actually keeps them out of an index.
 *
 * The two exceptions are the ones where crawling is pointless rather than
 * merely unproductive. `/api/` is a proxy to the API and answers JSON. `/c/` is
 * an invite link whose code is formatted client-side and never looked up, so
 * every string under it returns 200 — an unbounded space with nothing in it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/c/'] }],
    sitemap: `${ORIGIN}/sitemap.xml`,
    host: ORIGIN,
  };
}
