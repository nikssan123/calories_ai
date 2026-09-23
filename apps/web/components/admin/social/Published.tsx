'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { SocialBufferQueue, SocialPosted } from '@ct/shared';
import { api } from '@/lib/api';
import { inZone, serviceLabel } from './labels';

/**
 * What went out, and how it did.
 *
 * Two sources, because neither alone is the truth. Buffer knows what published
 * — including the `content/social/` back catalogue this pipeline never made —
 * and our rows are the only place a post's source key lives, which is what
 * makes a hook comparable against the next one. A row with no key came from
 * Buffer's own composer and is labelled rather than folded in.
 *
 * Seven days. Buffer's free plan forgets analytics past thirty and the useful
 * window is shorter than that anyway: the question here is whether the last
 * week's hooks worked, not what the account has ever done.
 */

/**
 * The metrics worth a row's width.
 *
 * Buffer returns whatever each platform exposes, which on some channels is
 * fifteen figures including `postCount` and `freeSubscriptions`. These are the
 * ones that answer whether a hook worked.
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
    // Failures are swallowed here on purpose: these are numbers to read after
    // the fact, and a slow metrics call must not be able to blank the screen.
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

  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
  const zoneOf = (channelId: string) =>
    buffer.channels.find((c) => c.id === channelId)?.timezone ?? 'UTC';

  /** Our own posts that have actually gone out inside the window. */
  const ours = posted
    .map((item) => ({
      item,
      channels: item.channels.filter(
        (ch) => ch.sentAt && new Date(ch.sentAt).getTime() >= cutoff,
      ),
    }))
    .filter((row) => row.channels.length)
    .sort((a, b) => (b.channels[0]!.sentAt ?? '').localeCompare(a.channels[0]!.sentAt ?? ''));

  /** Buffer's sent posts that this queue never made. */
  const external = buffer.published.filter(
    (p) => p.sourceKey === null && p.sentAt && new Date(p.sentAt).getTime() >= cutoff,
  );

  if (!ours.length && !external.length) {
    return (
      <div className="border-hairline text-footnote text-muted-foreground rounded-xl border p-8 text-center">
        Nothing published in the last {WINDOW_DAYS} days.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {ours.length > 0 && (
        <div className="space-y-3">
          {ours.map(({ item, channels }) => (
            <div key={item.key} className="border-hairline rounded-xl border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <code className="text-footnote">{item.key}</code>
                <span className="text-footnote text-muted-foreground">
                  {item.slides === 1 ? 'video' : `${item.slides} slides`}
                </span>
              </div>
              <p className="text-footnote text-muted-foreground mt-1 line-clamp-2">
                {item.caption}
              </p>
              <ul className="mt-2 space-y-1">
                {channels.map((ch) => {
                  const shown = ch.metrics.filter((m) => KEY_METRICS.includes(m.name));
                  return (
                    <li
                      key={ch.postId}
                      className="text-footnote flex flex-wrap items-baseline gap-x-3"
                    >
                      <span className="w-20 shrink-0 font-bold">{serviceLabel(ch.service)}</span>
                      <span className="text-muted-foreground w-32 shrink-0">
                        {inZone(ch.sentAt, 'Europe/Sofia')}
                      </span>
                      <span className="text-muted-foreground min-w-0 flex-1">
                        {shown.length
                          ? shown
                              .map((m) => `${m.name} ${formatMetric(m.value, m.unit)}`)
                              .join(' · ')
                          : 'Buffer has not polled yet'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {external.length > 0 && (
        <div className="border-hairline rounded-xl border p-3">
          <div className="text-footnote mb-2 font-bold">Not from this queue</div>
          <ul className="space-y-1">
            {external.map((post) => (
              <li key={post.id} className="text-footnote flex flex-wrap items-baseline gap-x-3">
                <span className="w-20 shrink-0 font-bold">{serviceLabel(post.service)}</span>
                <span className="text-muted-foreground w-32 shrink-0">
                  {inZone(post.sentAt, zoneOf(post.channelId))}
                </span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate">
                  {post.text.split('\n')[0]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
