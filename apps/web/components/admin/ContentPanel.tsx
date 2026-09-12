'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lightbulb,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  LOCALES,
  LOCALE_ENGLISH_NAMES,
  type ContentPost,
  type Locale,
  type SuggestedTopic,
  type TopicWithPosts,
} from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The blog, from the writing side.
 *
 * A topic is a subject; under it sits one post per language, each written from
 * that language's own search results rather than translated from the English.
 *
 * The panel is built around one idea: **select languages, then act on them.**
 * The same ticked set drives writing, publishing and unpublishing, because the
 * alternative — a button per language per action — is thirteen clicks to do
 * anything, which is how the first version of this worked and why it was
 * unusable.
 *
 * Reviewing has its own path. The reader opens on one language and moves to the
 * next with the post still on screen, so thirteen articles are read in one pass
 * rather than thirteen open-read-close cycles. Publishing is still a decision a
 * person makes — this is a health-adjacent site and most of what the blog says
 * carries a nutrition claim — but making that decision should not also be an
 * exercise in mouse mileage.
 */

type Busy = { topicId: string; locale: Locale | null } | null;

/**
 * Seconds since the current job started, or null when nothing is running.
 *
 * Writing an article takes about a minute and choosing subjects about the same.
 * A spinner alone does not survive that — the first report of this panel was "I
 * clicked Suggest topics and nothing happened", from a request that answered
 * ninety seconds later. A number that moves is the difference between waiting
 * and being ignored.
 */
function useElapsed(running: boolean): number | null {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (!running) {
      setSeconds(null);
      return;
    }
    const started = Date.now();
    setSeconds(0);
    const id = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);
  return seconds;
}

