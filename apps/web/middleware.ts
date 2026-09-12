import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isNoindexPath } from '@/lib/seo';

/**
 * `X-Robots-Tag: noindex, nofollow` on everything that is not one of the four
 * public pages.
 *
 * A header rather than a meta tag, because twenty-two of this app's
 * twenty-five routes open with `'use client'` and a client component cannot
 * export `metadata`. Saying it at the edge sidesteps that entirely: it does not
 * care how the page below is rendered, and it is the only statement of the kind
 * that also covers the app's own 404 and the dynamic segments underneath
 * `/c/` and `/cook/`.
 *
 * The list it protects against is a real one. Every app route currently answers
 * 200 with the same generic title and description — `/today`, `/history`,
 * `/admin`, `/coach` and a dozen more — which is a duplicate-metadata cluster
 * waiting for the day Google's renderer starts crediting them with content.
 *
 * The matcher excludes Next's own asset paths and the files that have to stay
 * fetchable for this to work at all: robots.txt, sitemap.xml and llms.txt, plus
 * the icons and the Open Graph image, which a crawler fetches while unfurling a
 * link and must not be told to forget.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (isNoindexPath(request.nextUrl.pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api/|robots\\.txt|sitemap\\.xml|llms\\.txt|opengraph-image|icon|apple-icon|favicon\\.ico|\\.well-known/).*)',
  ],
};
