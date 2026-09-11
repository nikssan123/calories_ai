import { matchLocale, type Locale } from './locale.ts';

/**
 * What the language picker needs beyond `LOCALE_NAMES`: an order, a second
 * line under each option, and which options to put first.
 *
 * Apart from `locale.ts` because none of it is about drawing a screen in a
 * language — it is about choosing one — and the table below is most of a
 * screenful on its own.
 */

/**
 * The languages in the order a picker lists them: by what each is called in
 * itself.
 *
 * By `LOCALE_NAMES` rather than by code or by English name, because that is
 * the column a reader scans: a list sorted as "Croatian, Czech, Greek" and
 * printed as "Hrvatski, Čeština, Ελληνικά" looks unsorted. Root collation, so
 * Latin comes first, then Greek, then Cyrillic, and "Čeština" files under C.
 *
 * Written out rather than sorted at load, because a collator is its runtime's
 * opinion and Hermes's is not V8's. `locale.test.ts` holds this to
 * `Intl.Collator('und')` under Node, so the two cannot drift.
 */
export const LOCALES_BY_NAME: readonly Locale[] = [
  'cs',
  'de',
  'en',
  'es',
  'fr',
  'hr',
  'hu',
  'ro',
  'sk',
  'el',
  'bg',
  'sr',
  'uk',
];

/**
 * What each language is called in each of the others — the second line under
 * a picker option.
 *
 * `LOCALE_NAMES` is the line somebody is looking for. This is the one that
 * helps when the screen is in a language they can read and the option is not:
 * "Ελληνικά", and under it "Greek" in an English interface or "Гръцки" in a
 * Bulgarian one. The option for the interface's own language leaves it off,
 * since it would say the same word twice.
 *
 * CLDR's names, capitalised for a list — CLDR writes most of them lower-case,
 * the way they sit mid-sentence. A table rather than `Intl.DisplayNames`
 * because Hermes has no `DisplayNames`, and the polyfill's data is every
 * language CLDR can name, per language, to print 169 strings. `locale.test.ts`
 * checks every cell against `DisplayNames` under Node, so a new language fails
 * there until its row and its column are filled in.
 */
