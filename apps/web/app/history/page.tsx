'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Calendar, CalendarDay } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * A month at a time, as a grid.
 *
 * This is the time-travel surface for the whole app: the Today screen used to
 * step one day at a time, which made "how did last month go?" a dozen taps and
 * gave no sense of shape. A grid answers both at once — the pattern is visible
 * without reading a single number, and any day is one tap away.
 */

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function HistoryPage() {
  // Month cursor as a first-of-month ISO date, so all arithmetic is on dates
  // rather than on a Date object in some ambient timezone.
  const [month, setMonth] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // Anchor on the server's idea of today: it honours day_start_hour, so a
        // 1am snack belongs to the evening before here as everywhere else.
        const today = await api.day();
        setMonth(`${today.local_date.slice(0, 7)}-01`);
        setSelected(today.local_date);
      } catch (e) {
        toast.error((e as Error).message);
      }
    })();
  }, []);

  const load = useCallback(async (firstOfMonth: string) => {
    try {
      setCalendar(await api.calendar(firstOfMonth, endOfMonth(firstOfMonth)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (month) void load(month);
  }, [month, load]);

  const byDate = useMemo(
    () => new Map((calendar?.days ?? []).map((day) => [day.local_date, day])),
    [calendar],
  );

  const cells = useMemo(() => (month ? monthGrid(month) : []), [month]);
  const selectedDay = selected ? byDate.get(selected) : undefined;
  const logged = (calendar?.days ?? []).filter((d) => d.logged);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8 lg:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-large-title">History</h1>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => setMonth((m) => (m ? shiftMonth(m, -1) : m))}
              className="text-muted-foreground rounded-full"
            >
              <ChevronLeft size={20} />
            </Button>
            <span className="min-w-36 text-center text-[15px] font-medium">
              {month ? monthLabel(month) : ''}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              onClick={() => setMonth((m) => (m ? shiftMonth(m, 1) : m))}
              className="text-muted-foreground rounded-full"
            >
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>

        {!calendar || !month ? (
          <Skeleton className="h-80 w-full rounded-2xl" />
        ) : (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
            <div className="bg-card rounded-2xl p-3 sm:p-4">
              <div className="text-footnote text-muted-foreground mb-1 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((label, i) => (
                  <div key={i} className="py-1 text-center font-medium">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {cells.map((date, i) =>
                  date === null ? (
                    <div key={`pad-${i}`} />
                  ) : (
                    <DayCell
                      key={date}
                      date={date}
                      day={byDate.get(date)}
                      selected={date === selected}
                      onSelect={() => setSelected(date)}
                      // The top row has no room above it inside the card.
                      placeAbove={i >= 7}
                    />
                  ),
                )}
              </div>

              <Legend />
            </div>

            <div className="mt-6 space-y-6 lg:mt-0">
              <InsetGroup title={selected ? formatFullDate(selected) : 'Day'}>
                {selectedDay && selectedDay.logged ? (
                  <div className="space-y-3 px-4 py-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="tnum text-large-title">
                        {selectedDay.kcal.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        of {selectedDay.target_kcal.toLocaleString() || '—'} kcal
                      </span>
                    </div>
                    <div className="text-footnote text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                      <span className="tnum">{selectedDay.protein_g}g protein</span>
                      {selectedDay.burned_kcal > 0 && (
                        <span className="tnum text-[var(--exercise)]">
                          −{selectedDay.burned_kcal} burned
                        </span>
                      )}
                      {selectedDay.weight_kg !== null && (
                        <span className="tnum">{selectedDay.weight_kg} kg</span>
                      )}
                    </div>
                    <Link
                      href={`/today?date=${selected}`}
                      className="text-[var(--calories-text)] inline-block text-[15px]"
                    >
                      Open in Today →
                    </Link>
                  </div>
                ) : (
                  <p className="text-muted-foreground px-4 py-6 text-center text-[15px]">
                    Nothing logged{selectedDay ? ' that day' : ' yet'}.
                  </p>
                )}
              </InsetGroup>

              <InsetGroup title="This month">
                <div className="divide-border grid grid-cols-3 divide-x">
                  <Stat label="Logged" value={`${logged.length}`} unit="days" />
                  <Stat
                    label="Avg intake"
                    value={
                      logged.length === 0
                        ? '—'
                        : Math.round(
                            logged.reduce((sum, d) => sum + d.kcal, 0) / logged.length,
                          ).toLocaleString()
                    }
                    unit="kcal"
                  />
                  <Stat
                    label="On target"
                    value={`${
                      logged.filter((d) => d.target_kcal > 0 && d.kcal <= d.target_kcal).length
                    }`}
                    unit="days"
                  />
                </div>
              </InsetGroup>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One cell.
 *
 * The fill says how the day went at a glance; the hover card is there for when
 * a glance is not enough. An unlogged day gets neither, because an empty day
 * and a day at zero calories are different facts and colouring them the same
 * would make a forgotten week look like a starved one.
 *
 * A logged day whose target is unknown still gets a fill — a neutral one. The
 * grid's first job is "did I log?", and that answer does not depend on having
 * a target to judge the day against. Before this, a month logged before any
 * target existed rendered completely blank, which read as never having used
 * the app at all.
 */
function DayCell({
  date,
  day,
  selected,
  onSelect,
  placeAbove,
}: {
  date: string;
  day: CalendarDay | undefined;
  selected: boolean;
  onSelect: () => void;
  placeAbove: boolean;
}) {
  const logged = day?.logged ?? false;
  const ratio = logged && day!.target_kcal > 0 ? day!.kcal / day!.target_kcal : null;
  const tone = toneFor(logged ? ratio : undefined);

  return (
    <div className="group relative hover:z-20 focus-within:z-20">
      <button
        type="button"
        onClick={onSelect}
        aria-label={
          logged
            ? `${formatFullDate(date)}, ${day!.kcal} kcal${
                day!.target_kcal > 0 ? ` of ${day!.target_kcal}` : ''
              }`
            : `${formatFullDate(date)}, nothing logged`
        }
        aria-pressed={selected}
        className={cn(
          'relative flex aspect-square w-full flex-col items-center justify-center rounded-xl',
          'transition-transform duration-[var(--dur-quick)] ease-[var(--ease-spring)]',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
          logged && 'group-hover:scale-110',
          selected && 'ring-foreground ring-2',
        )}
        style={{ background: tone.background }}
      >
        <span className={cn('tnum text-[13px]', tone.text)}>{Number(date.slice(8))}</span>
        {logged && day!.burned_kcal > 0 && (
          <span
            className="absolute bottom-1 size-[5px] rounded-full"
            style={{ background: 'var(--exercise)' }}
          />
        )}
      </button>

      {logged && <DayHoverCard date={date} day={day!} placeAbove={placeAbove} />}
    </div>
  );
}

/**
 * What that square actually was.
 *
 * Pointer-events are off so the card can never sit between the cursor and the
 * cell it describes, and it opens on `group-focus-within` as well as hover so
 * the keyboard reaches it. Rows after the first open upward, which keeps the
 * card off the cursor; the top row has nowhere to go but down.
 */
function DayHoverCard({
  date,
  day,
  placeAbove,
}: {
  date: string;
  day: CalendarDay;
  placeAbove: boolean;
}) {
  const over = day.target_kcal > 0 && day.kcal > day.target_kcal;

  return (
    <div
      role="tooltip"
      className={cn(
        'pointer-events-none absolute left-1/2 z-30 w-max max-w-[13rem] -translate-x-1/2',
        placeAbove ? 'bottom-full mb-2' : 'top-full mt-2',
        'bg-popover text-popover-foreground ring-border rounded-[12px] px-3 py-2 shadow-lg ring-1',
        'origin-center scale-95 opacity-0 transition-[opacity,transform]',
        'duration-[var(--dur-quick)] ease-[var(--ease-spring)]',
        'group-hover:scale-100 group-hover:opacity-100',
        'group-focus-within:scale-100 group-focus-within:opacity-100',
      )}
    >
      <p className="text-footnote text-muted-foreground">{formatFullDate(date)}</p>

      <p className="mt-0.5 flex items-baseline gap-1">
        <span className={cn('text-figure text-[17px]', over && 'text-foreground')}>
          {day.kcal.toLocaleString()}
        </span>
        <span className="text-footnote text-muted-foreground">
          {day.target_kcal > 0 ? `of ${day.target_kcal.toLocaleString()} kcal` : 'kcal'}
        </span>
      </p>

      <div className="text-footnote text-muted-foreground mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
        <span className="tnum">{day.protein_g}g protein</span>
        {day.burned_kcal > 0 && (
          <span className="tnum text-[var(--exercise)]">−{day.burned_kcal} burned</span>
        )}
        {day.weight_kg !== null && <span className="tnum">{day.weight_kg} kg</span>}
      </div>
    </div>
  );
}

/**
 * The fill for one day.
 *
 * The steps mix the accent into `--card` rather than into `transparent`, which
 * matters more than it looks. Fading a *deep* colour to transparent drains its
 * chroma before its lightness, so forest at 10% arrives as a grey smudge and
 * the whole scale reads as four shades of nothing. Mixing into the card keeps
 * every step on the accent's hue, and it stays correct in dark mode, where the
 * card is near-black and the same percentages walk the other way.
 */
function toneFor(ratio: number | null | undefined): { background: string; text: string } {
  // undefined — nothing logged. Left blank on purpose.
  if (ratio === undefined) return { background: 'transparent', text: 'text-muted-foreground' };
  // null — logged, but against no target we can hold it to. Neutral rather
  // than absent: it happened, we just have nothing to grade it against.
  if (ratio === null)
    return { background: 'color-mix(in oklch, var(--foreground) 9%, var(--card))', text: 'text-foreground' };
  // Over target is the one state that steps outside the scale — but it steps
  // to ink rather than to red. A month grid is exactly where a wall of red
  // squares would read as a verdict on the person rather than on the data.
  if (ratio > 1.05)
    return { background: 'color-mix(in oklch, var(--foreground) 26%, var(--card))', text: 'text-foreground' };
  if (ratio >= 0.85)
    return { background: 'color-mix(in oklch, var(--calories) 55%, var(--card))', text: 'text-foreground' };
  if (ratio >= 0.6)
    return { background: 'color-mix(in oklch, var(--calories) 28%, var(--card))', text: 'text-foreground' };
  return { background: 'color-mix(in oklch, var(--calories) 12%, var(--card))', text: 'text-foreground' };
}

function Legend() {
  const swatches: Array<{ label: string; ratio: number | null }> = [
    { label: 'Under', ratio: 0.5 },
    { label: 'On target', ratio: 0.95 },
    { label: 'Over', ratio: 1.2 },
    // Logged before any target existed — see toneFor.
    { label: 'No target', ratio: null },
  ];
  return (
    <div className="text-footnote text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
      {swatches.map(({ label, ratio }) => (
        <span key={label} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-[4px]"
            style={{ background: toneFor(ratio).background }}
          />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full" style={{ background: 'var(--exercise)' }} />
        Exercise
      </span>
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

// ---- Date arithmetic -------------------------------------------------------
// All of it on UTC-noon Dates built from ISO parts, so a month never shifts by
// one under a timezone offset.

function shiftMonth(firstOfMonth: string, delta: number): string {
  const [y, m] = firstOfMonth.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return date.toISOString().slice(0, 10);
}

function endOfMonth(firstOfMonth: string): string {
  const [y, m] = firstOfMonth.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

/** Six weeks of cells, Monday-first, padded with nulls before the 1st. */
function monthGrid(firstOfMonth: string): Array<string | null> {
  const [y, m] = firstOfMonth.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  // getUTCDay is Sunday-first; the grid is Monday-first.
  const lead = (first.getUTCDay() + 6) % 7;

  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) =>
      new Date(Date.UTC(y!, m! - 1, i + 1)).toISOString().slice(0, 10),
    ),
  ];
}

function monthLabel(firstOfMonth: string): string {
  const [y, m] = firstOfMonth.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatFullDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
