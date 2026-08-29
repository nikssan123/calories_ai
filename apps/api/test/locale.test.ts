import { describe, expect, it } from 'vitest';
import type { NudgeStats, Profile, ReviewStats } from '@ct/shared';
import {
  LOCALES,
  LOCALE_ENGLISH_NAMES,
  LOCALE_NAMES,
  plural,
  localeFromAcceptLanguage,
  localeOf,
  matchLocale,
  formatDay,
  formatMonth,
} from '@ct/shared';
import { languageBrief, nudgeTaskPrompt, reviewTaskPrompt } from '../src/ai/prompt.ts';
import { emailMessages } from '../src/email/messages.ts';

/**
 * The claims LANGUAGES.md phase 1 makes, one test each.
 *
 * The wording of the brief is free to change and nothing here asserts it. What
 * is asserted is the part that is load-bearing: that a background generation
 * for a non-English reader is *told* what language to write in, that English
 * costs nothing, and that a value nobody recognises degrades to English instead
 * of throwing — because the whole feature is cosmetic and has to fail that way.
 */

const profile: Profile = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'nik@example.com',
  email_verified: true,
  units: 'metric',
  locale: 'en',
  display_name: 'Nik',
  sex: 'male',
  birth_date: '1990-01-01',
  height_cm: 180,
  target_weight_kg: 78,
  activity_level: 'moderate',
  goal: 'lose',
  timezone: 'Europe/Sofia',
  day_start_hour: 4,
  is_setup_complete: true,
  plan: 'free',
  diet: 'none',
  avoids: [],
  notify_weekly_review: true,
  notify_nudges: false,
  notify_milestones: false,
  notify_daily_recap: false,
};

const bulgarian: Profile = { ...profile, locale: 'bg' };

describe('localeOf', () => {
  it('resolves a supported locale', () => {
    expect(localeOf({ locale: 'bg' })).toBe('bg');
  });

  it('resolves null to English — nobody has been asked, not "they chose English"', () => {
    expect(localeOf({ locale: null })).toBe('en');
    expect(localeOf(null)).toBe('en');
    expect(localeOf(undefined)).toBe('en');
  });

  it('resolves a value this build does not know to English rather than throwing', () => {
    // A row written by a newer deploy that has since been rolled back. The app
    // must render, in English, not 500.
    expect(localeOf({ locale: 'xx' })).toBe('en');
    expect(localeOf({ locale: '' })).toBe('en');
  });
});

describe('matchLocale', () => {
  it('takes the primary subtag, ignoring a region we do not vary on', () => {
    expect(matchLocale('de-AT')).toBe('de');
    expect(matchLocale('es-MX')).toBe('es');
    expect(matchLocale('fr-CA')).toBe('fr');
    expect(matchLocale('bg-BG')).toBe('bg');
    expect(matchLocale('bg_BG')).toBe('bg');
    expect(matchLocale('BG')).toBe('bg');
    expect(matchLocale('en-GB')).toBe('en');
  });

  it('answers null for a language this app does not speak', () => {
    // Null rather than English: "could not tell" and "chose English" are
    // different answers, and signup treats them differently.
    expect(matchLocale('ja')).toBeNull();
    expect(matchLocale('')).toBeNull();
    expect(matchLocale(null)).toBeNull();
  });
});

describe('localeFromAcceptLanguage', () => {
  it('takes the first tag the app actually speaks', () => {
    expect(localeFromAcceptLanguage('ja-JP,ja;q=0.9,bg;q=0.8,en;q=0.7')).toBe('bg');
    expect(localeFromAcceptLanguage('de-DE,de;q=0.9,en;q=0.7')).toBe('de');
  });

  it('handles the ordinary browser header', () => {
    expect(localeFromAcceptLanguage('bg-BG,bg;q=0.9,en-US;q=0.8')).toBe('bg');
  });

  it('answers null when it speaks none of them', () => {
    expect(localeFromAcceptLanguage('ja-JP,ko;q=0.9')).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });

  it('does not fall over on a malformed header', () => {
    // Attacker-controlled input. It may return nothing; it may not throw.
    expect(() => localeFromAcceptLanguage(';;;,,,q=')).not.toThrow();
    expect(() => localeFromAcceptLanguage('*'.repeat(5000))).not.toThrow();
  });
});

