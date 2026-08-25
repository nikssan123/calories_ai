import { intlLocale, type Locale } from './locale';

/**
 * Turning data into the words a sentence needs.
 *
 * Shared rather than kept beside a caller because both halves of Cook, both
 * recipe screens and both clients say these same sentences about the same
 * pantry — and a second copy would be the kind that drifts a comma at a time.
 *
 * Both of these take a locale, and neither of them takes a catalogue. That is
 * the point: `Intl.ListFormat` and `Intl.RelativeTimeFormat` already know every
 * language's answer to "how do you join three things" and "how do you say three
 * hours from now", so a new language costs nothing here — the same deal
 * `Intl.PluralRules` gets in `locale.ts`. A catalogue entry per phrase per
 * language would be words we have to write and can get wrong, for phrases the
 * platform is already correct about.
 */

/**
 * "chicken, garlic and spinach" — a sentence, not a comma-separated list.
 *
 * `Intl.ListFormat` does the conjunction and the serial comma per language:
 * English's "and", Bulgarian's "и", Spanish's "y" — including the "e" that
 * Spanish switches to before a word starting in `i`, which a hand-rolled join
 * gets wrong and nobody notices until a Spanish speaker reads it.
 *
 * Lowercased first because these are ingredients mid-sentence, not a heading.
 */
export function listWords(items: string[], locale: Locale): string {
  const lower = items.map((i) => i.toLowerCase());
  return new Intl.ListFormat(intlLocale(locale), { style: 'long', type: 'conjunction' }).format(
    lower,
  );
}

/**
 * "in about 3 hours" — how long until a rolling window lets go.
 *
 * Deliberately vague at the top end and precise at the bottom. Somebody told
 * "in 2 hours 47 minutes" reads it as a promise and comes back to check; the
 * useful information is only ever whether this is worth waiting for or worth
 * coming back tomorrow for.
 *
 * The vagueness now lives in the *unit* rather than in the adjective. This used
 * to return English phrases — "in a moment", "in about an hour", "in a few
 * weeks", "in a while" — which is where the hedging was carried, and there is
 * no way to translate that shape without a catalogue entry per bucket per
 * language. Rounding to the coarsest unit that still answers the question says
 * the same thing: "in 3 weeks" is no more of a promise than "in a few weeks"
 * was, and `numeric: 'auto'` still gives "tomorrow" rather than "in 1 day" in
 * every language that has a word for it.
 */
export function untilWords(iso: string, locale: Locale, now: Date = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return rtf.format(1, 'minute');
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return rtf.format(Math.max(1, minutes), 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(hours, 'hour');
  /*
   * Past a day the vagueness has to keep scaling, and once it did not.
   *
   * This used to end at 'tomorrow', which was true for every caller it had: the
   * recipe budget is a rolling twenty-four hours and can never point further
   * out than that. The monthly meters can — a spent journal allowance comes
   * back when the oldest turn ages out of a *thirty*-day window — and 'tomorrow'
   * for something four weeks away is not vague, it is wrong, and it is wrong in
   * the direction that brings somebody back to find nothing.
   */
  const days = Math.round(hours / 24);
  if (days === 1) return rtf.format(1, 'day');
  if (days < 14) return rtf.format(days, 'day');
  if (days < 45) return rtf.format(Math.round(days / 7), 'week');
  return rtf.format(Math.max(2, Math.round(days / 30)), 'month');
}
