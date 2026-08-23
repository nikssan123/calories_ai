'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DaySummary, ExerciseEntry, FoodEntry, Meal } from '@ct/shared';
import { formatBodyWeight, formatDistance, formatMass } from '@ct/shared';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { CalorieRing } from '@/components/CalorieRing';
import { MacroBars } from '@/components/MacroBars';
import { DietQuality } from '@/components/DietQuality';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { RepeatMeals } from '@/components/RepeatMeals';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { exerciseEmoji, foodEmoji } from '@ct/shared/food-emoji';

/** The `?date=` the calendar links here with. Anything else is ignored. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

/** The section headings get a picture too, so the day skims as a menu. */
const MEAL_EMOJI: Record<Meal, string> = {
  breakfast: '🌅',
  lunch: '🥪',
  dinner: '🌙',
  snack: '🍪',
};

/**
 * `useSearchParams` opts a client component into request-time rendering, which
 * Next refuses to prerender without a boundary. The skeleton is the same one
 * the data fetch shows, so a deep link does not flash a different empty state.
 */
export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayView />
    </Suspense>
  );
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col items-center gap-6 px-4 py-8">
      <Skeleton className="size-44 rounded-full" />
      <Skeleton className="h-12 w-full rounded-2xl" />
    </div>
  );
}

