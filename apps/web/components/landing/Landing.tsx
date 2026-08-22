'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Camera, MessageSquareText, RotateCcw, ScanBarcode } from 'lucide-react';
import type { DayQuality } from '@ct/shared';
import { useAuth } from '@/components/AuthGate';
import { DietQuality } from '@/components/DietQuality';
import { Logo } from '@/components/Logo';
import { HeroDemo } from '@/components/landing/HeroDemo';
import { Reveal } from '@/components/landing/Reveal';
import { StoreLinks } from '@/components/landing/StoreLinks';
import { cn } from '@/lib/utils';

/**
 * The public face of the app, served at `/` to anyone without a session.
 *
 * Three rules, taken from the same HIG the product is built on. Clarity: one
 * idea per section, said in the fewest words it survives. Deference: the only
 * saturated colour on the page is data — the ring, the macro bars, the mark —
 * plus one gradient that belongs to the project itself. Depth: content floats
 * on the recessed grouped background rather than inside boxes with borders.
 */
export function Landing() {
  const { signupAllowed } = useAuth();

  // The app shell owns the viewport and never scrolls the document. A landing
  // page is a document, so it asks for the window back while it is mounted.
  useEffect(() => {
    document.documentElement.dataset.scroll = 'document';
    return () => {
      delete document.documentElement.dataset.scroll;
    };
  }, []);

  // A server with registration closed has nothing to offer a stranger except
  // the sign-in form. Better to say so than to send them to a wall.
  const start = signupAllowed
    ? { href: '/login?mode=signup', label: 'Get started' }
    : { href: '/login', label: 'Sign in' };

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <Header start={start} />

      <main>
        <Hero start={start} />
        <ThreeWaysIn />
        <TheOnesNobodyCatalogued />
        <Corrections />
        <AdaptiveTarget />
        <BeyondCalories />
        <WeeklyRead />
        <Details />
        <Privacy />
        <Closing start={start} />
      </main>

      <Footer />
    </div>
  );
}

interface Cta {
  href: string;
  label: string;
}

/* ---------------------------------------------------------------- primitives */

/**
 * The hero's wash, and the page's only piece of pure decoration.
 *
 * A page this long that lights its accent once at the top and then runs flat
 * for six screens reads as a single unbroken field of paper — or, on dark, of
 * ink. So the same radial the mark carries comes back twice further down, at
 * the two places the page changes subject: where it starts talking about the
 * target, and where it asks for the sign-up. Turned far enough down that you
 * would not point at it, which is the whole idea — it is the ground warming,
 * not a shape.
 */
function Glow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-1/2 h-[34rem] -translate-y-1/2 opacity-70"
      style={{
        background:
          'radial-gradient(44% 44% at 50% 50%, color-mix(in oklch, var(--calories), transparent 84%), transparent 70%)',
      }}
    />
  );
}

/**
 * Section rhythm. Every band on the page gets the same gutters and the same
 * vertical air, so the eye can predict where the next idea starts.
 */
function Section({
  id,
  glow,
  className,
  children,
}: {
  id?: string;
  glow?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        'relative scroll-mt-16 px-6 py-20 sm:py-24 lg:py-28',
        glow && 'overflow-hidden',
        className,
      )}
    >
      {glow && <Glow />}
      <div className="relative mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

/**
 * The pill. Monochrome on purpose: `--primary` inverts cleanly between themes,
 * and keeping the buttons colourless leaves the accent meaning "calories" wherever
 * it appears on the page.
 */
function pill(variant: 'primary' | 'secondary', className?: string) {
  return cn(
    'chunk-press inline-flex items-center justify-center gap-1.5 rounded-full border-2 font-extrabold whitespace-nowrap',
    variant === 'primary'
      ? 'bg-primary text-primary-foreground border-transparent [--chunk-color:var(--calories-deep)] hover:bg-[color-mix(in_oklch,var(--primary),#fff_12%)]'
      : 'border-border bg-card text-foreground hover:bg-muted',
    className,
  );
}

/** A separated list of claims. Used wherever the honest small print is the
    selling point rather than the fine print. */
