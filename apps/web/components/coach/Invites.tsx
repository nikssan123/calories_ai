'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CoachInvite } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { shortDate } from './bits';

/**
 * Codes. See COACH.md §5.
 *
 * A code is the whole handshake: the coach reads it out, texts it, or sends
 * the link, and the client accepts it in the app. Nothing is emailed from
 * here — a coach already has a channel to their client, and it is faster than
 * ours.
 */
export function Invites() {
  const [invites, setInvites] = useState<CoachInvite[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setInvites((await api.coach.invites()).invites);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const invite = await api.coach.createInvite();
      await copy(invite.url, `Link copied: ${invite.code}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!invites) return <Skeleton className="h-48 w-full rounded-2xl" />;

  const open = invites.filter((i) => !i.accepted_at && new Date(i.expires_at).getTime() > Date.now());
  const spent = invites.filter((i) => i.accepted_at);
  const expired = invites.filter((i) => !i.accepted_at && new Date(i.expires_at).getTime() <= Date.now());

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-large-title">Invites</h1>
          <p className="text-footnote text-muted-foreground mt-1">
            One code per client. They enter it in the app under Settings, or open the link on their
            phone. A code is good for 14 days.
          </p>
        </div>
        <Button size="lg" onClick={() => void create()} disabled={busy}>
          <Plus size={17} /> New code
        </Button>
      </div>

      <InsetGroup
        title={`Open · ${open.length}`}
        footer="Send the link, or read the code out. Either works — the app takes both."
      >
        {open.length === 0 && (
          <InsetRow className="text-muted-foreground text-body">No open codes. Make one above.</InsetRow>
        )}
        {open.map((invite) => (
          <InsetRow key={invite.id} className="gap-4">
            <span className="tnum font-[family-name:var(--font-display)] text-[20px] font-extrabold tracking-wider">
              {invite.code}
            </span>
            <span className="text-footnote text-muted-foreground min-w-0 flex-1 truncate">
              {invite.url} · expires {shortDate(invite.expires_at.slice(0, 10))}
            </span>
            <span className="flex gap-1">
              <Button variant="secondary" size="sm" onClick={() => void copy(invite.url, 'Link copied')}>
                <Copy size={14} /> Link
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void copy(invite.code, 'Code copied')}>
                <Copy size={14} /> Code
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete this code"
                className="text-destructive"
                onClick={async () => {
                  try {
                    await api.coach.deleteInvite(invite.id);
                    await load();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Trash2 />
              </Button>
            </span>
          </InsetRow>
        ))}
      </InsetGroup>

      {spent.length > 0 && (
        <InsetGroup title={`Accepted · ${spent.length}`}>
          {spent.map((invite) => (
            <InsetRow key={invite.id} className="gap-4">
              <span className={cn('tnum font-[family-name:var(--font-display)] text-[16px] font-bold tracking-wider', 'text-muted-foreground')}>
                {invite.code}
              </span>
              <span className="text-body min-w-0 flex-1 truncate">
                {invite.accepted_name ?? 'A client'}{' '}
                <span className="text-muted-foreground">
                  · accepted {shortDate(invite.accepted_at!.slice(0, 10))}
                </span>
              </span>
            </InsetRow>
          ))}
        </InsetGroup>
      )}

      {expired.length > 0 && (
        <InsetGroup title={`Expired · ${expired.length}`}>
          {expired.map((invite) => (
            <InsetRow key={invite.id} className="text-muted-foreground gap-4">
              <span className="tnum font-[family-name:var(--font-display)] text-[16px] font-bold tracking-wider line-through">
                {invite.code}
              </span>
              <span className="text-footnote flex-1">expired {shortDate(invite.expires_at.slice(0, 10))}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete this code"
                onClick={async () => {
                  await api.coach.deleteInvite(invite.id).catch(() => {});
                  await load();
                }}
              >
                <Trash2 />
              </Button>
            </InsetRow>
          ))}
        </InsetGroup>
      )}
    </div>
  );
}

async function copy(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.message(text);
  }
}
