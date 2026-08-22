'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Camera } from 'lucide-react';
import type { ChatAction, DayQuality, Nutrition, Targets } from '@ct/shared';
import { CalorieRing } from '@/components/CalorieRing';
import { ChatActionCard } from '@/components/ChatCard';
import { DietQuality } from '@/components/DietQuality';
import { MacroBars } from '@/components/MacroBars';
import { useReducedMotion } from '@/components/landing/Reveal';
import { cn } from '@/lib/utils';

/**
 * The hero's product shot, played rather than photographed.
 *
 * It is built out of the app's own <CalorieRing>, <ChatActionCard>,
 * <MacroBars> and <DietQuality> rather than a mock-up, so it cannot drift away
 * from the thing it is advertising.
 *
 * The day it shows is already underway. That is not set dressing: every figure
 * worth advertising is a figure about a day rather than about a meal, and none
 * of them can be drawn from a standing start. A ring at zero is a hole, the
 * quality tracks are four empty gutters, and the card's calorie bar — the day
 * so far in quiet green, this meal bright on the end of it — degenerates into a
 * single band with nothing behind it. So breakfast and a snack are already on
 * the board before the visitor arrives, and the conversation on screen is the
 * one that adds lunch to them.
 *
 * It also shows a correction rather than a first log, because "I logged a meal"
 * is table stakes and "I changed my mind and it corrected the entry it already
 * had" is the product.
 */

const TARGETS: Targets = {
  kcal: 2290,
  protein_g: 165,
  carbs_g: 236,
  fat_g: 76,
  is_custom: false,
  source: 'calculated',
};

/**
 * The four quality targets that go with a 2,290 kcal day, worked out by the
 * same arithmetic the API uses: 14g of fiber per 1000 kcal, a flat 2,300mg of
 * sodium, and a tenth of the day's energy each for saturated fat and sugar.
 */
const QUALITY_TARGETS: DayQuality['targets'] = {
  fiber_g: { value: 32, direction: 'floor' },
  sodium_mg: { value: 2300, direction: 'ceiling' },
  sat_fat_g: { value: 25, direction: 'ceiling' },
  sugar_g: { value: 57, direction: 'ceiling' },
};

/** Stable ids: nothing here reaches the API, but the card's props are the real ones. */
const ENTRY_ID = '00000000-0000-4000-8000-000000000001';

/**
 * The demo's day is always today, so its card never says "on 14 Mar". Built
 * from local parts rather than an ISO slice, which is UTC and so is the wrong
 * date for anyone east of it after their evening meal.
 */
