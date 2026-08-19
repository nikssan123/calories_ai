'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { CostReport, UsageTurn } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Cell, DataTable } from './DataTable';
import { Stat, StatGrid } from './Stat';
import { bytes as _bytes, compactNumber, duration, percent, timestamp, usd } from './format';
import { cn } from '@/lib/utils';

const WINDOWS = [7, 30, 90] as const;

const KIND_LABEL: Record<string, string> = {
  text_log: 'Text log',
  photo_log: 'Photo log',
  setup: 'Onboarding',
  review: 'Weekly review',
};

/**
 * "Is this viable as a product?"
 *
 * The screen is arranged as the argument you would actually make: what one
 * turn costs, what one user costs per month, what that is at scale, and then
 * the breakdowns that either support or undermine those three numbers. The
 * caveats are rendered at the top rather than in a footnote, because the
 * headline figure is wrong in a specific and knowable way on most deployments
 * and someone reading it in a hurry needs to know which way.
 */
export function CostPanel() {
  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<CostReport | null>(null);
  const [turns, setTurns] = useState<UsageTurn[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [costs, recent] = await Promise.all([api.admin.costs(days), api.admin.turns({ limit: 50 })]);
        if (cancelled) return;
        setReport(costs);
        setTurns(recent.turns);
      } catch (e) {
        toast.error((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (!report) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const { economics, totals } = report;
  const noData = totals.turns === 0;

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-title-2">Unit economics</h2>
          <p className="text-footnote text-muted-foreground mt-0.5">
            Measured over the last {economics.window_days} days.
          </p>
        </div>
        <ToggleGroup
          value={[String(days)]}
          onValueChange={(values) => {
            const next = Number(values[0]);
            if (Number.isFinite(next)) setDays(next);
          }}
          className="bg-muted shrink-0 rounded-lg p-0.5"
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

      <Caveats report={report} />

      {noData ? (
        <div className="bg-card rounded-2xl px-4 py-8 text-center">
          <p className="text-[15px] font-medium">No turns recorded in this window.</p>
          <p className="text-muted-foreground mt-1 text-[15px]">
            Log a meal through the journal and the numbers appear here.
          </p>
        </div>
      ) : (
        <>
          <StatGrid columns={4}>
            <Stat
              label="Per turn"
              value={usd(economics.cost_per_turn_usd)}
              hint={`${compactNumber(economics.turns)} turns`}
            />
            <Stat
              label="Per user / month"
              value={usd(economics.cost_per_user_month_usd)}
              tone="accent"
              hint={`${economics.active_users} active · ${economics.turns_per_user_day.toFixed(1)} turns/day each`}
            />
            <Stat
              label="Heaviest user"
              value={usd(economics.heaviest_user_month_usd)}
              hint="Same month scaling. Sizes the worst case."
            />
            <Stat
              label="Window total"
              value={usd(economics.cost_usd)}
              hint={`p95 latency ${duration(totals.p95_duration_ms)}`}
            />
          </StatGrid>

          <InsetGroup
            title="If it were a product"
            footer="Mean spend per active user, multiplied out. Assumes new users behave like current ones — which for a tracker used by its own author is the assumption most likely to be wrong."
          >
            <div className="divide-border grid grid-cols-3 divide-x">
              {economics.projection.map((tier) => (
                <Stat
                  key={tier.users}
                  label={`${compactNumber(tier.users)} users`}
                  value={`${usd(tier.monthly_usd)}/mo`}
                  hint={`${usd(tier.monthly_usd / tier.users)} each`}
                />
              ))}
            </div>
          </InsetGroup>

          <InsetGroup
            title="Where the money goes"
            footer="The routing in ai/client.ts either pays for itself here or it does not: a photo turn costing many times a text turn is fine at a few percent of volume and fatal at a third of it."
          >
            <DataTable
              columns={['Turn', 'Model', 'Turns', 'Share', 'Avg cost', 'Total', 'Failed']}
              className="rounded-none"
            >
              {report.by_kind.map((row) => (
                <tr key={`${row.kind}-${row.model}`}>
                  <Cell className="font-medium">{KIND_LABEL[row.kind] ?? row.kind}</Cell>
                  <Cell className="text-muted-foreground">{row.model}</Cell>
                  <Cell className="tnum">{compactNumber(row.turns)}</Cell>
                  <Cell className="tnum text-muted-foreground">
                    {percent(totals.turns ? row.turns / totals.turns : 0)}
                  </Cell>
                  <Cell className="tnum">{usd(row.avg_cost_usd)}</Cell>
                  <Cell className="tnum font-medium">{usd(row.cost_usd)}</Cell>
                  <Cell className={cn('tnum', row.failed_turns > 0 && 'text-[var(--fat)]')}>
                    {row.failed_turns || '—'}
                  </Cell>
                </tr>
              ))}
            </DataTable>
          </InsetGroup>

          <InsetGroup
            title="Tokens"
            footer="Cache reads bill at a tenth of the input rate and writes at 1.25x, so they are tracked apart — folding them into input would misprice a turn by more than the turn costs."
          >
            <div className="divide-border grid grid-cols-2 divide-x lg:grid-cols-4">
              <Stat label="Input" value={compactNumber(totals.input_tokens)} />
              <Stat label="Output" value={compactNumber(totals.output_tokens)} />
              <Stat label="Cache read" value={compactNumber(totals.cache_read_tokens)} />
              <Stat label="Cache write" value={compactNumber(totals.cache_write_tokens)} />
            </div>
          </InsetGroup>

          <InsetGroup title="Daily">
            <DailyChart days={report.by_day} />
          </InsetGroup>

          <InsetGroup title="By account">
            <DataTable columns={['Account', 'Turns', 'Cost', 'Last turn']} className="rounded-none">
              {report.by_user.map((row) => (
                <tr key={row.user_id ?? 'deleted'}>
                  <Cell className="font-medium">
                    {row.email ?? <span className="text-muted-foreground">deleted account</span>}
                  </Cell>
                  <Cell className="tnum">{row.turns}</Cell>
                  <Cell className="tnum">{usd(row.cost_usd)}</Cell>
                  <Cell className="text-muted-foreground">{timestamp(row.last_turn_at)}</Cell>
                </tr>
              ))}
            </DataTable>
          </InsetGroup>
        </>
      )}

      <InsetGroup
        title="Recent turns"
        footer="Newest first, including the ones that failed — a turn that spent tokens and then errored is the most expensive kind."
      >
        <DataTable
          columns={['When', 'Account', 'Turn', 'Model', 'In', 'Out', 'Cache', 'Cost', 'Took', '']}
          className="rounded-none"
          empty="No turns recorded yet."
        >
          {turns.map((turn) => (
            <tr key={turn.id} className={cn(!turn.ok && 'bg-[var(--fat)]/5')}>
              <Cell className="text-muted-foreground">{timestamp(turn.occurred_at)}</Cell>
              <Cell>{turn.email ?? '—'}</Cell>
              <Cell>{KIND_LABEL[turn.kind] ?? turn.kind}</Cell>
              <Cell className="text-muted-foreground">{turn.model}</Cell>
              <Cell className="tnum">{compactNumber(turn.input_tokens)}</Cell>
              <Cell className="tnum">{compactNumber(turn.output_tokens)}</Cell>
              <Cell className="tnum text-muted-foreground">
                {compactNumber(turn.cache_read_tokens)}
              </Cell>
              <Cell className="tnum">
                {usd(turn.cost_usd)}
                {turn.cost_source !== 'reported' && (
                  <span className="text-muted-foreground ml-1 text-[11px]">
                    {turn.cost_source === 'estimated' ? 'est' : '?'}
                  </span>
                )}
              </Cell>
              <Cell className="text-muted-foreground">{duration(turn.duration_ms)}</Cell>
              <Cell className="text-[var(--fat)]" title={turn.error ?? undefined}>
                {turn.ok ? '' : 'failed'}
              </Cell>
            </tr>
          ))}
        </DataTable>
      </InsetGroup>
    </div>
  );
}

/**
 * The two ways these numbers mislead, stated before the numbers.
 *
 * On the default Claude Code subscription nothing here is actually billed —
 * the figure is what the same tokens would cost at API rates, which is exactly
 * the number the viability question wants, and exactly the number someone will
 * otherwise mistake for their current bill.
 */
function Caveats({ report }: { report: CostReport }) {
  const notes: string[] = [];

  if (report.economics.unpriced_share > 0) {
    notes.push(
      `${percent(report.economics.unpriced_share)} of turns have no price attached — their tokens were recorded but no rate card covered the model, so every total below is an undercount. Set OPENAI_PRICE_INPUT and OPENAI_PRICE_OUTPUT if you are on an OpenAI-compatible endpoint.`,
    );
  }
  if (report.economics.active_users < 3) {
    notes.push(
      `Only ${report.economics.active_users} account${report.economics.active_users === 1 ? '' : 's'} logged anything in this window, so the per-user figure is one person's habits rather than a population.`,
    );
  }

  return (
    <div className="bg-card space-y-3 rounded-2xl px-4 py-3.5">
      <p className="text-[15px]">
        <span className="font-medium">These are API-rate prices, not a bill.</span>{' '}
        <span className="text-muted-foreground">
          Running on a Claude Code subscription, no one is charged per token — this is what the
          same tokens would cost if they were metered, which is what a real product would pay.
        </span>
      </p>
      {notes.map((note) => (
        <p key={note} className="text-footnote text-muted-foreground flex gap-2">
          <AlertTriangle size={15} className="mt-px shrink-0 text-[var(--fat)]" />
          <span>{note}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Daily spend as bars. Deliberately not a charting library: it is one series
 * against one axis, and the honest version of that is a div per day.
 */
function DailyChart({ days }: { days: CostReport['by_day'] }) {
  if (days.length === 0) {
    return <p className="text-muted-foreground px-4 py-6 text-center text-[15px]">No turns yet.</p>;
  }
  const peak = Math.max(...days.map((d) => d.cost_usd), 0.000001);

  return (
    <div className="px-4 py-4">
      <div className="flex h-28 items-end gap-[3px]">
        {days.map((day) => (
          <div
            key={day.date}
            className="group relative flex-1 rounded-t-sm bg-[var(--calories)] transition-opacity hover:opacity-70"
            style={{ height: `${Math.max(2, (day.cost_usd / peak) * 100)}%` }}
            title={`${day.date} — ${usd(day.cost_usd)} over ${day.turns} turn${day.turns === 1 ? '' : 's'}`}
          />
        ))}
      </div>
      <div className="text-footnote text-muted-foreground mt-2 flex justify-between">
        <span>{days[0]?.date}</span>
        <span>peak {usd(peak)}</span>
        <span>{days[days.length - 1]?.date}</span>
      </div>
    </div>
  );
}
