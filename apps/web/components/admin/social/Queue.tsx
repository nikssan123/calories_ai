'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BellRing,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SocialBufferPost, SocialBufferQueue } from '@ct/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fromLocalInput, inZone, serviceLabel, toLocalInput } from './labels';

/**
 * Buffer's queue, and the three things you can do to it.
 *
 * Read from Buffer on every load rather than from our rows, because our rows
 * cannot answer this: a row turns `posted` the moment Buffer accepts it, days
 * before it publishes, and the account also holds posts this pipeline never
 * made. A post with no source key came from somewhere else and says so.
 *
 * Top / bottom and not drag-to-reorder: Buffer offers `movePostInQueue` with
 * those two positions and nothing else, so a draggable list would be a lie
 * about what can be expressed. When something is topical it goes next, and
 * when it is not it goes last, which is the whole of what this is for.
 */

/** Posts sharing a due time — one slot firing on several channels. */
function bySlot(posts: SocialBufferPost[]): { at: string | null; posts: SocialBufferPost[] }[] {
  const groups = new Map<string, SocialBufferPost[]>();
  for (const post of posts) {
    const at = post.dueAt ?? 'none';
    const list = groups.get(at);
    if (list) list.push(post);
    else groups.set(at, [post]);
  }
  return [...groups.entries()]
    .map(([at, list]) => ({ at: at === 'none' ? null : at, posts: list }))
    // Undated last. A draft has no `dueAt` and Buffer returns it first, which
    // put something nobody scheduled at the top of a list about what goes next.
    .sort((a, b) => {
      if (a.at === b.at) return 0;
      if (a.at === null) return 1;
      if (b.at === null) return -1;
      return a.at.localeCompare(b.at);
    });
}

