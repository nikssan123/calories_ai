'use client';

import type { DayQuality } from '@ct/shared';
import { QUALITY_COVERAGE_FLOOR } from '@ct/shared';
import { cn } from '@/lib/utils';

/**
 * Fiber, sodium, saturated fat and sugar, under the macros.
 *
 * Deliberately not four more MacroBars. Three fat tracks is a glance; seven is
 * a dashboard, and the moment this reads as important as protein it starts
 * being the thing people optimise. These are smaller, quieter, and sit below
 * the fold of attention on purpose — they are for noticing a pattern over a
 * week, not for scoring a lunch.
 *
 * The two halves of the panel do not mean the same thing and are not drawn
 * alike. Fiber is a floor: filling it is good news, so it takes the app's
 * positive green. The other three are ceilings, which have no good news in
 * them — a full sodium bar is not an achievement — so they run in ink and turn
 * to plain foreground when they are crossed. Never red: going over is still not
 * an alarm here, exactly as it is not on the calorie ring.
 */

const ROWS = [
  { key: 'fiber_g', label: 'Fiber', emoji: '🌱', unit: 'g' },
  { key: 'sodium_mg', label: 'Sodium', emoji: '🧂', unit: 'mg' },
  { key: 'sat_fat_g', label: 'Sat fat', emoji: '🧈', unit: 'g' },
  { key: 'sugar_g', label: 'Sugar', emoji: '🍬', unit: 'g' },
] as const;

export function DietQuality({
  quality,
  className,
}: {
  quality: DayQuality;
  className?: string;
}) {
  // Nothing estimated means nothing to say. An empty panel of dashes would
  // invite the reading that today had no fiber in it.
  if (ROWS.every((row) => quality[row.key] === null)) return null;

  const partial = quality.coverage < QUALITY_COVERAGE_FLOOR;

  return (
    <section className={cn('space-y-2', className)}>
      <header className="flex items-baseline justify-between gap-3 px-1.5">
        <h2 className="text-eyebrow text-muted-foreground">🥦&nbsp;&nbsp;Diet quality</h2>
        {partial && (
          <span className="text-footnote text-muted-foreground font-semibold">partly measured</span>
        )}
      </header>

      <div className="bg-card border-border chunk grid grid-cols-2 gap-x-5 gap-y-4 rounded-[var(--radius)] border-2 px-4 py-4">
        {ROWS.map((row) => (
          <QualityTrack
            key={row.key}
            row={row}
            value={quality[row.key]}
            target={quality.targets[row.key]}
          />
        ))}
      </div>

      {partial && (
        <p className="text-footnote text-muted-foreground px-1.5 pt-0.5 font-medium">
          Only {Math.round(quality.coverage * 100)}% of today&rsquo;s calories carry these figures,
          so the totals are a floor rather than the whole day.
        </p>
      )}
    </section>
  );
}

function QualityTrack({
  row,
  value,
  target,
}: {
  row: (typeof ROWS)[number];
  value: number | null;
  target: { value: number; direction: 'floor' | 'ceiling' };
}) {
  const floor = target.direction === 'floor';
  const pct = value === null ? 0 : Math.min(100, (value / target.value) * 100);

  // A floor reached is good; a ceiling crossed is worth seeing but is not an
  // alarm, so both land on a colour rather than on a warning.
  const marked = value !== null && (floor ? value >= target.value : value > target.value);
  const fill = floor ? 'var(--calories)' : 'var(--muted-foreground)';

  /*
   * Label, figure and bar stacked rather than laid out across the row — the
   * same rhythm as MacroBars above, which is what lets this sit under them
   * without reading as a different kind of object. It is also the only
   * arrangement that survives the 300px sidebar: "1,590 / 2,300mg" beside a
   * label wraps onto two lines and truncates "Sodium" to "So…".
   */
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="text-[11px] leading-none">
          {row.emoji}
        </span>
        <span className="text-footnote text-muted-foreground truncate font-semibold">
          {row.label}
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        {value === null ? (
          <span className="text-footnote text-muted-foreground font-semibold">not estimated</span>
        ) : (
          <>
            <span
              className="text-figure text-footnote leading-none"
              style={marked && floor ? { color: 'var(--calories-text)' } : undefined}
            >
              {Math.round(value).toLocaleString()}
            </span>
            <span className="tnum text-footnote text-muted-foreground font-semibold">
              /{target.value.toLocaleString()}
              {row.unit}
            </span>
          </>
        )}
      </div>

      <div className="bg-muted border-border h-1.5 overflow-hidden rounded-full border">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: marked && !floor ? 'var(--foreground)' : fill,
            transition: 'width var(--dur-spring) var(--ease-spring)',
          }}
        />
      </div>
    </div>
  );
}
