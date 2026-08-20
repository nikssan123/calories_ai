'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ExerciseEntry, ExerciseSummary } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Sparkline } from '@/components/Sparkline';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
  const [summary, setSummary] = useState<ExerciseSummary | null>(null);
  const [days, setDays] = useState<number>(30);

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
            className="bg-muted rounded-lg p-0.5"
          >
            {WINDOWS.map((w) => (
              <ToggleGroupItem
                key={w}
                value={String(w)}
                aria-label={`${w} days`}
                className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-7 rounded-md px-2.5 text-xs font-medium transition-colors"
              >
                {w}d
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {!summary ? (
          <div className="space-y-4">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : summary.sessions === 0 ? (
          <InsetGroup>
            <p className="text-muted-foreground px-4 py-12 text-center text-[15px]">
              Nothing logged in the last {days} days.
              <br />
              Tell the journal — “went for a 5km run”.
            </p>
          </InsetGroup>
        ) : (
          /* grid-cols-1 is not the default it looks like: an implicit column
             is `auto`, whose floor is the widest thing inside — and a session
             description is set to truncate, so its min-content is the whole
             untruncated line. That floor was pushing the phone layout wider
             than the screen and turning on sideways scrolling. */
          <div className="grid grid-cols-1 gap-7 lg:grid-cols-2 lg:items-start">
            <InsetGroup title="Consistency">
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-baseline gap-2">
                  <span className="tnum text-large-title">{summary.active_days}</span>
                  <span className="text-muted-foreground text-sm">
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
                />
              </div>

              <div className="divide-border grid grid-cols-3 divide-x">
                <Stat label="Burned" value={summary.total_kcal.toLocaleString()} unit="kcal" />
                <Stat
                  label="Distance"
                  value={summary.total_distance_km === null ? '—' : `${summary.total_distance_km}`}
                  unit="km"
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
              title="Sessions"
              footer="Burn is an estimate and is never netted off your calorie target. Correct one in the journal — “that run was closer to 7km”."
            >
              {summary.entries.map((entry) => (
                <InsetRow key={entry.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">{entry.description}</p>
                    <p className="text-footnote text-muted-foreground">
                      {[
                        formatDate(entry.local_date),
                        entry.distance_km !== null ? `${entry.distance_km} km` : null,
                        entry.duration_min !== null
                          ? `${Math.round(entry.duration_min)} min`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span className="tnum shrink-0 text-[15px] text-[var(--exercise)]">
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

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-footnote text-muted-foreground">{label}</p>
      <p className="tnum mt-0.5 font-semibold">
        {value}
        {value !== '—' && unit && (
          <span className="text-muted-foreground text-xs font-normal"> {unit}</span>
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

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
