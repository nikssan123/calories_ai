'use client';

import type { DaySummary } from '@ct/shared';
import { CalorieRing } from '@/components/CalorieRing';
import { MacroBars } from '@/components/MacroBars';
import { Skeleton } from '@/components/ui/skeleton';

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * Desktop-only companion to the journal. On a phone the day lives on its own
 * tab; on a wide screen there is room to keep it beside the conversation, so
 * logging a meal visibly moves the ring.
 */
export function DayRail({ day }: { day: DaySummary | null }) {
  return (
    <aside className="border-border hidden w-80 shrink-0 flex-col overflow-y-auto border-l px-5 py-6 xl:flex">
      {!day ? (
        <div className="flex flex-col items-center gap-6">
          <Skeleton className="size-40 rounded-full" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center">
            <CalorieRing
              consumed={day.consumed.kcal}
              target={day.targets.kcal}
              burned={day.burned_kcal}
              size={156}
              strokeWidth={12}
            />
            <p className="tnum text-muted-foreground mt-3 text-sm">
              <span className="text-foreground font-semibold">
                {Math.round(day.consumed.kcal).toLocaleString()}
              </span>{' '}
              of {day.targets.kcal.toLocaleString()} kcal
            </p>
          </div>

          <MacroBars consumed={day.consumed} targets={day.targets} className="mt-6" />

          {day.food_entries.length > 0 && (
            <div className="mt-7">
              <h2 className="text-footnote text-muted-foreground mb-2 font-medium tracking-wide uppercase">
                Today
              </h2>
              <ul className="space-y-1">
                {day.food_entries.map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-3 py-1">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{entry.description}</span>
                      <span className="text-footnote text-muted-foreground">
                        {MEAL_LABEL[entry.meal] ?? entry.meal}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-sm">
                      {entry.confidence !== 'high' && '~'}
                      {Math.round(entry.kcal)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {day.exercise_entries.length > 0 && (
            <div className="mt-6">
              <h2 className="text-footnote text-muted-foreground mb-2 font-medium tracking-wide uppercase">
                Exercise
              </h2>
              <ul className="space-y-1">
                {day.exercise_entries.map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-3 py-1">
                    <span className="min-w-0 flex-1 truncate text-sm">{entry.description}</span>
                    <span className="tnum shrink-0 text-sm text-[var(--exercise)]">
                      −{Math.round(entry.kcal_burned)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
