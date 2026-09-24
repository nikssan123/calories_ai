'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  LOCALE_NAMES_IN,
  SAVE_REASONS,
  type AdminFunnel,
  type FunnelStep,
  type Locale,
  type SaveReason,
} from '@ct/shared';
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
  teaseJournal: 'Tease · The journal',
  birth: 'Q3 · Birth date',
  body: 'Q4 · Height & weight',
  teaseDay: 'Tease · The day',
  target: 'Q5 · Goal weight',
  activity: 'Q6 · Activity',
  plan: 'Saw their plan',
  save: 'Tapped Start (Save my plan before 1.3)',
  guest: 'Guest session made',
  save_prompt: 'Saw “Save your account”',
  signup_email: 'Submitted email sign-up',
  signup_google: 'Tapped Continue with Google',
  account: 'Account created',
  in_app: 'Plan uploaded, in the app',
  reminder_on: 'Turned the daily reminder on',
  existing: 'Tapped “I already have an account”',
  signed_in: 'Signed in to an account that existed',
};

/*
 * The main line, in order. Everything in `BESIDE` is a count that is not a rung:
 * the two sign-up methods are alternatives rather than steps, "existing" leaves
 * the walk on the first screen, "signed_in" is where some of those taps come
 * out, and "reminder_on" is an offer taken on the plan screen by a subset of
 * the people who reach it. Read as drops they would each invent a cliff, so
 * they are listed apart.
 */
const LINE: FunnelStep[] = [
  'welcome',
  'start',
  'goal',
  'sex',
  'teaseJournal',
  'birth',
  'body',
  'teaseDay',
  'target',
  'activity',
  'plan',
  'save',
  'guest',
  'in_app',
  'save_prompt',
  'account',
];
const BESIDE: FunnelStep[] = [
  'reminder_on',
  'signup_email',
  'signup_google',
  'existing',
  'signed_in',
];

