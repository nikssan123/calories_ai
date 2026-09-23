'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PLANS, type AdminSubscription, type PlanName, type PlanSource, type SubscriptionReport } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Cell, DataTable } from './DataTable';
import { Stat, StatGrid } from './Stat';
import { timestamp, usd } from './format';
import { cn } from '@/lib/utils';

/**
 * Subscriptions: who is paying, and whether the plumbing that decides it works.
 *
 * The second half is the reason this panel exists. A store purchase reaches
 * `users.plan` through four hops — store, RevenueCat, our webhook, the column —
 * and **every failure in the middle is silent on both ends**: the customer is
 * charged and sees a success screen, the server hears nothing, and the account
 * carries on reading `free`. Nothing anywhere said so until this screen. The
 * morning that cost was the morning this was written: the webhook had been left
 * filtered to sandbox events after a test run in August, and a real €9.99
 * subscription simply never arrived.
 *
 * So the delivery block is at the top, above the money. Three facts decide
 * whether a purchase *can* land — the secret is set, sandbox events are
 * honoured or not, and when the last delivery actually was — and none of them
 * is visible in a subscriber count.
 *
 * What it does not do is take money. Refunds live in the store's own console on
 * purpose: Apple does not let a developer refund at all (only Apple does), Play
 * does but only against an order id, and a refund button here that worked on
 * one store and quietly did nothing on the other would be worse than the link
 * beside every row. The panel repairs *entitlement*, which is the half that is
 * genuinely ours.
 */

/*
 * The two console ids, for the links beside each row.
 *
 * Both are public — they are in the URL of every page of those dashboards — and
 * hardcoded rather than configured because they identify this product's own
 * accounts, which are as fixed as the package name. `u/1` is the Play profile
 * the developer account sits under.
 */
const REVENUECAT_PROJECT = '3db98aed';
const PLAY_DEVELOPER = '4927951051818588193';

const SOURCES: PlanSource[] = ['manual', 'play', 'app_store', 'stripe'];

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  play: 'Play',
  app_store: 'App Store',
  stripe: 'Stripe',
  coach_seat: 'Coach seat',
};

const PERIOD_LABEL: Record<string, string> = {
  week: '/wk',
  month: '/mo',
  year: '/yr',
};

