'use client';

import type { CoachFlag, Goal } from '@ct/shared';
import { cn } from '@/lib/utils';

/**
 * The small pieces the roster and the client page share, so a flag is the
 * same colour on both and a client's initials are cut the same way.
 */

/** "EK" for Elena K. — two letters, never more, and a dash for nobody. */
export function initials(name: string | null): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function goalLabel(goal: Goal | null): string {
  switch (goal) {
    case 'lose':
      return 'Cut';
    case 'gain':
      return 'Build';
    case 'maintain':
      return 'Maintain';
    default:
      return 'No goal set';
  }
}

export function Avatar({ name, size = 'md' }: { name: string | null; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'bg-secondary text-foreground inline-grid shrink-0 place-items-center rounded-full font-[family-name:var(--font-display)] font-extrabold',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-9 text-[13px]',
        size === 'lg' && 'size-13 text-[18px]',
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/**
 * A flag as a pill. Semantic colour, not the accent: critical borrows the
 * destructive token, a warning the protein cut, and information the carbs cut
 * — none of which is the green the ring is drawn in.
 */
export function FlagPill({ flag }: { flag: CoachFlag }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[12px] font-extrabold whitespace-nowrap',
        flag.severity === 'critical' && 'bg-destructive/12 text-destructive',
        flag.severity === 'warning' &&
          'bg-[color-mix(in_oklch,var(--protein),transparent_82%)] text-[var(--protein-text)]',
        flag.severity === 'info' &&
          'bg-[color-mix(in_oklch,var(--carbs),transparent_84%)] text-[var(--carbs-text)]',
      )}
    >
      {flag.label}
    </span>
  );
}

export function OnTrack() {
  return (
    <span className="inline-block rounded-full bg-[color-mix(in_oklch,var(--calories),transparent_84%)] px-2 py-0.5 text-[12px] font-extrabold whitespace-nowrap text-[var(--calories-text)]">
      On track
    </span>
  );
}

/** Seven dots, Monday to Sunday of the client's week: filled for a logged day. */
export function DotStrip({ days }: { days: { local_date: string; logged: boolean }[] }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex gap-1">
        {days.map((day) => (
          <span
            key={day.local_date}
            title={day.local_date}
            className={cn(
              'block size-2.5 rounded-full',
              day.logged ? 'bg-[var(--calories)]' : 'border-input border-2 bg-transparent',
            )}
          />
        ))}
      </span>
      <span className="text-muted-foreground inline-flex gap-1 text-[9px] font-bold tracking-[0.1em]">
        {days.map((day) => (
          <span key={day.local_date} className="block w-2.5 text-center">
            {weekdayInitial(day.local_date)}
          </span>
        ))}
      </span>
    </span>
  );
}

/** A thin bar of `value` against `target`, in a macro's own colour. */
export function Bar({ value, target, color }: { value: number | null; target: number; color: string }) {
  const pct = value === null || target <= 0 ? 0 : Math.min(100, Math.round((value / target) * 100));
  return (
    <span className="bg-muted block h-1.5 w-24 overflow-hidden rounded-full">
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

// ---- Dates -------------------------------------------------------------------

const noon = (localDate: string) => new Date(`${localDate}T12:00:00Z`);

export function weekdayInitial(localDate: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'narrow', timeZone: 'UTC' }).format(noon(localDate));
}

/** "Mon 7 Sep" */
export function shortDate(localDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(noon(localDate));
}

/** "Monday, 7 September" */
export function longDate(localDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(noon(localDate));
}

/** "31 Aug – 6 Sep" */
export function dateRange(start: string, end: string): string {
  const day = (d: string) =>
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(noon(d));
  return `${day(start)} – ${day(end)}`;
}

/** "Sun 20:15", in the client's own timezone — the clock they ate by. */
export function whenIn(iso: string | null, timezone: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

export function timeIn(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

/** "+0.3 kg", "−1.4 kg", "0.0 kg" — a real minus sign, because it is read. */
export function signedKg(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(1)} kg`;
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** A line the page wants read before the table: the free month, a failed card. */
export function Notice({ tone, children }: { tone: 'info' | 'warn'; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'rounded-2xl border-2 px-4 py-3 text-[14px] font-medium',
        tone === 'warn'
          ? 'border-[color-mix(in_oklch,var(--protein),transparent_50%)] bg-[color-mix(in_oklch,var(--protein),transparent_88%)]'
          : 'border-border bg-card',
      )}
    >
      {children}
    </p>
  );
}
