import type { Metadata } from 'next';
import type { Locale } from '@ct/shared';
import { landingCopy, landingSuggestions } from '@/components/landing/copy';
import { Landing } from '@/components/landing/Landing';
import { LANDING_PRICES } from '@/components/landing/prices';
import { landingHreflang, landingPath } from '@/lib/landing';
import { jsonLd, softwareApplicationSchema } from '@/lib/schema';
import { ORIGIN } from '@/lib/seo';

/**
 * The landing page's server half, written once for `/` and `/[locale]`.
 *
 * Same arrangement as components/blog/pages.tsx: two route files that are
 * shims around this one, so the hreflang cluster and the structured data are
 * written in one place and cannot disagree between the English page and the
 * other twelve.
 */

export function landingMetadata(locale: Locale): Metadata {
  const copy = landingCopy(locale);
  const path = landingPath(locale);
  return {
    // `absolute`, so the layout's "Day So Far" is not appended to a title
    // that already leads with it.
    title: { absolute: copy.meta.title },
    description: copy.meta.description,
    alternates: { canonical: path, languages: landingHreflang() },
    openGraph: {
      type: 'website',
      siteName: 'Day So Far',
      title: copy.meta.title,
      description: copy.meta.description,
      url: path,
      locale,
    },
    twitter: { card: 'summary_large_image', title: copy.meta.title, description: copy.meta.description },
  };
}

/**
 * The structured data a landing page carries: the app, and its FAQ.
 *
 * The FAQ is built from the same copy the `<details>` render, so the answers
 * a search engine reads are the ones on the page — FAQPage markup that differs
 * from the visible text is the kind Google treats as spam.
 */
export function LandingStructuredData({ locale }: { locale: Locale }) {
  const copy = landingCopy(locale);
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    url: `${ORIGIN}${landingPath(locale) === '/' ? '' : landingPath(locale)}`,
    mainEntity: copy.faq.items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(softwareApplicationSchema(copy.meta.description, LANDING_PRICES[locale])) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />
    </>
  );
}

/** The props `<Landing>` needs, resolved on the server so one language ships. */
export function landingProps(locale: Locale) {
  return { locale, copy: landingCopy(locale), suggestions: landingSuggestions() };
}

export function LandingPage({ locale }: { locale: Locale }) {
  return (
    <>
      <LandingStructuredData locale={locale} />
      <Landing {...landingProps(locale)} />
    </>
  );
}
