'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Progress } from '@ct/shared';
import {
  QUALITY_COVERAGE_FLOOR,
  bodyWeightToKg,
  bodyWeightUnit,
  formatBodyWeight,
  formatNumber,
  formatWeightDelta,
  toBodyWeight,
} from '@ct/shared';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Sparkline } from '@/components/Sparkline';
import { Achievements } from '@/components/Achievements';
import { TrainingWeek } from '@/components/TrainingWeek';
import { WeeklyReview } from '@/components/WeeklyReview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

const WINDOWS = [14, 30, 90] as const;

/**
 * The four quality nutrients, in the order the Today panel draws them, and the
 * words each needs when it is the one on the chart. A ceiling is not aimed for
 * — "aim for 2,300mg of sodium" is advice nobody should be given — so the
 * direction picks the phrasing rather than a single line covering both.
 */
const NUTRIENTS = [
  { key: 'fiber_g', label: 'macro.fiber', unit: 'g' },
  { key: 'sodium_mg', label: 'nutrient.sodium', unit: 'mg' },
  { key: 'sat_fat_g', label: 'nutrient.satFat', unit: 'g' },
  { key: 'sugar_g', label: 'nutrient.sugar', unit: 'g' },
] as const satisfies readonly { key: string; label: StringKey; unit: string }[];

type NutrientKey = (typeof NUTRIENTS)[number]['key'];

