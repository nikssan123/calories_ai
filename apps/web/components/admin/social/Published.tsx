'use client';

import { useEffect, useState } from 'react';
import { Film, Images, Loader2 } from 'lucide-react';
import type { SocialBufferQueue, SocialMetric, SocialPosted } from '@ct/shared';
import { api } from '@/lib/api';
import { inZone, serviceLabel } from './labels';

/**
 * What went out, per platform.
 *
 * Same axis as the Queue tab, for the same reason. An earlier version grouped
 * by source key and nested the channels inside, which reads as "here is a post
 * and where it went" — a question nobody asks. The question is what Instagram
 * published this week and how it did, so the platform is the column.
 *
 * Buffer's sent list is the spine rather than our rows, because it is the only
 * complete answer: the `content/social/` back catalogue published through
 * Buffer's own composer and appears nowhere in `social_queue`. Our rows supply
 * the source key and the metrics, joined on the Buffer post id, and a row
 * without a key is labelled rather than folded in.
 *
 * Seven days. Buffer's free plan forgets analytics past thirty and the useful
 * window is shorter anyway — the question is whether last week's hooks worked.
 */

/**
 * The metrics worth a row's width.
 *
 * Buffer returns whatever each platform exposes, which on some channels is
 * fifteen figures including `postCount` and `freeSubscriptions`.
 */
const KEY_METRICS = ['views', 'impressions', 'likes', 'reactions', 'comments', 'saves'];

function formatMetric(value: number, unit: string): string {
  if (unit === 'percentage') return `${value.toFixed(1)}%`;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

const WINDOW_DAYS = 7;

export function SocialPublishedTab() {
  const [posted, setPosted] = useState<SocialPosted[] | null>(null);
  const [buffer, setBuffer] = useState<SocialBufferQueue | null>(null);

  useEffect(() => {
    // Swallowed on purpose: these are numbers read after the fact, and a slow
    // metrics call must not be able to blank the screen.
    api.admin
      .socialPerformance()
      .then((r) => setPosted(r.posted))
      .catch(() => setPosted([]));
    api.admin
      .socialBufferQueue()
      .then(setBuffer)
      .catch(() => setBuffer(null));
  }, []);

  if (!posted || !buffer) {
    return (
      <div className="text-footnote text-muted-foreground flex items-center gap-2 p-8">
        <Loader2 className="size-4 animate-spin" />
        Reading Buffer…
      </div>
    );
  }

  /** Buffer post id -> the metrics and the slide count our rows know about. */
  const extra = new Map<string, { metrics: SocialMetric[]; slides: number }>();
  for (const item of posted) {
    for (const ch of item.channels) {
      extra.set(ch.postId, { metrics: ch.metrics, slides: item.slides });
    }
  }

  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
  const recent = buffer.published.filter(
    (p) => p.sentAt && new Date(p.sentAt).getTime() >= cutoff,
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      {buffer.channels.map((channel) => {
        const posts = recent
          .filter((p) => p.channelId === channel.id)
          .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));

        return (
          <section key={channel.id} className="border-hairline rounded-xl border">
            <header className="border-hairline flex items-baseline justify-between border-b px-3 py-2.5">
              <span className="text-headline">{serviceLabel(channel.service)}</span>
              <span className="text-footnote text-muted-foreground">
                {posts.length} in {WINDOW_DAYS}d
              </span>
            </header>

            {posts.length === 0 ? (
              <p className="text-footnote text-muted-foreground p-6 text-center">
                Nothing published.
              </p>
            ) : (
              <ol className="divide-hairline divide-y">
                {posts.map((post) => {
                  const ours = extra.get(post.id);
                  const shown = (ours?.metrics ?? []).filter((m) => KEY_METRICS.includes(m.name));
                  const isVideo = post.mediaType === 'video';
                  return (
                    <li key={post.id} className="p-3">
                      <div className="flex items-center gap-2">
                        {isVideo ? (
                          <Film className="text-muted-foreground size-4 shrink-0" />
                        ) : (
                          <Images className="text-muted-foreground size-4 shrink-0" />
                        )}
                        <span className="text-footnote font-bold">
                          {inZone(post.sentAt, channel.timezone)}
                        </span>
                      </div>

                      <div className="text-footnote mt-1 flex flex-wrap items-center gap-x-2">
                        {post.sourceKey ? (
                          <code className="text-[11px]">{post.sourceKey}</code>
                        ) : (
                          /* Not from this queue: the old back catalogue went out
                             through Buffer's composer, and folding it in
                             silently is how "what have we published" got
                             answered wrongly once already. */
                          <span className="text-muted-foreground italic">external</span>
                        )}
                      </div>

                      <p className="text-footnote text-muted-foreground mt-1 line-clamp-2">
                        {post.text.split('\n')[0]}
                      </p>

                      <p className="text-footnote mt-1.5">
                        {shown.length ? (
                          <span className="text-primary">
                            {shown
                              .map((m) => `${m.name} ${formatMetric(m.value, m.unit)}`)
                              .join(' · ')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {/* Buffer's lag is real and surfaced rather than
                                shown as a row of zeros, which reads as "this
                                failed" instead of "ask again later". */}
                            {ours ? 'Buffer has not polled yet' : 'no figures'}
                          </span>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
