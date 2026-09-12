import { notFound } from 'next/navigation';
import type { Locale } from '@ct/shared';
import { LandingPage, landingMetadata } from '@/components/landing/pages';
import { PREFIXED_LOCALES } from '@/lib/blog';

/**
 * The landing page in the twelve prefixed languages: `/bg`, `/de`, and so on.
 *
 * Static, and closed. `[locale]` sits at the root of the app, so without
 * `dynamicParams = false` every unknown first segment — `/wat`, `/wp-admin` —
 * would render a landing page at 200. With it, anything that is not one of the
 * twelve is a real 404 before a render starts, which is what the blog's
 * middleware check has to do by hand because its pages are dynamic. English is
 * not here: middleware 308s `/en` to `/`.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return PREFIXED_LOCALES.map((locale) => ({ locale }));
}

type Params = { params: Promise<{ locale: string }> };

/**
 * And checked again anyway. The blog's middleware answers an unknown
 * `/xx/blog` by rewriting to `/_not-found` — a one-segment path this route
 * matches, and a rewrite that `dynamicParams` does not stand in front of.
 */
function parse(locale: string): Locale {
  if (!(PREFIXED_LOCALES as readonly string[]).includes(locale)) notFound();
  return locale as Locale;
}

export async function generateMetadata({ params }: Params) {
  return landingMetadata(parse((await params).locale));
}

export default async function Page({ params }: Params) {
  return <LandingPage locale={parse((await params).locale)} />;
}
