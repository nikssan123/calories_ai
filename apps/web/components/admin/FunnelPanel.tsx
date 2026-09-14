'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AdminFunnel, FunnelStep } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Stat, StatGrid } from './Stat';
import { percent } from './format';

const WINDOWS = [1, 7, 30] as const;

const LABEL: Record<FunnelStep, string> = {
  welcome: 'Welcome screen',
  start: 'Tapped Get started',
  goal: 'Q1 · Goal',
  sex: 'Q2 · Sex',
  birth: 'Q3 · Birth date',
  body: 'Q4 · Height & weight',
  target: 'Q5 · Goal weight',
  activity: 'Q6 · Activity',
  plan: 'Saw their plan',
  save: 'Tapped Save my plan',
  signup_email: 'Submitted email sign-up',
  signup_google: 'Tapped Continue with Google',
  account: 'Account created',
  in_app: 'Plan saved, in the app',
  existing: 'Tapped “I already have an account”',
};

/*
 * The main line, in order. The two sign-up methods are alternatives rather than
 * steps, and "existing" leaves the walk on the first screen, so those three are
 * listed apart instead of being read as drops.
 */
const LINE: FunnelStep[] = ['welcome', 'start', 'goal', 'sex', 'birth', 'body', 'target', 'activity', 'plan', 'save', 'account', 'in_app'];
const BESIDE: FunnelStep[] = ['signup_email', 'signup_google', 'existing'];

/**
 * Where new installs stop before they have an account.
 *
 * Counts sent by the phone, one per install per step, with nothing that says
 * whose they are — see `apps/mobile/lib/funnel.ts`. Each row is measured against
 * the welcome screen and against the step before it; the second is the one
 * that says which screen is losing people.
 */
export function FunnelPanel() {
  const [days, setDays] = useState<number>(7);
  const [funnel, setFunnel] = useState<AdminFunnel | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.admin.funnel(days);
        if (!cancelled) setFunnel(data);
      } catch (e) {
        toast.error((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (!funnel) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const count = (step: FunnelStep) => funnel.steps.find((s) => s.step === step)!;
  const top = count('welcome').reached;
  const versions = [...new Set(funnel.versions.map((v) => v.app_version))];

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-title-2">First-run funnel</h2>
          <p className="text-footnote text-muted-foreground mt-0.5">
            New installs, before an account — {days === 1 ? 'today' : `the last ${days} days`}.
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
              aria-label={w === 1 ? 'Today' : `${w} days`}
              className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-8 rounded-full px-3.5 text-xs font-bold transition-colors"
            >
              {w === 1 ? 'Today' : `${w}d`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <StatGrid columns={4}>
        <Stat label="Opened the app" value={top} hint="Reached the welcome screen" />
        <Stat
          label="Saw their plan"
          value={count('plan').reached}
          hint={top ? `${percent(count('plan').reached / top)} of openers` : undefined}
        />
        <Stat
          label="Made an account"
          value={count('account').reached}
          hint={top ? `${percent(count('account').reached / top)} of openers` : undefined}
          tone="accent"
        />
        <Stat
          label="All new accounts"
          value={funnel.accounts_created}
          hint="From the database, any route in"
        />
      </StatGrid>

      <InsetGroup
        title="Step by step"
        footer="Each install is counted once per step. Q5 is only asked when the goal is not “stay where I am”, so it reads low by design and the step after it is measured against Q4."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left text-xs">
                <th className="px-4 py-2 font-semibold">Step</th>
                <th className="px-3 py-2 text-right font-semibold">Installs</th>
                <th className="px-3 py-2 text-right font-semibold">iOS</th>
                <th className="px-3 py-2 text-right font-semibold">Android</th>
                <th className="px-3 py-2 text-right font-semibold">Of openers</th>
                <th className="px-4 py-2 text-right font-semibold">Of previous</th>
              </tr>
            </thead>
            <tbody>
              {LINE.map((step, i) => {
                const row = count(step);
                // Skip the optional question when measuring the one after it.
                const previousStep = i === 0 ? null : LINE[i - 1] === 'target' ? 'body' : LINE[i - 1]!;
                const previous = previousStep ? count(previousStep).reached : null;
                const lost = previous !== null && previous > 0 && row.reached / previous < 0.5;
                return (
                  <tr key={step} className="border-border border-t">
                    <td className="px-4 py-2 font-medium">{LABEL[step]}</td>
                    <td className="text-figure px-3 py-2 text-right">{row.reached}</td>
                    <td className="text-muted-foreground px-3 py-2 text-right">{row.ios}</td>
                    <td className="text-muted-foreground px-3 py-2 text-right">{row.android}</td>
                    <td className="px-3 py-2 text-right">{top ? percent(row.reached / top) : '—'}</td>
                    <td className={`px-4 py-2 text-right ${lost ? 'font-bold text-[var(--fat-text)]' : ''}`}>
                      {previous ? percent(row.reached / previous) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </InsetGroup>

      <InsetGroup title="Beside the line">
        <div className="divide-border divide-y">
          {BESIDE.map((step) => (
            <div key={step} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="font-medium">{LABEL[step]}</span>
              <span className="text-figure">{count(step).reached}</span>
            </div>
          ))}
        </div>
      </InsetGroup>

      {versions.length > 1 && (
        <InsetGroup title="By app version" footer="The walk changes between releases; a total across versions hides which one lost people.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="px-4 py-2 font-semibold">Step</th>
                  {versions.map((v) => (
                    <th key={v} className="px-3 py-2 text-right font-semibold">
                      {v}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LINE.map((step) => (
                  <tr key={step} className="border-border border-t">
                    <td className="px-4 py-2 font-medium">{LABEL[step]}</td>
                    {versions.map((v) => (
                      <td key={v} className="text-figure px-3 py-2 text-right">
                        {funnel.versions.find((r) => r.app_version === v && r.step === step)?.reached ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InsetGroup>
      )}
    </div>
  );
}
