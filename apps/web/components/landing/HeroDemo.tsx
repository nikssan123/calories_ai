'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Camera } from 'lucide-react';
import type { ChatAction, Nutrition, Targets } from '@ct/shared';
import { CalorieRing } from '@/components/CalorieRing';
import { ChatActionCard } from '@/components/ChatCard';
import { MacroBars } from '@/components/MacroBars';
import { useReducedMotion } from '@/components/landing/Reveal';
import { cn } from '@/lib/utils';

/**
 * The hero's product shot, played rather than photographed.
 *
 * It is built out of the app's own <CalorieRing>, <ChatActionCard> and
 * <MacroBars> rather than a mock-up, so it cannot drift away from the thing it
 * is advertising — and it deliberately shows the second turn, not the first,
 * because "I logged a meal" is table stakes and "I changed my mind and it
 * corrected the entry it already had" is the product.
 */

const TARGETS: Targets = {
  kcal: 2290,
  protein_g: 165,
  carbs_g: 236,
  fat_g: 76,
  is_custom: false,
  source: 'calculated',
};

const NOTHING: Nutrition = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

/** Stable ids: nothing here reaches the API, but the card's props are the real ones. */
const ENTRY_ID = '00000000-0000-4000-8000-000000000001';

function breakfast(nutrition: Nutrition, eggs: string): ChatAction {
  return {
    kind: 'food_logged',
    entry_id: ENTRY_ID,
    summary: 'Logged breakfast',
    card: {
      type: 'food',
      entry_id: ENTRY_ID,
      meal: 'breakfast',
      description: 'Eggs, toast and cheese',
      confidence: 'medium',
      items: [
        { name: 'Eggs', quantity: eggs },
        { name: 'Toast', quantity: '2 slices' },
        { name: 'Cheddar', quantity: '30 g' },
      ],
      ...nutrition,
    },
  };
}

const FIRST = {
  text: 'Two eggs, toast and some cheese',
  reply: 'Breakfast — about 407 calories and 24g of protein. That leaves you 1,883 for the day.',
  nutrition: { kcal: 407, protein_g: 24, carbs_g: 31, fat_g: 21 } satisfies Nutrition,
};

const SECOND = {
  text: 'actually there were three eggs',
  reply: 'Updated — breakfast is 479 now, and 30g of protein. Still 1,811 to go.',
  nutrition: { kcal: 479, protein_g: 30, carbs_g: 31, fat_g: 26 } satisfies Nutrition,
};

/** Roughly 57 words a minute — a person thinking, not a machine printing. */
const TYPE_MS = 42;

type Phase =
  | 'idle'
  | 'typing-1'
  | 'sent-1'
  | 'thinking-1'
  | 'reply-1'
  | 'typing-2'
  | 'sent-2'
  | 'thinking-2'
  | 'reply-2';

/** How long each beat holds before the next one starts. */
const SCRIPT: { phase: Phase; ms: number }[] = [
  { phase: 'idle', ms: 1100 },
  { phase: 'typing-1', ms: FIRST.text.length * TYPE_MS + 520 },
  { phase: 'sent-1', ms: 380 },
  { phase: 'thinking-1', ms: 1600 },
  { phase: 'reply-1', ms: 3400 },
  { phase: 'typing-2', ms: SECOND.text.length * TYPE_MS + 520 },
  { phase: 'sent-2', ms: 380 },
  { phase: 'thinking-2', ms: 1500 },
  // The long one: the corrected numbers are the point, so leave them up.
  { phase: 'reply-2', ms: 5600 },
];

const AT = Object.fromEntries(SCRIPT.map((beat, i) => [beat.phase, i])) as Record<Phase, number>;

const CAPTION =
  'A conversation with the journal: "Two eggs, toast and some cheese" is logged as breakfast at about 407 calories, then corrected to three eggs — and the same entry updates in place to 479.';

export function HeroDemo({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(0);
  const [onScreen, setOnScreen] = useState(true);

  // Nothing worth animating off screen. Without this the loop keeps running —
  // and keeps repainting — for the whole of the rest of the page.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry?.isIntersecting ?? false),
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !onScreen) return;
    const timer = setTimeout(
      () => setBeat((current) => (current + 1) % SCRIPT.length),
      SCRIPT[beat]!.ms,
    );
    return () => clearTimeout(timer);
  }, [beat, reduced, onScreen]);

  // Asked for less movement: show the finished conversation and leave it there.
  const stage = reduced ? AT['reply-2'] : beat;

  const typing =
    stage === AT['typing-1'] ? FIRST.text : stage === AT['typing-2'] ? SECOND.text : '';
  const draft = useTypewriter(typing);

  const sent1 = stage >= AT['sent-1'];
  const replied1 = stage >= AT['reply-1'];
  const sent2 = stage >= AT['sent-2'];
  const replied2 = stage >= AT['reply-2'];

  const logged = replied2 ? SECOND.nutrition : replied1 ? FIRST.nutrition : null;
  const action = replied2 ? breakfast(SECOND.nutrition, '3') : breakfast(FIRST.nutrition, '2');

  return (
    <div
      ref={ref}
      role="img"
      aria-label={CAPTION}
      className={cn(
        'bg-card border-border/70 overflow-hidden rounded-[2rem] border',
        'shadow-[0_50px_100px_-45px_rgb(0_0_0/0.4)] dark:shadow-[0_50px_100px_-45px_rgb(0_0_0/0.9)]',
        className,
      )}
    >
      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col">
          {/* The app's own responsive split: the day is a strip above the
              conversation where there is no room beside it, and the rail below. */}
          <StatusStrip consumed={logged?.kcal ?? 0} className="lg:hidden" />

          <div
            className="flex h-[19rem] flex-col justify-end gap-4 px-4 py-5 sm:h-[21rem] sm:px-5"
            style={{
              // Older turns leave at the top edge rather than being cut by it.
              maskImage: 'linear-gradient(to bottom, transparent, #000 16%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 16%)',
            }}
          >
            {sent1 && <UserBubble>{FIRST.text}</UserBubble>}
            {stage === AT['thinking-1'] && <Thinking />}
            {replied1 && (
              <Assistant>
                <p className="text-[15px] leading-relaxed">{FIRST.reply}</p>
                <div
                  className="rounded-2xl"
                  // A one-shot ring the moment the entry is corrected. The card
                  // itself never remounts — that is the claim being made.
                  style={
                    replied2 && !reduced
                      ? { animation: 'entry-touched 1500ms cubic-bezier(0.32, 0.72, 0, 1)' }
                      : undefined
                  }
                >
                  <ChatActionCard action={action} />
                </div>
              </Assistant>
            )}
            {sent2 && <UserBubble>{SECOND.text}</UserBubble>}
            {stage === AT['thinking-2'] && <Thinking />}
            {replied2 && (
              <Assistant>
                <p className="text-[15px] leading-relaxed">{SECOND.reply}</p>
              </Assistant>
            )}
          </div>

          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <FakeComposer draft={draft} />
          </div>
        </div>

        <DayRail consumed={logged} />
      </div>
    </div>
  );
}

