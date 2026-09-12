import { notFound } from 'next/navigation';
import { Locale } from '@ct/shared';
import { BlogPost, blogPostMetadata } from '@/components/blog/pages';

export const revalidate = 3600;

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