describe('languageBrief', () => {
  it('says nothing when there is no language to name', () => {
    // Null covers two cases with the same right answer. English is one: it is
    // what the model does unprompted, and a line confirming it is tokens spent
    // on every turn. The other is a sample the detector could see but could not
    // name, where the stable prompt's standing rule — reply in the language
    // they wrote to you in — is the better instruction, because it is reading
    // the same sentence the model is.
    expect(languageBrief(null)).toBeNull();
  });

  it('names the language in English, because the prompt is in English', () => {
    const brief = languageBrief('Bulgarian');
    expect(brief).toContain('Bulgarian');
    expect(brief).not.toContain(LOCALE_NAMES.bg);
  });

  it('has something to say for every language the interface ships in', () => {
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      expect(languageBrief(LOCALE_ENGLISH_NAMES[locale])).toContain(LOCALE_ENGLISH_NAMES[locale]);
    }
  });

  it('speaks a language the interface does not ship in', () => {
    // The point of resolving this from what somebody writes rather than from
    // the locale column: Italian is not one of the five the app is drawn in,
    // and somebody writing Italian is still owed Italian back.
    expect(languageBrief('Italian')).toContain('Italian');
  });

  it('protects the tool arguments, which is the bug it exists to prevent', () => {
    // A model writing Bulgarian prose will reach for a Bulgarian enum value
    // unless told the arguments are an API. `log_food` does not take "закуска".
    expect(languageBrief('Bulgarian')).toContain('Tool arguments never change');
  });

  it('leaves food names alone', () => {
    expect(languageBrief('Bulgarian')?.toLowerCase()).toContain('food names stay');
  });
});

describe('the background generations', () => {
  const stats = {
    week_start: '2026-08-17',
    week_end: '2026-08-23',
    days_logged: 6,
  } as unknown as ReviewStats;

  it('tells the weekly review what language to write in', () => {
    // The one that matters most: a review is generated from a stats blob with
    // no user prose anywhere near it for the language rule to catch.
    expect(reviewTaskPrompt(stats, bulgarian, 'Bulgarian')).toContain('Bulgarian');
  });

  it('leaves an English review unchanged', () => {
    expect(reviewTaskPrompt(stats, profile, null)).not.toContain('Bulgarian');
  });

  it('writes the review in the language logged in, not the one the app is set to', () => {
    // The profile here reads English and the journal it summarises is
    // Bulgarian. The review belongs to the journal: it is posted into that
    // conversation and it is about that week's meals. Before the language was
    // resolved from what people write, this arrived every Monday in a language
    // the reader had not used all week.
    expect(reviewTaskPrompt(stats, profile, 'Bulgarian')).toContain('Bulgarian');
  });

  it('tells the nudge too', () => {
    const nudge = { kind: 'dormant', days_logged: 1 } as unknown as NudgeStats;
    expect(nudgeTaskPrompt(nudge, bulgarian, 'Bulgarian')).toContain('Bulgarian');
  });
});

describe('the name tables', () => {
  it('names every language in itself, for the picker', () => {
    expect(LOCALE_NAMES.bg).toBe('Български');
    expect(LOCALE_NAMES.de).toBe('Deutsch');
    expect(LOCALE_NAMES.fr).toBe('Français');
  });

  it('names every language in English, for the model', () => {
    expect(LOCALE_ENGLISH_NAMES.bg).toBe('Bulgarian');
    expect(LOCALE_ENGLISH_NAMES.de).toBe('German');
  });

  it('has an entry for every shipped locale, in both tables', () => {
    // The tables are `Record<Locale, string>` so the compiler already enforces
    // this. It is asserted anyway because the failure mode if it ever stopped
    // being enforced — a picker with a blank row — is silent.
    for (const locale of LOCALES) {
      expect(LOCALE_NAMES[locale]).toBeTruthy();
      expect(LOCALE_ENGLISH_NAMES[locale]).toBeTruthy();
    }
  });
});

