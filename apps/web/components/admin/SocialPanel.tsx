'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  ExternalLink,
  Loader2,
  RefreshCw,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  SocialBufferChannel,
  SocialBufferPost,
  SocialBufferQueue,
  SocialChannel,
  SocialGroup,
  SocialPosted,
  SocialQueue,
} from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { timestamp } from './format';
import { cn } from '@/lib/utils';

/**
 * The social queue: one rendered post at a time, and a yes or a no.
 *
 * Built as a stack rather than a table on purpose. A table invites reading
 * fourteen rows and deciding none of them, which is how Buffer's queue came to
 * hold six unique posts across fourteen slots — nobody was ever looking at one
 * post and asking whether it was good. One card, the image at a size you can
 * actually judge, two buttons.
 *
 * The caption is editable in place before approving, because the one thing
 * always wrong with a generated caption is a detail, and making the fix a
 * separate re-render on a laptop means it does not happen.
 *
 * What this panel cannot do, deliberately:
 *
 *  * It does not render images. `post.mts` does that on a Mac with a headless
 *    Chrome; the API container has no browser. Slides are added here with the
 *    file picker, straight out of `content/out/posts/` — uploaded from the
 *    browser because `/admin/*` answers only to a session, and a CLI would have
 *    to carry a copied cookie to do the same job.
 *  * It does not pick a time. Approving hands the post to the channel's own
 *    Buffer schedule, which somebody already configured there.
 *  * It does not write copy with a model. The beats come from
 *    `content/hooks/hooks.txt` and the §10 library, which are checked in.
 */

/** Buffer's service names, as the channel list returns them. */
const SERVICE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'X',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
};

const serviceLabel = (service: string) => SERVICE_LABELS[service] ?? service;

/**
 * The metrics worth a row's width.
 *
 * Buffer returns whatever each platform exposes, which on some channels is
 * fifteen figures including `postCount` and `freeSubscriptions`. Four is what
 * fits, and these four are the ones that answer whether a hook worked: views
 * for reach, likes and comments for whether it landed, and saves because a
 * save is the strongest signal a slideshow can generate.
 */
const KEY_METRICS = ['views', 'impressions', 'likes', 'reactions', 'comments', 'saves'];

/** Whole numbers for counts, one decimal and a % for rates. */
function formatMetric(value: number, unit: string): string {
  if (unit === 'percentage') return `${value.toFixed(1)}%`;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

/**
 * Hashtags offered as chips, so the set is a decision rather than typing.
 *
 * Short, and every one is something a person actually searches. The queue this
 * replaces carried six per post including `#consistencyoverperfection`, which
 * is a sentiment, not a query — the reason to keep this list in code and small
 * is that a free-text field regrows that habit immediately.
 *
 * How many of these reach a post is decided server-side per service:
 * `HASHTAG_LIMITS` in `services/social.ts` gives Instagram five and X two,
 * because on X a tag costs a clause out of 280 characters.
 */
const HASHTAG_SUGGESTIONS = [
  'calorietracker',
  'caloriecounting',
  'macros',
  'macrotracking',
  'foodlogging',
  'foodjournal',
  'nutrition',
  'highprotein',
  'mealprep',
  'buildinpublic',
  'indiedev',
  'solofounder',
];

/**
 * A channel's slots, said the way a person would read them.
 *
 * Seven rows of `mon 19:00` is a table nobody parses; runs of days sharing a
 * time read in one glance — "Mon–Thu 19:00 · Fri–Sun 13:00, 19:00" is the
 * whole schedule, and the asymmetry is the interesting part of it.
 *
 * Monday-first, though Buffer's own preference here is Sunday-first, because
 * the weekend is where the second slot lives and splitting it across the two
 * ends of the row hides exactly what this is for.
 */
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

function slotSummary(slots: SocialBufferChannel['slots']): string {
  const byDay = new Map(slots.map((s) => [s.day, s]));
  const runs: { from: string; to: string; times: string }[] = [];
  for (const day of DAY_ORDER) {
    const slot = byDay.get(day);
    // A paused day posts nothing, so it breaks a run rather than joining one.
    const times = slot && !slot.paused ? slot.times.join(', ') : '';
    const last = runs.at(-1);
    if (last && last.times === times) last.to = day;
    else runs.push({ from: day, to: day, times });
  }
  return (
    runs
      .filter((r) => r.times)
      .map((r) => {
        const days =
          r.from === r.to
            ? DAY_LABELS[r.from]
            : `${DAY_LABELS[r.from]}\u2013${DAY_LABELS[r.to]}`;
        return `${days} ${r.times}`;
      })
      .join(' \u00b7 ') || 'no slots'
  );
}

/**
 * A due time in the channel's own timezone.
 *
 * `timestamp()` renders UTC, which is right for a support call and wrong here:
 * every one of these slots was set in Sofia time, and 16:00Z reading as 16:00
 * makes a 19:00 post look like it goes out mid-afternoon.
 */
function inZone(iso: string | null, timeZone: string): string {
  if (!iso) return 'no time set';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    // An unknown timezone from Buffer should degrade, not blank the queue.
    return timestamp(iso);
  }
}

