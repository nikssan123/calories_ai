'use client';

import { formatNumber, type DaySummary } from '@ct/shared';
import { CalorieRing } from '@/components/CalorieRing';
import { MacroBars } from '@/components/MacroBars';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { exerciseEmoji, foodEmoji } from '@ct/shared/food-emoji';

const MEAL_LABEL: Record<string, StringKey> = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  dinner: 'meal.dinner',
  snack: 'meal.snackOne',
};

/**
 * Desktop-only companion to the journal. On a phone the day lives on its own
 * tab; on a wide screen there is room to keep it beside the conversation, so
 * logging a meal visibly moves the ring.
 */
export function DayRail({ day }: { day: DaySummary | null }) {
  const t = useT();
  const locale = useLocale();
  return (
    <aside className="border-border hidden w-80 shrink-0 flex-col overflow-y-auto border-l-2 px-5 py-6 xl:flex">
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
              size={168}
              strokeWidth={18}
            />
            <p className="tnum text-muted-foreground mt-4 text-sm font-medium">
              <span className="text-foreground font-extrabold">
                {Math.round(day.consumed.kcal).toLocaleString()}
              </span>{' '}
              of {day.targets.kcal.toLocaleString()} kcal
            </p>
            {day.burned_kcal > 0 && (
              <p className="tnum text-footnote text-muted-foreground mt-1 font-semibold">
                {t('rail.netAfterExercise')(formatNumber(day.net_kcal, locale))}
              </p>
            )}
          </div>

          <MacroBars consumed={day.consumed} targets={day.targets} className="mt-6" />

          {day.food_entries.length > 0 && (
            <div className="mt-7">
              <h2 className="text-eyebrow text-muted-foreground mb-2">{t('common.today')}</h2>
              <ul className="space-y-1">
                {day.food_entries.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2.5 py-1">
                    <span aria-hidden className="shrink-0 text-[17px] leading-none">
                      {foodEmoji(entry.description, entry.meal)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {entry.description}
                      </span>
                      <span className="text-footnote text-muted-foreground font-medium">
                        {MEAL_LABEL[entry.meal] ? t(MEAL_LABEL[entry.meal]!) : entry.meal}
                      </span>
                    </span>
                    <span className="text-figure shrink-0 text-sm">
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
              <h2 className="text-eyebrow text-muted-foreground mb-2">{t('today.exercise')}</h2>
              <ul className="space-y-1">
                {day.exercise_entries.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2.5 py-1">
                    <span aria-hidden className="shrink-0 text-[17px] leading-none">
                      {exerciseEmoji(entry.description)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {entry.description}
                    </span>
                    <span className="text-figure shrink-0 text-sm text-[var(--exercise-text)]">
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