const TODAY = (() => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, '0')}`;
})();

/** Breakfast and a snack: what the day already held before the turn on screen. */
const EARLIER: Nutrition = { kcal: 502, protein_g: 25, carbs_g: 56, fat_g: 21 };

/** The turn that is already on screen when the demo starts. */
const LOGGED = {
  text: 'Chicken salad with avocado, and a flat white',
  reply: 'Logged as lunch — a palm-sized chicken breast, half an avocado and a small flat white.',
  nutrition: { kcal: 550, protein_g: 45, carbs_g: 30, fat_g: 28 } satisfies Nutrition,
  quality: { fiber_g: 14, sodium_mg: 1180, sat_fat_g: 12, sugar_g: 22 },
  chicken: '100 g',
};

/** And the one it types. */
const CORRECTED = {
  text: 'make that double chicken',
  reply: 'Done — same entry, 200g of chicken now, and the day has moved with it.',
  nutrition: { kcal: 715, protein_g: 76, carbs_g: 30, fat_g: 32 } satisfies Nutrition,
  quality: { fiber_g: 14, sodium_mg: 1310, sat_fat_g: 13, sugar_g: 22 },
  chicken: '200 g',
};

function lunch(turn: typeof LOGGED): ChatAction {
  return {
    kind: 'food_logged',
    entry_id: ENTRY_ID,
    summary: 'Logged lunch',
    card: {
      type: 'food',
      entry_id: ENTRY_ID,
      meal: 'lunch',
      description: 'Chicken salad and a flat white',
      confidence: 'medium',
      items: [
        { name: 'Chicken breast', quantity: turn.chicken },
        { name: 'Avocado', quantity: 'half' },
        { name: 'Flat white', quantity: 'small' },
      ],
      ...turn.nutrition,
      day: {
        local_date: TODAY,
        kcal_before: EARLIER.kcal,
        kcal_after: EARLIER.kcal + turn.nutrition.kcal,
        target_kcal: TARGETS.kcal,
      },
    },
  };
}

/** Roughly 57 words a minute — a person thinking, not a machine printing. */
const TYPE_MS = 42;

type Phase = 'resting' | 'typing' | 'sent' | 'thinking' | 'corrected';

/** How long each beat holds before the next one starts. */
const SCRIPT: { phase: Phase; ms: number }[] = [
  // Long enough to read the day before anything moves on it.
  { phase: 'resting', ms: 2600 },
  { phase: 'typing', ms: CORRECTED.text.length * TYPE_MS + 520 },
  { phase: 'sent', ms: 380 },
  { phase: 'thinking', ms: 1500 },
  // The long one: the corrected numbers are the point, so leave them up.
  { phase: 'corrected', ms: 5600 },
];

const AT = Object.fromEntries(SCRIPT.map((beat, i) => [beat.phase, i])) as Record<Phase, number>;

const CAPTION =
  'A conversation with the journal. A day with breakfast and a snack already on it; "chicken salad with avocado, and a flat white" is logged as lunch at about 550 calories, drawn as a band on the end of the day\'s calorie bar — then corrected to double chicken, and the same entry updates in place to 715 while the ring, the macros and the fiber, sodium, saturated fat and sugar tracks move with it.';

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
  const stage = reduced ? AT.corrected : beat;

  const draft = useTypewriter(stage === AT.typing ? CORRECTED.text : '');

  const sent = stage >= AT.sent;
  const corrected = stage >= AT.corrected;
  const turn = corrected ? CORRECTED : LOGGED;

  const consumed: Nutrition = {
    kcal: EARLIER.kcal + turn.nutrition.kcal,
    protein_g: EARLIER.protein_g + turn.nutrition.protein_g,
    carbs_g: EARLIER.carbs_g + turn.nutrition.carbs_g,
    fat_g: EARLIER.fat_g + turn.nutrition.fat_g,
  };

  return (
    <div
      ref={ref}
      role="img"
      aria-label={CAPTION}
      className={cn(
        'bg-card border-border overflow-hidden rounded-[2rem] border-2',
        'shadow-[0_10px_0_0_var(--chunk),0_50px_100px_-45px_rgb(0_0_0/0.35)]',
        'dark:shadow-[0_10px_0_0_var(--chunk),0_50px_100px_-45px_rgb(0_0_0/0.9)]',
        className,
      )}
    >
      {/* Fixed once there is a rail to measure against, because a shot that
          grows by a bubble's height every few seconds shoves the whole page
          under it up and down. The conversation is what flexes inside it. */}
      <div className="grid lg:h-[28rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* `min-h-0`: a grid item's default `min-height: auto` would let this
            column refuse to be shorter than the conversation inside it, and the
            fixed height above would be a suggestion rather than a height. */}
        <div className="flex min-w-0 flex-col lg:min-h-0">
          {/* The app's own responsive split: the day is a strip above the
              conversation where there is no room beside it, and the rail below. */}
          <StatusStrip consumed={consumed.kcal} className="lg:hidden" />

          <div
            // `overflow-hidden` and `min-h-0` together are what let the column
            // clip rather than grow: without them a flex child refuses to be
            // shorter than its content, and the last reply of the loop shoves
            // the composer out through the bottom of the shot.
            className="flex min-h-[19rem] flex-1 flex-col justify-end gap-4 overflow-hidden px-4 py-5 sm:min-h-[21rem] sm:px-5 lg:min-h-0"
            style={{
              // Older turns leave at the top edge rather than being cut by it.
              maskImage: 'linear-gradient(to bottom, transparent, #000 16%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 16%)',
            }}
          >
            <UserBubble>{LOGGED.text}</UserBubble>
            <Assistant>
              <p className="text-body leading-relaxed">{LOGGED.reply}</p>
              <div
                className="rounded-2xl"
                // A one-shot ring the moment the entry is corrected. The card
                // itself never remounts — that is the claim being made.
                style={
                  corrected && !reduced
                    ? { animation: 'entry-touched 1500ms var(--ease-out)' }
                    : undefined
                }
              >
                <ChatActionCard action={lunch(turn)} today={TODAY} />
              </div>
            </Assistant>
            {sent && <UserBubble>{CORRECTED.text}</UserBubble>}
            {stage === AT.thinking && <Thinking />}
            {corrected && (
              <Assistant>
                <p className="text-body leading-relaxed">{CORRECTED.reply}</p>
              </Assistant>
            )}
          </div>

          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <FakeComposer draft={draft} />
          </div>
        </div>

        <DayRail consumed={consumed} quality={turn.quality} />
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
      <p className="bg-primary text-primary-foreground chunk [--chunk-color:var(--calories-deep)] [--chunk-depth:3px] max-w-[85%] rounded-[1.375rem] rounded-br-lg px-4 py-2.5 text-body leading-relaxed font-semibold">
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
          className="bg-muted-foreground/60 size-2.5 animate-bounce rounded-full"
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '1s' }}
        />
      ))}
    </div>
  );
}

/** The composer, with its keyboard held by someone else. */
function FakeComposer({ draft }: { draft: string }) {
  return (
    <div className="border-border bg-card chunk flex items-end gap-2 rounded-[1.75rem] border-2 px-2.5 py-2">
      <span className="text-muted-foreground flex size-9 shrink-0 items-center justify-center">
        <Camera size={22} strokeWidth={1.9} />
      </span>
      <p className="min-h-9 min-w-0 flex-1 px-1 py-[0.4375rem] text-body leading-6">
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
          'bg-primary text-primary-foreground chunk [--chunk-color:var(--calories-deep)] [--chunk-depth:3px] flex size-10 shrink-0 items-center justify-center rounded-full transition-opacity duration-300',
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
    <header className={cn('border-border shrink-0 border-b-2 px-4 py-2.5', className)}>
      <div className="flex items-baseline justify-between">
        <p className="text-figure text-body">
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
      <div className="bg-muted border-border mt-2 h-2.5 overflow-hidden rounded-full border">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'var(--calories)',
            transition: 'width var(--dur-spring) var(--ease-spring)',
          }}
        />
      </div>
    </header>
  );
}

/**
 * The day beside the conversation: ring, macros, quality — the Today screen's
 * own three panels, in its own order.
 *
 * No list of the day's entries, which the rail carried while it had the room.
 * The four quality tracks say more about the product than a third copy of
 * "Breakfast · ~407" does, and the shot has to stay the height it was.
 */
function DayRail({ consumed, quality }: { consumed: Nutrition; quality: typeof LOGGED.quality }) {
  return (
    <aside className="border-border hidden flex-col border-l-2 px-5 py-6 lg:flex">
      <div className="flex flex-col items-center">
        <CalorieRing consumed={consumed.kcal} target={TARGETS.kcal} size={132} strokeWidth={11} />
        <p className="tnum text-muted-foreground mt-3 text-sm">
          <span className="text-figure text-foreground">{consumed.kcal.toLocaleString()}</span> of{' '}
          {TARGETS.kcal.toLocaleString()} kcal
        </p>
      </div>

      <MacroBars consumed={consumed} targets={TARGETS} className="mt-6 w-full" />

      {/* The other four figures the same estimate reads off the same sentence.
          Flush rather than in their own card: they are already inside one. */}
      <DietQuality
        flush
        className="mt-6 w-full"
        quality={{ ...quality, coverage: 1, targets: QUALITY_TARGETS }}
      />
    </aside>
  );
}
