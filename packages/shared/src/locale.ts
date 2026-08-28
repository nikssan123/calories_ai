import { z } from 'zod';

/**
 * Which language the app is drawn in.
 *
 * The rule this file exists to hold: **locale is a rendering preference,
 * exactly like `units`.** It changes what is painted on a screen and written
 * into an email. It changes nothing that is stored, nothing in a tool argument,
 * and nothing about a food name — someone who logs "кюфте" gets an entry called
 * "кюфте" whatever this says, because that is what they will search for later.
 *
 * See LANGUAGES.md for the whole argument, including the list of things that
 * deliberately do not translate.
 */

export const LOCALES = ['en', 'bg', 'de', 'es', 'fr'] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;

/**
 * What each language is called in itself.
 *
 * A picker that says "Bulgarian" to a Bulgarian speaker is a picker written for
 * somebody else — by the time they can read that word they did not need the
 * picker. This is the only string in the app that is deliberately never
 * translated: every entry is already in its own language.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  bg: 'Български',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
};

/**
 * The name to give the model, in English, because the prompt is in English.
 * Kept apart from `LOCALE_NAMES` so that neither can be used for the other's
 * job: "Български" in a system prompt is a worse instruction than "Bulgarian".
 */
export const LOCALE_ENGLISH_NAMES: Record<Locale, string> = {
  en: 'English',
  bg: 'Bulgarian',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
};

/**
 * Null on a profile means "nobody has asked yet".
 *
 * That is not the same as English, and the difference is what lets the client
 * fall back to the device's language for a first session and the journal learn
 * it from how somebody writes. Resolved here rather than at each call site so
 * that null is a special case in exactly one place.
 *
 * An unrecognised value resolves to English rather than throwing. A row written
 * by a newer deploy that has since been rolled back should render in English,
 * not 500 — the whole feature is cosmetic and must fail that way.
 */
export function localeOf(profile: { locale?: string | null } | null | undefined): Locale {
  const parsed = Locale.safeParse(profile?.locale);
  return parsed.success ? parsed.data : 'en';
}

/**
 * The best supported match for a language tag off a device or a browser.
 *
 * Takes the primary subtag only: `bg-BG`, `bg`, and `BG` are one language as
 * far as this app is concerned, and a region we do not vary on is noise. Falls
 * back to null rather than to English, because "we could not tell" and "they
 * chose English" are answers a caller may want to treat differently — signup
 * stores the first as null and lets the journal work it out.
 */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  const parsed = Locale.safeParse(primary);
  return parsed.success ? parsed.data : null;
}

/**
 * The first supported language in an `Accept-Language` header.
 *
 * Deliberately naive: it walks the tags in the order the browser sent them and
 * takes the first one this app speaks, ignoring q-values. Getting this exactly
 * right buys nothing — somebody whose browser says Bulgarian and who wanted
 * English changes it on the setup screen thirty seconds later — and the header
 * is attacker-controlled, so the simple parse is also the safe one.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0];
    const match = matchLocale(tag);
    if (match) return match;
  }
  return null;
}

/**
 * The BCP-47 tag to hand `Intl`, which is not always the tag we store.
 *
 * `'en'` is the odd one. This app's English is British — "Fibre", "Metric",
 * "colour" — and CLDR's bare `en` is American, so asking `Intl` for `en` gets
 * "Wednesday, September 23" under a heading that says "Fibre", and
 * `Intl.ListFormat` puts a serial comma in "chicken, rice, and peppers" where
 * the hand-rolled join it replaced did not.
 *
 * Kept apart from the `Locale` enum on purpose: `users.locale` is a column, and
 * widening it to region-qualified tags would mean a migration and a `CHECK` for
 * a distinction only the formatter cares about. Every `Intl` call in this file
 * goes through here; nothing else needs to know.
 *
 * The other four are their own tags already — `bg`, `de`, `fr` have no split
 * this app cares about, and `es` resolves to the Peninsular forms the Spanish
 * catalogue is written in.
 */
export function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-GB' : locale;
}

// ---- Dates -----------------------------------------------------------------
//
// Eleven display sites used to hardcode 'en-GB' and spell the same six lines
// out. They are one parameter now. The three sites in `api/src/time.ts` that
// also name a locale are NOT display — they read `formatToParts` to assemble a
// `YYYY-MM-DD` for the day-boundary logic, and a locale flowing into those
// would change which day a meal counts toward. Leave them alone.

/**
 * Turns a stored `YYYY-MM-DD` into a readable day.
 *
 * Built through `Date.UTC` and read back in UTC on purpose. A day in this app
 * is a calendar date and not an instant, so constructing it in the viewer's
 * zone would render the day before for anybody west of Greenwich.
 */
