'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import type { Progress, TrendPoint } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
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

      {!progress ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-7 lg:grid-cols-2 lg:items-start">
          {/* §12: lead with the trend, not any individual day. */}
          <InsetGroup title="Weight" className="lg:row-span-2">
            <div className="px-4 pt-4 pb-2">
              {progress.weight.current_kg === null ? (
                <p className="text-muted-foreground py-2 text-[15px]">
                  No weigh-ins yet. Log one below, or just tell the journal.
                </p>
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="tnum text-large-title">{progress.weight.current_kg} kg</span>
                    {progress.weight.change_7d_kg !== null && progress.weight.change_7d_kg !== 0 && (
                      <span
                        className={cn(
                          'tnum flex items-center gap-0.5 text-sm font-medium',
                          progress.weight.change_7d_kg < 0
                            ? 'text-[var(--protein)]'
                            : 'text-[var(--calories)]',
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
                  <Sparkline points={progress.weight.series} accessor="average" stroke="var(--foreground)" />
                </>
              )}
            </div>

            <div className="grid grid-cols-3 divide-x divide-border">
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
                className="bg-muted/60 h-10 rounded-xl border-0 text-[15px]"
              />
              <Button
                type="submit"
                disabled={!weightInput || saving}
                className="h-10 rounded-xl px-5"
              >
                Save
              </Button>
            </form>
          </InsetGroup>

          <InsetGroup title="Calories">
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-baseline gap-2">
                <span className="tnum text-large-title">
                  {progress.calories.average_kcal === null
                    ? '—'
                    : progress.calories.average_kcal.toLocaleString()}
                </span>
                <span className="text-muted-foreground text-sm">
                  avg/day · target {progress.calories.target_kcal.toLocaleString()}
                </span>
              </div>
              <Sparkline
                points={progress.calories.series}
                accessor="average"
                stroke="var(--calories)"
                target={progress.calories.target_kcal}
              />
            </div>
          </InsetGroup>

          <InsetGroup title="Protein">
            <InsetRow className="py-4">
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="tnum text-large-title">
                    {progress.protein.average_g === null ? '—' : `${progress.protein.average_g}g`}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    avg/day · target {progress.protein.target_g}g
                  </span>
                </div>
                {progress.protein.days_logged > 0 && (
                  <p className="text-muted-foreground mt-1.5 text-footnote">
                    Hit the target on{' '}
                    <span className="text-foreground font-medium">
                      {progress.protein.days_target_hit} of {progress.protein.days_logged}
                    </span>{' '}
                    logged days.
                  </p>
                )}
              </div>
            </InsetRow>
          </InsetGroup>

          <InsetGroup
            title="Exercise"
            footer="Ask the journal anything about this data — “why haven’t I lost weight this week?”"
          >
            <InsetRow className="py-4">
              <span className="tnum text-large-title">{progress.exercise.sessions}</span>
              <span className="text-muted-foreground text-sm">
                sessions · ~{progress.exercise.total_kcal.toLocaleString()} kcal over {days} days
              </span>
            </InsetRow>
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
        {value !== '—' && <span className="text-muted-foreground text-xs font-normal"> {unit}</span>}
      </p>
    </div>
  );
}

/** Minimal inline chart — no dependency, and trivially replaced in React Native. */
function Sparkline({
  points,
  accessor,
  stroke,
  target,
}: {
  points: TrendPoint[];
  accessor: 'value' | 'average';
  stroke: string;
  target?: number;
}) {
  const values = points.map((p) => p[accessor]);
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return null;

  const width = 320;
  const height = 72;
  const lo = Math.min(...present, ...(target ? [target] : []));
  const hi = Math.max(...present, ...(target ? [target] : []));
  // Pad the domain so the trace sits in the body of the chart rather than
  // hugging an edge — a flat series against a distant target looks broken
  // otherwise.
  const pad = (hi - lo || Math.abs(hi) * 0.1 || 1) * 0.18;
  const min = lo - pad;
  const max = hi + pad;
  const span = max - min || 1;

  const x = (i: number) => (i / Math.max(1, points.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / span) * (height - 10) - 5;

  // Skip gaps rather than drawing a line through days with no data.
  let path = '';
  let penDown = false;
  points.forEach((point, i) => {
    const v = point[accessor];
    if (v === null) {
      penDown = false;
      return;
    }
    path += `${penDown ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    penDown = true;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 w-full" role="img" aria-hidden="true">
      {target !== undefined && (
        <line
          x1="0"
          x2={width}
          y1={y(target)}
          y2={y(target)}
          className="stroke-border"
          strokeDasharray="3 5"
          strokeWidth="1.5"
        />
      )}
      <path
        d={path.trim()}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
