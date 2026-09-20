import { notFound } from 'next/navigation';
import { Locale } from '@ct/shared';
import { BlogIndex, blogIndexMetadata } from '@/components/blog/pages';

/*
 * Rendered on demand, then cached for an hour.
 *
 * This carried `force-dynamic` for the reason the comment on `app/blog/page.tsx`
 * still gives: a route with no dynamic segment and a revalidate window gets
 * prerendered at build time, and the build runs in a container with no API, so
 * an empty list was baked into the image.
 *
 * That reason does not apply here, because this route *has* a dynamic segment.
 * `generateStaticParams` returning `[]` makes it static-capable while leaving the
 * build nothing to prerender and no API to call — the same trick as the `[slug]`
 * routes, and it matters for the same reason: on a dynamic route Next streams the
 * metadata, so `<title>`, the description and the canonical land in `<body>`
 * after `</head>` has closed for any user agent outside its bot allowlist —
 * Googlebot included.
 *
 * It was worse than "always broken". Measured on production, `/de/blog` served
 * its title inside `<head>` on one request and in the body on the next, so which
 * of the thirteen indexes looked correct depended on when you asked. That is why
 * the 2026-09-20 audit's crawl found all thirteen fine and `/cook/library`
 * broken: a snapshot of a coin flip, not a property.
 *
 * `/blog` and `/cook/library` cannot have this and still stream — they have no
 * dynamic segment. See SEO.md.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

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
