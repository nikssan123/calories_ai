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

  const asIso = new Date(hint);
  if (!Number.isNaN(asIso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(hint)) return asIso;

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
  if (/\bbreakfast|this morning|morning\b/.test(text)) return 8;
  if (/\blunch|midday|noon\b/.test(text)) return 13;
  if (/\bafternoon\b/.test(text)) return 16;
  if (/\bdinner|tonight|this evening|evening\b/.test(text)) return 19;
  if (/\blate night|midnight\b/.test(text)) return 23;
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