/** The ladder in GUEST-ACCOUNTS.md, in the order it is meant to be climbed. */
const REASON_LABEL: Record<SaveReason, string> = {
  first_log: 'After their first meal',
  you: 'The You tab',
  guest_limit: 'Guest logs used up',
  purchase: 'Tapped a purchase',
};
const REASON_HINT: Record<SaveReason, string> = {
  first_log: 'Soft — the inline card under the first AI reply',
  you: 'Soft — they went looking for it',
  guest_limit: 'Hard — the wall the guest allowance is built around',
  purchase: 'Hard — a subscription has to belong to an account',
};

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
  const byReason = (step: 'save_prompt' | 'account', reason: SaveReason) =>
    funnel.reasons.find((r) => r.step === step && r.reason === reason)?.reached ?? 0;
  const top = count('welcome').reached;
  const versions = [...new Set(funnel.versions.map((v) => v.app_version))];
  /*
   * Every language that reached any step, widest first, so the column that
   * matters is the one you read before scrolling. `null` — a phone on a build
   * from before the funnel carried a language — keeps a column of its own rather
   * than being folded into one of the real ones.
   */
  const locales = [...new Set(funnel.locales.map((l) => l.locale))].sort((a, b) => {
    const total = (locale: Locale | null) =>
      funnel.locales.filter((l) => l.locale === locale).reduce((sum, l) => sum + l.reached, 0);
    return total(b) - total(a);
  });

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-title-2">First-run funnel</h2>
          <p className="text-footnote text-muted-foreground mt-0.5">
            New installs, before an account — {days === 1 ? 'today' : `the last ${days} days`}.
            {/* Reported rather than silently dropped: a flag that works and a flag
                that never fires look like the same numbers otherwise. */}
            {funnel.internal_pings > 0 &&
              ` ${funnel.internal_pings} pings from our own builds are not counted.`}
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
          hint={`From the database, any route in — ${funnel.accounts_saved} saved an address`}
        />
      </StatGrid>

      <InsetGroup
        title="Step by step"
        footer="Each install is counted once per step. The two teases are screens the app talks on, counted since 2026-09-16 because the walk used to pass through them unmeasured. Q5 is only asked when the goal is not “stay where I am”, so it reads low by design and the step after it is measured against Q4. “Account created” counts any account a new install leaves with, by either route — through the walk, or straight off the sign-in screen — which is why it is measured against openers and not against the row above it; before 2026-09-18 it only counted the first of those and read zero while accounts were being made."
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
                /*
                 * Skip the optional question when measuring the one after it,
                 * and measure the account against nothing at all: it is the one
                 * row with two ways in — the guest walk above it, and the
                 * sign-in screen, which reaches it from `existing` without
                 * touching a single step in between. Against the row above it,
                 * a healthy day reads as more than a hundred per cent.
                 */
                const previousStep =
                  i === 0 || step === 'account' ? null : LINE[i - 1] === 'target' ? 'body' : LINE[i - 1]!;
                const previous = previousStep ? count(previousStep).reached : null;
                const lost = previous !== null && previous > 0 && row.reached / previous < 0.5;
                return (
                  <tr key={step} className="border-hairline border-t">
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

      <InsetGroup
        title="Which prompt asked"
        footer="The save-your-account screen is opened from four places, and only the first two rows are the guest wall doing its job — the rest are controls to read it against. “Saved” is an account made on that screen, so it will not add up to “Account created” above: that row also counts sign-ups straight off the sign-in screen, which no prompt asked for. A prompt that is not built yet reads as a row of zeros — the soft ask after the first meal is one of those today."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left text-xs">
                <th className="px-4 py-2 font-semibold">Prompt</th>
                <th className="px-3 py-2 text-right font-semibold">Shown</th>
                <th className="px-3 py-2 text-right font-semibold">Saved</th>
                <th className="px-4 py-2 text-right font-semibold">Converted</th>
              </tr>
            </thead>
            <tbody>
              {SAVE_REASONS.map((reason) => {
                const shown = byReason('save_prompt', reason);
                const saved = byReason('account', reason);
                return (
                  <tr key={reason} className="border-hairline border-t">
                    <td className="px-4 py-2">
                      <div className="font-medium">{REASON_LABEL[reason]}</div>
                      <div className="text-muted-foreground text-xs">{REASON_HINT[reason]}</div>
                    </td>
                    <td className="text-figure px-3 py-2 text-right">{shown}</td>
                    <td className="text-figure px-3 py-2 text-right">{saved}</td>
                    <td className={`px-4 py-2 text-right ${shown > 0 && saved === 0 ? 'font-bold text-[var(--fat-text)]' : ''}`}>
                      {shown ? percent(saved / shown) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </InsetGroup>

      <InsetGroup title="Beside the line">
        <div className="divide-hairline divide-y">
          {BESIDE.map((step) => (
            <div key={step} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="font-medium">{LABEL[step]}</span>
              <span className="text-figure">{count(step).reached}</span>
            </div>
          ))}
        </div>
      </InsetGroup>

      {locales.length > 0 && (
        <InsetGroup
          title="By language"
          footer="The campaigns are one per country, so a total across languages is a blend of whichever of them were enabled — and a cliff in one of them reads exactly like a cliff in the other. A language is not a country: DE and FR both target English speakers on purpose, so “en” is a mix. Pings from builds older than 2026-09-22 have no language and are grouped under “—”."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="px-4 py-2 font-semibold">Step</th>
                  {locales.map((l) => (
                    <th key={l ?? '?'} className="px-3 py-2 text-right font-semibold">
                      {l ? (LOCALE_NAMES_IN.en[l] ?? l) : '—'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LINE.map((step) => (
                  <tr key={step} className="border-hairline border-t">
                    <td className="px-4 py-2 font-medium">{LABEL[step]}</td>
                    {locales.map((l) => (
                      <td key={l ?? '?'} className="text-figure px-3 py-2 text-right">
                        {funnel.locales.find((r) => r.locale === l && r.step === step)?.reached ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InsetGroup>
      )}

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
                  <tr key={step} className="border-hairline border-t">
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
