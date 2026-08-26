'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  ChatAction,
  ChatMessage,
  ChatStreamEvent,
  DaySummary,
  OnboardingState,
  UnitSystem,
} from '@ct/shared';
import { formatNumber, isDeletion, unitsOf } from '@ct/shared';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { api } from '@/lib/api';
import { asBlob } from '@/lib/image';
import { ChatActionCard } from '@/components/ChatCard';
import { Markdown } from '@/components/Markdown';
import { Composer, type ComposerPayload } from '@/components/Composer';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/AuthGate';
import { DayRail } from '@/components/DayRail';
import { cn } from '@/lib/utils';

/** Optimistic rows carry a local id until the server assigns the real one. */
interface Bubble {
  key: string;
  role: 'user' | 'assistant';
  content: string;
  photoUrl?: string;
  pending?: boolean;
  failed?: boolean;
  actions?: ChatAction[];
  /**
   * The tool the model is running right now, while this row is still pending.
   * Set from the stream and cleared when text starts arriving again, so the
   * wait says "logging food" rather than nothing.
   */
  tool?: string;
  /**
   * What the turn said on its way to the answer — the sentence before a tool
   * call, which the server does not persist. Shown while the row is pending
   * and dropped when the reply lands. See `applyEvent`.
   */
  steps?: string[];
}

/** Near enough to the end that a new message should still carry the view. */
const NEAR_BOTTOM_PX = 64;

/**
 * The empty-state suggestions. Only the run carries a unit, and it carries one
 * because a distance without one is not a sentence anybody says — so there are
 * two lists rather than a placeholder to substitute into.
 */
const RUN_DISTANCE: Record<UnitSystem, string> = { metric: '5km', imperial: '3 mile' };

const prompts = (t: ReturnType<typeof useT>, units: UnitSystem): string[] => [
  t('journal.promptEggs'),
  t('journal.promptLunch'),
  t('journal.promptRun')(RUN_DISTANCE[units]),
  t('journal.promptProtein'),
];

/**
 * The product itself: one continuous conversation, with the day beside it on a
 * wide screen. Rendered at `/` for a signed-in account — a visitor gets
 * <Landing> at the same address.
 */
