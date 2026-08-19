'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ChatAction, ChatMessage, DaySummary, OnboardingState } from '@ct/shared';
import { api } from '@/lib/api';
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

export default function JournalPage() {
  const { profile, refresh: refreshAuth } = useAuth();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Guards the one-time setup kickoff against re-renders and StrictMode.
  const kickedOff = useRef(false);

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
        setBubbles(
          history.messages.map((m: ChatMessage) => ({
            key: m.id,
            role: m.role,
            content: m.content,
            photoUrl: m.photo_id ? api.photoUrl(m.photo_id) : undefined,
          })),
        );
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


  const send = useCallback(async (payload: ComposerPayload) => {
    const localKey = `local-${Date.now()}`;
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
      const message = (e as Error).message;
      setBubbles((prev) =>
        prev.map((b) =>
          b.key === `${localKey}-reply`
            ? { ...b, content: message, pending: false, failed: true }
            : b,
        ),
      );
      toast.error(message);
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
              Type it or take a photo. No forms, no searching a food database — just say what
              happened.
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

        <div className="shrink-0">
          <div className="mx-auto w-full max-w-2xl lg:px-8 lg:pb-4">
            <Composer onSend={(p) => void send(p)} disabled={busy} />
          </div>
        </div>
      </div>

      {/* The day is its own tab on a phone; on a wide screen it sits alongside. */}
      <DayRail day={day} />
    </div>
  );
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
        <p className="tnum text-[15px] font-semibold">
          {Math.round(consumed.kcal).toLocaleString()}
          <span className="text-muted-foreground font-normal">
            {' '}
            / {targets.kcal.toLocaleString()} kcal
          </span>
        </p>
        <p className={cn('tnum text-footnote', over ? 'text-destructive' : 'text-muted-foreground')}>
          {over
            ? `${Math.abs(remaining).toLocaleString()} over`
            : `${remaining.toLocaleString()} left`}
        </p>
      </div>
      <div className="bg-muted mt-2 h-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: over ? 'var(--destructive)' : 'var(--calories)',
            transition: 'width 700ms cubic-bezier(0.34, 1.4, 0.64, 1)',
          }}
        />
      </div>
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
            <div
              key={`${action.entry_id}-${i}`}
              className="bg-card flex items-center gap-2 rounded-xl px-3 py-2"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    action.kind === 'exercise_logged'
                      ? 'var(--exercise)'
                      : action.kind === 'food_deleted'
                        ? 'var(--destructive)'
                        : 'var(--calories)',
                }}
              />
              <span className="text-footnote">{action.summary}</span>
            </div>
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