export function SubscriptionsPanel() {
  const [report, setReport] = useState<SubscriptionReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminSubscription | null>(null);
  const [plan, setPlan] = useState<PlanName>('plus');
  const [source, setSource] = useState<PlanSource>('manual');
  const [expires, setExpires] = useState('');

  const load = useCallback(async () => {
    try {
      setReport(await api.admin.subscriptions());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Open the form on a row, pre-filled with what the account already has. */
  function edit(row: AdminSubscription) {
    setEditing(row);
    setPlan(row.plan === 'free' ? 'plus' : row.plan);
    setSource((SOURCES as string[]).includes(row.plan_source) ? (row.plan_source as PlanSource) : 'manual');
    setExpires(row.plan_expires_at ? row.plan_expires_at.slice(0, 10) : '');
  }

  async function save() {
    if (!editing) return;
    const row = editing;
    setEditing(null);
    setBusy(row.user_id);
    try {
      await api.admin.setPlan(row.user_id, {
        plan,
        // A date is enough for a support fix, and an empty box means no expiry
        // rather than "today" — see the note on the field below.
        expires_at: plan === 'free' || expires === '' ? null : expires,
        source,
      });
      toast.success(`${row.email ?? row.user_id} → ${plan}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const { subscriptions, events, totals, webhook } = report;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-footnote text-muted-foreground">
          {subscriptions.length === 0
            ? 'Nothing has ever been sold on this deployment.'
            : `${totals.active} active of ${subscriptions.length} accounts that have ever paid.`}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>

      <Delivery webhook={webhook} />

      <StatGrid columns={4}>
        <Stat
          label="Active"
          value={totals.active}
          hint={
            totals.by_plan.length > 0
              ? totals.by_plan.map((entry) => `${entry.count} ${entry.plan}`).join(' · ')
              : 'No paid accounts'
          }
        />
        <Stat
          label="MRR, net"
          value={usd(totals.mrr_net_usd)}
          tone="accent"
          hint={`${usd(totals.mrr_gross_usd)} gross · annual spread over twelve`}
        />
        <Stat
          label="Renewing ≤ 7d"
          value={totals.expiring_7d}
          hint="A renewal that does not arrive becomes an expiry"
        />
        <Stat
          label={totals.overdue > 0 ? 'Past expiry' : 'Lapsed'}
          value={totals.overdue > 0 ? totals.overdue : totals.lapsed}
          tone={totals.overdue > 0 ? 'warn' : 'default'}
          hint={
            totals.overdue > 0
              ? 'Paid, and the period already ran out — the sweep should have revoked these'
              : `${totals.lapsed} accounts back on free that once paid`
          }
        />
      </StatGrid>

      <InsetGroup
        title="Subscriptions"
        footer="Refunds and cancellations are the store's own: on Play, the order link opens the console page that refunds it; on the App Store only Apple can refund, and neither store lets an app cancel on somebody's behalf. What this panel changes is entitlement."
      >
        <div className="space-y-3 p-3 lg:hidden">
          {subscriptions.map((row) => (
            <SubscriptionCard
              key={row.user_id}
              row={row}
              busy={busy === row.user_id}
              onEdit={() => edit(row)}
            />
          ))}
          {subscriptions.length === 0 && (
            <p className="text-muted-foreground text-body px-1 py-4 text-center">
              Nothing sold yet.
            </p>
          )}
        </div>

        <DataTable
          className="hidden lg:block"
          columns={['Account', 'Plan', 'Source', 'Renews', 'Product', 'Last charge', 'Last event', '']}
          empty="Nothing sold yet."
        >
          {subscriptions.map((row) => (
            <tr
              key={row.user_id}
              className={cn(row.plan === 'free' && 'opacity-60', busy === row.user_id && 'opacity-50')}
            >
              <Cell>
                <span className="font-medium">{row.email ?? 'guest'}</span>
                <span className="text-muted-foreground block text-[12px]">
                  {row.country ?? '—'}
                  {row.environment === 'SANDBOX' && ' · sandbox purchase'}
                </span>
              </Cell>
              <Cell>
                <PlanBadge row={row} />
              </Cell>
              <Cell className="text-muted-foreground">
                {SOURCE_LABEL[row.plan_source] ?? row.plan_source}
              </Cell>
              <Cell className={cn(row.overdue && 'text-[var(--fat-text)]')}>
                {row.plan_expires_at ? timestamp(row.plan_expires_at).slice(0, 10) : '—'}
                {row.overdue && <span className="block text-[12px]">past expiry</span>}
              </Cell>
              <Cell className="text-muted-foreground font-mono text-[12px]">
                {row.product_id ?? '—'}
              </Cell>
              <Cell className="tnum">
                {row.net_usd === null ? (
                  '—'
                ) : (
                  <>
                    {usd(row.net_usd)}
                    {row.period && PERIOD_LABEL[row.period]}
                    <span className="text-muted-foreground block text-[12px]">
                      {usd(row.gross_usd ?? 0)} gross
                      {row.renewals !== null && ` · period ${row.renewals}`}
                    </span>
                  </>
                )}
              </Cell>
              <Cell className="text-muted-foreground">
                {row.last_event ?? '—'}
                <span className="block text-[12px]">{timestamp(row.last_event_at)}</span>
              </Cell>
              <Cell>
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="sm" onClick={() => edit(row)}>
                    <Pencil size={14} /> Plan
                  </Button>
                  <Links row={row} />
                </div>
              </Cell>
            </tr>
          ))}
        </DataTable>
      </InsetGroup>

      {editing && (
        <InsetGroup
          title={`Set the plan for ${editing.email ?? editing.user_id}`}
          footer="The repair for a purchase the store took money for and the webhook never delivered — a missed INITIAL_PURCHASE is never redelivered, so the column has to be set by hand. Match the store: the source it was bought on, and the date it renews, so the next renewal keeps it correct and the expiry sweep still applies. Free revokes, and clears both."
        >
          <div className="flex flex-col gap-4 p-4">
            <Field label="Plan">
              <ToggleGroup
                value={[plan]}
                onValueChange={(values) => {
                  const next = values[0] as PlanName | undefined;
                  if (next) setPlan(next);
                }}
                className="bg-muted w-fit rounded-lg p-0.5"
              >
                {PLANS.map((name) => (
                  <ToggleGroupItem
                    key={name}
                    value={name}
                    className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-8 rounded-full px-3.5 text-xs font-bold transition-colors"
                  >
                    {name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            {plan !== 'free' && (
              <>
                <Field label="Source">
                  <ToggleGroup
                    value={[source]}
                    onValueChange={(values) => {
                      const next = values[0] as PlanSource | undefined;
                      if (next) setSource(next);
                    }}
                    className="bg-muted w-fit rounded-lg p-0.5"
                  >
                    {SOURCES.map((name) => (
                      <ToggleGroupItem
                        key={name}
                        value={name}
                        className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-8 rounded-full px-3.5 text-xs font-bold transition-colors"
                      >
                        {SOURCE_LABEL[name]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>

                <Field
                  label="Renews or expires"
                  hint={
                    expires === ''
                      ? 'Empty means no expiry: the sweep will never revoke this account.'
                      : source === 'manual'
                        ? 'A manual grant is exempt from the expiry sweep, so this date is a note rather than a deadline.'
                        : 'The sweep puts this account back on free after this date unless a renewal arrives.'
                  }
                >
                  <Input
                    type="date"
                    value={expires}
                    onChange={(event) => setExpires(event.target.value)}
                    className="w-44"
                  />
                </Field>
              </>
            )}

            <div className="flex gap-2">
              <Button onClick={() => void save()} variant={plan === 'free' ? 'destructive' : 'default'}>
                {plan === 'free' ? 'Revoke to free' : `Set ${plan}`}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </InsetGroup>
      )}

      <InsetGroup
        title="Store events"
        footer="Every delivery as RevenueCat sent it, newest first, including the ones that changed nothing — a CANCELLATION deliberately does not revoke, and an event for an unknown account is logged and ignored. ADMIN_SET_PLAN rows are this panel's own edits."
      >
        <DataTable
          columns={['Received', 'Type', 'Account', 'Store', 'Product', 'Env', 'Expires']}
          empty="No store event has ever been delivered here."
        >
          {events.map((event) => (
            <tr key={event.id}>
              <Cell className="text-muted-foreground">{timestamp(event.received_at)}</Cell>
              <Cell className="font-medium">{event.type}</Cell>
              <Cell>{event.email ?? (event.user_id ? 'guest' : '—')}</Cell>
              <Cell className="text-muted-foreground">
                {event.store ? (SOURCE_LABEL[event.store.toLowerCase().replace('_store', '')] ?? event.store) : '—'}
              </Cell>
              <Cell className="text-muted-foreground font-mono text-[12px]">
                {event.product_id ?? '—'}
              </Cell>
              <Cell
                className={cn(
                  'text-muted-foreground',
                  event.environment === 'SANDBOX' && 'text-[var(--fat-text)]',
                )}
              >
                {event.environment ?? '—'}
              </Cell>
              <Cell className="text-muted-foreground">{timestamp(event.expires_at)}</Cell>
            </tr>
          ))}
        </DataTable>
      </InsetGroup>
    </div>
  );
}

/**
 * Whether a purchase can reach the column at all.
 *
 * Drawn as sentences rather than a row of green ticks, because each of these is
 * only a problem in combination with something else: a deployment that refuses
 * sandbox events is correct and also untestable with a licence tester, and a
 * webhook that has been quiet for a month is either a quiet month or a broken
 * integration. The panel says which is which and leaves the reading to whoever
 * knows whether anything has sold.
 */
function Delivery({ webhook }: { webhook: SubscriptionReport['webhook'] }) {
  const quiet =
    webhook.last_event_at === null ||
    Date.now() - Date.parse(webhook.last_event_at) > 14 * 86_400_000;

  const notes: Array<{ text: string; tone: 'warn' | 'note' }> = [];

  if (!webhook.configured) {
    notes.push({
      tone: 'warn',
      text: 'REVENUECAT_WEBHOOK_SECRET is not set, so the endpoint answers 503 to every delivery. Nothing bought anywhere can grant a plan here.',
    });
  }
  if (webhook.accepts_sandbox) {
    notes.push({
      tone: 'warn',
      text: 'Sandbox purchases are honoured on this deployment. A licence tester or a TestFlight account can grant itself any tier, for nothing.',
    });
  } else {
    notes.push({
      tone: 'note',
      text: 'Sandbox purchases are refused (BILLING_ACCEPT_SANDBOX=false). Play licence-tester and TestFlight purchases are sandbox, so they reach the log as wrong_environment and grant nothing — test the whole path against a local API instead.',
    });
  }
  notes.push({
    tone: quiet ? 'warn' : 'note',
    text:
      webhook.last_event_at === null
        ? 'No store event has ever been delivered. If anything has sold, check the webhook in RevenueCat — its URL, its Authorization header, and the environment it is filtered to.'
        : `Last delivery ${timestamp(webhook.last_event_at)}${
            quiet
              ? '. If anything has sold since, delivery is broken: the usual cause is the webhook being filtered to one environment in RevenueCat.'
              : '.'
          }`,
  });

  return (
    <InsetGroup title="Delivery">
      <ul className="divide-hairline divide-y">
        {notes.map((note) => (
          <li key={note.text} className="flex gap-3 px-4 py-3">
            <span
              aria-hidden
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                note.tone === 'warn' ? 'bg-[var(--fat-text)]' : 'bg-muted-foreground/40',
              )}
            />
            <p
              className={cn(
                'text-footnote font-medium',
                note.tone === 'warn' ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {note.text}
            </p>
          </li>
        ))}
      </ul>
    </InsetGroup>
  );
}

function PlanBadge({ row }: { row: AdminSubscription }) {
  const paid = row.plan !== 'free';
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[12px] font-bold',
        paid && !row.overdue && 'bg-primary text-primary-foreground',
        (!paid || row.overdue) && 'bg-muted text-muted-foreground',
      )}
    >
      {row.plan}
    </span>
  );
}

/**
 * Out to the two dashboards that hold the other half of the row.
 *
 * RevenueCat first because it is the one place both stores are visible at once,
 * and it is where a transfer or a promotional grant is done. The order link is
 * Play-only for the reason in the panel's own note: an App Store order has no
 * console page a developer can open, so drawing a dead link for it would be
 * inventing a control that does not exist.
 */
function Links({ row }: { row: AdminSubscription }) {
  const play = row.store === 'PLAY_STORE' && row.transaction_id !== null;
  return (
    <>
      <a
        href={`https://app.revenuecat.com/projects/${REVENUECAT_PROJECT}/customers/${row.user_id}`}
        target="_blank"
        rel="noreferrer"
        title="Open this customer in RevenueCat"
        className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium transition-colors"
      >
        RC <ArrowUpRight size={13} />
      </a>
      {play && (
        <a
          href={`https://play.google.com/console/u/1/developers/${PLAY_DEVELOPER}/orders/${row.transaction_id}`}
          target="_blank"
          rel="noreferrer"
          title={`Open order ${row.transaction_id} in the Play Console`}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium transition-colors"
        >
          Order <ArrowUpRight size={13} />
        </a>
      )}
    </>
  );
}

/** The same row on a phone, where eight columns do not fit. */
function SubscriptionCard({
  row,
  busy,
  onEdit,
}: {
  row: AdminSubscription;
  busy: boolean;
  onEdit: () => void;
}) {
  return (
    <div
      className={cn(
        'border-hairline rounded-xl border p-3',
        row.plan === 'free' && 'opacity-60',
        busy && 'opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.email ?? 'guest'}</p>
          <p className="text-muted-foreground text-[12px]">
            {SOURCE_LABEL[row.plan_source] ?? row.plan_source}
            {row.product_id && ` · ${row.product_id}`}
            {row.environment === 'SANDBOX' && ' · sandbox'}
          </p>
        </div>
        <PlanBadge row={row} />
      </div>

      <dl className="text-footnote mt-3 grid grid-cols-2 gap-y-1">
        <dt className="text-muted-foreground">Renews</dt>
        <dd className={cn('text-right', row.overdue && 'text-[var(--fat-text)]')}>
          {row.plan_expires_at ? timestamp(row.plan_expires_at).slice(0, 10) : '—'}
        </dd>
        <dt className="text-muted-foreground">Last charge</dt>
        <dd className="tnum text-right">
          {row.net_usd === null
            ? '—'
            : `${usd(row.net_usd)}${row.period ? PERIOD_LABEL[row.period] : ''} net`}
        </dd>
        <dt className="text-muted-foreground">Last event</dt>
        <dd className="text-right">
          {row.last_event ?? '—'}
          {row.last_event_at && ` · ${timestamp(row.last_event_at).slice(0, 10)}`}
        </dd>
      </dl>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <Pencil size={14} /> Plan
        </Button>
        <Links row={row} />
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-eyebrow text-muted-foreground mb-1.5">{label}</p>
      {children}
      {hint && <p className="text-footnote text-muted-foreground mt-1.5 font-medium">{hint}</p>}
    </div>
  );
}
