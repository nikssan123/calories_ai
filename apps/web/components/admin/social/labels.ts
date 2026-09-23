/** Buffer's service names, as the channel list returns them. */
const SERVICE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'X',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
};

export const serviceLabel = (service: string) => SERVICE_LABELS[service] ?? service;

/**
 * A time in a channel's own timezone.
 *
 * `timestamp()` in ../format.ts renders UTC, which is right in a support call
 * and wrong here: every slot on this account was set in Sofia, and 16:00Z shown
 * as 16:00 makes a 19:00 post look like mid-afternoon.
 */
export function inZone(iso: string | null, timeZone: string): string {
  if (!iso) return 'no time';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    // An unknown timezone from Buffer should degrade, not blank the row.
    return iso.slice(0, 16).replace('T', ' ');
  }
}

/**
 * The value a `datetime-local` input wants, in a given timezone.
 *
 * The input has no timezone of its own — it shows and returns a bare wall
 * clock — so the conversion has to happen on both sides or a retime silently
 * lands hours out. This is the read side; `fromLocalInput` is the write side.
 */
export function toLocalInput(iso: string | null, timeZone: string): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${at('year')}-${at('month')}-${at('day')}T${at('hour')}:${at('minute')}`;
}

/**
 * A `datetime-local` value read as a wall clock in `timeZone`, to an ISO instant.
 *
 * Done by probing rather than with a timezone library: format a guess back into
 * the zone, measure how far off it landed, and correct by that. Two passes
 * because a single correction can cross a DST boundary and land an hour out —
 * the second pass converges on it.
 */
export function fromLocalInput(local: string, timeZone: string): string {
  let guess = new Date(`${local}:00Z`).getTime();
  for (let pass = 0; pass < 2; pass++) {
    const shown = toLocalInput(new Date(guess).toISOString(), timeZone);
    const drift = new Date(`${local}:00Z`).getTime() - new Date(`${shown}:00Z`).getTime();
    if (drift === 0) break;
    guess += drift;
  }
  return new Date(guess).toISOString();
}
