import { BlogPost, blogPostMetadata } from '@/components/blog/pages';

/*
 * Rendered on demand, then cached for an hour. A `[slug]` route has no paths to
 * prerender without `generateStaticParams`, so the build calls nothing either
 * way — and `force-dynamic` here was what pushed this page's `<title>` out of
 * `<head>` for Googlebot and every AI crawler. The long version is in
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

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return blogPostMetadata('en', (await params).slug);
}

export default async function Page({ params }: Params) {
  return <BlogPost locale="en" slug={(await params).slug} />;
}
