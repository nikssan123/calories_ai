'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpToLine,
  BellRing,
  Clock,
  Film,
  Images,
  Loader2,
  RefreshCw,
  Trash2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SocialBufferPost, SocialBufferQueue } from '@ct/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fromLocalInput, inZone, serviceLabel, toLocalInput } from './labels';

/**
 * What is scheduled, per platform.
 *
 * The first version grouped by due time and listed the channels firing at it,
 * on the assumption that a slot holds the same post everywhere. That is true
 * only while every approval goes to every channel, and it stopped being true
 * within an hour: three carousels were re-approved to all three channels while
 * three memes sat on Instagram and TikTok only, so `26 Sep 19:00` held a
 * carousel on X and a meme on the other two. The UI showed one of them and
 * named all three channels — not just hard to read, actually wrong.
 *
 * So the axis is the platform, because that is the axis the question is asked
 * in: what goes out on TikTok, in what order. Each column is one channel's
 * queue in time order, and every control acts on the one post it sits under.
 * Moving a carousel that spans three channels is three taps; that is honest
 * about what Buffer stores, which is three independent posts.
 */

/** Sort a channel's posts: dated first in time order, undated drafts last. */
function inOrder(posts: SocialBufferPost[]): SocialBufferPost[] {
  return [...posts].sort((a, b) => {
    if (a.dueAt === b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.localeCompare(b.dueAt);
  });
}

export function SocialQueueTab() {
  const [queue, setQueue] = useState<SocialBufferQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  /** Which source keys appear on more than one channel, so a row can say so. */
  const spread = new Map<string, number>();
  for (const post of queue.upcoming) {
    if (!post.sourceKey) continue;
    spread.set(post.sourceKey, (spread.get(post.sourceKey) ?? 0) + 1);
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      {queue.channels.map((channel) => {
        const posts = inOrder(queue.upcoming.filter((p) => p.channelId === channel.id));
        const full = channel.limit !== null && channel.scheduled >= channel.limit;

        return (
          <section key={channel.id} className="border-hairline rounded-xl border">
            <header className="border-hairline flex items-baseline justify-between border-b px-3 py-2.5">
              <span className="text-headline">{serviceLabel(channel.service)}</span>
              <span className={cn('text-footnote', full ? 'text-destructive font-bold' : 'text-muted-foreground')}>
                {channel.scheduled}
                {channel.limit !== null && ` / ${channel.limit}`}
              </span>
            </header>

            {posts.length === 0 ? (
              <p className="text-footnote text-muted-foreground p-6 text-center">Nothing queued.</p>
            ) : (
              <ol className="divide-hairline divide-y">
                {posts.map((post) => {
                  const isVideo = post.mediaType === 'video';
                  const alsoOn = post.sourceKey ? (spread.get(post.sourceKey) ?? 1) - 1 : 0;
                  return (
                    <li key={post.id} className="p-3">
                      <div className="flex items-center gap-2">
                        {isVideo ? (
                          <Film className="text-muted-foreground size-4 shrink-0" />
                        ) : (
                          <Images className="text-muted-foreground size-4 shrink-0" />
                        )}
                        <span className="text-footnote font-bold">
                          {inZone(post.dueAt, channel.timezone)}
                        </span>
                        {post.custom && <Clock className="text-muted-foreground size-3.5" />}
                      </div>

                      <div className="text-footnote mt-1 flex flex-wrap items-center gap-x-2">
                        {/* Reminder or automatic, said plainly: it is the
                            difference between "this goes out" and "you post
                            this", and it is invisible otherwise. */}
                        <span
                          className={cn(
                            'inline-flex items-center gap-1',
                            post.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {post.status === 'draft' ? (
                            'draft'
                          ) : post.status === 'error' ? (
                            'error'
                          ) : post.reminder ? (
                            <>
                              <BellRing className="size-3" />
                              you post it
                            </>
                          ) : (
                            <>
                              <Zap className="size-3" />
                              auto
                            </>
                          )}
                        </span>
                        {post.sourceKey ? (
                          <code className="text-[11px]">{post.sourceKey}</code>
                        ) : (
                          <span className="text-muted-foreground italic">external</span>
                        )}
                        {alsoOn > 0 && (
                          <span className="text-muted-foreground">+{alsoOn} more</span>
                        )}
                      </div>

                      <p className="text-footnote text-muted-foreground mt-1 line-clamp-2">
                        {post.text.split('\n')[0]}
                      </p>

                      {editing?.id === post.id ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <input
                            type="datetime-local"
                            className="border-hairline bg-background text-footnote min-w-0 flex-1 rounded-lg border px-2 py-1.5"
                            value={editing.value}
                            onChange={(e) => setEditing({ id: post.id, value: e.target.value })}
                          />
                          <Button
                            size="sm"
                            disabled={busy === post.id || !editing.value}
                            onClick={() =>
                              void act(
                                post.id,
                                () =>
                                  api.admin.retimeSocialPost(
                                    post.id,
                                    fromLocalInput(editing.value, channel.timezone),
                                  ),
                                'Time changed',
                              )
                            }
                          >
                            {busy === post.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              'Set'
                            )}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Move to the front of this channel's queue"
                            disabled={busy === post.id}
                            onClick={() =>
                              void act(
                                post.id,
                                () => api.admin.moveSocialPost(post.id, 'top'),
                                'Moved to the front',
                              )
                            }
                          >
                            <ArrowUpToLine className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Set a specific time"
                            disabled={busy === post.id}
                            onClick={() =>
                              setEditing({
                                id: post.id,
                                value: toLocalInput(post.dueAt, channel.timezone),
                              })
                            }
                          >
                            <Clock className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive ml-auto"
                            title="Delete from Buffer"
                            disabled={busy === post.id}
                            onClick={() =>
                              void act(
                                post.id,
                                () => api.admin.removeSocialPost(post.id),
                                'Removed from Buffer',
                              )
                            }
                          >
                            {busy === post.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            <footer className="border-hairline text-footnote text-muted-foreground border-t px-3 py-2.5">
              <div className="mb-1 flex items-center gap-1.5">
                <Zap className="size-3.5" />
                <span className="font-bold">Slots</span>
                <span>· {channel.timezone.split('/')[1] ?? channel.timezone}</span>
              </div>
              {channel.slots
                .filter((s) => !s.paused && s.times.length)
                .map((s) => (
                  <div key={s.day} className="flex gap-2">
                    <span className="w-8 shrink-0 capitalize">{s.day}</span>
                    <span>{s.times.join(', ')}</span>
                  </div>
                ))}
            </footer>
          </section>
        );
      })}
    </div>
  );
}
