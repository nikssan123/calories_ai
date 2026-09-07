'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Send, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import type { CoachClientWeek, DaySummary, FoodEntry, TrendPoint } from '@ct/shared';
import { api } from '@/lib/api';
import { Sparkline } from '@/components/Sparkline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Avatar, dateRange, goalLabel, longDate, shortDate, signedKg, timeIn, weekdayInitial } from './bits';

/**
 * One client, one week. See COACH.md §6.
 *
 * Left: the seven days as stacked macro bars against the target line, then
 * one day's meals with their photos. Right: the scale over eight weeks, the
 * targets editor, the comment composer, and the coach's own notes. Every
 * number here is a `DaySummary` the client's own app would draw — the page
 * cannot show the coach a figure the client does not have.
 */
export function ClientWeek({ clientId }: { clientId: string }) {
  const [week, setWeek] = useState<CoachClientWeek | null>(null);
  const [missing, setMissing] = useState(false);
  const [end, setEnd] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.coach.clientWeek(clientId, end);
      setWeek(next);
      setSelected((current) => {
        if (current && next.days.some((day) => day.local_date === current)) return current;
        const lastLogged = [...next.days].reverse().find((day) => day.food_entries.length > 0);
        return (lastLogged ?? next.days.at(-1))?.local_date ?? null;
      });
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) setMissing(true);
      else toast.error((e as Error).message);
    }
  }, [clientId, end]);

  useEffect(() => {
    void load();
  }, [load]);

  if (missing) {
    return (
      <div className="space-y-4">
        <Link href="/coach" className="text-muted-foreground inline-flex items-center gap-1.5 text-body font-bold">
          <ArrowLeft size={16} /> Roster
        </Link>
        <p className="text-title-2">This client is not on your roster.</p>
        <p className="text-body text-muted-foreground">
          They may have stopped sharing. Nothing of theirs is shown once the link ends.
        </p>
      </div>
    );
  }
  if (!week) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const day = week.days.find((d) => d.local_date === selected) ?? week.days.at(-1)!;
  const canGoForward = week.week.end < week.today;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/coach" className="text-muted-foreground inline-flex items-center gap-1.5 text-body font-bold">
          <ArrowLeft size={16} /> Roster
        </Link>
        <div className="flex items-center gap-3">
          <Avatar name={week.client.display_name} size="lg" />
          <div>
            <h1 className="text-large-title">{week.client.display_name ?? 'Unnamed'}</h1>
            <p className="text-footnote text-muted-foreground mt-0.5">
              {goalLabel(week.client.goal)} · {week.client.timezone} · sharing since{' '}
              {shortDate(week.client.accepted_at.slice(0, 10))}
              {week.client.seat === 'free' && ' · on the free tier'}
            </p>
          </div>
        </div>
        <p className="text-footnote text-muted-foreground ml-auto font-bold">
          Targets{' '}
          <span className="text-foreground tnum">
            {week.targets.kcal.toLocaleString('en-GB')} kcal · {week.targets.protein_g} P ·{' '}
            {week.targets.carbs_g} C · {week.targets.fat_g} F
          </span>
          {week.targets.source === 'coach' && ' · set by you'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="space-y-6">
          <Card
            title="The week"
            trailing={
              <span className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous week"
                  onClick={() => setEnd(addDays(week.week.start, -1))}
                >
                  <ChevronLeft />
                </Button>
                <span className="text-footnote text-muted-foreground tnum">
                  {dateRange(week.week.start, week.week.end)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next week"
                  disabled={!canGoForward}
                  onClick={() => setEnd(addDays(week.week.end, 7) > week.today ? undefined : addDays(week.week.end, 7))}
                >
                  <ChevronRight />
                </Button>
              </span>
            }
          >
            <WeekStrip days={week.days} target={week.targets.kcal} selected={day.local_date} onSelect={setSelected} />
            <div className="text-footnote text-muted-foreground mt-3 flex gap-4 font-bold">
              <Legend color="var(--protein)" label="Protein" />
              <Legend color="var(--carbs)" label="Carbs" />
              <Legend color="var(--fat)" label="Fat" />
              <span className="ml-auto">dashed line is the calorie target</span>
            </div>
          </Card>

          <Card
            title={longDate(day.local_date)}
            trailing={
              <span className="text-footnote text-muted-foreground tnum">
                {Math.round(day.consumed.kcal).toLocaleString('en-GB')} of{' '}
                {day.targets.kcal.toLocaleString('en-GB')} kcal · {Math.round(day.consumed.protein_g)} of{' '}
                {day.targets.protein_g} g protein
                {day.targets.protein_g - day.consumed.protein_g > 10 &&
                  ` · ${Math.round(day.targets.protein_g - day.consumed.protein_g)} g short`}
              </span>
            }
          >
            {day.food_entries.length === 0 ? (
              <p className="text-body text-muted-foreground py-6 text-center">
                {week.client.scope.meals ? 'Nothing logged this day.' : 'Meals are not shared.'}
              </p>
            ) : (
              <ol className="divide-border divide-y-2">
                {day.food_entries.map((entry) => (
                  <MealRow key={entry.id} entry={entry} photoUrl={week.photo_urls[entry.photo_id ?? '']} timezone={week.client.timezone} />
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <WeightCard week={week} />
          <TargetsCard week={week} onSaved={load} />
          <CommentsCard week={week} day={day} onSent={load} />
          <NotesCard week={week} />
          <div className="px-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={async () => {
                if (!window.confirm(`Stop coaching ${week.client.display_name ?? 'this client'}? They keep every comment already in their journal.`)) return;
                try {
                  await api.coach.removeClient(clientId);
                  toast.success('Removed from your roster.');
                  window.location.href = '/coach';
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <UserMinus size={15} /> Remove from roster
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---- The week -----------------------------------------------------------------

function WeekStrip({
  days,
  target,
  selected,
  onSelect,
}: {
  days: DaySummary[];
  target: number;
  selected: string;
  onSelect: (localDate: string) => void;
}) {
  const H = 150;
  const scale = Math.max(target * 1.25, ...days.map((d) => d.consumed.kcal * 1.08), 1);
  const px = (kcal: number) => Math.max(kcal > 0 ? 2 : 0, Math.round((kcal / scale) * H));
  return (
    <div className="relative grid grid-cols-7 gap-2.5" style={{ height: H + 52 }}>
      <div
        className="border-foreground/45 pointer-events-none absolute right-0 left-0 border-t-2 border-dashed"
        style={{ bottom: 52 + Math.round((target / scale) * H) }}
      >
        <span className="text-muted-foreground absolute -top-5 right-0 text-[11px] font-extrabold">
          {target.toLocaleString('en-GB')} kcal
        </span>
      </div>
      {days.map((day) => {
        const p = day.consumed.protein_g * 4;
        const f = day.consumed.fat_g * 9;
        const c = Math.max(0, day.consumed.kcal - p - f);
        const logged = day.food_entries.length > 0 || day.consumed.kcal > 0;
        const active = day.local_date === selected;
        return (
          <button
            key={day.local_date}
            type="button"
            onClick={() => onSelect(day.local_date)}
            aria-pressed={active}
            className={cn('group flex h-full flex-col justify-end rounded-xl outline-none', active && 'bg-muted/60')}
            title={`${day.local_date}: ${Math.round(day.consumed.kcal)} kcal, ${Math.round(day.consumed.protein_g)} g protein`}
          >
            {logged ? (
              <span className="flex flex-col-reverse overflow-hidden rounded-t-lg rounded-b">
                <span style={{ height: px(p), background: 'var(--protein)' }} />
                <span style={{ height: px(c), background: 'var(--carbs)' }} />
                <span style={{ height: px(f), background: 'var(--fat)' }} />
              </span>
            ) : (
              <span className="border-input h-7 rounded-lg border-2 border-dashed" />
            )}
            <span className="mt-2 text-center text-[12px] leading-tight">
              <span className={cn('tnum block font-extrabold', active && 'text-[var(--calories-text)]')}>
                {logged ? Math.round(day.consumed.kcal).toLocaleString('en-GB') : '—'}
              </span>
              <span className="text-muted-foreground block font-bold">
                {logged ? `${Math.round(day.consumed.protein_g)} g P` : 'no log'}
              </span>
              <span className="text-muted-foreground block text-[10px] font-bold tracking-widest">
                {weekdayInitial(day.local_date)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function MealRow({ entry, photoUrl, timezone }: { entry: FoodEntry; photoUrl?: string; timezone: string }) {
  const src = photoUrl ? api.photoUrl(photoUrl) : null;
  return (
    <li className="grid grid-cols-[56px_1fr_auto] items-center gap-3 py-2.5">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-14 rounded-xl object-cover" loading="lazy" />
      ) : (
        <span className="bg-muted text-muted-foreground grid size-14 place-items-center rounded-xl text-[10px] font-extrabold tracking-wider uppercase">
          {entry.source}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-extrabold">{entry.description ?? entry.items.map((i) => i.name).join(', ')}</span>
        <span className="text-muted-foreground block text-[12px]">
          {entry.meal} · {timeIn(entry.eaten_at, timezone)}
          {entry.items.length > 1 && ` · ${entry.items.length} items`}
          {entry.photo_id && entry.source !== 'photo' && ' · photo'}
        </span>
      </span>
      <span className="tnum text-right">
        <span className="block font-extrabold">{Math.round(entry.kcal).toLocaleString('en-GB')} kcal</span>
        <span className="block text-[12px] font-bold text-[var(--protein-text)]">{Math.round(entry.protein_g)} g protein</span>
      </span>
    </li>
  );
}

// ---- The side column ---------------------------------------------------------

function WeightCard({ week }: { week: CoachClientWeek }) {
  const points: TrendPoint[] = useMemo(
    () => week.weights.map((w) => ({ local_date: w.local_date, value: w.weight_kg, average: w.weight_kg })),
    [week.weights],
  );
  const first = week.weights[0]?.weight_kg ?? null;
  const last = week.weights.at(-1)?.weight_kg ?? null;
  const change = first !== null && last !== null && week.weights.length > 1 ? Math.round((last - first) * 10) / 10 : null;

  return (
    <Card
      title="Weight"
      trailing={
        <span className="text-footnote text-muted-foreground tnum">
          {!week.client.scope.weight
            ? 'not shared'
            : change === null
              ? week.weights.length === 1
                ? 'one weigh-in'
                : 'no weigh-ins yet'
              : `${signedKg(change)} over ${week.weights.length} weigh-ins`}
        </span>
      }
    >
      {last !== null && <p className="text-figure tnum text-2xl">{last.toFixed(1)} kg</p>}
      {points.length >= 2 ? (
        <Sparkline points={points} accessor="value" stroke="var(--calories)" height={90} label="Weight over eight weeks" />
      ) : (
        <p className="text-footnote text-muted-foreground mt-1">The chart draws from the second weigh-in.</p>
      )}
    </Card>
  );
}

function TargetsCard({ week, onSaved }: { week: CoachClientWeek; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    kcal: week.targets.kcal,
    protein_g: week.targets.protein_g,
    carbs_g: week.targets.carbs_g,
    fat_g: week.targets.fat_g,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      kcal: week.targets.kcal,
      protein_g: week.targets.protein_g,
      carbs_g: week.targets.carbs_g,
      fat_g: week.targets.fat_g,
    });
  }, [week.targets]);

  const field = (key: keyof typeof form, label: string) => (
    <label className="text-eyebrow text-muted-foreground grid gap-1">
      {label}
      <Input
        type="number"
        inputMode="numeric"
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
        className="tnum h-10"
      />
    </label>
  );

  return (
    <Card title="Targets">
      <form
        className="grid grid-cols-4 gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await api.coach.setTargets(week.client.id, form);
            toast.success(`Targets saved. ${week.client.display_name ?? 'They'} sees them as set by you.`);
            await onSaved();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {field('kcal', 'kcal')}
        {field('protein_g', 'Protein')}
        {field('carbs_g', 'Carbs')}
        {field('fat_g', 'Fat')}
        <div className="col-span-4 flex items-center justify-between gap-2 pt-1">
          <span className="text-footnote text-muted-foreground">Saved as “set by your coach”.</span>
          <Button type="submit" size="sm" disabled={busy}>
            Save targets
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CommentsCard({ week, day, onSent }: { week: CoachClientWeek; day: DaySummary; onSent: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const name = week.client.display_name?.split(' ')[0] ?? 'them';

  return (
    <Card title={`Comment on ${shortDate(day.local_date)}`}>
      {week.comments.length > 0 && (
        <ol className="mb-3 space-y-2">
          {week.comments.slice(0, 5).map((comment) => (
            <li key={comment.id} className="grid grid-cols-[28px_1fr] gap-2">
              <Avatar name={comment.coach_name} size="sm" />
              <div>
                <p className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-[14px]">{comment.body}</p>
                <p className="text-muted-foreground mt-0.5 text-[11px] font-bold">
                  {shortDate(comment.local_date)} · {comment.read_at ? 'read' : 'unread'}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          try {
            await api.coach.addComment(week.client.id, { local_date: day.local_date, body: text.trim() });
            setText('');
            toast.success(`Sent to ${name}'s journal, with a push.`);
            await onSent();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`Lands in ${name}'s journal with a push.`}
          rows={3}
          maxLength={1000}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-footnote text-muted-foreground">Push: “{firstName(week)} commented on {shortDate(day.local_date).split(' ')[0]}”.</span>
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>
            <Send size={14} /> Send
          </Button>
        </div>
      </form>
    </Card>
  );
}

function NotesCard({ week }: { week: CoachClientWeek }) {
  const [notes, setNotes] = useState(week.notes);
  const [saved, setSaved] = useState(week.notes);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNotes(week.notes);
    setSaved(week.notes);
  }, [week.notes]);

  return (
    <Card title="Private notes">
      <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={10_000} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-footnote text-muted-foreground">Only you see these. They never reach the phone.</span>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || notes === saved}
          onClick={async () => {
            setBusy(true);
            try {
              await api.coach.setNotes(week.client.id, notes);
              setSaved(notes);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save notes
        </Button>
      </div>
    </Card>
  );
}

// ---- Bits ---------------------------------------------------------------------

function Card({ title, trailing, children }: { title: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card border-border chunk rounded-2xl border-2 px-5 py-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-title-2 text-[17px]">{title}</h2>
        {trailing}
      </header>
      {children}
    </section>
  );
}

function firstName(week: CoachClientWeek): string {
  return week.comments[0]?.coach_name?.split(' ')[0] ?? 'Your coach';
}

function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
