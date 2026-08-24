/**
 * Day-boundary handling that only the server needs.
 *
 * The boundary arithmetic itself moved to `@ct/shared/day` when the phone
 * learned to add up a day it has not been able to send yet — see OFFLINE.md.
 * It is re-exported from here so the twenty-odd modules that import it go on
 * importing it from where it has always been.
 *
 * What stays is the part with no client: resolving a *model-supplied* time hint
 * ("yesterday 8pm", a shortened ISO string) to an instant. Nothing on a phone
 * parses English into a timestamp.
 */

import { formatInTimeZone, localPartsFor, type DayContext } from '@ct/shared';

export {
  addDays,
  dateRange,
  inferMeal,
  localDateFor,
  localPartsFor,
  type DayContext,
} from '@ct/shared';

/**
 * ISO-shaped hints, resolved against the *user's* zone rather than the server's.
 *
 * `new Date()` gets both spellings wrong for our purposes: a bare `2026-08-20`
 * is read as UTC midnight, and a zoneless `2026-08-20T08:00` as whatever the
 * container's TZ happens to be. With a 04:00 day start, UTC midnight on the
 * 20th resolves to the *19th* — so a model that shortened its own timestamp
 * silently backdated the entry by a day.
 *
 * A hint that carries an explicit offset is left alone: the model has already
 * committed to an instant and it is not ours to reinterpret.
 */
function fromIsoHint(hint: string, timeZone: string): Date | null {
  const match = hint
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, offset] = match;
  if (offset) {
    const explicit = new Date(hint.trim());
    return Number.isNaN(explicit.getTime()) ? null : explicit;
  }

  // A bare date names a day, not a moment. Noon keeps it inside that day for
  // every day_start_hour we allow, and on both sides of a DST change.
  const at = instantFromLocalParts(
    Number(year),
    Number(month),
    Number(day),
    hour === undefined ? 12 : Number(hour),
    minute === undefined ? 0 : Number(minute),
    timeZone,
  );

  // A date-shaped string that is not a real date ("9999-99-99") rolls over into
  // some other date instead of failing. If it does not read back as the date we
  // were asked for, it was nonsense — let the language parser have it.
  if (Number.isNaN(at.getTime())) return null;
  return formatInTimeZone(at, timeZone) === `${year}-${month}-${day}` ? at : null;
}

/** The instant at which `timeZone` reads these wall-clock parts. */
function instantFromLocalParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // The offset to apply depends on the instant we are looking for, so measure
  // it at a first guess and correct. The second pass settles the DST edges,
  // where the guess lands on the far side of a transition.
  const first = new Date(wall - zoneOffsetMs(new Date(wall), timeZone));
  return new Date(wall - zoneOffsetMs(first, timeZone));
}

/**
 * How far ahead of UTC `timeZone` runs at `instant`, in milliseconds.
 *
 * **The `en-GB` below is not a display locale and must not become one.**
 *
 * Every other `en-GB` in this repo was replaced by `formatDay(date, locale)`
 * when the app learned to speak other languages — see LANGUAGES.md phase 5.
 * These are different: `formatToParts` is being used to pull the *numbers* out
 * of an instant so `localPartsFor` can assemble a `YYYY-MM-DD`, and the tag is
 * chosen for its stable numeric output, not because anybody reads it. A user's
 * locale flowing in here would change which day a meal counts toward — in a
 * calendar that does not number days the way this arithmetic assumes, it would
 * corrupt the day boundary silently and for everyone in that language.
 *
 * If this ever needs to change, it changes toward *more* determinism — an
 * ISO-style tag like `en-CA`, or explicit `Intl` options — never toward the
 * reader.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  if (Number.isNaN(instant.getTime())) return 0;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // en-GB spells midnight "24" in some ICU versions.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Resolves a model-supplied time hint ("this morning", "yesterday 8pm", an ISO
 * string, or nothing) to an instant. Deliberately forgiving: a wrong hour is
 * much less costly than refusing to log the meal.
 */
export function resolveWhen(hint: string | undefined, now: Date, ctx: DayContext): Date {
  if (!hint) return now;

  const iso = fromIsoHint(hint, ctx.timezone);
  if (iso) return iso;

  const text = hint.toLowerCase().trim();
  const dayOffset = text.includes('yesterday') ? -1 : 0;
  const hour = namedHour(text);

  const base = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  if (hour === null) return base;

  // Set the wall-clock hour in the user's timezone by measuring the current
  // offset between UTC and local time, then shifting.
  const parts = localPartsFor(base, ctx.timezone);
  const currentHour = Number(parts.time.slice(0, 2));
  return new Date(base.getTime() + (hour - currentHour) * 60 * 60 * 1000);
}

function namedHour(text: string): number | null {
  const explicit = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (explicit) {
    let h = Number(explicit[1]);
    const meridiem = explicit[3];
    if (meridiem === 'pm' && h !== 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    return h;
  }
  // Each alternation is grouped so the word boundaries apply to every branch.
  // Without the group, `\blunch|midday|noon\b` anchors only the first and last
  // alternative — and "afternoon" ends in "noon", so it read as lunchtime.
  if (/\b(?:breakfast|this morning|morning)\b/.test(text)) return 8;
  if (/\b(?:lunch|midday|noon)\b/.test(text)) return 13;
  if (/\bafternoon\b/.test(text)) return 16;
  if (/\b(?:dinner|tonight|this evening|evening)\b/.test(text)) return 19;
  if (/\b(?:late night|midnight)\b/.test(text)) return 23;
  return null;
}
