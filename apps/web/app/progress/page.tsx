'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Progress } from '@ct/shared';
import { QUALITY_COVERAGE_FLOOR } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Sparkline } from '@/components/Sparkline';
import { WeeklyReview } from '@/components/WeeklyReview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

const WINDOWS = [14, 30, 90] as const;

export default function ProgressPage() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [days, setDays] = useState<number>(30);
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(window: number) {
    try {
      setProgress(await api.progress(window));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  useEffect(() => {
    void load(days);
  }, [days]);

  async function submitWeight(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(weightInput);
    if (!Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      await api.logWeight(value);
      setWeightInput('');
      toast.success(`Logged ${value} kg`);
      await load(days);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8 lg:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-7">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-large-title">Progress</h1>
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

      {!progress ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-7 lg:grid-cols-2 lg:items-start">
          {/* §12: lead with the trend, not any individual day. */}
          <InsetGroup title="⚖️  Weight" className="lg:row-span-2">
            <div className="px-4 pt-4 pb-2">
              {progress.weight.current_kg === null ? (
                <p className="text-muted-foreground py-2 text-body font-medium">
                  No weigh-ins yet. Log one below, or just tell the journal.
                </p>
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="text-figure text-large-title">{progress.weight.current_kg} kg</span>
                    {progress.weight.change_7d_kg !== null && progress.weight.change_7d_kg !== 0 && (
                      <span
                        className={cn(
                          'tnum flex items-center gap-0.5 text-sm font-bold',
                          progress.weight.change_7d_kg < 0
                            ? 'text-[var(--positive)]'
                            : 'text-[var(--calories-text)]',
                        )}
                      >
                        {progress.weight.change_7d_kg < 0 ? (
                          <ArrowDown size={14} />
                        ) : (
                          <ArrowUp size={14} />
                        )}
                        {Math.abs(progress.weight.change_7d_kg)} kg this week
                      </span>
                    )}
                  </div>
                  <Sparkline points={progress.weight.series} stroke="var(--foreground)" className="mt-4" />
                </>
              )}
            </div>

            <div className="divide-border grid grid-cols-3 divide-x-2">
              <Stat
                label="7-day avg"
                value={progress.weight.average_7d_kg === null ? '—' : `${progress.weight.average_7d_kg}`}
                unit="kg"
              />
              <Stat
                label="Since start"
                value={
                  progress.weight.change_since_start_kg === null
                    ? '—'
                    : `${progress.weight.change_since_start_kg > 0 ? '+' : ''}${progress.weight.change_since_start_kg}`
                }
                unit="kg"
              />
              <Stat
                label="To target"
                value={
                  progress.weight.to_target_kg === null
                    ? '—'
                    : `${Math.abs(progress.weight.to_target_kg)}`
                }
                unit="kg"
              />
            </div>

            <form onSubmit={submitWeight} className="flex gap-2 p-3">
              <Input
                type="number"
                step="0.1"
                inputMode="decimal"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="Log today's weight"
                className="bg-muted/60 border-border h-11 rounded-full border-2 px-4 text-body"
              />
              <Button
                type="submit"
                disabled={!weightInput || saving}
                className="h-11 rounded-full px-6"
              >
                Save
              </Button>
            </form>
          </InsetGroup>

          <InsetGroup title="🔥  Calories">
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-figure text-large-title">
                  {progress.calories.average_kcal === null
                    ? '—'
                    : progress.calories.average_kcal.toLocaleString()}
                </span>
                <span className="text-muted-foreground text-sm font-medium">
                  avg/day · target {progress.calories.target_kcal.toLocaleString()}
                </span>
              </div>
              <Sparkline
                points={progress.calories.series}
                stroke="var(--calories)"
                target={progress.calories.target_kcal}
                className="mt-4"
              />
            </div>
          </InsetGroup>

          <InsetGroup title="💪  Protein">
            <InsetRow className="py-4">
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-figure text-large-title">
                    {progress.protein.average_g === null ? '—' : `${progress.protein.average_g}g`}
                  </span>
                  <span className="text-muted-foreground text-sm font-medium">
                    avg/day · target {progress.protein.target_g}g
                  </span>
                </div>
                {progress.protein.days_logged > 0 && (
                  <p className="text-muted-foreground text-footnote mt-1.5 font-medium">
                    Hit the target on{' '}
                    <span className="text-foreground font-extrabold">
                      {progress.protein.days_target_hit} of {progress.protein.days_logged}
                    </span>{' '}
                    logged days.
                  </p>
                )}
              </div>
            </InsetRow>
          </InsetGroup>

          {progress.quality.days_measured > 0 && (
            <InsetGroup
              title="🥦  Diet quality"
              footer={
                progress.quality.coverage < QUALITY_COVERAGE_FLOOR
                  ? `Averaged over ${progress.quality.days_measured} day${progress.quality.days_measured === 1 ? '' : 's'} — ${Math.round(progress.quality.coverage * 100)}% of what you logged carries these figures.`
                  : undefined
              }
            >
              {/*
               * Fiber gets the line, and the other three get a row of figures.
               * Fiber is the only floor here and the only one whose shape over
               * time tells you anything — a ceiling is a question about a week,
               * not a curve to watch. Four sparklines would be a dashboard
               * nobody opens twice.
               */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-figure text-large-title">
                    {progress.quality.average.fiber_g === null
                      ? '—'
                      : `${progress.quality.average.fiber_g}g`}
                  </span>
                  <span className="text-muted-foreground text-sm font-medium">
                    fiber avg/day · aim for {progress.quality.targets.fiber_g.value}g
                  </span>
                </div>
                <Sparkline
                  points={progress.quality.fiber_series}
                  stroke="var(--calories)"
                  target={progress.quality.targets.fiber_g.value}
                  className="mt-4"
                />
              </div>

              <div className="divide-border grid grid-cols-3 divide-x-2">
                <Stat
                  label="Sodium"
                  value={
                    progress.quality.average.sodium_mg === null
                      ? '—'
                      : progress.quality.average.sodium_mg.toLocaleString()
                  }
                  unit="mg"
                />
                <Stat
                  label="Sat fat"
                  value={
                    progress.quality.average.sat_fat_g === null
                      ? '—'
                      : `${progress.quality.average.sat_fat_g}`
                  }
                  unit="g"
                />
                <Stat
                  label="Sugar"
                  value={
                    progress.quality.average.sugar_g === null
                      ? '—'
                      : `${progress.quality.average.sugar_g}`
                  }
                  unit="g"
                />
              </div>
            </InsetGroup>
          )}

          {/* Exercise has its own tab now; this is the pointer, not the data. */}
          <InsetGroup
            title="🏃  Exercise"
            footer="Ask the journal anything about this data — “why haven’t I lost weight this week?”"
          >
            <Link href="/exercise" className="block transition-colors active:bg-muted/60">
              <InsetRow className="py-4">
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-figure text-large-title">{progress.exercise.sessions}</span>
                    <span className="text-muted-foreground text-sm font-medium">
                      sessions · ~{progress.exercise.total_kcal.toLocaleString()} kcal over {days}{' '}
                      days
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground shrink-0" />
              </InsetRow>
            </Link>
          </InsetGroup>

          <div className="lg:col-span-2">
            <WeeklyReview />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-footnote text-muted-foreground font-semibold">{label}</p>
      <p className="text-figure mt-0.5">
        {value}
        {value !== '—' && (
          <span className="text-muted-foreground text-xs font-semibold"> {unit}</span>
        )}
      </p>
    </div>
  );
}

