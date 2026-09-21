import { notFound } from 'next/navigation';
import { Locale } from '@ct/shared';
import { BlogPost, blogPostMetadata } from '@/components/blog/pages';

/*
 * Rendered on demand, then cached for an hour — same reasoning as the English
 * route next door, and the same reason `force-dynamic` had to go: it streamed
 * the metadata into the body on the eighty-four non-English posts as well. See
 * `app/cook/library/[slug]/page.tsx`.
 */
export const revalidate = 3600;

/*
 * Empty on purpose — it is what makes the route static-capable without calling
 * the API at build time. See app/cook/library/[slug]/page.tsx.
 */
export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ locale: string; slug: string }> };

/** See the index page next door for why English never arrives here. */
function parse(locale: string): Locale | null {
  const parsed = Locale.safeParse(locale);
  return parsed.success ? parsed.data : null;
}

export async function generateMetadata({ params }: Params) {
  const { locale, slug } = await params;
  const parsed = parse(locale);
  // See the index page next door: the status is decided while metadata
  // resolves, so an unknown locale has to fail here rather than in the render.
  if (!parsed) notFound();
  return blogPostMetadata(parsed, slug);
}

export default async function Page({ params }: Params) {
  const { locale, slug } = await params;
  const parsed = parse(locale);
  if (!parsed) notFound();
  return <BlogPost locale={parsed} slug={slug} />;
}