export function SocialQueueTab() {
  const [queue, setQueue] = useState<SocialBufferQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Which post has its time picker open, and what is typed in it. */
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setQueue(await api.admin.socialBufferQueue());
      setError(null);
    } catch (e) {
      // Kept, not swallowed: an empty Buffer and an unreachable Buffer must not
      // render the same, which is a fault this view already had once.
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (id: string, what: () => Promise<unknown>, done: string) => {
      setBusy(id);
      try {
        await what();
        toast.success(done);
        await load();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(null);
        setEditing(null);
      }
    },
    [load],
  );

  if (error) {
    return (
      <div className="border-hairline rounded-xl border p-6 text-center">
        <p className="text-footnote text-destructive">{error}</p>
        <Button variant="secondary" className="mt-3" onClick={() => void load()}>
          <RefreshCw className="size-4" />
          Try again
        </Button>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  const slots = bySlot(queue.upcoming);

  return (
    <div className="space-y-5">
      {/* Depth per channel, against the plan's ceiling. Per channel and not
          account-wide: counting across three once reported 13 of 10 against
          thirty posts of real headroom. */}
      <div className="grid gap-2 sm:grid-cols-3">
        {queue.channels.map((ch) => {
          const full = ch.limit !== null && ch.scheduled >= ch.limit;
          return (
            <div
              key={ch.id}
              className={cn(
                'border-hairline rounded-xl border p-3',
                full && 'border-destructive/60',
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-footnote font-bold">{serviceLabel(ch.service)}</span>
                <span
                  className={cn('text-headline', full ? 'text-destructive' : 'text-primary')}
                >
                  {ch.scheduled}
                  {ch.limit !== null && (
                    <span className="text-muted-foreground text-footnote">/{ch.limit}</span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {slots.length === 0 ? (
        <div className="border-hairline text-footnote text-muted-foreground rounded-xl border p-8 text-center">
          Queue is empty.
        </div>
      ) : (
        <div className="space-y-3">
          {slots.map(({ at, posts }) => {
            const zone =
              queue.channels.find((c) => c.id === posts[0]?.channelId)?.timezone ?? 'UTC';
            const first = posts[0]!;
            const isVideo = first.mediaType === 'video';
            return (
              <div key={at ?? 'undated'} className="border-hairline rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-footnote font-bold">{inZone(at, zone)}</span>
                    {posts.some((p) => p.status === 'draft') && (
                      <span className="text-footnote text-muted-foreground">draft</span>
                    )}
                    {posts.some((p) => p.status === 'error') && (
                      <span className="text-footnote text-destructive">error</span>
                    )}
                    {posts.some((p) => p.custom) && (
                      <Clock className="text-muted-foreground size-3.5" />
                    )}
                    {posts.some((p) => p.sourceKey === null) && (
                      <span className="text-footnote text-muted-foreground italic">external</span>
                    )}
                  </div>
                  <span className="text-footnote text-muted-foreground">
                    {posts.map((p) => serviceLabel(p.service)).join(' · ')}
                  </span>
                </div>

                <div className="text-footnote mt-1 flex items-center gap-2">
                  {first.sourceKey && <code>{first.sourceKey}</code>}
                  <span className="text-muted-foreground">
                    {isVideo ? 'video' : `${first.assets} images`}
                  </span>
                </div>

                <p className="text-footnote text-muted-foreground mt-1 line-clamp-2">
                  {first.text}
                </p>

                {editing?.id === first.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="datetime-local"
                      className="border-hairline bg-background text-footnote rounded-lg border px-2 py-1.5"
                      value={editing.value}
                      onChange={(e) => setEditing({ id: first.id, value: e.target.value })}
                    />
                    <Button
                      size="sm"
                      disabled={busy === first.id || !editing.value}
                      onClick={() =>
                        void act(
                          first.id,
                          () =>
                            // Every post in the slot, so a carousel on three
                            // channels moves together rather than splitting.
                            Promise.all(
                              posts.map((p) =>
                                api.admin.retimeSocialPost(
                                  p.id,
                                  fromLocalInput(editing.value, zone),
                                ),
                              ),
                            ),
                          'Time changed',
                        )
                      }
                    >
                      {busy === first.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Clock className="size-4" />
                      )}
                      Set
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === first.id}
                      onClick={() =>
                        void act(
                          first.id,
                          () =>
                            Promise.all(posts.map((p) => api.admin.moveSocialPost(p.id, 'top'))),
                          'Moved to the front',
                        )
                      }
                    >
                      <ArrowUpToLine className="size-4" />
                      Next
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === first.id}
                      onClick={() =>
                        void act(
                          first.id,
                          () =>
                            Promise.all(
                              posts.map((p) => api.admin.moveSocialPost(p.id, 'bottom')),
                            ),
                          'Moved to the back',
                        )
                      }
                    >
                      <ArrowDownToLine className="size-4" />
                      Last
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === first.id}
                      onClick={() => setEditing({ id: first.id, value: toLocalInput(at, zone) })}
                    >
                      <Clock className="size-4" />
                      Time
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy === first.id}
                      onClick={() =>
                        void act(
                          first.id,
                          () =>
                            Promise.all(posts.map((p) => api.admin.removeSocialPost(p.id))),
                          'Removed from Buffer',
                        )
                      }
                    >
                      {busy === first.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* When it posts. Readable over Buffer's API, settable only in Buffer. */}
      <div className="border-hairline rounded-xl border p-3">
        <div className="text-footnote mb-2 flex items-center gap-2 font-bold">
          <BellRing className="size-4" />
          Slots
        </div>
        <ul className="space-y-1">
          {queue.channels.map((ch) => (
            <li key={ch.id} className="text-footnote flex flex-wrap items-baseline gap-x-3">
              <span className="w-20 shrink-0 font-bold">{serviceLabel(ch.service)}</span>
              <span className="text-muted-foreground min-w-0 flex-1">
                {ch.slots
                  .filter((s) => !s.paused && s.times.length)
                  .map((s) => `${s.day} ${s.times.join(', ')}`)
                  .join('  ·  ') || 'none'}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-footnote text-muted-foreground mt-2">
          Set in Buffer — its API has no mutation for these.
        </p>
      </div>
    </div>
  );
}
