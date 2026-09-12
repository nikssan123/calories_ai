import type { Metadata } from 'next';
import { Home } from '@/components/Home';

/**
 * A server component wrapping a client one, for the sake of two lines of
 * metadata.
 *
 * `generateMetadata` and `export const metadata` are server-only, so a page
 * that opens with `'use client'` cannot declare a canonical, and every route on
 * the site went without one. The decision about who is looking still belongs to
 * <Home>, which reads the session; this file exists to say what the URL is.
 */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return <Home />;
}