function Points({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn('divide-border divide-y-2', className)}>
      {items.map((item) => (
        <li key={item} className="text-muted-foreground py-3 text-body leading-relaxed font-medium">
          {item}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------- header */

function Header({ start }: { start: Cta }) {
  return (
    <header className="material border-border sticky top-0 z-40 border-b-2">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <Logo size={26} />
          <span className="font-[family-name:var(--font-display)] text-[19px] font-extrabold tracking-[-0.01em]">Day So Far</span>
        </a>

        <nav className="text-muted-foreground ml-auto hidden items-center gap-7 text-sm md:flex">
          <a href="#how" className="hover:text-foreground transition-colors">
            How it works
          </a>
          <a href="#target" className="hover:text-foreground transition-colors">
            Your target
          </a>
          <a href="#privacy" className="hover:text-foreground transition-colors">
            Your data
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-7">
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground hidden px-3 py-2 text-sm transition-colors sm:block"
          >
            Sign in
          </Link>
          <Link href={start.href} className={pill('primary', 'h-9 px-4 text-sm')}>
            {start.label}
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------- hero */

function Hero({ start }: { start: Cta }) {
  return (
    <section id="top" className="relative overflow-hidden px-6 pt-16 pb-4 sm:pt-24">
      {/* The mark's own gradient, blown up and turned almost all the way down.
          It is the only thing on the page that is decoration and nothing else. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-48 h-[38rem] opacity-60"
        style={{
          background:
            'radial-gradient(44% 44% at 50% 45%, color-mix(in oklch, var(--calories), transparent 80%), transparent 70%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h1 className="text-display text-balance">Just say what you ate.</h1>
          </Reveal>

          <Reveal delay={90}>
            <p className="text-lede text-muted-foreground mx-auto mt-6 max-w-lg text-pretty">
              A calorie journal you talk to. Describe the meal in your own words; the day
              adds itself up.
            </p>
          </Reveal>

          <Reveal delay={170}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href={start.href} className={pill('primary', 'h-12 px-6 text-body')}>
                {start.label}
              </Link>
              <a href="#how" className={pill('secondary', 'h-12 px-6 text-body')}>
                See how it works
              </a>
            </div>

            <p className="text-footnote text-muted-foreground mt-5 font-semibold">
              No ads, no trackers, nothing sold on.
            </p>

            <StoreLinks className="mt-2.5" />
          </Reveal>
        </div>

        <Reveal delay={250}>
          <HeroDemo className="mx-auto mt-14 max-w-4xl sm:mt-16" />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- three ways in */

const WAYS = [
  {
    Icon: MessageSquareText,
    title: 'Say it',
    body: '“Two eggs, toast and some cheese.” That is the whole interaction.',
  },
  {
    Icon: Camera,
    title: 'Or photograph it',
    body: 'A plate, a menu, the back of a packet. A guess comes back labelled as a guess.',
  },
  {
    Icon: RotateCcw,
    title: 'Or ask for your usual',
    body: '“My usual breakfast” reuses what you actually ate before. Your history, not a stranger’s database.',
  },
  /*
   * A peer, not a footnote. The obvious cheap move was to fold this into the
   * camera card above — it already says "the back of a packet" and is halfway
   * there — but the scanner sits in the composer's menu beside Take a photo
   * and Choose a photo, and something that is a peer in the product should be
   * a peer on the page. Buried in the photo card it reads as a detail of a
   * feature rather than as a feature.
   *
   * The sentence is doing two jobs on purpose. It says the scan produces a
   * candidate and not a log, which is the decision the whole thing rests on,
   * and it puts the miss path in the shop window rather than in the FAQ.
   */
  {
    Icon: ScanBarcode,
    title: 'Or scan the packet',
    body: 'Point at the barcode and the label comes back. You say how much of it you ate.',
  },
] as const;

function ThreeWaysIn() {
  return (
    <Section id="how">
      <Reveal>
        <h2 className="text-section-title max-w-2xl text-balance">
          Four ways in. None of them is a form.
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
        {WAYS.map(({ Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 80}>
            {/* The icon sits on a tinted disc rather than floating: three bare
                line icons on an empty ground was the most "dashboard" moment
                left on the page. */}
            <span
              className="flex size-12 items-center justify-center rounded-2xl"
              style={{ background: 'color-mix(in oklch, var(--calories), transparent 86%)' }}
            >
              <Icon size={24} strokeWidth={2.4} style={{ color: 'var(--calories-text)' }} />
            </span>
            <h3 className="font-[family-name:var(--font-display)] mt-4 text-[19px] font-extrabold tracking-[-0.01em]">
              {title}
            </h3>
            <p className="text-muted-foreground mt-2 text-body leading-relaxed">{body}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------- the ones nobody has */

/**
 * A fabricated scan, and deliberately fabricated.
 *
 * ODbL requires a visible "Data from Open Food Facts" wherever their data is
 * shown, which the product card carries. This page only inherits that
 * obligation if it shows a real product — so it invents one, the way HeroDemo,
 * Corrections and WeeklyRead invent everything they display. Plausible numbers,
 * no real GTIN, no obligation, and nothing here that goes stale when somebody
 * edits a crowd-sourced row.
 */
const MISS_STEPS = [
  { label: '5 060 337 XXXXXX', caption: 'Own-brand oat milk', tone: 'code' },
  { label: 'Not in the catalogue', caption: 'Nobody has scanned this one', tone: 'miss' },
  { label: 'Oat drink · 250 ml', caption: '113 kcal · read off the panel', tone: 'hit' },
] as const;

function TheOnesNobodyCatalogued() {
  return (
    <Section>
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <h2 className="text-section-title text-balance">
            A scanner is only as good as its worst case.
          </h2>
          <p className="text-muted-foreground mt-5 text-[17px] leading-relaxed font-medium">
            Most of a real trolley is own-brand that nobody has ever catalogued. Here a miss
            is not a dead end: it says <em>snap the label instead</em>, and the nutrition
            panel goes to the same reader that handles a plate of food.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="bg-card border-border chunk rounded-[var(--radius)] border-2 px-5 py-4">
            <p className="text-eyebrow text-muted-foreground">One scan, start to finish</p>

            <ol className="divide-border mt-2 divide-y-2">
              {MISS_STEPS.map((step, i) => (
                <li key={step.label} className="flex items-baseline gap-3 py-3">
                  <span
                    aria-hidden
                    className="text-footnote text-muted-foreground tnum w-4 shrink-0 font-extrabold"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-body font-semibold',
                        step.tone === 'code' && 'tnum',
                        step.tone === 'miss' && 'text-muted-foreground',
                        step.tone === 'hit' && 'text-[var(--calories-text)] font-extrabold',
                      )}
                    >
                      {step.label}
                    </span>
                    <span className="text-footnote text-muted-foreground block truncate">
                      {step.caption}
                    </span>
                  </span>
                  {step.tone === 'hit' && (
                    <span aria-hidden className="shrink-0 text-body">
                      ✓
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- corrections */

const ITEMS = [
  { name: 'Eggs', before: '2', after: '3', kcal: 143, kcalAfter: 215 },
  { name: 'Toast', before: '2 slices', after: null, kcal: 160, kcalAfter: 160 },
  { name: 'Cheddar', before: '30 g', after: null, kcal: 104, kcalAfter: 104 },
];

function Corrections() {
  return (
    <Section>
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <h2 className="text-section-title text-balance">
            Change your mind. It changes the entry.
          </h2>
          <p className="text-muted-foreground mt-5 text-[17px] leading-relaxed font-medium">
            “Actually there were three eggs.” The entry is corrected in place — not appended
            to, not logged twice. A meal is stored item by item, so correcting the eggs
            leaves the toast alone.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="bg-card border-border chunk rounded-[var(--radius)] border-2 px-5 py-4">
            <p className="text-eyebrow text-muted-foreground">
              Breakfast · one entry
            </p>

            <ul className="divide-border mt-2 divide-y-2">
              {ITEMS.map((item) => (
                <li
                  key={item.name}
                  className="grid grid-cols-[1fr_auto_4.5rem] items-baseline gap-3 py-3"
                >
                  <span className="truncate text-body font-semibold">{item.name}</span>
                  <span className="tnum text-footnote text-muted-foreground font-semibold">
                    {item.after ? (
                      <>
                        <s>{item.before}</s>{' '}
                        <span className="font-extrabold text-[var(--calories-text)]">{item.after}</span>
                      </>
                    ) : (
                      item.before
                    )}
                  </span>
                  <span className="tnum text-right text-body">
                    {item.after ? (
                      <span className="font-extrabold text-[var(--calories-text)]">{item.kcalAfter}</span>
                    ) : (
                      item.kcal
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-border flex items-baseline justify-between border-t-2 pt-3">
              <span className="text-body font-bold">Total</span>
              <span className="tnum text-body">
                <s className="text-muted-foreground">407</s>{' '}
                <span className="text-figure">479 kcal</span>
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------- adaptive target */

const GUARDRAILS = [
  'Ten logged days and four weigh-ins before it moves at all.',
  'Two hundred calories a pass at most, scaled by how well you logged.',
  'Never further than 35% from the formula’s prediction.',
  'A number you set by hand is never touched.',
];

function AdaptiveTarget() {
  return (
    <Section id="target" glow>
      <Reveal>
        <h2 className="text-section-title max-w-2xl text-balance">
          Your target learns what you actually burn.
        </h2>
        <p className="text-muted-foreground mt-5 max-w-2xl text-[17px] leading-relaxed font-medium">
          A calculator predicts what people your size burn. After a fortnight of logging
          there is something better: what <em className="text-foreground not-italic">you</em>{' '}
          burn.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <div className="bg-card border-border chunk h-full rounded-[var(--radius)] border-2 p-6 sm:p-7">
            <p className="text-eyebrow text-muted-foreground">
              Every Monday
            </p>
            {/* Broken by hand rather than left to wrap, so the minus sign starts
                a line the way it would on paper. The second half is still
                allowed to wrap under its own indent — a phone is narrower than
                the formula, and a line clipped mid-number reads as a bug. */}
            <p className="mt-3 font-mono text-[12.5px] leading-6 sm:text-[13px]">
              <span className="block">TDEE = mean daily intake</span>
              <span className="block pl-[2ch]">
                &minus; (weight change per day &times; 7,700 kcal/kg)
              </span>
            </p>
            <p className="text-muted-foreground mt-5 text-body leading-relaxed">
              Eat 2,000 while losing half a kilo a week and you were burning about 2,550. The
              arithmetic is easy; knowing when not to believe it is the work.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="bg-card border-border chunk h-full rounded-[var(--radius)] border-2 p-6 pb-3 sm:p-7 sm:pb-4">
            <p className="text-eyebrow text-muted-foreground">
              Before it moves anything
            </p>
            <Points items={GUARDRAILS} className="mt-1" />
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------- beyond calories */

/**
 * A Tuesday, drawn by the app's own `DietQuality`.
 *
 * This used to be a hand-typed copy of that component's markup, on the grounds
 * that a landing page shows a picture of a day rather than a day. The picture
 * is still invented — but the invention is now the four numbers rather than the
 * panel, which is the half that was worth keeping honest. A second copy of a
 * component is a thing that will eventually disagree with the first.
 *
 * The day is deliberately a partly-measured one, so the panel prints its own
 * "only 55% of today's calories carry these figures" line. That sentence used
 * to be a whole card of prose beside this one, and it is worth more shown than
 * told: an un-estimated item is recorded as unknown, never as a zero.
 */
const A_TUESDAY: DayQuality = {
  fiber_g: 22,
  sodium_mg: 1590,
  sat_fat_g: 18,
  sugar_g: 44,
  coverage: 0.55,
  targets: {
    fiber_g: { value: 31, direction: 'floor' },
    sodium_mg: { value: 2300, direction: 'ceiling' },
    sat_fat_g: { value: 24, direction: 'ceiling' },
    sugar_g: { value: 55, direction: 'ceiling' },
  },
};

function BeyondCalories() {
  return (
    <Section id="quality">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <h2 className="text-section-title text-balance">
            Two identical days can be very different dinners.
          </h2>
          <p className="text-muted-foreground mt-5 text-[17px] leading-relaxed font-medium">
            2,100 calories is the same number from lentils or from crisps and a shake. So the
            same estimate that prices your meal reads its fiber, sodium, saturated fat and
            sugar &mdash; from the sentence you already typed.
          </p>
          <p className="text-muted-foreground mt-4 text-[17px] leading-relaxed font-medium">
            Fiber is a floor to reach; the other three are ceilings to stay under, and they
            are drawn differently because nothing here throws a party for hitting your sodium.
          </p>
        </Reveal>

        <Reveal delay={100}>
          {/* No eyebrow of its own: the panel brings its own heading, and two
              labels stacked on one card is one label too many. */}
          <div className="bg-card border-border chunk rounded-[var(--radius)] border-2 p-6 sm:p-7">
            <DietQuality flush quality={A_TUESDAY} />
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- the review */

function WeeklyRead() {
  return (
    <Section>
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <h2 className="text-section-title text-balance">
            Monday morning, a short read on the week.
          </h2>
          <p className="text-muted-foreground mt-5 text-[17px] leading-relaxed font-medium">
            Every number in it is computed in SQL; the model only writes the prose. Anything
            asked to both recall and narrate gets one of them wrong, and it is always the
            recall.
          </p>
          <p className="text-muted-foreground mt-4 text-[17px] leading-relaxed font-medium">
            It runs after the target has already moved, so it explains a change rather than
            proposing one.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="bg-card border-border chunk space-y-3 rounded-[var(--radius)] border-2 px-5 py-5">
            <p className="text-footnote text-muted-foreground">11 – 17 August</p>
            <p className="text-body leading-relaxed">
              You averaged 2,180 calories against a target of 2,290, and protein held above
              150g on six days of seven. Weight is down 0.4 kg over the fortnight.
            </p>
            <p className="text-body leading-relaxed">
              Your target goes up today: you have been eating below the old number and losing
              at the rate you wanted, which means the old number was too low.
            </p>

            <div className="bg-muted border-border rounded-2xl border-2 px-3.5 py-3">
              <div className="tnum flex items-center gap-2 text-body font-bold">
                <span className="text-muted-foreground">2,290</span>
                <ArrowRight size={14} className="text-muted-foreground" />
                <span className="text-[var(--calories-text)]">2,480 kcal</span>
              </div>
              <p className="text-footnote text-muted-foreground mt-1">
                From 14 logged days and 6 weigh-ins. Capped at +200.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- details */

const DETAILS = [
  {
    title: 'A day ends at 4am.',
    body: 'Your 1am snack counts toward the evening it belonged to. Move the hour to wherever your day actually ends.',
  },
  {
    title: 'Exercise is logged, never spent.',
    body: 'A run shows up on your day and in your trends. It does not quietly enlarge your calorie budget.',
  },
  {
    title: 'A guess is marked as a guess.',
    body: 'A weighed portion and a restaurant estimate are not the same evidence, and the maths weighs them differently.',
  },
  {
    title: 'Phone and desktop are different layouts.',
    body: 'Not one scaled to fit. The day rides beside the conversation on a wide screen, and gets its own tab on a phone.',
  },
];

function Details() {
  return (
    <Section>
      <Reveal>
        <h2 className="text-section-title max-w-2xl text-balance">
          The details you only notice when they are wrong.
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
        {DETAILS.map(({ title, body }, i) => (
          <Reveal key={title} delay={(i % 2) * 80}>
            <h3 className="font-[family-name:var(--font-display)] text-[19px] font-extrabold tracking-[-0.01em]">{title}</h3>
            <p className="text-muted-foreground mt-2 text-body leading-relaxed">{body}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- privacy */

function Privacy() {
  return (
    <Section id="privacy">
      <Reveal>
        <div
          className="relative overflow-hidden rounded-[2rem] px-8 py-14 sm:px-12 sm:py-16"
          style={{
            // The mark's own forest-into-jade ramp, pinned rather than taken
            // from the tokens: `--calories` lifts to mint in dark mode, and
            // white on that is barely 2:1. The jade end stops short of the
            // `--logo-ramp` value for the same reason — white on #23d3b0 is
            // under 2:1, and the body copy runs the width of the panel. These
            // are the new grass-and-jade hues walked down until every stop
            // clears 4.7:1 against white.
            background: 'linear-gradient(140deg, #0a6b41 0%, #0b7d4c 45%, #0a7a68 100%)',
          }}
        >
          <h2 className="text-section-title max-w-xl text-balance text-white">
            Your meals stay yours.
          </h2>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed font-medium text-white/85">
            No third-party sign-in, no analytics, no advertising, nothing to sell. Your meals
            are rows in a database that exists to answer one question &mdash; what did you
            eat today.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------- closing */

function Closing({ start }: { start: Cta }) {
  return (
    <Section glow className="text-center">
      <Reveal>
        <h2 className="text-section-title text-balance">Start with breakfast.</h2>
        <p className="text-muted-foreground mx-auto mt-5 max-w-md text-[17px] leading-relaxed font-medium">
          About a minute to set up. It asks your height, your weight and what you are aiming
          at, and works the rest out from there.
        </p>
        <Link href={start.href} className={pill('primary', 'mt-8 h-12 px-6 text-body')}>
          {start.label}
        </Link>
        <StoreLinks className="mt-5" />
      </Reveal>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-border border-t-2 px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={22} />
          <span className="text-sm font-bold">Day So Far</span>
        </div>
        <nav className="text-muted-foreground flex items-center gap-6 text-sm">
          <Link href="/login" className="hover:text-foreground transition-colors">
            Sign in
          </Link>
          <span>© {new Date().getFullYear()} Day So Far</span>
        </nav>
      </div>
    </footer>
  );
}