describe('plural', () => {
  it('uses the singular for one, in the languages that do', () => {
    expect(plural(1, { one: 'day', other: 'days' }, 'en')).toBe('1 day');
    expect(plural(1, { one: 'Tag', other: 'Tage' }, 'de')).toBe('1 Tag');
    expect(plural(2, { one: 'day', other: 'days' }, 'en')).toBe('2 days');
  });

  it('puts zero in the singular for French and the plural for English', () => {
    // The reason this is `Intl.PluralRules` and not a two-argument helper.
    // French says "0 jour"; English says "0 days"; no shared shape expresses it.
    expect(plural(0, { one: 'jour', other: 'jours' }, 'fr')).toBe('0 jour');
    expect(plural(0, { one: 'day', other: 'days' }, 'en')).toBe('0 days');
  });

  it('falls back to `other` when a category has no form', () => {
    // `other` is the only category every language has, so a catalogue that
    // supplies just that one must still render rather than print undefined.
    expect(plural(1, { other: 'дни' }, 'bg')).toBe('1 дни');
  });

  it('formats the count for the locale too', () => {
    // A four-figure count carries the reader's separator, not the runtime's.
    expect(plural(1500, { one: 'day', other: 'days' }, 'en')).toBe('1,500 days');
    expect(plural(1500, { one: 'Tag', other: 'Tage' }, 'de')).toBe('1.500 Tage');
  });
});

describe('date formatting', () => {
  it('reads a stored day in the reader’s language', () => {
    expect(formatDay('2026-08-24', 'en')).toContain('August');
    expect(formatDay('2026-08-24', 'bg')).toContain('август');
    expect(formatDay('2026-08-24', 'de')).toContain('August');
    expect(formatDay('2026-08-24', 'fr')).toContain('août');
    expect(formatDay('2026-08-24', 'es')).toContain('agosto');
  });

  it('builds the day in UTC, so it is not the day before west of Greenwich', () => {
    // A day here is a calendar date, not an instant. Constructing it in the
    // viewer's zone would render the 23rd for anybody behind UTC.
    expect(formatDay('2026-08-24', 'en', { day: 'numeric', month: 'numeric' })).toContain('24');
  });

  it('returns the input unchanged rather than "Invalid Date"', () => {
    expect(formatDay('not-a-date', 'en')).toBe('not-a-date');
    expect(formatMonth('', 'en')).toBe('');
  });
});

describe('the email catalogues', () => {
  it('has a complete set for every shipped locale', () => {
    // The compiler enforces this via `EmailMessages`, so what this actually
    // guards is the wiring: a catalogue written but never added to the record
    // would fall through to English silently, which reads as "the translation
    // did not work" rather than as an error.
    const english = emailMessages('en');
    for (const locale of LOCALES) {
      const m = emailMessages(locale);
      expect(Object.keys(m)).toEqual(Object.keys(english));
      if (locale !== 'en') expect(m['review.heading']).not.toBe(english['review.heading']);
    }
  });

  it('agrees the count with the noun, per language', () => {
    expect(emailMessages('en')['review.times'](1)).toBe('1 time');
    expect(emailMessages('en')['review.times'](3)).toBe('3 times');
    // German's "Mal" does not inflect, which is a real answer and not an
    // oversight — both forms are supplied so nothing falls back by accident.
    expect(emailMessages('de')['review.times'](3)).toBe('3 Mal');
    expect(emailMessages('es')['review.times'](1)).toBe('1 vez');
    expect(emailMessages('es')['review.times'](3)).toBe('3 veces');
  });

  it('gives the week strip seven day names in every language', () => {
    for (const locale of LOCALES) {
      expect(emailMessages(locale)['review.weekdays']).toHaveLength(7);
    }
  });
});
