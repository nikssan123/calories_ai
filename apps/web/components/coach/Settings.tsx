'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CoachAccount } from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { daysUntil, shortDate } from './bits';

/**
 * The account and the seats. See COACH.md §9.
 *
 * Billing itself is a Stripe page rather than a form here: the checkout and
 * the customer portal are theirs, and this screen only says which plan the
 * seats are on and hands over to them.
 */
export function Settings() {
  const { profile, signOut } = useAuth();
  const [account, setAccount] = useState<CoachAccount | null>(null);
  const [business, setBusiness] = useState('');
  const [busy, setBusy] = useState(false);
  const [seats, setSeats] = useState(5);

  const load = useCallback(async () => {
    try {
      const next = await api.coach.me();
      setAccount(next);
      setBusiness(next.business_name ?? '');
      setSeats(Math.max(3, next.seats_used, next.plan === 'trial' ? next.seat_limit : 3));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    /*
     * Back from Stripe. The return URL is a browser saying it was there, not a
     * payment: the webhook is what moves the plan, and it can land a second or
     * two after this page does. Say so, and read the account again shortly.
     */
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout) {
      window.history.replaceState(null, '', '/coach/settings');
      if (checkout === 'success') {
        toast.success('Payment received. Your seats update in a moment.');
        const timer = setTimeout(() => void load(), 3000);
        return () => clearTimeout(timer);
      }
      if (checkout === 'cancelled') toast.message('Checkout cancelled. Nothing changed.');
    }
    return undefined;
  }, [load]);

  if (!account) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const trialDays = daysUntil(account.trial_ends_at);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-large-title">Settings</h1>
        <p className="text-footnote text-muted-foreground mt-1">
          Signed in as {profile?.email}. Your clients see your name, {profile?.display_name ?? 'which is not set yet'}.
        </p>
      </div>

      <InsetGroup title="Business" footer="Shown to a client on the accept screen, under your name.">
        <form
          className="flex flex-col gap-3 p-4 sm:flex-row"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              setAccount(await api.coach.update({ business_name: business.trim() || null }));
              toast.success('Saved');
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            value={business}
            onChange={(event) => setBusiness(event.target.value)}
            placeholder="Studio or business name"
            className="flex-1"
            maxLength={120}
          />
          <Button type="submit" disabled={busy || (account.business_name ?? '') === business.trim()}>
            Save
          </Button>
        </form>
      </InsetGroup>

      <InsetGroup title="Seats" footer={seatFooter(account)}>
        <InsetRow className="justify-between">
          <span className="text-body font-bold">Plan</span>
          <span className="text-body">{planLabel(account)}</span>
        </InsetRow>
        <InsetRow className="justify-between">
          <span className="text-body font-bold">Seats</span>
          <span className="text-body tnum">
            {account.seats_used} of {account.seat_limit} in use
          </span>
        </InsetRow>
        <InsetRow className="justify-between">
          <span className="text-body font-bold">What a seat carries</span>
          <span className="text-body">{account.seats_carry_plus ? 'Plus, with photo logging' : 'The free tier'}</span>
        </InsetRow>
        {account.plan === 'trial' && (
          <InsetRow className="justify-between">
            <span className="text-body font-bold">Trial ends</span>
            <span className="text-body tnum">
              {account.trial_ends_at ? shortDate(account.trial_ends_at.slice(0, 10)) : '—'}
              {trialDays !== null && ` · ${trialDays} day${trialDays === 1 ? '' : 's'} left`}
            </span>
          </InsetRow>
        )}
        <InsetRow className="justify-between gap-3">
          <span className="text-body font-bold">Billing</span>
          {!account.billing_configured ? (
            <span className="text-footnote text-muted-foreground">Not taking cards on this server yet.</span>
          ) : account.plan === 'paid' || account.plan === 'lapsed' ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  window.location.href = (await api.coach.portal()).url;
                } catch (e) {
                  toast.error((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              {account.plan === 'lapsed' ? 'Fix the card' : 'Manage billing'}
            </Button>
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                try {
                  window.location.href = (await api.coach.checkout(seats)).url;
                } catch (e) {
                  toast.error((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={3}
                max={200}
                value={seats}
                onChange={(event) => setSeats(Number(event.target.value))}
                className="tnum h-9 w-20"
                aria-label="Seats"
              />
              <Button type="submit" size="sm" disabled={busy || seats < 3}>
                Continue to checkout
              </Button>
            </form>
          )}
        </InsetRow>
      </InsetGroup>

      <InsetGroup title="Email" footer="The one email this dashboard sends on its own: who logged, who did not, whose protein slipped. Numbers only.">
        <InsetRow className="justify-between">
          <span>
            <span className="text-body block font-bold">Monday digest</span>
            <span className="text-footnote text-muted-foreground block">07:00 every Monday, in your timezone.</span>
          </span>
          <Switch
            checked={account.notify_digest}
            onCheckedChange={async (checked) => {
              try {
                setAccount(await api.coach.update({ notify_digest: checked }));
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
            aria-label="Monday digest email"
          />
        </InsetRow>
      </InsetGroup>

      <InsetGroup title="Pricing" footer="Per seat, monthly. Annual is ten months for twelve. A seat is a client with an active link; pending codes do not count.">
        <InsetRow className="justify-between"><span className="text-body">1 seat</span><span className="text-body tnum">free, client on the free tier</span></InsetRow>
        <InsetRow className="justify-between"><span className="text-body">2 – 10 seats</span><span className="text-body tnum">$6 each</span></InsetRow>
        <InsetRow className="justify-between"><span className="text-body">11 – 30 seats</span><span className="text-body tnum">$5 each</span></InsetRow>
        <InsetRow className="justify-between"><span className="text-body">31 and up</span><span className="text-body tnum">$4 each</span></InsetRow>
      </InsetGroup>

      <div className="px-1">
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

function planLabel(account: CoachAccount): string {
  switch (account.plan) {
    case 'trial':
      return 'Trial';
    case 'solo':
      return 'Solo';
    case 'paid':
      return 'Per seat';
    case 'lapsed':
      return 'Payment failed';
  }
}

function seatFooter(account: CoachAccount): string {
  switch (account.plan) {
    case 'trial':
      return 'Every seat carries Plus during the trial. Pick a plan before it ends and nothing changes for your clients.';
    case 'solo':
      return 'One client, on the free tier: manual and barcode logging, one photo. A paid seat puts them on Plus.';
    case 'paid':
      return 'Add a seat from the billing page and it is prorated to the day.';
    case 'lapsed':
      return 'Seats keep Plus for two weeks after a failed payment, then drop to free. Fix the card and they come straight back.';
  }
}