/** Posts sharing a due time, which is what a slot firing on three channels is. */
function bySlot(posts: SocialBufferPost[]): { at: string | null; posts: SocialBufferPost[] }[] {
  const groups = new Map<string, SocialBufferPost[]>();
  for (const post of posts) {
    const at = post.dueAt ?? 'none';
    const list = groups.get(at);
    if (list) list.push(post);
    else groups.set(at, [post]);
  }
  return (
    [...groups.entries()]
      .map(([at, list]) => ({ at: at === 'none' ? null : at, posts: list }))
      // Undated last, whatever order Buffer returned. A draft has no `dueAt`
      // and Buffer hands it over first, which put an orphan nobody scheduled
      // at the top of a list whose whole purpose is "what goes out next".
      .sort((a, b) => {
        if (a.at === b.at) return 0;
        if (a.at === null) return 1;
        if (b.at === null) return -1;
        return a.at.localeCompare(b.at);
      })
  );
}

export function SocialPanel() {
  const [queue, setQueue] = useState<SocialQueue | null>(null);
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** Which slide of the current carousel is on screen. */
  const [slide, setSlide] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [posted, setPosted] = useState<SocialPosted[] | null>(null);
  /** Buffer's side. `null` while loading, and an error string if it refused. */
  const [buffer, setBuffer] = useState<SocialBufferQueue | null>(null);
  const [bufferError, setBufferError] = useState<string | null>(null);

  const load = useCallback(async (keepPlace = false) => {
    setRefreshing(true);
    try {
      const next = await api.admin.social();
      setQueue(next);
      if (!keepPlace) setIndex(0);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Performance is fetched separately and failures are swallowed: it reaches
   * Buffer for per-post metrics, and a panel that cannot be used to decide
   * anything because the numbers are slow is worse than a panel with no
   * numbers.
   */
  useEffect(() => {
    api.admin
      .socialPerformance()
      .then((r) => setPosted(r.posted))
      .catch(() => setPosted([]));
  }, []);

  /*
   * Buffer's queue, on its own request and with its own error kept.
   *
   * Swallowing this one the way performance is swallowed would reproduce the
   * fault it exists to prevent: an unreachable Buffer and an empty Buffer
   * rendering identically. The message is shown.
   */
  useEffect(() => {
    api.admin
      .socialBufferQueue()
      .then(setBuffer)
      .catch((e: Error) => setBufferError(e.message));
  }, []);

  /**
   * Slides straight off disk, from `content/out/posts/`.
   *
   * The filename is the source key, which is how a slide keeps its place in its
   * slideshow through the queue — `10-three-ways-1-story.png` becomes
   * `10-three-ways-1`. The caption starts as a placeholder because the image
   * already carries the beats and repeating them underneath reads as a
   * transcript; it is edited on the card before approving.
   *
   * Dimensions are read from the PNG header rather than an `<img>`: the queue
   * should record what was actually rendered, and a 1080x1350 slide reaching
   * TikTok is one of the things this panel exists to catch.
   */
  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setUploading(true);
      let ok = 0;
      try {
        for (const file of Array.from(files)) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const view = new DataView(bytes.buffer);
          const isMp4 = /\.mp4$/i.test(file.name);

          /*
           * A PNG is measured from its header. An MP4's dimensions are behind a
           * box walk that is not worth doing in a file picker, and it does not
           * need doing: video.mts stitches slides that are already 1080x1920,
           * so the shape is known from what made it.
           */
          let width = 1080;
          let height = 1920;
          if (!isMp4) {
            if (bytes.length < 24 || view.getUint32(12) !== 0x49484452) {
              toast.error(`${file.name} is not a PNG`);
              continue;
            }
            width = view.getUint32(16);
            height = view.getUint32(20);
          }

          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          await api.admin.uploadSocial({
            sourceKey: file.name.replace(/(-(?:post|story|square))?\.(png|mp4)$/i, ''),
            caption: `TODO caption — ${file.name}`,
            width,
            height,
            mediaType: isMp4 ? 'video/mp4' : 'image/png',
            bytes: btoa(binary),
          });
          ok++;
        }
        if (ok) toast.success(`Added ${ok} slide${ok === 1 ? '' : 's'}`);
        await load(true);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [load],
  );

  const current: SocialGroup | undefined = queue?.pending[index];

  /*
   * The caption resets to the candidate's own text whenever the card changes,
   * and the channel choice does not: which accounts you are posting to is a
   * decision about this batch, not about this image, and re-ticking three boxes
   * per card is exactly the mouse mileage ContentPanel's header warns about.
   */
  useEffect(() => {
    setCaption(current?.caption ?? '');
    setSlide(0);
  }, [current?.key, current?.caption]);

  /** Everything connected, ticked, the first time the channels arrive. */
  useEffect(() => {
    if (!queue || chosen.length) return;
    setChosen(queue.channels.filter((c) => !c.disconnected).map((c) => c.id));
  }, [queue, chosen.length]);

  /** The slide on screen, and whether the carousel is self-consistent. */
  const shown = current?.slides[Math.min(slide, (current?.slides.length ?? 1) - 1)];
  /** A video group is one asset; its url carries the extension. */
  const isVideo = Boolean(shown?.assetUrl && /\.mp4$/i.test(shown.assetUrl));
  const mixedAspect = useMemo(() => {
    if (!current || current.slides.length < 2) return false;
    const ratio = (s: { width: number; height: number }) => (s.width / s.height).toFixed(3);
    return new Set(current.slides.map(ratio)).size > 1;
  }, [current]);

  const full = useMemo(() => {
    const { used, limit } = queue?.scheduled ?? { used: 0, limit: null };
    return limit !== null && used >= limit;
  }, [queue]);

  const act = useCallback(
    async (verdict: 'approve' | 'reject') => {
      if (!current || busy) return;
      setBusy(true);
      try {
        const result =
          verdict === 'approve'
            ? await api.admin.decideSocial(current.key, {
                verdict: 'approve',
                channelIds: chosen,
                caption: caption.trim() === current.caption ? undefined : caption.trim(),
                hashtags: tags.length ? tags : undefined,
              })
            : await api.admin.decideSocial(current.key, { verdict: 'reject' });

        if (result.state === 'error') {
          toast.error(result.error ?? 'Buffer refused the post');
        } else if (result.state === 'posted') {
          const n = result.bufferIds.length;
          const s = result.slides.length;
          toast.success(
            `Queued a ${s}-slide carousel to ${n} channel${n === 1 ? '' : 's'}`,
          );
        } else {
          toast.success('Rejected');
        }

        /*
         * Drop the decided card out of the stack locally instead of reloading
         * and jumping back to the top. Deciding twenty posts should be twenty
         * clicks, not twenty clicks and nineteen scroll-backs.
         */
        setQueue((prev) =>
          prev
            ? {
                ...prev,
                pending: prev.pending.filter((g) => g.key !== current.key),
                counts: {
                  ...prev.counts,
                  pending: Math.max(0, prev.counts.pending - current.slides.length),
                },
              }
            : prev,
        );
        setIndex((i) => Math.max(0, Math.min(i, (queue?.pending.length ?? 1) - 2)));
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [current, busy, chosen, caption, tags, queue?.pending.length],
  );

  if (!queue) {
    return (
      <InsetGroup>
        <div className="space-y-3 p-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      </InsetGroup>
    );
  }

  return (
    <div className="space-y-4">
      <InsetGroup>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-headline">
              {queue.counts.pending} waiting
              {queue.counts.posted > 0 && (
                <span className="text-footnote text-muted-foreground ml-2 font-normal">
                  {queue.counts.posted} posted · {queue.counts.rejected} rejected
                </span>
              )}
            </div>
            <p className="text-footnote text-muted-foreground mt-0.5">
              Rendered by{' '}
              <code className="text-[12px]">npx tsx scripts/content/queue.mts</code>. Approving
              hands the post to the channel&apos;s Buffer schedule.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label
              className={cn(
                'text-footnote border-hairline flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-bold',
                uploading && 'pointer-events-none opacity-60',
              )}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Add slides
              <input
                type="file"
                accept="image/png,video/mp4"
                multiple
                className="hidden"
                onChange={(e) => void upload(e.target.files)}
              />
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load(true)}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </InsetGroup>

      {/* Buffer's ceiling, which is low and otherwise silent: the free plan
          takes ten scheduled posts and refuses the eleventh at approve time. */}
      {full && (
        <InsetGroup>
          <div className="flex items-start gap-3 p-4">
            <TriangleAlert className="text-destructive mt-0.5 size-5 shrink-0" />
            <div className="text-footnote">
              Buffer&apos;s queue is full — {queue.scheduled.used} of {queue.scheduled.limit}{' '}
              scheduled posts. Approving now will be refused. Let some publish, or delete a few in
              Buffer first.
            </div>
          </div>
        </InsetGroup>
      )}

      {queue.channels.length === 0 && (
        <InsetGroup>
          <div className="flex items-start gap-3 p-4">
            <TriangleAlert className="text-muted-foreground mt-0.5 size-5 shrink-0" />
            <div className="text-footnote">
              No Buffer channels. Either <code className="text-[12px]">BUFFER_ACCESS_TOKEN</code>,{' '}
              <code className="text-[12px]">BUFFER_ORGANIZATION_ID</code> and{' '}
              <code className="text-[12px]">BUFFER_PUBLIC_ORIGIN</code> are unset on this
              deployment, or Buffer could not be reached. Rejecting still works.
            </div>
          </div>
        </InsetGroup>
      )}

      {!current ? (
        <InsetGroup>
          <div className="text-footnote text-muted-foreground p-8 text-center">
            Nothing waiting. Render more with{' '}
            <code className="text-[12px]">npx tsx scripts/content/post.mts</code>, then upload them
            with <code className="text-[12px]">queue.mts</code>.
          </div>
        </InsetGroup>
      ) : (
        <InsetGroup>
          <div className="space-y-4 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <code className="text-footnote">{current.key}</code>
              <span className="text-footnote text-muted-foreground">
                {index + 1} of {queue.pending.length} ·{' '}
                {isVideo
                  ? 'video'
                  : `${current.slides.length} slide${current.slides.length === 1 ? '' : 's'}`}{' '}
                · {shown?.width}×{shown?.height}
              </span>
            </div>

            {/* Judged at a real size. A thumbnail is how a bad post gets
                approved — the type is the content in this format, and type is
                the first thing a thumbnail destroys.

                The arrows step through the carousel. Without them the first
                build of this showed slide 0 and nothing else, which made a
                four-slide decision a one-slide guess. */}
            <div className="bg-muted/40 border-hairline relative flex justify-center rounded-xl border p-3">
              {isVideo ? (
                /* Controls and no autoplay: this is a review surface, and a
                   video that starts talking the moment a card appears is the
                   opposite of being able to judge it. */
                <video
                  key={shown?.id}
                  src={shown?.assetUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[560px] w-auto rounded-lg"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={shown?.id}
                  src={shown?.assetUrl}
                  alt={`${current.key} slide ${slide + 1}`}
                  className="max-h-[560px] w-auto rounded-lg"
                />
              )}
              {current.slides.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous slide"
                    onClick={() => setSlide((i) => (i - 1 + current.slides.length) % current.slides.length)}
                    className="bg-card/85 border-hairline absolute top-1/2 left-5 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next slide"
                    onClick={() => setSlide((i) => (i + 1) % current.slides.length)}
                    className="bg-card/85 border-hairline absolute top-1/2 right-5 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                  <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
                    {current.slides.map((s, i) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-label={`Slide ${i + 1}`}
                        onClick={() => setSlide(i)}
                        className={cn(
                          'size-2.5 rounded-full transition-colors',
                          i === slide ? 'bg-foreground' : 'bg-foreground/30',
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* One caption for the whole carousel, which is how the platforms
                model it — a carousel has one body and N images. Any mismatched
                aspect ratio is worth saying out loud here: Instagram crops a
                carousel to the first slide's ratio, so one odd slide reframes
                every other one. */}
            {mixedAspect && (
              <div className="text-footnote text-destructive flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                These slides are not all the same shape. Instagram crops a whole
                carousel to the first slide&apos;s ratio.
              </div>
            )}

            <label className="block space-y-1.5">
              <span className="text-footnote text-muted-foreground">Caption</span>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                className="border-hairline bg-card w-full rounded-lg border p-3 text-[15px] leading-relaxed"
              />
              <span className="text-footnote text-muted-foreground">
                {caption.length} characters
              </span>
            </label>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-footnote text-muted-foreground">Hashtags</span>
                <span className="text-footnote text-muted-foreground">
                  {tags.length
                    ? `${tags.length} picked — Instagram takes 5, X takes 2`
                    : 'none'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {HASHTAG_SUGGESTIONS.map((tag) => {
                  const on = tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setTags((prev) =>
                          prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                        )
                      }
                      className={cn(
                        'text-footnote rounded-full border px-2.5 py-1 transition-colors',
                        on
                          ? 'bg-primary text-primary-foreground border-transparent font-bold'
                          : 'border-hairline text-muted-foreground hover:text-foreground',
                      )}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
              {/* Order is the order they were picked, and the server trims from
                  the end — so the first few ticked are the ones that survive on
                  X. Worth knowing before wondering why two of five showed up. */}
            </div>

            <div className="space-y-1.5">
              <span className="text-footnote text-muted-foreground">Post to</span>
              <div className="flex flex-wrap gap-2">
                {queue.channels.map((channel) => (
                  <ChannelChip
                    key={channel.id}
                    channel={channel}
                    on={chosen.includes(channel.id)}
                    onToggle={() =>
                      setChosen((prev) =>
                        prev.includes(channel.id)
                          ? prev.filter((id) => id !== channel.id)
                          : [...prev, channel.id],
                      )
                    }
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => void act('reject')}
                disabled={busy}
              >
                <X className="size-4" />
                Reject
              </Button>
              <Button
                className="flex-1"
                onClick={() => void act('approve')}
                disabled={busy || !chosen.length}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Approve
              </Button>
            </div>

            {queue.pending.length > 1 && (
              <button
                type="button"
                onClick={() => setIndex((i) => (i + 1) % queue.pending.length)}
                disabled={busy}
                className="text-footnote text-muted-foreground hover:text-foreground w-full text-center"
              >
                Skip for now
              </button>
            )}
          </div>
        </InsetGroup>
      )}

      {/* Buffer's queue, read from Buffer.
          Our own rows cannot answer this. A row turns `posted` the moment
          Buffer accepts it — days before anybody sees it — and the account
          also holds posts this pipeline never made. */}
      {(buffer || bufferError) && (
        <InsetGroup>
          <div className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <CalendarClock className="text-muted-foreground size-4" />
              <div className="text-headline">In Buffer</div>
            </div>
            {bufferError ? (
              <p className="text-footnote text-destructive">
                Buffer would not answer: {bufferError}
              </p>
            ) : !buffer ? null : (
              <>
                <p className="text-footnote text-muted-foreground mb-3">
                  What is going out and when, as Buffer holds it. Times are each channel&apos;s own.
                  Approving here adds to these slots; the slots themselves are set in Buffer.
                </p>

                <ul className="mb-4 space-y-1">
                  {buffer.channels.map((ch) => (
                    <li key={ch.id} className="text-footnote flex flex-wrap items-baseline gap-x-3">
                      <span className="w-20 shrink-0 font-bold">{serviceLabel(ch.service)}</span>
                      <span
                        className={cn(
                          'w-20 shrink-0',
                          ch.limit !== null &&
                            ch.scheduled >= ch.limit &&
                            'text-destructive font-bold',
                        )}
                      >
                        {ch.scheduled}
                        {ch.limit !== null && ` / ${ch.limit}`}
                      </span>
                      <span className="text-muted-foreground min-w-0 flex-1">
                        {slotSummary(ch.slots)}
                      </span>
                      <span className="text-muted-foreground shrink-0">{ch.timezone}</span>
                    </li>
                  ))}
                </ul>

                {buffer.upcoming.length === 0 ? (
                  <p className="text-footnote text-muted-foreground">
                    Nothing scheduled. Approve something above and it lands in the next free slot.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bySlot(buffer.upcoming).map(({ at, posts }) => (
                      <div key={at ?? 'unscheduled'} className="border-hairline rounded-lg border p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="text-footnote font-bold">
                            {inZone(
                              at,
                              buffer.channels.find((c) => c.id === posts[0]?.channelId)?.timezone ??
                                'UTC',
                            )}
                          </span>
                          <span className="text-footnote text-muted-foreground">
                            {posts.map((post) => serviceLabel(post.service)).join(' · ')}
                          </span>
                        </div>
                        <div className="text-footnote mt-1 flex flex-wrap items-baseline gap-x-3">
                          {posts[0]?.sourceKey ? (
                            <code>{posts[0].sourceKey}</code>
                          ) : (
                            /* No key means it was composed in Buffer, not here.
                               Worth saying: five of this account's sent posts
                               are old singles, and folding them in silently is
                               how "what have we published" got answered wrong. */
                            <span className="text-muted-foreground italic">not from this queue</span>
                          )}
                          <span className="text-muted-foreground">
                            {posts[0]?.assets ?? 0} {posts[0]?.mediaType ?? 'asset'}
                            {(posts[0]?.assets ?? 0) === 1 ? '' : 's'}
                          </span>
                          {posts.some((post) => post.status !== 'scheduled') && (
                            <span
                              className={cn(
                                posts.some((post) => post.status === 'error')
                                  ? 'text-destructive'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {[...new Set(posts.map((post) => post.status))].join(', ')}
                            </span>
                          )}
                          {posts.some((post) => post.custom) && (
                            <span className="text-muted-foreground">custom time</span>
                          )}
                        </div>
                        <p className="text-footnote text-muted-foreground mt-1 line-clamp-2">
                          {posts[0]?.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {buffer.published.length > 0 && (
                  <>
                    <div className="text-footnote mt-4 mb-2 font-bold">Already published</div>
                    <ul className="space-y-1">
                      {buffer.published.map((post) => (
                        <li
                          key={post.id}
                          className="text-footnote flex flex-wrap items-baseline gap-x-3"
                        >
                          <span className="text-muted-foreground w-32 shrink-0">
                            {inZone(
                              post.sentAt ?? post.dueAt,
                              buffer.channels.find((c) => c.id === post.channelId)?.timezone ??
                                'UTC',
                            )}
                          </span>
                          <span className="w-20 shrink-0 font-bold">
                            {serviceLabel(post.service)}
                          </span>
                          {post.sourceKey ? (
                            <code className="shrink-0">{post.sourceKey}</code>
                          ) : (
                            <span className="text-muted-foreground shrink-0 italic">
                              not from this queue
                            </span>
                          )}
                          <span className="text-muted-foreground min-w-0 flex-1 truncate">
                            {post.text.split('\n')[0]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </InsetGroup>
      )}

      {posted && posted.length > 0 && (
        <InsetGroup>
          <div className="p-4">
            <div className="text-headline mb-1">How it did</div>
            <p className="text-footnote text-muted-foreground mb-3">
              Buffer&apos;s own figures, per post. It polls the platforms on its own schedule, so a
              post published in the last hour usually reads zero everywhere — the timestamp says
              when Buffer last looked.
            </p>
            <div className="space-y-3">
              {posted.map((item) => (
                <div key={item.key} className="border-hairline rounded-lg border p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <code className="text-footnote">{item.key}</code>
                    <span className="text-footnote text-muted-foreground">
                      {item.slides} slides
                    </span>
                  </div>
                  <p className="text-footnote text-muted-foreground mt-1 truncate">
                    {item.caption}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {item.channels.map((ch) => (
                      <li key={ch.postId} className="text-footnote flex flex-wrap items-baseline gap-x-3">
                        <span className="w-20 shrink-0 font-bold">{serviceLabel(ch.service)}</span>
                        <span
                          className={cn(
                            'w-24 shrink-0',
                            ch.status === 'sent' && 'text-primary',
                            ch.status === 'error' && 'text-destructive',
                            ch.status !== 'sent' && ch.status !== 'error' && 'text-muted-foreground',
                          )}
                        >
                          {ch.status}
                        </span>
                        {ch.metrics.length ? (
                          <span className="text-muted-foreground">
                            {ch.metrics
                              .filter((m) => KEY_METRICS.includes(m.name))
                              .map((m) => `${m.name} ${formatMetric(m.value, m.unit)}`)
                              .join(' · ') || 'no figures yet'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {ch.status === 'sent' ? 'Buffer has not polled yet' : 'not published yet'}
                          </span>
                        )}
                        {ch.error && <span className="text-destructive">{ch.error}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </InsetGroup>
      )}

      {queue.recent.length > 0 && (
        <InsetGroup>
          <div className="p-4">
            <div className="text-headline mb-3">Decided</div>
            <ul className="space-y-2">
              {queue.recent.map((item) => (
                <li key={item.id} className="flex items-baseline gap-3">
                  <span
                    className={cn(
                      'text-footnote w-16 shrink-0 font-bold',
                      item.state === 'posted' && 'text-primary',
                      item.state === 'error' && 'text-destructive',
                      item.state === 'rejected' && 'text-muted-foreground',
                    )}
                  >
                    {item.state}
                  </span>
                  <code className="text-footnote shrink-0">{item.sourceKey}</code>
                  <span className="text-footnote text-muted-foreground min-w-0 flex-1 truncate">
                    {item.error ?? item.caption}
                  </span>
                  <span className="text-footnote text-muted-foreground shrink-0">
                    {timestamp(item.postedAt ?? item.decidedAt ?? item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </InsetGroup>
      )}
    </div>
  );
}

function ChannelChip({
  channel,
  on,
  onToggle,
}: {
  channel: SocialChannel;
  on: boolean;
  onToggle: () => void;
}) {
  // A disconnected channel is shown rather than hidden: it is the reason a post
  // did not go out, and a channel silently missing from the row is the version
  // of this that wastes an afternoon.
  if (channel.disconnected) {
    return (
      <span className="border-hairline text-footnote text-muted-foreground flex items-center gap-1.5 rounded-full border px-3 py-1.5">
        {serviceLabel(channel.service)}
        <ExternalLink className="size-3" />
        reconnect in Buffer
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={cn(
        'text-footnote flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-bold transition-colors',
        on
          ? 'bg-primary text-primary-foreground border-transparent'
          : 'border-hairline text-muted-foreground hover:text-foreground',
      )}
    >
      {on && <Check className="size-3" />}
      {serviceLabel(channel.service)}
      <span className="font-normal opacity-70">{channel.name}</span>
    </button>
  );
}