export function Journal() {
  const { profile, refresh: refreshAuth, adoptProfile } = useAuth();
  const t = useT();
  const units = unitsOf(profile);
  /*
   * The language this page is drawn in, which is also the language the reply
   * has to come back in. Sent with every turn: the profile's preference wins on
   * the server, and this answers for an account that has none — where the page
   * is following the browser and the model would otherwise write English
   * underneath a Bulgarian interface. See `ChatRequest.locale`.
   */
  const locale = useLocale();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollerRef = useRef<HTMLElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  // Whether the conversation is parked at its end. Everything that grows it
  // follows it down while this holds, and nothing does once the reader has
  // scrolled back through history.
  const pinned = useRef(true);
  // Where our own scrolling last left the view. A scroll event still reporting
  // that position is the tail of that scroll rather than the reader moving —
  // a distinction that matters because the event is delivered after layout, by
  // which time a photo may already have grown the column underneath it. Read
  // naively that looks exactly like someone scrolling away from the end.
  const settledAt = useRef(-1);
  // Guards the one-time setup kickoff against re-renders and StrictMode.
  const kickedOff = useRef(false);
  // Lets `send` see the messages it started from without depending on them.
  const bubblesRef = useRef<Bubble[]>([]);
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [history, today, state] = await Promise.all([
          api.history(40),
          api.day(),
          api.onboarding(),
        ]);
        if (cancelled) return;
        setOnboarding(state);
        setBubbles(history.messages.map(toBubble));
        setDay(today);
      } catch (e) {
        if (!cancelled) toast.error((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Re-read the day. Stable, because it is a prop on every memoised row — an
   * inline arrow here would hand each of them a new function on every render
   * and quietly undo the memoisation while looking like it worked.
   */
  const refreshDay = useCallback(() => {
    void api.day().then(setDay).catch(() => {});
  }, []);

  /**
   * A scan, arriving in the conversation.
   *
   * The scanner logs through its own route rather than a turn, so nothing here
   * had written the meal down — the packet went into the ring and the day and
   * left the journal with a gap where a meal should be. The server now stores
   * the message with the card on it and returns it, so this is the same row a
   * reload would show, put in without waiting for one.
   */
  const onScanned = useCallback(
    (message: ChatMessage) => {
      // Scanning is a request to be at the end of the conversation, wherever
      // the reader had scrolled back to — the same as sending.
      pinned.current = true;
      setBubbles((prev) => [...prev, toBubble(message)]);
      refreshDay();
    },
    [refreshDay],
  );

  const stickToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    pinned.current = true;
    // scrollTop rather than scrollIntoView, which aligns the last element with
    // the bottom of the scrollport and so leaves the column's own bottom
    // padding below the fold — short of the end by exactly that much, every
    // time. Instant rather than smooth for the same reason: an animation spends
    // its frames somewhere that is not the end, and every later growth then has
    // to fight it.
    scroller.scrollTop = scroller.scrollHeight;
    settledAt.current = scroller.scrollTop;
  }, []);

  // Reaching the end is not one scroll but a series. A photo has no height
  // until it decodes and a card none until its images do, so the column keeps
  // growing under a scroll that has already finished — which is what leaves a
  // freshly opened journal parked just above the message it was opened to read.
  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current) stickToBottom();
    });
    observer.observe(column);
    return () => observer.disconnect();
  }, [stickToBottom]);

  useEffect(() => {
    if (pinned.current) stickToBottom();
  }, [bubbles, stickToBottom]);

  // Opening the keyboard shortens the shell, which would otherwise leave the
  // conversation scrolled to where its bottom used to be.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const follow = () => {
      if (pinned.current) stickToBottom();
    };
    viewport.addEventListener('resize', follow);
    return () => viewport.removeEventListener('resize', follow);
  }, [stickToBottom]);


  const send = useCallback(async (payload: ComposerPayload) => {
    const localKey = `local-${Date.now()}`;
    // Ids the server had already given us. Anything outside this set afterwards
    // arrived during this turn, which is clock-free evidence that it landed.
    const known = new Set(bubblesRef.current.map((b) => b.key));
    // Sending is a request to be at the end of the conversation, wherever the
    // reader had scrolled back to.
    pinned.current = true;
    // Render the user's message immediately — a multi-second wait before
    // anything appears would break the "continuous conversation" feel.
    setBubbles((prev) => [
      ...prev,
      { key: localKey, role: 'user', content: payload.text, photoUrl: payload.photoPreview },
      { key: `${localKey}-reply`, role: 'assistant', content: '', pending: true },
    ]);
    setBusy(true);

    try {
      const replyKey = `${localKey}-reply`;
      /*
       * The photo goes to the bucket first, and the turn carries a key instead
       * of several megabytes of base64. `uploadPhoto` answers null when the
       * deployment stores photos on local disk, which is where the old path
       * still earns its place.
       *
       * A failed upload falls back to sending the bytes rather than failing the
       * turn: from here the meal still gets logged, which is what the person in
       * front of it wants. What the fallback costs is visibility — a bucket
       * that has quietly stopped accepting writes looks exactly like one nobody
       * configured — so `photo_upload_failed` tells the two apart and the API
       * logs it.
       */
      let photoKey: string | undefined;
      let uploadFailed = false;
      if (payload.photoBase64) {
        try {
          photoKey =
            (await api.uploadPhoto(
              await asBlob(payload.photoBase64),
              // The composer only produces a photo alongside its media type, but
              // the two travel as separate optional fields; jpeg is what
              // `preparePhoto` re-encodes to and what the API assumes anyway.
              payload.photoMediaType ?? 'image/jpeg',
            )) ?? undefined;
        } catch {
          uploadFailed = true;
        }
      }

      const result = await api.chatStream(
        {
          text: payload.text,
          photo_key: photoKey,
          photo_base64: photoKey ? undefined : payload.photoBase64,
          photo_media_type: payload.photoMediaType,
          photo_upload_failed: uploadFailed || undefined,
          scanned: payload.scanned,
          locale,
        },
        // The stream is a preview of the reply, never the record of it: `result`
        // below is what actually lands in the conversation. So this only ever
        // touches the one pending row, and nothing here has to be undone.
        (event) =>
          setBubbles((prev) => prev.map((b) => (b.key === replyKey ? applyEvent(b, event) : b))),
      );
      setBubbles((prev) =>
        prev.map((b) =>
          b.key === replyKey
            ? {
                ...b,
                key: result.message.id,
                content: result.message.content,
                pending: false,
                tool: undefined,
                // The trace was scaffolding for the wait. The reply it was
                // standing in for is here now, and it says the same things.
                steps: undefined,
                actions: result.actions,
              }
            : b,
        ),
      );
      // A turn can delete an entry too, and the card that logged it is
      // somewhere above in this same conversation.
      for (const action of result.actions) {
        if (isDeletion(action) && action.entry_id) {
          const gone = action.entry_id;
          setBubbles((prev) => strike(prev, gone));
        }
      }
      setDay(result.day);
      // The turn may have changed the profile — units, diet, a name. Adopting
      // it here is what makes "switch me to pounds" take effect in the rail
      // beside the conversation rather than at the next page load.
      adoptProfile(result.profile);

      // set_profile may have completed setup during this turn.
      if (!onboarding?.complete) {
        const state = await api.onboarding().catch(() => null);
        if (state) {
          setOnboarding(state);
          if (state.complete) void refreshAuth();
        }
      }
    } catch (e) {
      // A lost response is not a lost turn. The server commits the message and
      // the reply together at the very end, so a connection that dies while
      // waiting — a phone changing network, a screen locking mid-upload — leaves
      // the meal logged but the answer undelivered. Ask what actually happened
      // before calling it a failure, or the obvious retry logs the meal twice.
      const landed = await reconcile(known);
      if (landed) {
        setBubbles(landed.bubbles);
        setDay(landed.day);
      } else {
        const message = (e as Error).message;
        setBubbles((prev) =>
          prev.map((b) =>
            b.key === `${localKey}-reply`
              ? {
                  ...b,
                  content: message,
                  pending: false,
                  tool: undefined,
                  steps: undefined,
                  failed: true,
                }
              : b,
          ),
        );
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }, [locale, onboarding?.complete, refreshAuth, adoptProfile]);

  // A new account opens straight into setup: the agent introduces itself and
  // asks for what it needs, rather than pointing at a settings form.
  useEffect(() => {
    if (loading || kickedOff.current) return;
    if (!onboarding || onboarding.complete) return;
    if (bubbles.length > 0) return;
    kickedOff.current = true;
    void send({ text: t('journal.kickoff') });
  }, [loading, onboarding, bubbles.length, send, t]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBar day={day} loading={loading} setupPending={onboarding?.complete === false} />

        <main
          ref={scrollerRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            if (el.scrollTop === settledAt.current) return;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
          }}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 lg:px-8 lg:py-8"
        >
          <div ref={columnRef} className="mx-auto w-full max-w-2xl space-y-5">
        {loading && <ChatSkeleton />}

        {!loading && bubbles.length === 0 && onboarding?.complete && (
          <div className="pt-10">
            {/* The one place in the app with room for a mascot, and the one
                screen that otherwise offers a new account a wall of text. */}
            <span aria-hidden className="animate-bob mb-3 block text-[44px] leading-none">
              🍽️
            </span>
            <h1 className="text-large-title">{t('journal.emptyTitle')}</h1>
            <p className="text-muted-foreground mt-3 text-body leading-relaxed">
              {t('journal.emptyBody')}
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {prompts(t, units).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send({ text: prompt })}
                  className="bg-card border-border chunk-press text-secondary-foreground rounded-full border-2 px-4 py-2 text-sm font-bold [--chunk-depth:3px]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

          {bubbles.map((bubble) => (
            <Bubble
              key={bubble.key}
              bubble={bubble}
              // Which date the app currently calls today, so a food card can
              // say "today" rather than a date — and say the date on the one
              // that was backdated. The browser's own clock cannot answer it:
              // the day here turns over at 4am.
              today={day?.local_date}
              // The workout card logs without going through `send`, so the day
              // beside the conversation has to be told to re-read itself.
              onLogged={refreshDay}
            />
          ))}
          </div>
        </main>

        {/* The gutter goes outside the column, matching <main> above — with it
            inside, the composer rendered 64px narrower than the messages. */}
        <div className="shrink-0 lg:px-8 lg:pb-4">
          <div className="mx-auto w-full max-w-2xl">
            <Composer
              onSend={(p) => void send(p)}
              // A scanned packet is logged by the scanner itself, without a
              // turn — so the message it produced is dropped into the
              // conversation here, and the day beside it re-read.
              onLogged={onScanned}
              disabled={busy}
            />
          </div>
        </div>
      </div>

      {/* The day is its own tab on a phone; on a wide screen it sits alongside. */}
      <DayRail day={day} />
    </div>
  );
}

/**
 * One streamed frame folded into the row it belongs to.
 *
 * Text before a tool call is a preamble — "Let me log that" — and is not part
 * of the reply the server persists, which is the model's final message. So it
 * cannot stay in the body of the bubble: the real answer would replace it and
 * a sentence the reader was halfway through would change under them.
 *
 * It does not get deleted either, which is what this used to do and what read
 * as a bug — a line appearing, vanishing a second later, and the whole reply
 * arriving after it. On `tool` the preamble moves into `steps`, where it stays
 * beside the spinner as the trace of what the turn is doing, until the reply
 * it was announcing arrives and takes over. Nothing on screen is ever removed
 * before the thing that replaces it exists.
 */
function applyEvent(bubble: Bubble, event: ChatStreamEvent): Bubble {
  switch (event.type) {
    case 'text':
      return { ...bubble, content: bubble.content + event.text, tool: undefined };
    case 'tool': {
      const said = bubble.content.trim();
      return {
        ...bubble,
        content: '',
        steps: said ? [...(bubble.steps ?? []), said] : bubble.steps,
        tool: event.name,
      };
    }
    case 'reset':
      // A run that died and is being started over. Its trace described that
      // run, so it goes with it.
      return { ...bubble, content: '', steps: undefined, tool: undefined };
    default:
      // `done` and `error` never reach here — the client resolves or throws on
      // them — but a frame from a newer server should be ignored, not rendered.
      return bubble;
  }
}

/**
 * What to call the pause while a tool runs.
 *
 * Keyed on the verb rather than on all thirty-odd tool names, because the names
 * are already `verb_noun` and a table of every one of them would be a second
 * place to update whenever a tool is added — which is exactly the kind of list
 * that silently goes stale. An unknown verb falls through to the plain spinner,
 * which is no worse than what was there before any of this.
 */
const TOOL_VERBS: Record<string, StringKey> = {
  log: 'tool.log',
  update: 'tool.update',
  delete: 'tool.delete',
  get: 'tool.get',
  search: 'tool.search',
  find: 'tool.find',
  set: 'tool.set',
  show: 'tool.show',
  suggest: 'tool.suggest',
  import: 'tool.import',
  adapt: 'tool.adapt',
  save: 'tool.save',
  plan: 'tool.plan',
  cook: 'tool.cook',
  repeat: 'tool.repeat',
  remember: 'tool.remember',
  forget: 'tool.forget',
  lookup: 'tool.lookup',
  run: 'tool.run',
  define: 'tool.define',
  ask: 'tool.ask',
};

/**
 * The verb alone, and deliberately not the object.
 *
 * This used to append the rest of the tool name — `log_food` became "Logging
 * food" — which was free in English and untranslatable everywhere else: the
 * object is a raw identifier, so a Bulgarian session read "Записвам food". The
 * fix is not a second table of twenty nouns; the whole argument for keying on
 * the verb was that a table of every tool name goes stale. The object was
 * carrying almost nothing anyway — you know what you just typed — so the label
 * is the verb, and the tool that is running stays legible without being half
 * in English.
 */
function toolLabel(name: string, t: ReturnType<typeof useT>): string | null {
  const [verb = ''] = name.split('_');
  const key = TOOL_VERBS[verb];
  return key ? t(key) : null;
}

/**
 * Marks every card drawn from an entry that has since been deleted.
 *
 * The mark itself is the server's — it writes it onto the stored cards as the
 * entry goes, so a page load is right whatever was deleted and wherever from.
 * This is the same edit applied to the copy already on screen, for the one
 * case that never reloads: a turn that deletes something, with the card that
 * logged it further up the conversation it is answering into.
 *
 * Untouched bubbles keep their identity: the rows are memoised, and rebuilding
 * every one of them to strike a single card would redraw the whole journal.
 */
function strike(bubbles: Bubble[], entryId: string): Bubble[] {
  return bubbles.map((bubble) =>
    bubble.actions?.some((action) => action.entry_id === entryId && !action.removed)
      ? {
          ...bubble,
          actions: bubble.actions.map((action) =>
            action.entry_id === entryId ? { ...action, removed: true } : action,
          ),
        }
      : bubble,
  );
}

/**
 * A stored message as a bubble. `actions` comes back from the server with the
 * turn, so a reopened conversation still shows the cards it was answered with
 * rather than degrading to plain text.
 */
function toBubble(message: ChatMessage): Bubble {
  return {
    key: message.id,
    role: message.role,
    content: message.content,
    photoUrl: message.photo_url ? api.photoUrl(message.photo_url) : undefined,
    actions: message.actions,
  };
}

/**
 * Re-reads the conversation after a send failed at the transport. Returns the
 * server's version of it when this turn is present there, and null when the
 * request really never arrived.
 */
async function reconcile(
  known: Set<string>,
): Promise<{ bubbles: Bubble[]; day: DaySummary } | null> {
  try {
    const [history, today] = await Promise.all([api.history(40), api.day()]);
    if (!history.messages.some((m) => !known.has(m.id))) return null;
    return {
      bubbles: history.messages.map(toBubble),
      day: today,
    };
  } catch {
    // The network is still down; report the original failure.
    return null;
  }
}

/** Compact always-visible answer to "how am I doing today?" (§25). */
function StatusBar({
  day,
  loading,
  setupPending,
}: {
  day: DaySummary | null;
  loading: boolean;
  setupPending?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  if (loading || !day) {
    return (
      <header className="material border-border shrink-0 border-b-2 px-4 py-3 xl:hidden">
        <Skeleton className="h-4 w-40" />
      </header>
    );
  }

  if (setupPending) {
    return (
      <header className="material border-border shrink-0 border-b-2 px-4 py-3 xl:hidden">
        <p className="text-footnote text-muted-foreground font-medium">
          {t('journal.settingUp')}
        </p>
      </header>
    );
  }

  const { consumed, targets } = day;
  const remaining = targets.kcal - consumed.kcal;
  const pct = Math.min(100, (consumed.kcal / Math.max(1, targets.kcal)) * 100);
  const over = remaining < 0;

  return (
    <header className="material border-border shrink-0 border-b-2 px-4 py-2.5 xl:hidden">
      <div className="flex items-baseline justify-between">
        <p className="text-figure text-body">
          {formatNumber(Math.round(consumed.kcal), locale)}
          <span className="text-muted-foreground text-footnote font-semibold">
            {' '}
            / {formatNumber(targets.kcal, locale)} kcal
          </span>
        </p>
        {/* Ink rather than red — see the note on --destructive in globals.css. */}
        <p className={cn('tnum text-footnote font-bold', over ? 'text-foreground' : 'text-muted-foreground')}>
          {over
            ? t('journal.over')(formatNumber(Math.abs(remaining), locale))
            : t('journal.left')(formatNumber(remaining, locale))}
        </p>
      </div>
      <div className="bg-muted border-border mt-2 h-2.5 overflow-hidden rounded-full border">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: over ? 'var(--foreground)' : 'var(--calories)',
            transition: 'width var(--dur-spring) var(--ease-spring)',
          }}
        />
      </div>
      {/*
        §9: the bar tracks the plain target, so a run never quietly enlarges the
        budget. But logging one has to visibly change this screen — otherwise the
        only feedback is a chat bubble — so the burn and the net sit under it.
      */}
      {day.burned_kcal > 0 && (
        <p className="tnum text-footnote text-muted-foreground mt-1.5 font-semibold">
          <span className="font-bold text-[var(--exercise-text)]">
            {t('journal.burned')(formatNumber(day.burned_kcal, locale))}
          </span>
          {t('journal.net')(formatNumber(day.net_kcal, locale))}
        </p>
      )}
    </header>
  );
}

/**
 * Memoised, which matters now rather than before.
 *
 * A streamed reply lands as tens of state updates a second, and every one of
 * them re-rendered the whole conversation — forty bubbles and their cards — to
 * add a word to the last row. `bubble` is a fresh object only for the row that
 * changed, so with `onLogged` held stable by the caller this narrows each
 * delta to the one row it actually touches.
 */
const Bubble = memo(function Bubble({
  bubble,
  today,
  onLogged,
}: {
  bubble: Bubble;
  today?: string;
  onLogged: () => void;
}) {
  const t = useT();
  if (bubble.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-2">
          {bubble.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bubble.photoUrl}
              alt={t('journal.loggedMeal')}
              className="border-border chunk max-h-72 rounded-2xl border-2 object-cover"
            />
          )}
          {bubble.content && (
            <p className="bg-primary text-primary-foreground chunk [--chunk-color:var(--calories-deep)] [--chunk-depth:3px] rounded-[1.375rem] rounded-br-lg px-4 py-2.5 text-body leading-relaxed font-semibold">
              {bubble.content}
            </p>
          )}
        </div>
      </div>
    );
  }

  /*
   * The dots are for silence, not for waiting.
   *
   * A turn used to be twenty seconds of them; now they cover only the gaps the
   * stream cannot fill — before the first word, and while a tool is running,
   * which is where the label comes from. Once text is arriving it speaks for
   * itself, and there is deliberately nothing decorating it: text that is
   * visibly growing already reads as live, and a pulse or a caret on top of
   * that is an animation competing with the thing it is animating.
   */
  const label = bubble.tool ? toolLabel(bubble.tool, t) : null;
  const waiting = bubble.pending && !bubble.content;
  /*
   * The weekly review is the one turn whose card *replaces* the words rather
   * than illustrating them: the card folds the prose into itself, so drawing
   * both would print the review twice — once unfolded above the thing built to
   * fold it. Every other card in the app sits under its reply.
   */
  const review = bubble.actions?.find((action) => action.card?.type === 'review');

  return (
    <div className="max-w-[92%] space-y-2.5">
      {/*
        What the turn said before it went to work, kept where it cannot be
        mistaken for the answer: quiet, one line per step, and gone the moment
        the reply arrives. It is the same words the model wrote, so it reads as
        the turn narrating itself rather than as a message that changed its mind.
      */}
      {bubble.pending && bubble.steps && bubble.steps.length > 0 && (
        <div className="text-muted-foreground text-footnote space-y-1 leading-relaxed">
          {bubble.steps.map((step, i) => (
            <p key={i}>{step}</p>
          ))}
        </div>
      )}

      {waiting ? (
        <div className="flex items-center gap-2 py-2" aria-label={label ?? t('journal.thinking')}>
          <div className="flex gap-2">
            {[
              'var(--protein)',
              'var(--carbs)',
              'var(--fat)',
            ].map((color, i) => (
              <span
                key={color}
                className="size-2.5 animate-bounce rounded-full"
                style={{ background: color, animationDelay: `${i * 140}ms`, animationDuration: '1s' }}
              />
            ))}
          </div>
          {label && (
            <span className="text-muted-foreground text-footnote font-semibold">{label}…</span>
          )}
        </div>
      ) : review ? null : (
        <Markdown
          text={bubble.content}
          className={cn(
            'text-body leading-relaxed',
            bubble.failed && 'text-destructive font-semibold',
          )}
        />
      )}

      {bubble.actions && bubble.actions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {bubble.actions.map((action, i) => (
            <ChatActionCard
              key={`${action.entry_id ?? action.kind}-${i}`}
              action={action}
              // The workout card posts its own answer, and the server rewrites
              // this message's card into a receipt — so it has to know which
              // message it is sitting on. An optimistic bubble has no server id
              // yet, but it also cannot be carrying a card the model drew.
              messageId={bubble.key}
              today={today}
              onLogged={onLogged}
              // Only the review card reads this; see the note above.
              text={bubble.content}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function ChatSkeleton() {
  return (
    <div className="space-y-5 pt-4">
      <div className="flex justify-end">
        <Skeleton className="h-11 w-48 rounded-[1.375rem]" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}
