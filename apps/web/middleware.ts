import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PREFIXED_LOCALES } from '@/lib/blog';
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
  const { pathname } = request.nextUrl;

  /*
   * `/en/blog...` is `/blog...`, permanently.
   *
   * English owns the bare path and the other twelve take a prefix, so
   * `/en/blog/x` is a second address for a page that already has one. Caught
   * here rather than in the page because a redirect belongs before a render:
   * `redirect()` from inside `generateMetadata` is swallowed, which is how this
   * shipped once already as a 200 with an empty body.
   */
  if (pathname === '/en') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url, 308);
  }

  if (pathname === '/en/blog' || pathname.startsWith('/en/blog/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice('/en'.length);
    return NextResponse.redirect(url, 308);
  }

  /*
   * `/<anything>/blog` where <anything> is not one of the twelve.
   *
   * `[locale]` is a bare dynamic segment at the root of the app, so it catches
   * every first path segment there is, and an unknown one has to 404 rather
   * than render an empty page at 200. It is settled here because it cannot be
   * settled in the route: `notFound()` from a page swaps the body after the
   * status line has gone out, and `notFound()` from `generateMetadata` does not
   * set the status either — both answer 200 with a 404 page inside, which is a
   * soft 404 and the exact thing Search Console complains about.
   *
   * A rewrite rather than a bare response, so the reader still gets the app's
   * own not-found page; the status is the part that had to be fixed.
   */
  const localeBlog = /^\/([^/]+)\/blog(?:\/|$)/.exec(pathname);
  if (localeBlog && !(PREFIXED_LOCALES as readonly string[]).includes(localeBlog[1]!)) {
    const url = request.nextUrl.clone();
    url.pathname = '/_not-found';
    return NextResponse.rewrite(url, { status: 404 });
  }

  const response = NextResponse.next();
  if (isNoindexPath(pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api/|robots\\.txt|sitemap\\.xml|llms\\.txt|opengraph-image|icon|apple-icon|favicon\\.ico|\\.well-known/).*)',
  ],
};
