'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DaySummary, FoodEntry, Meal } from '@ct/shared';
import { api } from '@/lib/api';
import { CalorieRing } from '@/components/CalorieRing';
import { MacroBars } from '@/components/MacroBars';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export default function TodayPage() {
  const [day, setDay] = useState<DaySummary | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (dayOffset: number) => {
    try {
      const base = await api.day();
      setDay(dayOffset === 0 ? base : await api.day(shiftDate(base.local_date, dayOffset)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(offset);
  }, [load, offset]);

  async function removeEntry(entry: FoodEntry) {
    setDay((prev) =>
      prev ? { ...prev, food_entries: prev.food_entries.filter((e) => e.id !== entry.id) } : prev,
    );
    try {
      await api.deleteFoodEntry(entry.id);
      toast.success(`Removed ${entry.description}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    void load(offset);
  }

  const byMeal = MEAL_ORDER.map((meal) => ({
    meal,
    entries: day?.food_entries.filter((e) => e.meal === meal) ?? [],
  })).filter((group) => group.entries.length > 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-2 pt-6 pb-1 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOffset((o) => o - 1)}
          aria-label="Previous day"
          className="text-muted-foreground rounded-full"
        >
          <ChevronLeft size={22} />
        </Button>
        <div className="text-center">
          <h1 className="text-title-2">{offset === 0 ? 'Today' : formatDay(day?.local_date)}</h1>
          {offset === 0 && day && (
            <p className="text-footnote text-muted-foreground">{formatDay(day.local_date)}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset === 0}
          aria-label="Next day"
          className="text-muted-foreground rounded-full disabled:opacity-25"
        >
          <ChevronRight size={22} />
        </Button>
      </header>

      {loading || !day ? (
        <div className="flex flex-col items-center gap-6 px-4 py-8">
          <Skeleton className="size-44 rounded-full" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-5xl px-4 pt-4 lg:grid lg:grid-cols-[300px_1fr] lg:items-start lg:gap-10 lg:px-6">
          <div className="space-y-7 lg:sticky lg:top-4">
          <div className="flex flex-col items-center">
            <CalorieRing
              consumed={day.consumed.kcal}
              target={day.targets.kcal}
              burned={day.burned_kcal}
            />
            <p className="tnum text-muted-foreground mt-4 text-[15px]">
              <span className="text-foreground font-semibold">
                {Math.round(day.consumed.kcal).toLocaleString()}
              </span>{' '}
              of {day.targets.kcal.toLocaleString()} kcal
            </p>
          </div>

          <MacroBars consumed={day.consumed} targets={day.targets} />
          </div>

          <div className="mt-7 space-y-7 lg:mt-0">
          {byMeal.length === 0 && day.exercise_entries.length === 0 && (
            <p className="text-muted-foreground py-10 text-center text-[15px]">
              Nothing logged yet.
              <br />
              Tell the journal what you ate.
            </p>
          )}

          {byMeal.map(({ meal, entries }) => (
            <InsetGroup
              key={meal}
              title={MEAL_LABEL[meal]}
              trailing={
                <span className="tnum text-footnote text-muted-foreground">
                  {Math.round(entries.reduce((sum, e) => sum + e.kcal, 0))} kcal
                </span>
              }
            >
              {entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onDelete={() => void removeEntry(entry)} />
              ))}
            </InsetGroup>
          ))}

          {day.exercise_entries.length > 0 && (
            <InsetGroup
              title="Exercise"
              trailing={
                <span className="tnum text-footnote text-[var(--exercise)]">
                  −{day.burned_kcal} kcal
                </span>
              }
              // §9: exercise is reported beside food, never netted off the target.
              footer="Shown separately from your target — exercise burn is a rough estimate."
            >
              {day.exercise_entries.map((entry) => (
                <InsetRow key={entry.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">{entry.description}</p>
                    {entry.duration_min !== null && (
                      <p className="text-footnote text-muted-foreground">
                        {Math.round(entry.duration_min)} min
                      </p>
                    )}
                  </div>
                  <span className="tnum text-muted-foreground text-[15px]">
                    ~{Math.round(entry.kcal_burned)}
                  </span>
                </InsetRow>
              ))}
            </InsetGroup>
          )}

          {day.weight && (
            <InsetGroup title="Weight">
              <InsetRow>
                <span className="flex-1 text-[15px]">Weighed</span>
                <span className="tnum text-[15px] font-medium">{day.weight.weight_kg} kg</span>
              </InsetRow>
            </InsetGroup>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, onDelete }: { entry: FoodEntry; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const approx = entry.confidence !== 'high';

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted/60"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{entry.description}</p>
          <p className="tnum text-footnote text-muted-foreground">
            {Math.round(entry.protein_g)}P · {Math.round(entry.carbs_g)}C · {Math.round(entry.fat_g)}F
            {entry.confidence === 'low' && ' · rough estimate'}
          </p>
        </div>
        <span className="tnum text-[15px] font-medium">
          {approx && '~'}
          {Math.round(entry.kcal)}
        </span>
      </button>

      {open && (
        <div className="bg-muted/40 space-y-2 px-4 py-3">
          <ul className="space-y-1.5">
            {entry.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 text-footnote">
                <span className="min-w-0 flex-1 truncate">
                  {item.name}
                  {(item.quantity_desc || item.quantity_g !== null) && (
                    <span className="text-muted-foreground">
                      {' · '}
                      {item.quantity_desc ?? `${Math.round(item.quantity_g!)}g`}
                    </span>
                  )}
                </span>
                <span className="tnum text-muted-foreground shrink-0">
                  {Math.round(item.kcal)} kcal
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 pt-1">
            <p className="text-footnote text-muted-foreground flex-1">
              To change this, say so in the journal — “there was more rice”.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive h-8 gap-1.5 px-2"
            >
              <Trash2 size={15} />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDay(isoDate?: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
