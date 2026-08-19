/**
 * Formatters for the admin panel.
 *
 * They exist because every number on that screen spans several orders of
 * magnitude — a text log costs $0.0007 and the monthly projection at ten
 * thousand users is five figures — and a single `toFixed(2)` renders half of
 * them as "$0.00", which is the one answer that makes the whole panel useless.
 */

export function usd(value: number): string {
  if (value === 0) return '$0';
  if (Math.abs(value) < 0.01) return `$${value.toFixed(5)}`;
  if (Math.abs(value) < 1) return `$${value.toFixed(4)}`;
  if (Math.abs(value) < 1000) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString()}`;
}

export function compactNumber(value: number): string {
  if (Math.abs(value) < 1000) return String(Math.round(value));
  if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

export function bytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = value;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? n : n.toFixed(1)} ${units[unit]}`;
}

export function duration(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Short, absolute, and unambiguous — "2 days ago" is useless in a support call. */
export function timestamp(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`;
}

export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction < 0.1 ? 1 : 0)}%`;
}
