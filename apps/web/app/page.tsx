import type { Metadata } from 'next';
import { Home } from '@/components/Home';
import { LandingStructuredData, landingMetadata, landingProps } from '@/components/landing/pages';

/**
 * A server component wrapping a client one.
 *
 * `generateMetadata` and `export const metadata` are server-only, so a page
 * that opens with `'use client'` cannot declare a canonical. The decision about
 * who is looking still belongs to <Home>, which reads the session; this file
 * says what the URL is, names its twelve siblings in other languages, and hands
 * down the English copy so the client bundle carries no other.
 */
export const metadata: Metadata = landingMetadata('en');

export default function HomePage() {
  return (
    <>
      <LandingStructuredData locale="en" />
      <Home landing={landingProps('en')} />
    </>
  );
}
