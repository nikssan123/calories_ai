/**
 * Day-boundary handling. "Today" is not a UTC day and not even a calendar day in
 * the user's timezone — it runs from `day_start_hour` to `day_start_hour` so that
 * a 1am snack lands on the evening it belongs to.
 */

export interface DayContext {
  timezone: string;
  dayStartHour: number;
}

/** The YYYY-MM-DD this instant counts toward. */
export function localDateFor(instant: Date, { timezone, dayStartHour }: DayContext): string {
  const shifted = new Date(instant.getTime() - dayStartHour * 60 * 60 * 1000);
  return formatInTimeZone(shifted, timezone);
}

/** Wall-clock parts in the user's timezone, for prompting the model. */
export function localPartsFor(instant: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday ?? '',
  };
}

function formatInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // en-CA yields YYYY-MM-DD
}

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

/** How far ahead of UTC `timeZone` runs at `instant`, in milliseconds. */
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

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive list of dates from `start` to `end`. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
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

/** §6: pick a sensible meal rather than asking which one it was. */
export function inferMeal(instant: Date, timezone: string): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const hour = Number(localPartsFor(instant, timezone).time.slice(0, 2));
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}
