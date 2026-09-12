'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, Lightbulb, Loader2, Plus, RefreshCw, Trash2, Wand2 } from 'lucide-react';
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
 * The grid of thirteen chips is the whole status display: grey means not
 * written, amber means drafted and unread, green means live.
 *
 * Nothing here publishes on its own. "Write all" fills the row with drafts and
 * stops; the green tick is a separate press, by a person who has read the
 * thing. That is deliberate and it is the most important behaviour in this
 * panel — most of what a calorie app's blog says is a nutrition claim, and this
 * is the last point at which a bad one can be caught.
 */

type Busy = { topicId: string; locale: Locale | null } | null;

/**
 * Seconds since the thing started, or null when nothing is running.
 *
 * Writing an article takes about a minute; choosing eight subjects takes about
 * the same. A spinner alone does not survive that — the first report of this
 * panel was "I clicked Suggest topics and nothing happened", from a request
 * that was working perfectly and answered ninety seconds later. A number that
 * moves is the difference between waiting and being ignored.
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
  const [reading, setReading] = useState<ContentPost | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  /*
   * Suggestions live here and nowhere else until they are submitted. The model
   * proposes, nothing is written, and the list is cut down before any of it
   * becomes work — one topic is thirteen articles.
   */
  const [suggested, setSuggested] = useState<SuggestedTopic[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [thinking, setThinking] = useState(false);
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

  async function suggest() {
    setThinking(true);
    try {
      const { topics } = await api.admin.suggestTopics();
      setSuggested(topics);
      // Everything ticked, because the common case is "these are fine" and the
      // work is in removing the one that is not.
      setChosen(new Set(topics.map((_, i) => i)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function acceptSuggested() {
    if (!suggested) return;
    const picked = suggested.filter((_, i) => chosen.has(i));
    if (picked.length === 0) return;
    setThinking(true);
    try {
      for (const topic of picked) await api.admin.createTopic(topic.name, topic.brief);
      setSuggested(null);
      setChosen(new Set());
      toast.success(`Added ${picked.length} topic${picked.length === 1 ? '' : 's'}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
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

  async function write(topicId: string, locale: Locale | null) {
    setBusy({ topicId, locale });
    try {
      const { post } = await api.admin.writePost(topicId, locale ?? undefined);
      toast.success(`${LOCALE_ENGLISH_NAMES[post.locale]}: ${post.title}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Every missing language, one after another.
   *
   * Sequential rather than parallel, and not for politeness: thirteen
   * concurrent Opus turns on one subscription is how you find its rate limit,
   * and each failure would then be a post nobody notices is absent. This stops
   * at the first failure with the reason on screen.
   */
  async function writeAll(topic: TopicWithPosts) {
    const done = new Set(topic.posts.map((p) => p.locale));
    const missing = LOCALES.filter((l) => !done.has(l));
    if (missing.length === 0) return;

    for (const locale of missing) {
      setBusy({ topicId: topic.topic.id, locale });
      try {
        await api.admin.writePost(topic.topic.id, locale);
      } catch (e) {
        toast.error(`${LOCALE_ENGLISH_NAMES[locale]}: ${(e as Error).message}`);
        break;
      }
    }
    setBusy(null);
    await load();
  }

  async function setStatus(post: ContentPost, status: 'published' | 'draft' | 'binned') {
    try {
      await api.admin.updatePost(post.id, { status });
      setReading(null);
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

  if (!topics) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-[var(--radius)]" />
        <Skeleton className="h-24 w-full rounded-[var(--radius)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-footnote text-muted-foreground">
          {topics.length} topic{topics.length === 1 ? '' : 's'} ·{' '}
          {topics.reduce((n, t) => n + t.posts.filter((p) => p.status === 'published').length, 0)}{' '}
          published across {LOCALES.length} languages
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()} className="h-9 gap-1.5 rounded-full">
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
          <Button onClick={() => void suggest()} disabled={thinking} className="h-9 gap-1.5 rounded-full">
            {thinking ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
            Suggest topics
          </Button>
        </div>
      </div>

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
              <Button variant="secondary" onClick={() => setAdding(false)} className="h-9 rounded-full">
                Cancel
              </Button>
              <Button onClick={() => void addTopic()} className="h-9 rounded-full">
                Add
              </Button>
            </div>
          </div>
        </InsetGroup>
      )}

      {elapsed !== null && (
        <InsetGroup>
          <div className="flex items-center gap-3 p-4">
            <Loader2 size={18} className="animate-spin shrink-0" />
            <div className="min-w-0">
              <p className="text-body font-semibold">
                {busy
                  ? `Writing ${busy.locale ? LOCALE_ENGLISH_NAMES[busy.locale] : 'the next language'}…`
                  : suggested
                    ? 'Adding topics…'
                    : 'Choosing subjects…'}{' '}
                <span className="text-muted-foreground tabular-nums">{elapsed}s</span>
              </p>
              <p className="text-footnote text-muted-foreground mt-0.5">
                This normally takes about a minute. Leave the tab open.
              </p>
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
                onClick={() => setSuggested(null)}
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
                {thinking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
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
        const missing = LOCALES.filter((l) => !byLocale.has(l)).length;
        const working = busy?.topicId === topic.id;

        return (
          <InsetGroup key={topic.id}>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-body font-bold">{topic.name}</h3>
                  <p className="text-footnote text-muted-foreground mt-1 line-clamp-2">
                    {topic.brief}
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

              <div className="flex flex-wrap gap-1.5">
                {LOCALES.map((locale) => {
                  const post = byLocale.get(locale);
                  const isBusy = working && busy?.locale === locale;
                  return (
                    <button
                      key={locale}
                      type="button"
                      title={
                        post
                          ? `${LOCALE_ENGLISH_NAMES[locale]} — ${post.status}\n${post.title}`
                          : `${LOCALE_ENGLISH_NAMES[locale]} — not written`
                      }
                      onClick={() => (post ? setReading(post) : void write(topic.id, locale))}
                      disabled={working}
                      className={cn(
                        'text-footnote inline-flex h-8 min-w-[3rem] items-center justify-center gap-1 rounded-full border-2 px-2.5 font-semibold uppercase',
                        !post && 'border-border text-muted-foreground',
                        post?.status === 'draft' && 'border-[var(--calories-text)] text-[var(--calories-text)]',
                        post?.status === 'published' && 'border-transparent bg-[var(--protein-text)] text-white',
                        post?.status === 'binned' && 'border-border text-muted-foreground line-through',
                      )}
                    >
                      {isBusy ? <Loader2 size={12} className="animate-spin" /> : locale}
                    </button>
                  );
                })}
              </div>

              {missing > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => void writeAll({ topic, posts })}
                  disabled={working}
                  className="h-9 gap-1.5 rounded-full"
                >
                  {working ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  {working
                    ? `Writing ${busy?.locale ? LOCALE_ENGLISH_NAMES[busy.locale] : '...'}`
                    : `Write the missing ${missing}`}
                </Button>
              )}
            </div>
          </InsetGroup>
        );
      })}

      {reading && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
          onClick={() => setReading(null)}
        >
          <div
            className="bg-background my-8 w-full max-w-3xl rounded-[var(--radius)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-footnote text-muted-foreground uppercase">
              {LOCALE_ENGLISH_NAMES[reading.locale]} · {reading.status}
            </p>
            <h2 className="text-section-title mt-1">{reading.title}</h2>
            <p className="text-footnote text-muted-foreground mt-2">{reading.description}</p>
            <dl className="text-footnote text-muted-foreground mt-3 space-y-1">
              <div>
                <span className="font-semibold">Query:</span> {reading.keyword}
              </div>
              <div>
                <span className="font-semibold">URL:</span> /
                {reading.locale === 'en' ? '' : `${reading.locale}/`}blog/{reading.slug}
              </div>
            </dl>

            <pre className="text-footnote bg-card mt-4 max-h-[50vh] overflow-y-auto rounded-[var(--radius)] p-4 whitespace-pre-wrap">
              {reading.body_md}
            </pre>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setReading(null)} className="h-9 rounded-full">
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => void write(reading.topic_id, reading.locale)}
                className="h-9 gap-1.5 rounded-full"
              >
                <Wand2 size={14} />
                Rewrite
              </Button>
              {reading.status === 'published' ? (
                <Button
                  variant="secondary"
                  onClick={() => void setStatus(reading, 'draft')}
                  className="h-9 gap-1.5 rounded-full"
                >
                  <Eye size={14} />
                  Unpublish
                </Button>
              ) : (
                <Button
                  onClick={() => void setStatus(reading, 'published')}
                  className="h-9 gap-1.5 rounded-full"
                >
                  <Check size={14} />
                  Publish
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