export default function ProgressPage() {
  const t = useT();
  const locale = useLocale();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [days, setDays] = useState<number>(30);
  /**
   * Which nutrient the quality chart is drawing. Fiber to start with: it is the
   * only floor of the four and the only one whose shape over time is worth
   * watching unprompted — the ceilings are questions you go looking for.
   */
  const [nutrient, setNutrient] = useState<NutrientKey>('fiber_g');
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);
  const units = useUnits();

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
      // Typed in whatever they read, stored in kilograms. The API has one unit
      // and does not need to be told which one the keyboard was in.
      const kg = bodyWeightToKg(value, units);
      await api.logWeight(kg);
      setWeightInput('');
      toast.success(`Logged ${formatBodyWeight(kg, units)}`);
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
        <h1 className="text-large-title">{t('progress.title')}</h1>
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
              aria-label={t('progress.daysWindow')(w)}
              className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-8 rounded-full px-3.5 text-xs font-bold transition-colors"
            >
              {t('progress.daysShort')(w)}
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
          <InsetGroup title={t('progress.weightTitle')} className="lg:row-span-2">
            <div className="px-4 pt-4 pb-2">
              {progress.weight.current_kg === null ? (
                <p className="text-muted-foreground py-2 text-body font-medium">
                  {t('progress.noWeighIns')}
                </p>
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className="text-figure text-large-title">
                      {formatBodyWeight(progress.weight.current_kg, units)}
                    </span>
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
                        {formatWeightDelta(Math.abs(progress.weight.change_7d_kg), units, false)}{' '}
                        {t('progress.thisWeek')}
                      </span>
                    )}
                  </div>
                  <Sparkline points={progress.weight.series} stroke="var(--foreground)" className="mt-4" />
                </>
              )}
            </div>

            <div className="divide-border grid grid-cols-3 divide-x-2">
              <Stat
                label={t('progress.avg7d')}
                value={
                  progress.weight.average_7d_kg === null
                    ? '—'
                    : `${toBodyWeight(progress.weight.average_7d_kg, units)}`
                }
                unit={bodyWeightUnit(units)}
              />
              <Stat
                label={t('progress.sinceStart')}
                value={
                  progress.weight.change_since_start_kg === null
                    ? '—'
                    : `${progress.weight.change_since_start_kg > 0 ? '+' : ''}${toBodyWeight(progress.weight.change_since_start_kg, units)}`
                }
                unit={bodyWeightUnit(units)}
              />
              <Stat
                label={t('progress.toTarget')}
                value={
                  progress.weight.to_target_kg === null
                    ? '—'
                    : `${Math.abs(toBodyWeight(progress.weight.to_target_kg, units))}`
                }
                unit={bodyWeightUnit(units)}
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
                placeholder={t('progress.logTodaysWeight')(bodyWeightUnit(units))}
                className="bg-muted/60 border-border h-11 rounded-full border-2 px-4 text-body"
              />
              <Button
                type="submit"
                disabled={!weightInput || saving}
                className="h-11 rounded-full px-6"
              >
                {t('common.save')}
              </Button>
            </form>
          </InsetGroup>

          <InsetGroup title={t('progress.caloriesTitle')}>
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-figure text-large-title">
                  {progress.calories.average_kcal === null
                    ? '—'
                    : formatNumber(progress.calories.average_kcal, locale)}
                </span>
                <span className="text-muted-foreground text-sm font-medium">
                  {t('progress.avgDayTarget')(formatNumber(progress.calories.target_kcal, locale))}
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

          <InsetGroup title={t('progress.proteinTitle')}>
            <InsetRow className="py-4">
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-figure text-large-title">
                    {progress.protein.average_g === null ? '—' : `${progress.protein.average_g}g`}
                  </span>
                  <span className="text-muted-foreground text-sm font-medium">
                    {t('progress.avgDayTarget')(`${progress.protein.target_g}g`)}
                  </span>
                </div>
                {progress.protein.days_logged > 0 && (
                  <p className="text-muted-foreground text-footnote mt-1.5 font-medium">
                    {t('progress.hitTargetBefore')}{' '}
                    <span className="text-foreground font-extrabold">
                      {t('progress.ofDays')(
                        String(progress.protein.days_target_hit),
                        String(progress.protein.days_logged),
                      )}
                    </span>{' '}
                    {t('progress.hitTargetAfter')}
                  </p>
                )}
              </div>
            </InsetRow>
          </InsetGroup>

          {progress.quality.days_measured > 0 && (
            <InsetGroup
              title={t('progress.qualityTitle')}
              footer={
                progress.quality.coverage < QUALITY_COVERAGE_FLOOR
                  ? t('progress.qualityFooter')(
                      t('progress.days')(progress.quality.days_measured),
                      String(Math.round(progress.quality.coverage * 100)),
                    )
                  : undefined
              }
            >
              {/*
               * One line at a time, and you choose whose. Four sparklines at
               * once would be a dashboard nobody opens twice, but the question
               * "is my sodium creeping up?" deserves an answer here rather than
               * a trip to the journal — so the chips promote a nutrient into
               * the chart and the row underneath keeps the other three's
               * averages where they were.
               */}
              <div className="flex flex-wrap gap-1.5 px-4 pt-3.5">
                {NUTRIENTS.map((n) => (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => setNutrient(n.key)}
                    aria-pressed={nutrient === n.key}
                    aria-label={t('progress.chartNutrient')(t(n.label).toLocaleLowerCase(locale))}
                    className={cn(
                      'text-footnote rounded-full px-3 py-1.5 transition-colors',
                      nutrient === n.key
                        ? 'bg-muted text-foreground ring-1 ring-[var(--calories-text)]'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(n.label)}
                  </button>
                ))}
              </div>

              <QualityChart quality={progress.quality} nutrient={nutrient} />

              <div className="divide-border grid grid-cols-3 divide-x-2">
                {NUTRIENTS.filter((n) => n.key !== nutrient).map((n) => {
                  const value = progress.quality.average[n.key];
                  return (
                    <Stat
                      key={n.key}
                      label={t(n.label)}
                      value={value === null ? '—' : formatNumber(value, locale)}
                      unit={n.unit}
                    />
                  );
                })}
              </div>
            </InsetGroup>
          )}

          {/* Exercise has its own tab now; this is the pointer, not the data. */}
          <InsetGroup
            title={t('progress.exerciseTitle')}
            footer={t('progress.exerciseFooter')}
          >
            <Link href="/exercise" className="block transition-colors active:bg-muted/60">
              <InsetRow className="py-4">
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-figure text-large-title">{progress.exercise.sessions}</span>
                    <span className="text-muted-foreground text-sm font-medium">
                      {t('progress.sessionsOver')(
                        formatNumber(progress.exercise.total_kcal, locale),
                        String(days),
                      )}
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground shrink-0" />
              </InsetRow>
            </Link>
          </InsetGroup>

          {/* Both runs and the wall, under the charts. The charts answer "how
              am I doing"; these answer "how long have I kept it up", which is
              the question you ask second. */}
          <InsetGroup title={t('streak.training')}>
            <div className="px-3 py-4">
              <TrainingWeek
                week={progress.streaks.training_week}
                streak={progress.streaks.training}
              />
            </div>
          </InsetGroup>

          <div className="lg:col-span-2">
            <Achievements earned={progress.achievements} />
          </div>

          <div className="lg:col-span-2">
            <WeeklyReview />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * The headline figure and the line, for whichever nutrient is showing.
 *
 * Fiber is a floor and takes the app's positive green, exactly as its bar does
 * on Today. The other three are ceilings, which have no good news in them — a
 * high sodium line is not an achievement — so they run in plain ink, and the
 * aside says "keep under" rather than "aim for". Never red: crossing a ceiling
 * is worth seeing and is still not an alarm.
 */
function QualityChart({
  quality,
  nutrient,
}: {
  quality: Progress['quality'];
  nutrient: NutrientKey;
}) {
  const t = useT();
  const locale = useLocale();
  const { label, unit } = NUTRIENTS.find((n) => n.key === nutrient)!;
  const average = quality.average[nutrient];
  const target = quality.targets[nutrient];
  const floor = target.direction === 'floor';

  return (
    <div className="px-4 pt-2.5 pb-3">
      <div className="flex items-baseline gap-2">
        <span className="text-figure text-large-title">
          {average === null ? '—' : `${formatNumber(average, locale)}${unit}`}
        </span>
        <span className="text-muted-foreground text-sm font-medium">
          {t('progress.qualityLine')(
            t(label).toLocaleLowerCase(locale),
            floor ? t('progress.aimFor') : t('progress.keepUnder'),
            `${formatNumber(target.value, locale)}${unit}`,
          )}
        </span>
      </div>
      <Sparkline
        points={quality.series[nutrient]}
        stroke={floor ? 'var(--calories)' : 'var(--foreground)'}
        target={target.value}
        className="mt-4"
      />
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

