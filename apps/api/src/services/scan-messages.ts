import type { Locale, PluralForms } from '@ct/shared';

/**
 * The words around a scan that no model wrote.
 *
 * A packet scanned into an empty composer is logged without a turn, so the
 * server writes the journal line itself — and until 2026-09-25 it wrote it in
 * English whatever the account read: a Bulgarian guest scanned a wafer and got
 * "Scanned — … 1 serving (28 g)." in the middle of a Bulgarian journal.
 *
 * The serving noun is the apps' own `barcode.servings` word in each language,
 * so the line agrees with the picker it was chosen on. Its forms are keyed by
 * `Intl.PluralRules` category, the same as the email catalogue — see `plural`
 * in `shared/locale.ts`.
 */
export interface ScanMessages {
  /** The whole journal line; `what` is the product, and its portion if one is said. */
  scanned: (what: string) => string;
  servings: PluralForms;
}

const CATALOGUES: Record<Locale, ScanMessages> = {
  en: {
    scanned: (what) => `Scanned — ${what}.`,
    servings: { one: 'serving', other: 'servings' },
  },
  bg: {
    scanned: (what) => `Сканирано — ${what}.`,
    servings: { one: 'порция', other: 'порции' },
  },
  de: {
    scanned: (what) => `Gescannt — ${what}.`,
    servings: { one: 'Portion', other: 'Portionen' },
  },
  es: {
    scanned: (what) => `Escaneado — ${what}.`,
    servings: { one: 'ración', other: 'raciones' },
  },
  fr: {
    scanned: (what) => `Scanné — ${what}.`,
    servings: { one: 'portion', other: 'portions' },
  },
  ro: {
    scanned: (what) => `Scanat — ${what}.`,
    servings: { one: 'porție', few: 'porții', other: 'de porții' },
  },
  uk: {
    scanned: (what) => `Відскановано — ${what}.`,
    servings: { one: 'порція', few: 'порції', many: 'порцій', other: 'порції' },
  },
  sr: {
    scanned: (what) => `Скенирано — ${what}.`,
    servings: { one: 'порција', few: 'порције', other: 'порција' },
  },
  hr: {
    scanned: (what) => `Skenirano — ${what}.`,
    servings: { one: 'porcija', few: 'porcije', other: 'porcija' },
  },
  cs: {
    scanned: (what) => `Naskenováno — ${what}.`,
    servings: { one: 'porce', few: 'porce', many: 'porce', other: 'porcí' },
  },
  hu: {
    scanned: (what) => `Beolvasva — ${what}.`,
    servings: { one: 'adag', other: 'adag' },
  },
  el: {
    scanned: (what) => `Σαρώθηκε — ${what}.`,
    servings: { one: 'μερίδα', other: 'μερίδες' },
  },
  sk: {
    scanned: (what) => `Naskenované — ${what}.`,
    servings: { one: 'porcia', few: 'porcie', many: 'porcie', other: 'porcií' },
  },
};

export function scanMessages(locale: Locale): ScanMessages {
  return CATALOGUES[locale];
}
