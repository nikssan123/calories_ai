'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { CoachDigest, CoachDigestStats, CoachRosterRow } from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { dateRange, shortDate } from './bits';

/**
 * The Monday digest, as it goes and as it went. See COACH.md §8.
 *
 * The preview is computed on request and written nowhere, so it is always
 * this week as it stands; the history is the rows the scheduler wrote at
 * 07:00 on each Monday, which is what the email carried and never changes.
 */
export function Digest() {
  const { profile } = useAuth();
  const [preview, setPreview] = useState<CoachDigestStats | null>(null);
  const [history, setHistory] = useState<CoachDigest[] | null>(null);
  const [selected, setSelected] = useState<string | 'preview'>('preview');

  const load = useCallback(async () => {
    try {
      const [next, sent] = await Promise.all([api.coach.digestPreview(), api.coach.digests()]);
      setPreview(next);
      setHistory(sent.digests);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!preview || !history) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const shown = selected === 'preview' ? preview : history.find((d) => d.week_start === selected)?.stats ?? preview;
  const sentAt = selected === 'preview' ? null : history.find((d) => d.week_start === selected)?.sent_at ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-large-title">Monday digest</h1>
        <p className="text-footnote text-muted-foreground mt-1">
          Sent at 07:00 in your timezone every Monday. Numbers only, no model, so it costs nothing to
          send. Turn it off under{' '}
          <Link href="/coach/settings" className="font-bold underline underline-offset-2">
            Settings
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Email stats={shown} name={profile?.display_name ?? null} email={profile?.email ?? null} sentAt={sentAt} />

        <aside className="space-y-2">
          <p className="text-eyebrow text-muted-foreground px-1.5">Mondays</p>
          <div className="bg-card border-border chunk divide-border divide-y-2 overflow-hidden rounded-2xl border-2">
            <HistoryRow active={selected === 'preview'} onClick={() => setSelected('preview')} title="This week, as it stands" hint="preview" />
            {history.map((digest) => (
              <HistoryRow
                key={digest.week_start}
                active={selected === digest.week_start}
                onClick={() => setSelected(digest.week_start)}
                title={dateRange(digest.stats.week.start, digest.stats.week.end)}
                hint={digest.sent_at ? `sent ${shortDate(digest.sent_at.slice(0, 10))}` : 'not sent'}
              />
            ))}
            {history.length === 0 && (
              <p className="text-footnote text-muted-foreground px-4 py-3">Nothing sent yet. The first one goes next Monday.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function HistoryRow({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn('block w-full px-4 py-3 text-left transition-colors', active ? 'bg-muted' : 'hover:bg-muted/60')}
    >
      <span className="block text-[14px] font-extrabold">{title}</span>
      <span className="text-muted-foreground block text-[12px]">{hint}</span>
    </button>
  );
}

/** The mail, drawn the way the layout module draws it: heading, facts, button. */
function Email({
  stats,
  name,
  email,
  sentAt,
}: {
  stats: CoachDigestStats;
  name: string | null;
  email: string | null;
  sentAt: string | null;
}) {
  const attention = stats.clients.filter((row) => row.flags.some((flag) => flag.severity !== 'info'));
  const rest = stats.clients.filter((row) => !attention.includes(row));
  const subject =
    attention.length === 0
      ? `Monday: everyone on track · ${stats.clients.length} on the roster`
      : `Monday: ${attention.length} client${attention.length === 1 ? '' : 's'} need${attention.length === 1 ? 's' : ''} you · ${stats.clients.length} on the roster`;
  const first = name?.trim().split(/\s+/)[0];

  return (
    <div className="bg-card border-border chunk max-w-2xl overflow-hidden rounded-2xl border-2">
      <div className="border-border grid gap-1 border-b-2 px-5 py-4 text-[13px]">
        <p><span className="text-muted-foreground inline-block w-16 font-extrabold">From</span> Day So Far Coach</p>
        <p><span className="text-muted-foreground inline-block w-16 font-extrabold">To</span> {email ?? '—'}</p>
        <p><span className="text-muted-foreground inline-block w-16 font-extrabold">Subject</span> {subject}</p>
        {sentAt && <p className="text-muted-foreground">Sent {new Date(sentAt).toLocaleString('en-GB')}</p>}
      </div>
      <div className="space-y-5 px-5 py-5">
        <div>
          <h2 className="text-title-2">Your roster, this Monday</h2>
          <p className="text-footnote text-muted-foreground">{dateRange(stats.week.start, stats.week.end)}</p>
        </div>
        <p className="text-body">
          {first ? `Good morning, ${first}. ` : 'Good morning. '}
          {stats.clients.length === 0
            ? 'Nobody is on your roster yet.'
            : attention.length === 0
              ? `All ${stats.clients.length} of your clients logged and stayed near target last week. Nothing to chase.`
              : `${attention.length} of your ${stats.clients.length} client${stats.clients.length === 1 ? '' : 's'} ${attention.length === 1 ? 'needs' : 'need'} a word this week.${
                  rest.length === 0 ? '' : rest.length === 1 ? ' The other one is on track.' : ` The other ${rest.length} are on track.`
                }`}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted rounded-xl px-4 py-3">
            <p className="text-figure tnum text-2xl">{attention.length}</p>
            <p className="text-footnote text-muted-foreground">{attention.length === 1 ? 'client needs you' : 'clients need you'}</p>
          </div>
          <div className="bg-muted rounded-xl px-4 py-3">
            <p className="text-figure tnum text-2xl">
              {stats.clients.filter((r) => r.days_logged === 7).length} of {stats.clients.length}
            </p>
            <p className="text-footnote text-muted-foreground">logged every day</p>
          </div>
        </div>

        {attention.length > 0 && <Section title="Needs you today" rows={attention} withWeek />}
        {rest.length > 0 && <Section title={attention.length > 0 ? 'Everyone else' : 'Your clients'} rows={rest} withWeek={false} />}

        <span className="bg-primary text-primary-foreground inline-block rounded-full px-4 py-2 text-[14px] font-extrabold">
          Open the roster
        </span>
        <p className="text-footnote text-muted-foreground">
          {stats.seats.used} of {stats.seats.limit} seats in use. Flags are the app's own signals: no log, protein
          short, weight stalled. Sorted by days logged, never by deficit.
        </p>
      </div>
    </div>
  );
}

/** The mail's person card, drawn the way `email/layout.ts` draws it. */
function Section({ title, rows, withWeek }: { title: string; rows: CoachRosterRow[]; withWeek: boolean }) {
  return (
    <div>
      <p className="text-eyebrow text-muted-foreground mb-2">{title}</p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.client.id} className="bg-muted grid gap-1.5 rounded-xl px-4 py-3">
            <span className="text-[15px] font-extrabold">{row.client.display_name ?? 'Unnamed'}</span>
            <span className={cn('text-[13px] font-bold', row.flags.length === 0 ? 'text-[var(--calories-text)]' : 'text-foreground')}>
              {row.flags.length > 0 ? row.flags.map(flagSentence).join(' · ') : 'On track'}
            </span>
            {withWeek && (
              <span className="mt-1 flex gap-1.5">
                {row.days.map((day) => {
                  const hit = day.logged && Math.abs(day.kcal - row.kcal.target) <= row.kcal.target * 0.1;
                  return (
                    <span
                      key={day.local_date}
                      className={cn(
                        'flex flex-1 flex-col items-center rounded-lg py-1.5 text-[11px] font-extrabold',
                        hit && 'bg-[var(--calories)] text-[var(--primary-foreground)]',
                        !hit && day.logged && 'bg-card',
                        !day.logged && 'bg-border/60 text-muted-foreground',
                      )}
                    >
                      {new Intl.DateTimeFormat('en-GB', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${day.local_date}T12:00:00Z`))}
                      {day.logged && <span className="tnum text-[10px] font-bold opacity-75">{day.kcal.toLocaleString('en-GB')}</span>}
                    </span>
                  );
                })}
              </span>
            )}
            <span className="text-muted-foreground tnum text-[12px]">
              {row.days_logged} of 7 days logged
              {row.protein.average_g !== null && ` · ${row.protein.average_g} g protein a day against ${row.protein.target_g}`}
              {' · '}
              {row.weight.weigh_ins === 0
                ? 'no weigh-ins'
                : row.weight.change_4w_kg === null
                  ? 'first weigh-ins'
                  : row.weight.change_4w_kg === 0
                    ? 'no change on the scale over 4 weeks'
                    : `${row.weight.change_4w_kg < 0 ? 'down' : 'up'} ${Math.abs(row.weight.change_4w_kg).toFixed(1)} kg over 4 weeks`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function flagSentence(flag: CoachRosterRow['flags'][number]): string {
  switch (flag.kind) {
    case 'no_log':
      return flag.days === null ? 'Nothing logged yet' : flag.days === 1 ? 'Nothing logged since yesterday' : `Nothing logged for ${flag.days} days`;
    case 'protein_short':
      return 'Protein under target on the days logged';
    case 'kcal_over':
      return 'Over the calorie target on average';
    case 'kcal_under':
      return 'Well under the calorie target on average';
    case 'stalled':
      return 'Weight flat for four weeks, on a cut';
    case 'new':
      return 'Joined this week';
  }
}
