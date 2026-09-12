import { BlogIndex, blogIndexMetadata } from '@/components/blog/pages';

/** The English blog index. `/blog`, with no locale segment — see lib/blog.ts. */
export const revalidate = 3600;
export const generateMetadata = () => blogIndexMetadata('en');
export default function Page() {
  return <BlogIndex locale="en" />;
}
