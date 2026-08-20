'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ChatAction, ChatMessage, DaySummary, OnboardingState } from '@ct/shared';
import { api } from '@/lib/api';
import { ChatActionCard } from '@/components/ChatCard';
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
}

const PROMPTS = [
  'Two eggs, toast and coffee',
  'Chicken and rice for lunch',
  'Went for a 5km run',
  'Am I eating enough protein?',
];

/**
 * The product itself: one continuous conversation, with the day beside it on a
 * wide screen. Rendered at `/` for a signed-in account — a visitor gets
 * <Landing> at the same address.
 */
export function Journal() {
  const { profile, refresh: refreshAuth } = useAuth();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [bubbles]);

  // Opening the keyboard shortens the shell, which would otherwise leave the
  // conversation scrolled to where its bottom used to be.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const stickToBottom = () => bottomRef.current?.scrollIntoView({ block: 'end' });
    viewport.addEventListener('resize', stickToBottom);
    return () => viewport.removeEventListener('resize', stickToBottom);
  }, []);


  const send = useCallback(async (payload: ComposerPayload) => {
    const localKey = `local-${Date.now()}`;
    // Ids the server had already given us. Anything outside this set afterwards
    // arrived during this turn, which is clock-free evidence that it landed.
    const known = new Set(bubblesRef.current.map((b) => b.key));
    // Render the user's message immediately — a multi-second wait before
    // anything appears would break the "continuous conversation" feel.
    setBubbles((prev) => [
      ...prev,
      { key: localKey, role: 'user', content: payload.text, photoUrl: payload.photoPreview },
      { key: `${localKey}-reply`, role: 'assistant', content: '', pending: true },
    ]);
    setBusy(true);

    try {
      const result = await api.chat({
        text: payload.text,
        photo_base64: payload.photoBase64,
        photo_media_type: payload.photoMediaType,
      });
      setBubbles((prev) =>
        prev.map((b) =>
          b.key === `${localKey}-reply`
            ? {
                ...b,
                key: result.message.id,
                content: result.message.content,
                pending: false,
                actions: result.actions,
              }
            : b,
        ),
      );
      setDay(result.day);

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
              ? { ...b, content: message, pending: false, failed: true }
              : b,
          ),
        );
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }, [onboarding?.complete, refreshAuth]);

  // A new account opens straight into setup: the agent introduces itself and
  // asks for what it needs, rather than pointing at a settings form.
  useEffect(() => {
    if (loading || kickedOff.current) return;
    if (!onboarding || onboarding.complete) return;
    if (bubbles.length > 0) return;
    kickedOff.current = true;
    void send({ text: "Hi — I'm new here. Let's get set up." });
  }, [loading, onboarding, bubbles.length, send]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBar day={day} loading={loading} setupPending={onboarding?.complete === false} />

        <main className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-2xl space-y-5">
        {loading && <ChatSkeleton />}

        {!loading && bubbles.length === 0 && onboarding?.complete && (
          <div className="pt-12">
            <h1 className="text-large-title">What have you eaten today?</h1>
            <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
              Type it or take a photo — whatever's easiest. No forms, nothing to search for.
              Say what happened and I'll work out the rest.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send({ text: prompt })}
                  className="bg-card text-secondary-foreground rounded-full px-3.5 py-2 text-sm transition-transform active:scale-95"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

          {bubbles.map((bubble) => (
            <Bubble key={bubble.key} bubble={bubble} />
          ))}
          <div ref={bottomRef} />
          </div>
        </main>

        {/* The gutter goes outside the column, matching <main> above — with it
            inside, the composer rendered 64px narrower than the messages. */}
        <div className="shrink-0 lg:px-8 lg:pb-4">
          <div className="mx-auto w-full max-w-2xl">
            <Composer onSend={(p) => void send(p)} disabled={busy} />
          </div>
        </div>
      </div>

      {/* The day is its own tab on a phone; on a wide screen it sits alongside. */}
      <DayRail day={day} />
    </div>
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
  if (loading || !day) {
    return (
      <header className="material border-border shrink-0 border-b px-4 py-3 xl:hidden">
        <Skeleton className="h-4 w-40" />
      </header>
    );
  }

  if (setupPending) {
    return (
      <header className="material border-border shrink-0 border-b px-4 py-3 xl:hidden">
        <p className="text-footnote text-muted-foreground">
          Setting up — your target is a placeholder until we finish.
        </p>
      </header>
    );
  }

  const { consumed, targets } = day;
  const remaining = targets.kcal - consumed.kcal;
  const pct = Math.min(100, (consumed.kcal / Math.max(1, targets.kcal)) * 100);
  const over = remaining < 0;

  return (
    <header className="material border-border shrink-0 border-b px-4 py-2.5 xl:hidden">
      <div className="flex items-baseline justify-between">
        <p className="text-figure text-[15px]">
          {Math.round(consumed.kcal).toLocaleString()}
          <span className="text-muted-foreground font-normal">
            {' '}
            / {targets.kcal.toLocaleString()} kcal
          </span>
        </p>
        {/* Ink rather than red — see the note on --destructive in globals.css. */}
        <p className={cn('tnum text-footnote', over ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
          {over
            ? `${Math.abs(remaining).toLocaleString()} over`
            : `${remaining.toLocaleString()} left`}
        </p>
      </div>
      <div className="bg-muted mt-2 h-[5px] overflow-hidden rounded-full">
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
        <p className="tnum text-footnote text-muted-foreground mt-1.5">
          <span className="text-[var(--exercise)]">
            −{day.burned_kcal.toLocaleString()} burned
          </span>
          {' · net '}
          {day.net_kcal.toLocaleString()} kcal
        </p>
      )}
    </header>
  );
}

function Bubble({ bubble }: { bubble: Bubble }) {
  if (bubble.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-2">
          {bubble.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bubble.photoUrl}
              alt="Logged meal"
              className="max-h-72 rounded-2xl object-cover"
            />
          )}
          {bubble.content && (
            <p className="bg-primary text-primary-foreground rounded-[1.25rem] rounded-br-md px-3.5 py-2 text-[15px] leading-relaxed">
              {bubble.content}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[92%] space-y-2.5">
      {bubble.pending ? (
        <div className="flex gap-1.5 py-1.5" aria-label="Thinking">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="bg-muted-foreground/60 size-2 animate-bounce rounded-full"
              style={{ animationDelay: `${i * 140}ms`, animationDuration: '1s' }}
            />
          ))}
        </div>
      ) : (
        <p
          className={cn(
            'text-[15px] leading-relaxed whitespace-pre-wrap',
            bubble.failed && 'text-destructive',
          )}
        >
          {bubble.content}
        </p>
      )}

      {bubble.actions && bubble.actions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {bubble.actions.map((action, i) => (
            <ChatActionCard key={`${action.entry_id ?? action.kind}-${i}`} action={action} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-5 pt-4">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-48 rounded-[1.25rem]" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}
