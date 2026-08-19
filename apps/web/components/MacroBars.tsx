'use client';

import type { Nutrition, Targets } from '@ct/shared';
import { cn } from '@/lib/utils';

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
      {MACROS.map(({ key, label, color }) => {
        const value = consumed[key];
        const target = targets[key];
        const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);

        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-footnote text-muted-foreground">{label}</span>
              <span className="tnum text-footnote font-medium">
                {Math.round(value)}
                <span className="text-muted-foreground font-normal">/{target}</span>
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: color,
                  transition: 'width 700ms cubic-bezier(0.34, 1.4, 0.64, 1)',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
