/**
 * Every catalogue, evaluated.
 *
 * `pnpm -r typecheck` proves each catalogue has every key with the right
 * signature. It does not prove the values *run*: a message that takes two
 * arguments and only interpolates one still typechecks, and so does one whose
 * template references a parameter that was renamed. This calls every function
 * in every language and fails on anything that throws or prints `undefined`.
 */
import { en } from '../messages/en.ts';
import { bg } from '../messages/bg.ts';
import { de } from '../messages/de.ts';
import { es } from '../messages/es.ts';
import { fr } from '../messages/fr.ts';

type Any = Record<string, unknown>;
const catalogues: Record<string, Any> = { en, bg, de, es, fr } as never;

/**
 * Keys whose first argument is a count.
 *
 * `meter.*` is on the list and is the one that looks wrong: it takes a count
 * and deliberately renders only the agreeing noun — that is what `pluralWord`
 * is for, because the paywall's sentences put a word between the number and
 * the noun. Passing it a marker string instead would make the dropped-argument
 * check fire on every meter in every language.
 */
const COUNTED =
  /count|things|steps|nights|days|people|portions|minutes|sets|runs|exerciseCount|sessionsCount|^meter\./i;

let checked = 0;
const problems: string[] = [];

for (const [lang, catalogue] of Object.entries(catalogues)) {
  for (const key of Object.keys(en)) {
    const value = catalogue[key];
    if (value === undefined) {
      problems.push(`${lang}: ${key} missing`);
      continue;
    }
    if (typeof value === 'function') {
      const fn = value as (...args: unknown[]) => string;
      // Counted messages get a number; everything else gets a marker string,
      // so a dropped argument shows up as a gap rather than as plausible prose.
      const args = Array.from({ length: fn.length }, (_, i) =>
        i === 0 && COUNTED.test(key) ? 2 : `«${i}»`,
      );
      try {
        const out = fn(...args);
        if (typeof out !== 'string') problems.push(`${lang}: ${key} returned ${typeof out}`);
        else if (out.includes('undefined')) problems.push(`${lang}: ${key} → ${out}`);
        else {
          const dropped = args.filter(
            (a) => typeof a === 'string' && !out.includes(a as string),
          );
          if (dropped.length) problems.push(`${lang}: ${key} dropped ${dropped.join(', ')} → ${out}`);
        }
      } catch (e) {
        problems.push(`${lang}: ${key} threw ${(e as Error).message}`);
      }
    } else if (typeof value !== 'string') {
      problems.push(`${lang}: ${key} is ${typeof value}`);
    }
    checked += 1;
  }
}

console.log(`checked ${checked} entries across ${Object.keys(catalogues).length} languages`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('every message renders');