export function formatDay(
  date: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(intlLocale(locale), {
    ...options,
    timeZone: 'UTC',
  });
}

/** The month a `YYYY-MM` or `YYYY-MM-DD` falls in, for a history heading. */
export function formatMonth(date: string, locale: Locale, year = false): string {
  const [y, m] = date.split('-').map(Number);
  if (!y || !m) return date;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(intlLocale(locale), {
    month: 'long',
    ...(year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** Just the month's name, for a plan header that already says the year. */
export function monthName(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', timeZone: 'UTC' }).format(
    date,
  );
}

/**
 * A weekday's name, from the 0–6 the schedule stores.
 *
 * This replaced `WEEKDAY_NAMES`, a seven-string English array that both
 * Workouts screens read — and, worse, that both of them shortened with
 * `.slice(0, 3)`. Three letters is English's abbreviation and nobody else's:
 * German wants "Mo." with the stop, French "lun.", and Bulgarian's "понеделник"
 * shortens to "пн" rather than to "пон". `Intl` knows all of that and an array
 * cannot. `narrow` covers the third case — the single letters down the weekly
 * review's day strip, which were `['S','M','T','W','T','F','S']` and are "П" in
 * three different places in Bulgarian.
 *
 * The anchor is a Sunday, so `weekday` indexes off it directly and the caller
 * keeps using the same 0–6 the database stores. Read back in UTC for the same
 * reason `formatDay` does: a weekday is a name here, not an instant.
 */
export function weekdayName(
  weekday: number,
  locale: Locale,
  style: 'long' | 'short' | 'narrow' = 'long',
): string {
  // 2024-01-07 was a Sunday.
  const date = new Date(Date.UTC(2024, 0, 7 + (((weekday % 7) + 7) % 7)));
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: style, timeZone: 'UTC' }).format(
    date,
  );
}

// ---- Numbers ---------------------------------------------------------------

/**
 * A number with its thousands separator, in this language's convention.
 *
 * `1,240` in English, `1 240` in Bulgarian. Passing the locale explicitly
 * rather than letting `toLocaleString()` follow the runtime matters on the
 * server, where the runtime's idea of a locale is the container's and has
 * nothing to do with who is reading.
 */
export function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(intlLocale(locale));
}

// ---- Plurals ---------------------------------------------------------------

/**
 * The plural forms a message needs, keyed by CLDR category.
 *
 * `other` is required and the rest are optional, because `other` is the only
 * category every language has — and it is the one every lookup falls back to.
 * A catalogue that supplies only `other` is therefore always correct-ish and
 * never crashes; supplying `one` as well is what makes English and German read
 * properly, and the remaining categories exist for the languages that use them.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/**
 * A count and its noun, agreeing.
 *
 * This replaced a two-argument `plural(count, 'day', 'days')` helper that lived
 * in the email templates. Two forms is not a simplification of the problem, it
 * is English's answer to it: Bulgarian happens to agree, German agrees, and
 * French does not — `Intl.PluralRules('fr').select(0)` is `'one'`, so a French
 * review says "0 jour" and not "0 jours". Polish and Russian have four and
 * three categories respectively, so the old shape could not have been patched
 * into correctness for them at all.
 *
 * Delegating the category choice to `Intl.PluralRules` means a new language
 * needs no code here — only the forms, in its own catalogue, next to the rest
 * of its words.
 *
 * The number is formatted for the locale too, so a four-figure count carries
 * the right separator rather than the runtime's.
 */
export function plural(count: number, forms: PluralForms, locale: Locale): string {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(count);
  return `${formatNumber(count, locale)} ${forms[rule] ?? forms.other}`;
}

/**
 * The agreeing noun on its own, without the number in front of it.
 *
 * `plural()` returns "10 messages", which is the right answer wherever the
 * count and the noun sit together. The paywall's sentences separate them —
 * "That's your 1 free photo scan" puts a word between — so it needs the category
 * without the formatting. Same rules, same forms, one less thing rendered.
 */
export function pluralWord(count: number, forms: PluralForms, locale: Locale): string {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(count);
  return forms[rule] ?? forms.other;
}

/** `pluralWord` with the locale already bound. See `pluralFor`. */
export const pluralWordFor =
  (locale: Locale) =>
  (count: number, forms: PluralForms): string =>
    pluralWord(count, forms, locale);

/**
 * `plural` with the locale already bound.
 *
 * Each catalogue is a file about one language, so repeating that language on
 * every line of it is noise that can also be got wrong — a Spanish entry
 * carrying `'en'` would silently pick English's categories. Binding it once at
 * the top of the file makes that mistake unavailable.
 */
export const pluralFor =
  (locale: Locale) =>
  (count: number, forms: PluralForms): string =>
    plural(count, forms, locale);
