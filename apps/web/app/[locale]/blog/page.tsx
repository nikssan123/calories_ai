import { notFound } from 'next/navigation';
import { Locale } from '@ct/shared';
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

type Params = { params: Promise<{ locale: string }> };

/**
 * The twelve prefixed languages.
 *
 * `[locale]` sits at the root of the app, so it catches `/anything/blog`; the
 * parse below is what stops `/wat/blog` being a soft 200. English never reaches
 * here — middleware.ts 308s `/en/blog...` to `/blog...` before a render starts,
 * because the same article on two URLs is exactly the duplicate this layout
 * exists to avoid.
 *
 * `notFound()` lives in the component and not in `generateMetadata`: Next runs
 * metadata alongside the render, and a control-flow throw from inside it is
 * swallowed — which is how an unknown locale ended up answering 200 with an
 * empty body.
 */
function parse(locale: string): Locale | null {
  const parsed = Locale.safeParse(locale);
  return parsed.success ? parsed.data : null;
}

export async function generateMetadata({ params }: Params) {
  const locale = parse((await params).locale);
  // Here as well as in the component, and that is not belt-and-braces: metadata
  // resolves first and its <head> is flushed, after which the status line is
  // already sent and a `notFound()` from the component can only swap the body.
  // That is how an unknown locale answered 200 with a 404 page inside it.
  if (!locale) notFound();
  return blogIndexMetadata(locale);
}

export default async function Page({ params }: Params) {
  const locale = parse((await params).locale);
  if (!locale) notFound();
  return <BlogIndex locale={locale} />;
}