/** Reveals `text` a character at a time, and clears the moment there is none. */
function useTypewriter(text: string) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    setTyped('');
    if (!text) return;
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setTyped(text.slice(0, count));
      if (count >= text.length) clearInterval(timer);
    }, TYPE_MS);
    return () => clearInterval(timer);
  }, [text]);

  return typed;
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 flex justify-end duration-500 ease-out">
      <p className="bg-primary text-primary-foreground max-w-[85%] rounded-[1.25rem] rounded-br-md px-3.5 py-2 text-[15px] leading-relaxed">
        {children}
      </p>
    </div>
  );
}

function Assistant({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-2 max-w-[92%] space-y-2.5 duration-500 ease-out">
      {children}
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex gap-1.5 py-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-muted-foreground/60 size-2 animate-bounce rounded-full"
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '1s' }}
        />
      ))}
    </div>
  );
}

/** The composer, with its keyboard held by someone else. */
function FakeComposer({ draft }: { draft: string }) {
  return (
    <div className="border-border bg-card flex items-end gap-2 rounded-[1.75rem] border px-2.5 py-2 shadow-sm">
      <span className="text-muted-foreground flex size-9 shrink-0 items-center justify-center">
        <Camera size={22} strokeWidth={1.9} />
      </span>
      <p className="min-h-9 min-w-0 flex-1 px-1 py-[0.4375rem] text-[15px] leading-6">
        {draft ? (
          <>
            {draft}
            <span className="bg-foreground ml-px inline-block h-[1.05em] w-px translate-y-[0.15em] animate-pulse align-baseline" />
          </>
        ) : (
          <span className="text-muted-foreground">Two eggs and toast…</span>
        )}
      </p>
      <span
        className={cn(
          'bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full transition-opacity duration-300',
          draft ? 'opacity-100' : 'opacity-30',
        )}
      >
        <ArrowUp size={20} strokeWidth={2.6} />
      </span>
    </div>
  );
}

/** What the phone gets instead of the rail: the same answer, one line high. */
function StatusStrip({ consumed, className }: { consumed: number; className?: string }) {
  const pct = Math.min(100, (consumed / TARGETS.kcal) * 100);

  return (
    <header className={cn('border-border shrink-0 border-b px-4 py-2.5', className)}>
      <div className="flex items-baseline justify-between">
        <p className="tnum text-[15px] font-semibold">
          {consumed.toLocaleString()}
          <span className="text-muted-foreground font-normal">
            {' '}
            / {TARGETS.kcal.toLocaleString()} kcal
          </span>
        </p>
        <p className="tnum text-footnote text-muted-foreground">
          {(TARGETS.kcal - consumed).toLocaleString()} left
        </p>
      </div>
      <div className="bg-muted mt-2 h-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'var(--calories)',
            transition: 'width 700ms cubic-bezier(0.34, 1.4, 0.64, 1)',
          }}
        />
      </div>
    </header>
  );
}

function DayRail({ consumed }: { consumed: Nutrition | null }) {
  const totals = consumed ?? NOTHING;

  return (
    <aside className="border-border hidden flex-col items-center border-l px-5 py-7 lg:flex">
      <CalorieRing consumed={totals.kcal} target={TARGETS.kcal} size={148} strokeWidth={12} />
      <p className="tnum text-muted-foreground mt-3 text-sm">
        <span className="text-foreground font-semibold">{totals.kcal.toLocaleString()}</span> of{' '}
        {TARGETS.kcal.toLocaleString()} kcal
      </p>

      <MacroBars consumed={totals} targets={TARGETS} className="mt-6 w-full" />

      <div className="mt-7 w-full">
        <h3 className="text-footnote text-muted-foreground mb-2 font-medium tracking-wide uppercase">
          Today
        </h3>
        {consumed ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">Eggs, toast and cheese</span>
              <span className="text-footnote text-muted-foreground">Breakfast</span>
            </span>
            <span className="tnum shrink-0 text-sm">~{consumed.kcal}</span>
          </div>
        ) : (
          <p className="text-footnote text-muted-foreground">Nothing logged yet.</p>
        )}
      </div>
    </aside>
  );
}
