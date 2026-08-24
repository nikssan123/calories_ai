'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ExerciseEntry, ExerciseSummary, Locale } from '@ct/shared';
import { distanceUnit, formatDay, formatDistance, toDistance } from '@ct/shared';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Sparkline } from '@/components/Sparkline';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { exerciseEmoji } from '@ct/shared/food-emoji';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Workouts } from '@/components/exercise/Workouts';
import { useLocale } from '@/lib/i18n';

/**
 * Exercise, split out of Progress so it gets a screen rather than a single row.
 *
 * Everything here stays on the §9 side of the line: burn is reported, never
 * netted against the target. The screen answers "have I been training?" — a
 * question about consistency — which is why active days and the per-day shape
 * lead, and the calorie total is the smallest number on the page.
 */

const WINDOWS = [14, 30, 90] as const;

export default function ExercisePage() {
  const locale = useLocale();
  const [summary, setSummary] = useState<ExerciseSummary | null>(null);
  const [days, setDays] = useState<number>(30);
  const units = useUnits();

  /* The series carries a date and a number per day; the sessions that made
     that number sit in a flat list beside it. Index them once, so pointing at
     a bar can answer what the day actually was. */
  const byDate = useMemo(() => {
    const map = new Map<string, ExerciseEntry[]>();
    for (const entry of summary?.entries ?? []) {
      const day = map.get(entry.local_date);
      if (day) day.push(entry);
      else map.set(entry.local_date, [entry]);
    }
    return map;
  }, [summary]);

  const load = useCallback(async (window: number) => {
    try {
      setSummary(await api.exercise(window));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  async function remove(entry: ExerciseEntry) {
    setSummary((prev) =>
      prev ? { ...prev, entries: prev.entries.filter((e) => e.id !== entry.id) } : prev,
    );
    try {
      await api.deleteExerciseEntry(entry.id);
      toast.success(`Removed ${entry.description}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    void load(days);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8 lg:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-7">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-large-title">Exercise</h1>
          <ToggleGroup
            value={[String(days)]}
            onValueChange={(values) => {
              const next = Number(values[0]);
              if (Number.isFinite(next)) setDays(next);
            }}
            className="bg-card border-border chunk-sm rounded-full border-2 p-1"
          >
            {WINDOWS.map((w) => (
              <ToggleGroupItem
                key={w}
                value={String(w)}
                aria-label={`${w} days`}
                className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-8 rounded-full px-3.5 text-xs font-bold transition-colors"
              >
                {w}d
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Saved workouts and the week, above the history: this is the half of
            the screen you come here to *act* on, and the history below is the
            half you come to read. */}
        <Workouts onLogged={() => void load(days)} />

        {!summary ? (
          <div className="space-y-4">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : summary.sessions === 0 ? (
          <InsetGroup>
            <div className="px-4 py-12 text-center">
              <span aria-hidden className="animate-bob mb-3 block text-[40px] leading-none">
                🏃
              </span>
              <p className="text-muted-foreground text-body font-medium">
                Nothing logged in the last {days} days.
                <br />
                Tell the journal — “went for a {units === 'imperial' ? '3 mile' : '5km'} run”.
              </p>
            </div>
          </InsetGroup>
        ) : (
          /* grid-cols-1 is not the default it looks like: an implicit column
             is `auto`, whose floor is the widest thing inside — and a session
             description is set to truncate, so its min-content is the whole
             untruncated line. That floor was pushing the phone layout wider
             than the screen and turning on sideways scrolling. */
          <div className="grid grid-cols-1 gap-7 lg:grid-cols-2 lg:items-start">
            <InsetGroup title="🔁  Consistency">
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-figure text-large-title">{summary.active_days}</span>
                  <span className="text-muted-foreground text-sm font-medium">
                    active of {summary.days} days · {summary.sessions} session
                    {summary.sessions === 1 ? '' : 's'}
                  </span>
                </div>
                <Sparkline
                  points={summary.series}
                  accessor="value"
                  stroke="var(--exercise)"
                  variant="bars"
                  className="mt-4"
                  label="Calories burned per day"
                  tooltip={(point) => (
                    <DayReadout
                      date={point.local_date}
                      kcal={point.value ?? 0}
                      sessions={byDate.get(point.local_date) ?? []}
                    />
                  )}
                />
              </div>

              <div className="divide-border grid grid-cols-3 divide-x-2">
                <Stat label="Burned" value={summary.total_kcal.toLocaleString()} unit="kcal" />
                <Stat
                  label="Distance"
                  value={
                    summary.total_distance_km === null
                      ? '—'
                      : `${toDistance(summary.total_distance_km, units)}`
                  }
                  unit={distanceUnit(units)}
                />
                <Stat
                  label="Time"
                  value={
                    summary.total_duration_min === null
                      ? '—'
                      : formatDuration(summary.total_duration_min)
                  }
                  unit=""
                />
              </div>
            </InsetGroup>

            <InsetGroup
              title="🏃  Sessions"
              footer={`Burn is an estimate and is never netted off your calorie target. Correct one in the journal — “that run was closer to ${units === 'imperial' ? '4.5 miles' : '7km'}”.`}
            >
              {summary.entries.map((entry) => (
                <InsetRow key={entry.id}>
                  <span aria-hidden className="shrink-0 text-[20px] leading-none">
                    {exerciseEmoji(entry.description)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold">{entry.description}</p>
                    <p className="text-footnote text-muted-foreground font-medium">
                      {[
                        formatDate(entry.local_date, locale),
                        entry.distance_km !== null ? formatDistance(entry.distance_km, units) : null,
                        entry.duration_min !== null
                          ? `${Math.round(entry.duration_min)} min`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span className="text-figure shrink-0 text-body text-[var(--exercise-text)]">
                    −{Math.round(entry.kcal_burned)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void remove(entry)}
                    aria-label={`Delete ${entry.description}`}
                    className="text-muted-foreground hover:text-destructive -mr-2 size-8 shrink-0 rounded-full"
                  >
                    <Trash2 size={15} />
                  </Button>
                </InsetRow>
              ))}
            </InsetGroup>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * What one bar was.
 *
 * The number on its own is the least interesting half of a day — "260 kcal"
 * last Saturday means nothing until you remember it was the long ride — so the
 * sessions come with it. A rest day says so in words: an empty slot with no
 * caption reads as something the app lost rather than a day off.
 */
function DayReadout({
  date,
  kcal,
  sessions,
}: {
  date: string;
  kcal: number;
  sessions: ExerciseEntry[];
}) {
  const locale = useLocale();
  const units = useUnits();
  const distance = sessions.reduce((sum, s) => sum + (s.distance_km ?? 0), 0);
  const minutes = sessions.reduce((sum, s) => sum + (s.duration_min ?? 0), 0);
  const detail = [
    distance > 0 ? formatDistance(distance, units) : null,
    minutes > 0 ? formatDuration(minutes) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {/* Date and figure share a line. The card is parked on top of the chart
          it is explaining, so every line it costs is a bar you cannot see. */}
      <div className="flex items-baseline gap-3">
        <p className="text-footnote text-muted-foreground font-bold">{formatDate(date, locale)}</p>
        {sessions.length === 0 ? (
          <p className="text-footnote ml-auto font-semibold">Rest day</p>
        ) : (
          <p className="text-figure ml-auto text-body text-[var(--exercise-text)]">
            {Math.round(kcal).toLocaleString()}
            <span className="text-muted-foreground text-xs font-semibold">
              {' '}
              kcal{detail && ` · ${detail}`}
            </span>
          </p>
        )}
      </div>
      {sessions.length > 0 && (
        /* Three is as many as fits before the card covers the chart it is
           explaining; a fourth session is rarer than that limit is annoying. */
        <ul className="mt-1 space-y-0.5">
          {sessions.slice(0, 3).map((session) => (
            <li key={session.id} className="text-footnote flex items-baseline gap-1.5 font-medium">
              <span aria-hidden className="shrink-0">
                {exerciseEmoji(session.description)}
              </span>
              <span className="min-w-0 truncate">{session.description}</span>
            </li>
          ))}
          {sessions.length > 3 && (
            <li className="text-footnote text-muted-foreground font-medium">
              +{sessions.length - 3} more
            </li>
          )}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-footnote text-muted-foreground font-semibold">{label}</p>
      <p className="text-figure mt-0.5">
        {value}
        {value !== '—' && unit && (
          <span className="text-muted-foreground text-xs font-semibold"> {unit}</span>
        )}
      </p>
    </div>
  );
}

function formatDuration(minutes: number): string {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole}m`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

const formatDate = (isoDate: string, locale: Locale) =>
  formatDay(isoDate, locale, { weekday: 'short', day: 'numeric', month: 'short' });
