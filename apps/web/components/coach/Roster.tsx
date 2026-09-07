'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { CoachRoster, CoachRosterRow } from '@ct/shared';
import { api } from '@/lib/api';
import { Cell, DataTable } from '@/components/admin/DataTable';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Avatar,
  Bar,
  DotStrip,
  FlagPill,
  OnTrack,
  daysUntil,
  goalLabel,
  longDate,
  signedKg,
  whenIn,
} from './bits';

type Sort = 'attention' | 'logged' | 'name';

/**
 * The Monday screen. See COACH.md §6.
 *
 * One row per client, sorted by who needs attention — the server's order,
 * which puts silence first and never ranks anybody by deficit. Everything on
 * the row is the week just gone: seven dots, the averages against target, the
 * scale over four weeks, and the flags the nudge pass would have raised.
 *
 * Two shapes on the same line the admin panel draws: a table from `lg` up, and
 * cards below it, where eight columns would put the flags off the edge of a
 * phone with nothing to say they were there.
 */
export function Roster() {
  const [roster, setRoster] = useState<CoachRoster | null>(null);
  const [sort, setSort] = useState<Sort>('attention');
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      setRoster(await api.coach.roster());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!roster) return [];
    const list = [...roster.clients];
    if (sort === 'name') {
      list.sort((a, b) => (a.client.display_name ?? '').localeCompare(b.client.display_name ?? ''));
    } else if (sort === 'logged') {
      list.sort((a, b) => b.days_logged - a.days_logged);
    }
    return list;
  }, [roster, sort]);

  if (!roster) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const attention = roster.clients.filter((row) =>
    row.flags.some((flag) => flag.severity !== 'info'),
  ).length;
  const everyDay = roster.clients.filter((row) => row.days_logged === 7).length;
  const trialDays = daysUntil(roster.account.trial_ends_at);

  const open = (row: CoachRosterRow) => router.push(`/coach/clients/${row.client.id}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-large-title">{longDate(roster.today)}</h1>
          <p className="text-footnote text-muted-foreground mt-1">
            {roster.clients.length} client{roster.clients.length === 1 ? '' : 's'}
            {roster.clients.length > 0 && (
              <>
                {' · '}
                <span className={cn(attention > 0 && 'text-destructive font-extrabold')}>
                  {attention} need{attention === 1 ? 's' : ''} attention
                </span>
                {' · '}
                {everyDay} logged every day last week
              </>
            )}
            {' · '}
            {roster.seats.used} of {roster.seats.limit} seats
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-footnote text-muted-foreground flex items-center gap-2 font-bold">
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="bg-card border-input rounded-lg border-2 px-2 py-1 text-[13px] font-bold"
            >
              <option value="attention">Needs attention</option>
              <option value="logged">Days logged</option>
              <option value="name">Name</option>
            </select>
          </label>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={15} /> Refresh
          </Button>
          <Link href="/coach/invites" className={cn(buttonVariants({ size: 'sm' }))}>
            <UserPlus size={15} /> Invite a client
          </Link>
        </div>
      </div>

      {roster.account.plan === 'trial' && trialDays !== null && (
        <Notice tone={trialDays <= 3 ? 'warn' : 'info'}>
          Trial: {trialDays} day{trialDays === 1 ? '' : 's'} left, {roster.seats.limit} seats with Plus for
          every client.{' '}
          <Link href="/coach/settings" className="font-extrabold underline underline-offset-2">
            Pick a plan
          </Link>{' '}
          before it ends to keep them.
        </Notice>
      )}
      {roster.account.plan === 'solo' && (
        <Notice tone="info">
          Solo: one seat, and your client is on the free tier. A paid seat puts them on Plus, with photo
          logging.{' '}
          <Link href="/coach/settings" className="font-extrabold underline underline-offset-2">
            See plans
          </Link>
          .
        </Notice>
      )}
      {roster.account.plan === 'lapsed' && (
        <Notice tone="warn">
          Your card did not go through, so every seat is on the free tier for now.{' '}
          <Link href="/coach/settings" className="font-extrabold underline underline-offset-2">
            Fix billing
          </Link>
          .
        </Notice>
      )}

      {roster.clients.length === 0 ? (
        <div className="bg-card border-border chunk rounded-2xl border-2 px-6 py-12 text-center">
          <p className="text-title-2">Nobody on the roster yet</p>
          <p className="text-body text-muted-foreground mx-auto mt-2 max-w-md">
            Send a client a code. They accept it inside the app they already have, and their week
            appears here from the next meal they log.
          </p>
          <Link href="/coach/invites" className={cn(buttonVariants({ size: 'lg' }), 'mt-6')}>
            <UserPlus size={17} /> Invite your first client
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <ClientCard key={row.client.id} row={row} onOpen={() => open(row)} />
            ))}
          </div>

          <DataTable
            className="border-border chunk hidden border-2 lg:block"
            columns={['Client', 'Last week', 'Logged', 'Protein', 'Calories', 'Weight, 4 wks', 'Flags', 'Last log']}
          >
            {rows.map((row) => {
              const severity = row.flags.reduce(
                (max, flag) => (flag.severity === 'critical' ? 2 : flag.severity === 'warning' ? Math.max(max, 1) : max),
                0,
              );
              return (
                <tr
                  key={row.client.id}
                  tabIndex={0}
                  onClick={() => open(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      open(row);
                    }
                  }}
                  className={cn(
                    'hover:bg-muted/60 focus-visible:bg-muted/60 cursor-pointer outline-none transition-colors',
                    severity === 2 && 'shadow-[inset_4px_0_0_var(--destructive)]',
                    severity === 1 && 'shadow-[inset_4px_0_0_var(--protein)]',
                  )}
                >
                  <Cell>
                    <span className="flex items-center gap-3">
                      <Avatar name={row.client.display_name} />
                      <span>
                        <span className="block font-[family-name:var(--font-display)] text-[15px] font-bold">
                          {row.client.display_name ?? 'Unnamed'}
                        </span>
                        <span className="text-muted-foreground block text-[12px]">
                          {goalLabel(row.client.goal)}
                          {row.client.seat === 'free' && ' · free tier'}
                        </span>
                      </span>
                    </span>
                  </Cell>
                  <Cell>
                    <DotStrip days={row.days} />
                  </Cell>
                  <Cell className="tnum">
                    <b>{row.days_logged}</b>
                    <span className="text-muted-foreground">/7</span>
                  </Cell>
                  <Cell>
                    <Metric
                      value={row.protein.average_g}
                      target={row.protein.target_g}
                      unit="g"
                      color="var(--protein)"
                    />
                  </Cell>
                  <Cell>
                    <Metric
                      value={row.kcal.average}
                      target={row.kcal.target}
                      unit=""
                      color="var(--calories)"
                    />
                  </Cell>
                  <Cell className="tnum">
                    {row.weight.weigh_ins === 0 ? (
                      <span className="text-muted-foreground">no weigh-ins</span>
                    ) : row.weight.change_4w_kg === null ? (
                      <span className="text-muted-foreground">
                        {row.weight.current_kg?.toFixed(1)} kg
                      </span>
                    ) : (
                      signedKg(row.weight.change_4w_kg)
                    )}
                  </Cell>
                  <Cell>
                    <span className="flex flex-wrap gap-1">
                      {row.flags.length === 0 ? (
                        <OnTrack />
                      ) : (
                        row.flags.map((flag) => <FlagPill key={flag.kind} flag={flag} />)
                      )}
                    </span>
                  </Cell>
                  <Cell className="text-muted-foreground">
                    {whenIn(row.last_logged_at, row.client.timezone)}
                  </Cell>
                </tr>
              );
            })}
          </DataTable>

          <p className="text-footnote text-muted-foreground">
            Flags are the signals the app already computes for nudges: no log, protein short, weight
            stalled. Sorted by days logged before anything else — never by deficit.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({
  value,
  target,
  unit,
  color,
}: {
  value: number | null;
  target: number;
  unit: string;
  color: string;
}) {
  return (
    <span className="flex flex-col gap-1">
      <span className="tnum text-[14px]">
        {value === null ? <span className="text-muted-foreground">—</span> : <b>{value.toLocaleString('en-GB')}{unit && ` ${unit}`}</b>}
        <span className="text-muted-foreground"> / {target.toLocaleString('en-GB')}</span>
      </span>
      <Bar value={value} target={target} color={color} />
    </span>
  );
}

function ClientCard({ row, onOpen }: { row: CoachRosterRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-card border-border chunk block w-full space-y-3 rounded-[var(--radius)] border-2 p-4 text-left"
    >
      <span className="flex items-center gap-3">
        <Avatar name={row.client.display_name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-[family-name:var(--font-display)] text-[16px] font-bold">
            {row.client.display_name ?? 'Unnamed'}
          </span>
          <span className="text-muted-foreground block text-[12px]">
            {goalLabel(row.client.goal)} · logged {row.days_logged}/7 · last{' '}
            {whenIn(row.last_logged_at, row.client.timezone)}
          </span>
        </span>
        <DotStrip days={row.days} />
      </span>
      <span className="grid grid-cols-3 gap-3 text-[13px]">
        <span>
          <span className="text-muted-foreground block text-[11px]">Protein</span>
          <span className="tnum">
            {row.protein.average_g ?? '—'} / {row.protein.target_g} g
          </span>
        </span>
        <span>
          <span className="text-muted-foreground block text-[11px]">Calories</span>
          <span className="tnum">
            {row.kcal.average?.toLocaleString('en-GB') ?? '—'} / {row.kcal.target.toLocaleString('en-GB')}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground block text-[11px]">Weight, 4 wks</span>
          <span className="tnum">{signedKg(row.weight.change_4w_kg)}</span>
        </span>
      </span>
      <span className="flex flex-wrap gap-1">
        {row.flags.length === 0 ? <OnTrack /> : row.flags.map((flag) => <FlagPill key={flag.kind} flag={flag} />)}
      </span>
    </button>
  );
}

function Notice({ tone, children }: { tone: 'info' | 'warn'; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'rounded-2xl border-2 px-4 py-3 text-[14px] font-medium',
        tone === 'warn'
          ? 'border-[color-mix(in_oklch,var(--protein),transparent_50%)] bg-[color-mix(in_oklch,var(--protein),transparent_88%)]'
          : 'border-border bg-card',
      )}
    >
      {children}
    </p>
  );
}
