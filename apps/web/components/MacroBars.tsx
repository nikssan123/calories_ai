'use client';

import type { Nutrition, Targets } from '@ct/shared';
import { cn } from '@/lib/utils';

/**
 * Protein, carbs, fat as three tracks.
 *
 * All three are lighter and more saturated than the accent on the ring above,
 * which is what keeps the two readable together: the deep, low-chroma green
 * reads as structure and these read as data. The bars share the ring's spring,
 * so a logged meal lands as one movement across the screen rather than four
 * separate widgets updating.
 */

const MACROS = [
  { key: 'protein_g', label: 'Protein', color: 'var(--protein)' },
  { key: 'carbs_g', label: 'Carbs', color: 'var(--carbs)' },
  { key: 'fat_g', label: 'Fat', color: 'var(--fat)' },
] as const;

export function MacroBars({
  consumed,
  targets,
  className,
}: {
  consumed: Nutrition;
  targets: Targets;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-3 gap-4', className)}>
      {MACROS.map(({ key, label, color }, i) => {
        const value = consumed[key];
        const target = targets[key];
        const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);

        return (
          <div key={key} className="space-y-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-footnote text-muted-foreground">{label}</span>
              <span className="text-figure text-footnote">
                {Math.round(value)}
                <span className="text-muted-foreground font-normal tracking-normal">/{target}</span>
              </span>
            </div>
            <div className="bg-muted h-[5px] overflow-hidden rounded-full">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: color,
                  // Staggered so the three bars read as a sequence rather than
                  // one three-part thing snapping at once.
                  transition: `width var(--dur-spring) var(--ease-spring) ${i * 60}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
