/**
 * Every `Intl` call the app makes, run on a runtime shaped like Hermes.
 *
 * `catalogue-smoke.mts` proves the messages render; it proves it under Node,
 * which has full ICU and therefore cannot see the thing that actually broke.
 * Hermes binds three `Intl` constructors — `Collator`, `DateTimeFormat`,
 * `NumberFormat` — and leaves `PluralRules`, `ListFormat` and
 * `RelativeTimeFormat` undefined. Every counted noun in every catalogue goes
 * through `PluralRules`, so Progress and You threw `TypeError` on device while
 * CI stayed green.
 *
 * This deletes the three before loading anything, imports the polyfill the app
 * imports, and then calls the helpers in all five languages. It fails if a
 * constructor is still missing afterwards, if a call throws, or if one comes
 * back empty — which is what a missing locale-data import looks like.
 */
const MISSING = ['PluralRules', 'ListFormat', 'RelativeTimeFormat'] as const;

const intl = Intl as unknown as Record<string, unknown>;
for (const name of MISSING) delete intl[name];

await import('../lib/intl-polyfill.ts');

const problems: string[] = [];

for (const name of MISSING) {
  if (typeof intl[name] !== 'function') problems.push(`Intl.${name} still missing after the polyfill`);
}

const { LOCALES, plural, pluralWord, formatDay, weekdayName, formatNumber } = await import('@ct/shared');
const { listWords, untilWords } = await import('@ct/shared/words');

/** A call is wrong if it throws, and equally wrong if it renders nothing. */
function check(label: string, run: () => string): void {
  let value: string;
  try {
    value = run();
  } catch (error) {
    problems.push(`${label}: threw ${(error as Error).message}`);
    return;
  }
  if (!value.trim()) problems.push(`${label}: rendered empty`);
}

const soon = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();

for (const locale of LOCALES) {
  // Zero, one and many: French's `one` covers 0 and English's does not, which
  // is the disagreement the categories exist to carry.
  for (const count of [0, 1, 2, 5, 1240]) {
    check(`plural(${count}, ${locale})`, () => plural(count, { one: 'day', other: 'days' }, locale));
    check(`pluralWord(${count}, ${locale})`, () =>
      pluralWord(count, { one: 'scan', other: 'scans' }, locale));
  }
  check(`listWords(${locale})`, () => listWords(['chicken', 'rice', 'peppers'], locale));
  check(`untilWords(${locale})`, () => untilWords(soon, locale));
  check(`formatDay(${locale})`, () => formatDay('2026-09-23', locale));
  check(`formatNumber(${locale})`, () => formatNumber(1240, locale));
  for (const style of ['long', 'short', 'narrow'] as const) {
    for (let weekday = 0; weekday < 7; weekday++) {
      check(`weekdayName(${weekday}, ${locale}, ${style})`, () =>
        weekdayName(weekday, locale, style),
      );
    }
  }
}

if (problems.length > 0) {
  console.error(problems.map((line) => `  ${line}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Intl holds up without ${MISSING.join(', ')} across ${LOCALES.length} languages`);
}