export const LOCALE_NAMES_IN: Record<Locale, Record<Locale, string>> = {
  en: {
    en: 'English',
    bg: 'Bulgarian',
    de: 'German',
    es: 'Spanish',
    fr: 'French',
    ro: 'Romanian',
    uk: 'Ukrainian',
    sr: 'Serbian',
    hr: 'Croatian',
    cs: 'Czech',
    hu: 'Hungarian',
    el: 'Greek',
    sk: 'Slovak',
  },
  bg: {
    en: 'Английски',
    bg: 'Български',
    de: 'Немски',
    es: 'Испански',
    fr: 'Френски',
    ro: 'Румънски',
    uk: 'Украински',
    sr: 'Сръбски',
    hr: 'Хърватски',
    cs: 'Чешки',
    hu: 'Унгарски',
    el: 'Гръцки',
    sk: 'Словашки',
  },
  de: {
    en: 'Englisch',
    bg: 'Bulgarisch',
    de: 'Deutsch',
    es: 'Spanisch',
    fr: 'Französisch',
    ro: 'Rumänisch',
    uk: 'Ukrainisch',
    sr: 'Serbisch',
    hr: 'Kroatisch',
    cs: 'Tschechisch',
    hu: 'Ungarisch',
    el: 'Griechisch',
    sk: 'Slowakisch',
  },
  es: {
    en: 'Inglés',
    bg: 'Búlgaro',
    de: 'Alemán',
    es: 'Español',
    fr: 'Francés',
    ro: 'Rumano',
    uk: 'Ucraniano',
    sr: 'Serbio',
    hr: 'Croata',
    cs: 'Checo',
    hu: 'Húngaro',
    el: 'Griego',
    sk: 'Eslovaco',
  },
  fr: {
    en: 'Anglais',
    bg: 'Bulgare',
    de: 'Allemand',
    es: 'Espagnol',
    fr: 'Français',
    ro: 'Roumain',
    uk: 'Ukrainien',
    sr: 'Serbe',
    hr: 'Croate',
    cs: 'Tchèque',
    hu: 'Hongrois',
    el: 'Grec',
    sk: 'Slovaque',
  },
  ro: {
    en: 'Engleză',
    bg: 'Bulgară',
    de: 'Germană',
    es: 'Spaniolă',
    fr: 'Franceză',
    ro: 'Română',
    uk: 'Ucraineană',
    sr: 'Sârbă',
    hr: 'Croată',
    cs: 'Cehă',
    hu: 'Maghiară',
    el: 'Greacă',
    sk: 'Slovacă',
  },
  uk: {
    en: 'Англійська',
    bg: 'Болгарська',
    de: 'Німецька',
    es: 'Іспанська',
    fr: 'Французька',
    ro: 'Румунська',
    uk: 'Українська',
    sr: 'Сербська',
    hr: 'Хорватська',
    cs: 'Чеська',
    hu: 'Угорська',
    el: 'Грецька',
    sk: 'Словацька',
  },
  sr: {
    en: 'Енглески',
    bg: 'Бугарски',
    de: 'Немачки',
    es: 'Шпански',
    fr: 'Француски',
    ro: 'Румунски',
    uk: 'Украјински',
    sr: 'Српски',
    hr: 'Хрватски',
    cs: 'Чешки',
    hu: 'Мађарски',
    el: 'Грчки',
    sk: 'Словачки',
  },
  hr: {
    en: 'Engleski',
    bg: 'Bugarski',
    de: 'Njemački',
    es: 'Španjolski',
    fr: 'Francuski',
    ro: 'Rumunjski',
    uk: 'Ukrajinski',
    sr: 'Srpski',
    hr: 'Hrvatski',
    cs: 'Češki',
    hu: 'Mađarski',
    el: 'Grčki',
    sk: 'Slovački',
  },
  cs: {
    en: 'Angličtina',
    bg: 'Bulharština',
    de: 'Němčina',
    es: 'Španělština',
    fr: 'Francouzština',
    ro: 'Rumunština',
    uk: 'Ukrajinština',
    sr: 'Srbština',
    hr: 'Chorvatština',
    cs: 'Čeština',
    hu: 'Maďarština',
    el: 'Řečtina',
    sk: 'Slovenština',
  },
  hu: {
    en: 'Angol',
    bg: 'Bolgár',
    de: 'Német',
    es: 'Spanyol',
    fr: 'Francia',
    ro: 'Román',
    uk: 'Ukrán',
    sr: 'Szerb',
    hr: 'Horvát',
    cs: 'Cseh',
    hu: 'Magyar',
    el: 'Görög',
    sk: 'Szlovák',
  },
  el: {
    en: 'Αγγλικά',
    bg: 'Βουλγαρικά',
    de: 'Γερμανικά',
    es: 'Ισπανικά',
    fr: 'Γαλλικά',
    ro: 'Ρουμανικά',
    uk: 'Ουκρανικά',
    sr: 'Σερβικά',
    hr: 'Κροατικά',
    cs: 'Τσεχικά',
    hu: 'Ουγγρικά',
    el: 'Ελληνικά',
    sk: 'Σλοβακικά',
  },
  sk: {
    en: 'Angličtina',
    bg: 'Bulharčina',
    de: 'Nemčina',
    es: 'Španielčina',
    fr: 'Francúzština',
    ro: 'Rumunčina',
    uk: 'Ukrajinčina',
    sr: 'Srbčina',
    hr: 'Chorvátčina',
    cs: 'Čeština',
    hu: 'Maďarčina',
    el: 'Gréčtina',
    sk: 'Slovenčina',
  },
};

/**
 * The languages to offer first: the one in use, then whichever of the device's
 * own this app speaks, in the device's order.
 *
 * In use first, because on Settings it is the row with the tick. The device's
 * languages next, because they are the likeliest way back — somebody who
 * switched to Română to try it should find their phone's English without
 * scanning for it. On the sign-in screen the two are usually the same
 * language, and this is one row.
 *
 * Tags go through `matchLocale`, so `en-US` and `en-GB` are one suggestion and
 * a language the app does not speak is simply not one.
 */
export function suggestedLocales(
  current: Locale,
  deviceTags: readonly (string | null | undefined)[],
): Locale[] {
  const suggested = new Set<Locale>([current]);
  for (const tag of deviceTags) {
    const match = matchLocale(tag);
    if (match) suggested.add(match);
  }
  return [...suggested];
}