function TodayView() {
  const requested = useSearchParams().get('date');
  const units = useUnits();

  const [day, setDay] = useState<DaySummary | null>(null);
  /*
   * The date being shown, or null for "whatever the server calls today". Held
   * as a date rather than an offset so History can link straight to a day.
   *
   * Seeded from the query during render rather than in an effect. As an effect
   * it was a tick too late: the first commit had already fired a dateless fetch
   * for today, so a deep link raced its own request for the day it had asked
   * for — and lost often enough that `/today?date=…` looked simply ignored.
   */
  const [date, setDate] = useState<string | null>(() =>
    requested && ISO_DATE.test(requested) ? requested : null,
  );
  const [today, setToday] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Later changes to the query still have to land — History links here with
  // `next/link`, which swaps the parameter without remounting this component.
  useEffect(() => {
    if (requested && ISO_DATE.test(requested)) setDate(requested);
  }, [requested]);

  /*
   * Which fetch is allowed to publish its result.
   *
   * Stepping through days quickly issues overlapping requests, and they do not
   * come back in the order they were sent. Without this the day on screen is
   * whichever response happened to be slowest rather than the one that was
   * asked for last.
   */
  const latest = useRef(0);

  const load = useCallback(async (target: string | null) => {
    const seq = ++latest.current;
    try {
      const summary = await api.day(target ?? undefined);
      if (seq !== latest.current) return;
      setDay(summary);
      // Today is whatever the server says when asked without a date; it honours
      // day_start_hour, so it is not always the browser's calendar date.
      if (target === null) setToday(summary.local_date);
    } catch (e) {
      if (seq !== latest.current) return;
      toast.error((e as Error).message);
    } finally {
      if (seq === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [load, date]);

  // Resolved once from a dateless fetch, so the header and the next-day guard
  // both work on the first paint of a deep link.
  useEffect(() => {
    if (today === null && date !== null) void api.day().then((d) => setToday(d.local_date));
  }, [today, date]);

  const isToday = day !== null && today !== null && day.local_date === today;
  const step = (days: number) =>
    setDate((current) => shiftDate(current ?? day?.local_date ?? today ?? '', days));

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
    void load(date);
  }

  /**
   * Exercise has no expand-to-edit affordance the way food does — there are no
   * items under it — so the burn is corrected in the journal and removed here.
   * Totals are adjusted optimistically because they head the section.
   */
  async function removeExercise(entry: ExerciseEntry) {
    const burn = Math.round(entry.kcal_burned);
    setDay((prev) =>
      prev
        ? {
            ...prev,
            exercise_entries: prev.exercise_entries.filter((e) => e.id !== entry.id),
            burned_kcal: prev.burned_kcal - burn,
            net_kcal: prev.net_kcal + burn,
          }
        : prev,
    );
    try {
      await api.deleteExerciseEntry(entry.id);
      toast.success(`Removed ${entry.description}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    void load(date);
  }

  /** Clones a past entry to now — which is today, so jump back there to show it. */
  async function repeatEntry(entry: FoodEntry) {
    try {
      const copy = await api.repeatFoodEntry(entry.id);
      toast.success(`Logged ${copy.description} — ${Math.round(copy.kcal)} kcal`);
      setDate(null);
      void load(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
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
          onClick={() => step(-1)}
          aria-label="Previous day"
          className="text-muted-foreground rounded-full"
        >
          <ChevronLeft size={22} />
        </Button>
        {/* Stepping one day at a time made "how did last month go?" a dozen
            taps; the header is the way into the month grid — and below `lg`,
            where the bottom bar has no room for History, it is the only way in.
            So it wears an outline and a calendar mark at rest rather than only
            on hover: a thumb has no hover to discover it with, and a bare
            heading is not something anyone thinks to press.

            The mark rides the second line rather than the heading, because
            "Wednesday 23 September" already spends every pixel a phone has
            between the two chevrons. */}
        <Link
          href="/history"
          className="border-border bg-card hover:bg-muted/60 active:bg-muted/60 rounded-2xl border-2 px-2.5 py-1 text-center transition-colors"
        >
          <h1 className="text-title-2">{isToday ? 'Today' : formatDay(day?.local_date)}</h1>
          <p className="text-footnote text-muted-foreground flex items-center justify-center gap-1.5 font-semibold">
            <CalendarDays size={13} strokeWidth={2.4} className="shrink-0" />
            {isToday && day ? formatDay(day.local_date) : 'View calendar'}
          </p>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => step(1)}
          disabled={isToday}
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
            <p className="tnum text-muted-foreground mt-5 text-body font-medium">
              <span className="text-foreground font-extrabold">
                {Math.round(day.consumed.kcal).toLocaleString()}
              </span>{' '}
              of {day.targets.kcal.toLocaleString()} kcal
            </p>
            {day.burned_kcal > 0 && (
              <p className="tnum text-footnote text-muted-foreground mt-1 font-semibold">
                net {day.net_kcal.toLocaleString()} kcal after exercise
              </p>
            )}
          </div>

          <MacroBars consumed={day.consumed} targets={day.targets} />

          <DietQuality quality={day.quality} />
          </div>

          <div className="mt-7 space-y-7 lg:mt-0">
          {byMeal.length === 0 && day.exercise_entries.length === 0 && (
            <div className="py-10 text-center">
              <span aria-hidden className="animate-bob mb-3 block text-[40px] leading-none">
                🍽️
              </span>
              <p className="text-muted-foreground text-body font-medium">
                Nothing logged yet.
                <br />
                Tell the journal what you ate.
              </p>
            </div>
          )}

          {byMeal.map(({ meal, entries }) => (
            <InsetGroup
              key={meal}
              title={`${MEAL_EMOJI[meal]}  ${MEAL_LABEL[meal]}`}
              trailing={
                <span className="tnum text-footnote text-muted-foreground font-bold">
                  {Math.round(entries.reduce((sum, e) => sum + e.kcal, 0))} kcal
                </span>
              }
            >
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onDelete={() => void removeEntry(entry)}
                  onRepeat={() => void repeatEntry(entry)}
                />
              ))}
            </InsetGroup>
          ))}

          {day.exercise_entries.length > 0 && (
            <InsetGroup
              title="🏃  Exercise"
              trailing={
                <span className="tnum text-footnote font-bold text-[var(--exercise-text)]">
                  −{day.burned_kcal} kcal
                </span>
              }
              // §9: exercise is reported beside food, never netted off the target.
              footer="Shown separately from your target — exercise burn is a rough estimate."
            >
              {day.exercise_entries.map((entry) => (
                <InsetRow key={entry.id}>
                  <span aria-hidden className="shrink-0 text-[20px] leading-none">
                    {exerciseEmoji(entry.description)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold">{entry.description}</p>
                    {(entry.distance_km !== null || entry.duration_min !== null) && (
                      <p className="text-footnote text-muted-foreground font-medium">
                        {[
                          entry.distance_km !== null ? formatDistance(entry.distance_km, units) : null,
                          entry.duration_min !== null ? `${Math.round(entry.duration_min)} min` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="tnum text-body font-bold text-[var(--exercise-text)]">
                    ~{Math.round(entry.kcal_burned)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void removeExercise(entry)}
                    aria-label={`Delete ${entry.description}`}
                    className="text-muted-foreground hover:text-destructive -mr-2 size-8 shrink-0 rounded-full"
                  >
                    <Trash2 size={15} />
                  </Button>
                </InsetRow>
              ))}
            </InsetGroup>
          )}

          {day.weight && (
            <InsetGroup title="⚖️  Weight">
              <InsetRow>
                <span className="flex-1 text-body font-semibold">Weighed</span>
                <span className="text-figure text-body">
                  {formatBodyWeight(day.weight.weight_kg, units)}
                </span>
              </InsetRow>
            </InsetGroup>
          )}

          {/* Repeating logs at the current time, so it only belongs on today. */}
          {isToday && <RepeatMeals onLogged={() => void load(null)} />}
          </div>
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  onDelete,
  onRepeat,
}: {
  entry: FoodEntry;
  onDelete: () => void;
  onRepeat: () => void;
}) {
  const [open, setOpen] = useState(false);
  const approx = entry.confidence !== 'high';
  const units = useUnits();

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="active:bg-muted/60 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
      >
        <span aria-hidden className="shrink-0 text-[20px] leading-none">
          {foodEmoji(entry.description, entry.meal)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{entry.description}</p>
          <p className="tnum text-footnote text-muted-foreground font-medium">
            {Math.round(entry.protein_g)}P · {Math.round(entry.carbs_g)}C ·{' '}
            {Math.round(entry.fat_g)}F
            {entry.confidence === 'low' && ' · rough estimate'}
          </p>
        </div>
        <span className="text-figure text-body">
          {approx && '~'}
          {Math.round(entry.kcal)}
        </span>
      </button>

      {open && (
        <div className="bg-muted/40 space-y-2 px-4 py-3">
          <ul className="space-y-1.5">
            {entry.items.map((item) => (
              <li key={item.id} className="text-footnote flex justify-between gap-3 font-medium">
                <span className="min-w-0 flex-1 truncate">
                  {item.name}
                  {(item.quantity_desc || item.quantity_g !== null) && (
                    <span className="text-muted-foreground">
                      {' · '}
                      {item.quantity_desc ?? formatMass(item.quantity_g!, units)}
                    </span>
                  )}
                </span>
                <span className="tnum text-muted-foreground shrink-0">
                  {Math.round(item.kcal)} kcal
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 pt-1">
            <p className="text-footnote text-muted-foreground flex-1 font-medium">
              To change this, say so in the journal — “there was more rice”.
            </p>
            <Button variant="ghost" size="sm" onClick={onRepeat} className="h-8 gap-1.5 px-2">
              <RotateCcw size={15} />
              Log again
            </Button>
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
