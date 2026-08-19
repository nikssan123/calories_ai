import { cn } from '@/lib/utils';

/**
 * One figure with its label, and optionally the sentence that says what it
 * means. The hint is not decoration: most of these numbers are only useful
 * next to the assumption behind them ("at this window's usage", "excludes
 * unpriced turns"), and a dashboard of bare numbers invites confident wrong
 * conclusions.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'accent' | 'warn';
  className?: string;
}) {
  return (
    <div className={cn('px-4 py-3', className)}>
      <p className="text-footnote text-muted-foreground font-medium tracking-wide uppercase">
        {label}
      </p>
      <p
        className={cn(
          'tnum mt-1 text-2xl font-semibold',
          tone === 'accent' && 'text-[var(--calories)]',
          tone === 'warn' && 'text-[var(--fat)]',
        )}
      >
        {value}
      </p>
      {hint && <p className="text-footnote text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

/** A responsive grid of `Stat`s sharing hairline separators, iOS-style. */
export function StatGrid({
  columns = 3,
  children,
}: {
  columns?: 2 | 3 | 4;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-card divide-border grid divide-x divide-y overflow-hidden rounded-2xl',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-2 sm:grid-cols-3',
        columns === 4 && 'grid-cols-2 lg:grid-cols-4',
      )}
    >
      {children}
    </div>
  );
}
