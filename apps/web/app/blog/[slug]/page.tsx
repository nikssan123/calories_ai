import { BlogPost, blogPostMetadata } from '@/components/blog/pages';

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return blogPostMetadata('en', (await params).slug);
}

export default async function Page({ params }: Params) {
  return <BlogPost locale="en" slug={(await params).slug} />;
}