export function ContentPanel() {
  const [topics, setTopics] = useState<TopicWithPosts[] | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [thinking, setThinking] = useState(false);

  /** Which languages are ticked, per topic. Keyed by topic so two cannot bleed. */
  const [picked, setPicked] = useState<Record<string, Set<Locale>>>({});

  /** The reader: which topic is open and which language within it. */
  const [reading, setReading] = useState<{ topicId: string; locale: Locale } | null>(null);

  const [suggested, setSuggested] = useState<SuggestedTopic[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');

  const elapsed = useElapsed(thinking || busy !== null);

  const load = useCallback(async () => {
    try {
      setTopics((await api.admin.content()).topics);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- selection ------------------------------------------------------------

  const selectionFor = (topicId: string) => picked[topicId] ?? new Set<Locale>();

  function toggle(topicId: string, locale: Locale) {
    setPicked((prev) => {
      const next = new Set(prev[topicId] ?? []);
      if (next.has(locale)) next.delete(locale);
      else next.add(locale);
      return { ...prev, [topicId]: next };
    });
  }

  const setSelection = (topicId: string, locales: Locale[]) =>
    setPicked((prev) => ({ ...prev, [topicId]: new Set(locales) }));

  const untick = (topicId: string, locale: Locale) =>
    setPicked((prev) => {
      const next = new Set(prev[topicId] ?? []);
      next.delete(locale);
      return { ...prev, [topicId]: next };
    });

  // ---- topics ---------------------------------------------------------------

  async function suggest() {
    setThinking(true);
    try {
      const { topics: proposals } = await api.admin.suggestTopics();
      setSuggested(proposals);
      setChosen(new Set(proposals.map((_, i) => i)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  /**
   * Take the ticked ones — and record the rest as turned down.
   *
   * The unticked half is the more valuable signal. Silently dropping it is why
   * the same subject kept reappearing every time the button was pressed.
   */
  async function acceptSuggested() {
    if (!suggested) return;
    const wanted = suggested.filter((_, i) => chosen.has(i));
    const refused = suggested.filter((_, i) => !chosen.has(i));
    if (wanted.length === 0) return;
    setThinking(true);
    try {
      for (const topic of wanted) await api.admin.createTopic(topic.name, topic.brief);
      if (refused.length > 0) await api.admin.rejectSuggestions(refused.map((t) => t.name));
      setSuggested(null);
      setChosen(new Set());
      toast.success(
        `Added ${wanted.length}${refused.length ? `, turned down ${refused.length}` : ''}`,
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  /** Discarding the whole batch is a rejection of all of it. */
  async function discardSuggested() {
    const all = suggested ?? [];
    setSuggested(null);
    setChosen(new Set());
    if (all.length > 0) {
      try {
        await api.admin.rejectSuggestions(all.map((t) => t.name));
      } catch {
        // Not worth a toast: the batch is gone from the screen either way, and
        // the worst case is the planner offers one of them again.
      }
    }
  }

  async function addTopic() {
    if (!name.trim() || !brief.trim()) return;
    try {
      await api.admin.createTopic(name.trim(), brief.trim());
      setName('');
      setBrief('');
      setAdding(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function removeTopic(id: string) {
    try {
      await api.admin.deleteTopic(id);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ---- writing --------------------------------------------------------------

  /**
   * The ticked languages, one after another.
   *
   * Sequential rather than parallel, and not for politeness: thirteen
   * concurrent Opus turns on one subscription is how you find its rate limit.
   *
   * One failure does not end the run — a language can fail for its own reasons
   * and the rest are still worth having. Two in a row does: that is the lane
   * being unavailable, and grinding through eleven more is eleven more minutes
   * of the same error.
   */
  async function writeSelected(topicId: string) {
    const wanted = LOCALES.filter((l) => selectionFor(topicId).has(l));
    if (wanted.length === 0) return;

    let written = 0;
    let failed = 0;
    let consecutive = 0;

    for (const locale of wanted) {
      setBusy({ topicId, locale });
      try {
        await api.admin.writePost(topicId, locale);
        written++;
        consecutive = 0;
        // Untick as each lands, so an interrupted run leaves exactly what is
        // left still ticked.
        untick(topicId, locale);
      } catch (e) {
        failed++;
        consecutive++;
        toast.error(`${LOCALE_ENGLISH_NAMES[locale]}: ${(e as Error).message}`);
        if (consecutive >= 2) {
          toast.error('Two in a row failed — stopping.');
          break;
        }
      }
    }

    setBusy(null);
    if (written > 0) {
      toast.success(
        `Wrote ${written} language${written === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`,
      );
    }
    await load();
  }

  async function write(topicId: string, locale: Locale) {
    setBusy({ topicId, locale });
    try {
      await api.admin.writePost(topicId, locale);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // ---- publishing -----------------------------------------------------------

  async function setStatus(posts: ContentPost[], status: 'published' | 'draft' | 'binned') {
    if (posts.length === 0) return;
    setThinking(true);
    try {
      for (const post of posts) await api.admin.updatePost(post.id, { status });
      const verb = status === 'published' ? 'Published' : status === 'draft' ? 'Unpublished' : 'Binned';
      toast.success(`${verb} ${posts.length}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  // ---- reading --------------------------------------------------------------

  const openTopic = reading ? topics?.find((t) => t.topic.id === reading.topicId) : undefined;
  const openPost = openTopic?.posts.find((p) => p.locale === reading?.locale) ?? null;
  /** The written languages of the open topic, in the order the chips show them. */
  const readable = openTopic ? LOCALES.filter((l) => openTopic.posts.some((p) => p.locale === l)) : [];
  const readIndex = reading ? readable.indexOf(reading.locale) : -1;

  function step(delta: number) {
    if (!reading || readIndex === -1) return;
    const next = readable[readIndex + delta];
    if (next) setReading({ topicId: reading.topicId, locale: next });
    else setReading(null);
  }

  async function publishAndNext() {
    if (!openPost) return;
    try {
      await api.admin.updatePost(openPost.id, { status: 'published' });
      await load();
      step(1);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!topics) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-[var(--radius)]" />
        <Skeleton className="h-28 w-full rounded-[var(--radius)]" />
      </div>
    );
  }

  const totalLive = topics.reduce(
    (n, t) => n + t.posts.filter((p) => p.status === 'published').length,
    0,
  );
  const totalDrafts = topics.reduce((n, t) => n + t.posts.filter((p) => p.status === 'draft').length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-footnote text-muted-foreground">
          {topics.length} topic{topics.length === 1 ? '' : 's'} · {totalLive} live ·{' '}
          {totalDrafts} awaiting review · {LOCALES.length} languages
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => void load()}
            className="h-9 gap-1.5 rounded-full"
          >
            <RefreshCw size={14} />
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={() => setAdding((v) => !v)}
            className="h-9 gap-1.5 rounded-full"
          >
            <Plus size={14} />
            By hand
          </Button>
          <Button
            onClick={() => void suggest()}
            disabled={thinking || busy !== null}
            className="h-9 gap-1.5 rounded-full"
          >
            {thinking && !suggested ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Lightbulb size={14} />
            )}
            Suggest topics
          </Button>
        </div>
      </div>

      {elapsed !== null && (
        <InsetGroup>
          <div className="flex items-center gap-3 p-4">
            <Loader2 size={18} className="shrink-0 animate-spin" />
            <div className="min-w-0">
              <p className="text-body font-semibold">
                {busy
                  ? `Writing ${busy.locale ? LOCALE_ENGLISH_NAMES[busy.locale] : 'the next language'}…`
                  : suggested
                    ? 'Saving…'
                    : 'Choosing subjects…'}{' '}
                <span className="text-muted-foreground tabular-nums">{elapsed}s</span>
              </p>
              <p className="text-footnote text-muted-foreground mt-0.5">
                About a minute per article. Leave the tab open.
              </p>
            </div>
          </div>
        </InsetGroup>
      )}

      {adding && (
        <InsetGroup>
          <div className="space-y-3 p-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Subject, in English — an internal label"
              className="bg-card border-border h-10 w-full rounded-[var(--radius)] border-2 px-3 text-sm"
            />
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={5}
              placeholder="The brief. What to cover, what angle, what to avoid. Every language gets this same brief and then chooses its own query from it."
              className="bg-card border-border w-full rounded-[var(--radius)] border-2 p-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setAdding(false)}
                className="h-9 rounded-full"
              >
                Cancel
              </Button>
              <Button onClick={() => void addTopic()} className="h-9 rounded-full">
                Add
              </Button>
            </div>
          </div>
        </InsetGroup>
      )}

      {suggested && (
        <InsetGroup>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-body font-bold">
                {suggested.length} suggestions — untick anything you do not want
              </h3>
              <button
                type="button"
                onClick={() => void discardSuggested()}
                className="text-footnote text-muted-foreground underline underline-offset-2"
              >
                Discard
              </button>
            </div>

            <ul className="space-y-3">
              {suggested.map((topic, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={chosen.has(i)}
                      onChange={(e) => {
                        const next = new Set(chosen);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        setChosen(next);
                      }}
                      className="mt-1 size-4 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="text-body block font-semibold">{topic.name}</span>
                      <span className="text-footnote text-muted-foreground mt-0.5 block italic">
                        {topic.rationale}
                      </span>
                      <span className="text-footnote text-muted-foreground mt-1 block">
                        {topic.brief}
                      </span>
                      {/* The planner's own answer to "how is this not one of
                          the others" — the sentence that makes the overlap
                          check auditable rather than assumed. */}
                      <span className="text-footnote text-muted-foreground mt-1 block">
                        <span className="font-semibold">Distinct:</span> {topic.distinct_from}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => void suggest()}
                disabled={thinking}
                className="h-9 gap-1.5 rounded-full"
              >
                <RefreshCw size={14} />
                Again
              </Button>
              <Button
                onClick={() => void acceptSuggested()}
                disabled={thinking || chosen.size === 0}
                className="h-9 rounded-full"
              >
                Add {chosen.size}
              </Button>
            </div>
          </div>
        </InsetGroup>
      )}

      {topics.length === 0 && !suggested && (
        <p className="text-body text-muted-foreground py-8 text-center">
          No topics yet. Press <span className="font-semibold">Suggest topics</span> and the model
          proposes some; each language then writes its own article from the one you keep.
        </p>
      )}

      {topics.map(({ topic, posts }) => {
        const byLocale = new Map(posts.map((p) => [p.locale, p]));
        const missingLocales = LOCALES.filter((l) => !byLocale.has(l));
        const working = busy?.topicId === topic.id;
        const selection = selectionFor(topic.id);

        const selectedPosts = [...selection]
          .map((l) => byLocale.get(l))
          .filter((p): p is ContentPost => p !== undefined);
        const selectedDrafts = selectedPosts.filter((p) => p.status === 'draft');
        const selectedLive = selectedPosts.filter((p) => p.status === 'published');
        const allDrafts = posts.filter((p) => p.status === 'draft');
        const live = posts.filter((p) => p.status === 'published').length;

        return (
          <InsetGroup key={topic.id}>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-body font-bold">{topic.name}</h3>
                  <p className="text-footnote text-muted-foreground mt-0.5">
                    {live} live · {allDrafts.length} draft · {missingLocales.length} not written
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeTopic(topic.id)}
                  aria-label="Delete topic"
                  className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/*
                * One chip per language: a tick box that also happens to show
                * status. The chip selects; the eye opens what is written. Both
                * in one control because the row has to stay scannable at
                * thirteen wide — the colour answers "where are we", the tick
                * answers "what next".
                */}
              <div className="flex flex-wrap gap-1.5">
                {LOCALES.map((locale) => {
                  const post = byLocale.get(locale);
                  const isBusy = working && busy?.locale === locale;
                  const isPicked = selection.has(locale);
                  return (
                    <span
                      key={locale}
                      className={cn(
                        'text-footnote inline-flex h-8 items-center rounded-full border-2 font-semibold uppercase',
                        isPicked && 'ring-foreground ring-2 ring-offset-1',
                        !post && 'border-border text-muted-foreground',
                        post?.status === 'draft' &&
                          'border-[var(--calories-text)] text-[var(--calories-text)]',
                        post?.status === 'published' &&
                          'border-transparent bg-[var(--protein-text)] text-white',
                        post?.status === 'binned' &&
                          'border-border text-muted-foreground line-through',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(topic.id, locale)}
                        disabled={working}
                        aria-pressed={isPicked}
                        title={`${LOCALE_ENGLISH_NAMES[locale]} — ${post ? post.status : 'not written'}`}
                        className="inline-flex h-full min-w-[3rem] items-center justify-center gap-1 px-2.5"
                      >
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : locale}
                      </button>
                      {post && (
                        <button
                          type="button"
                          onClick={() => setReading({ topicId: topic.id, locale })}
                          aria-label={`Read the ${LOCALE_ENGLISH_NAMES[locale]} post`}
                          className="flex h-full items-center pr-2.5 pl-0.5 opacity-70 hover:opacity-100"
                        >
                          <Eye size={12} />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/*
                  * One ticked set, three verbs. Each button names how many it
                  * would affect and disappears when that number is zero, so the
                  * bar says what is possible rather than offering everything
                  * always.
                  */}
                {selection.size > 0 && (
                  <Button
                    onClick={() => void writeSelected(topic.id)}
                    disabled={working || thinking}
                    className="h-9 gap-1.5 rounded-full"
                  >
                    {working ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {working
                      ? `Writing ${busy?.locale ? LOCALE_ENGLISH_NAMES[busy.locale] : '…'}`
                      : `Write ${selection.size}`}
                  </Button>
                )}

                {selectedDrafts.length > 0 && (
                  <Button
                    onClick={() => void setStatus(selectedDrafts, 'published')}
                    disabled={working || thinking}
                    className="h-9 gap-1.5 rounded-full"
                  >
                    <Check size={14} />
                    Publish {selectedDrafts.length}
                  </Button>
                )}

                {selectedLive.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => void setStatus(selectedLive, 'draft')}
                    disabled={working || thinking}
                    className="h-9 gap-1.5 rounded-full"
                  >
                    <EyeOff size={14} />
                    Unpublish {selectedLive.length}
                  </Button>
                )}

                <span className="text-footnote text-muted-foreground flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelection(topic.id, missingLocales)}
                    disabled={working || missingLocales.length === 0}
                    className="underline underline-offset-2 disabled:opacity-40"
                  >
                    Not written ({missingLocales.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelection(topic.id, allDrafts.map((p) => p.locale))}
                    disabled={working || allDrafts.length === 0}
                    className="underline underline-offset-2 disabled:opacity-40"
                  >
                    Drafts ({allDrafts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelection(topic.id, [...LOCALES])}
                    disabled={working}
                    className="underline underline-offset-2 disabled:opacity-40"
                  >
                    All 13
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelection(topic.id, [])}
                    disabled={working || selection.size === 0}
                    className="underline underline-offset-2 disabled:opacity-40"
                  >
                    None
                  </button>
                </span>

                {allDrafts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setReading({ topicId: topic.id, locale: allDrafts[0]!.locale })}
                    className="text-footnote ml-auto underline underline-offset-2"
                  >
                    Review {allDrafts.length} draft{allDrafts.length === 1 ? '' : 's'} →
                  </button>
                )}
              </div>
            </div>
          </InsetGroup>
        );
      })}

      {reading && openPost && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
          onClick={() => setReading(null)}
        >
          <div
            className="bg-background my-8 w-full max-w-3xl rounded-[var(--radius)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-footnote text-muted-foreground uppercase">
                {LOCALE_ENGLISH_NAMES[openPost.locale]} · {openPost.status} ·{' '}
                {readIndex + 1} of {readable.length}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  disabled={readIndex <= 0}
                  aria-label="Previous language"
                  className="p-1 disabled:opacity-30"
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  disabled={readIndex >= readable.length - 1}
                  aria-label="Next language"
                  className="p-1 disabled:opacity-30"
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            <h2 className="text-section-title mt-1">{openPost.title}</h2>
            <p className="text-footnote text-muted-foreground mt-2">{openPost.description}</p>
            <dl className="text-footnote text-muted-foreground mt-3 space-y-1">
              <div>
                <span className="font-semibold">Query:</span> {openPost.keyword}
              </div>
              <div>
                <span className="font-semibold">URL:</span> /
                {openPost.locale === 'en' ? '' : `${openPost.locale}/`}blog/{openPost.slug}
              </div>
            </dl>

            <pre className="text-footnote bg-card mt-4 max-h-[50vh] overflow-y-auto rounded-[var(--radius)] p-4 whitespace-pre-wrap">
              {openPost.body_md}
            </pre>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setReading(null)}
                className="h-9 rounded-full"
              >
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => void write(openPost.topic_id, openPost.locale)}
                disabled={busy !== null}
                className="h-9 gap-1.5 rounded-full"
              >
                <Wand2 size={14} />
                Rewrite
              </Button>
              {openPost.status === 'published' ? (
                <Button
                  variant="secondary"
                  onClick={() => void setStatus([openPost], 'draft')}
                  className="h-9 gap-1.5 rounded-full"
                >
                  <EyeOff size={14} />
                  Unpublish
                </Button>
              ) : (
                <Button
                  onClick={() => void publishAndNext()}
                  className="h-9 gap-1.5 rounded-full"
                >
                  <Check size={14} />
                  {readIndex < readable.length - 1 ? 'Publish & next' : 'Publish'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
