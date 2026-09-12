import type { Locale } from '@ct/shared';

/**
 * What each language's page charges, as numbers, for the structured data.
 *
 * The visible prices are written into each copy file in that language's own
 * number format; this is the same figures again for schema.org, which wants
 * `9.99` and a currency code. Keep the two in step.
 *
 * **English is US dollars; the other twelve are euros.** Not a conversion:
 * these are Google Play's own regional prices, read from the monetization API
 * on 2026-09-13, for each language's main market — Germany for `de`, Greece for
 * `el`, Croatia for `hr`. Play sets a separate euro price per country, so they
 * differ: Plus is €99.99 a year in Germany and €104.99 in most of the rest.
 * Romanian, Czech, Hungarian, Serbian and Ukrainian are read in countries that
 * pay in their own currency; their pages show the common eurozone figures, and
 * the copy says Google Play shows the exact price.
 *
 * At euro prices the year is not "two months free" (€104.99 against twelve of
 * €9.99 is a saving of 12%), so the European copy states the monthly equivalent
 * and each page's toggle carries the smaller of its two plans' savings.
 */
interface Prices {
  currency: 'USD' | 'EUR';
  plus: { monthly: string; annual: string };
  coach: { monthly: string; annual: string };
}

const EUROZONE: Prices = {
  currency: 'EUR',
  plus: { monthly: '9.99', annual: '104.99' },
  coach: { monthly: '25.99', annual: '254.99' },
};

export const LANDING_PRICES: Record<Locale, Prices> = {
  en: { currency: 'USD', plus: { monthly: '9.99', annual: '99.99' }, coach: { monthly: '24.99', annual: '249.99' } },
  bg: EUROZONE,
  fr: EUROZONE,
  de: { currency: 'EUR', plus: { monthly: '9.99', annual: '99.99' }, coach: { monthly: '24.99', annual: '254.99' } },
  es: { currency: 'EUR', plus: { monthly: '9.99', annual: '104.99' }, coach: { monthly: '25.99', annual: '259.99' } },
  el: { currency: 'EUR', plus: { monthly: '10.99', annual: '104.99' }, coach: { monthly: '26.99', annual: '264.99' } },
  hr: { currency: 'EUR', plus: { monthly: '10.99', annual: '104.99' }, coach: { monthly: '26.99', annual: '269.99' } },
  sk: { currency: 'EUR', plus: { monthly: '10.99', annual: '104.99' }, coach: { monthly: '25.99', annual: '264.99' } },
  ro: EUROZONE,
  uk: EUROZONE,
  sr: EUROZONE,
  cs: EUROZONE,
  hu: EUROZONE,
};
