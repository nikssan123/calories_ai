'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Camera, MessageSquareText, RotateCcw } from 'lucide-react';
import { useAuth } from '@/components/AuthGate';
import { Logo } from '@/components/Logo';
import { HeroDemo } from '@/components/landing/HeroDemo';
import { Reveal } from '@/components/landing/Reveal';
import { cn } from '@/lib/utils';

const REPO = 'https://github.com/nikssan123/calories_ai';

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
        <Corrections />
        <AdaptiveTarget />
        <WeeklyRead />
        <Details />
        <OpenSource />
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
 * Section rhythm. Every band on the page gets the same gutters and the same
 * vertical air, so the eye can predict where the next idea starts.
 */
function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn('scroll-mt-16 px-6 py-20 sm:py-24 lg:py-28', className)}>
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

/**
 * The pill. Monochrome on purpose: `--primary` inverts cleanly between themes,
 * and keeping the buttons colourless leaves indigo meaning "calories" wherever
 * it appears on the page.
 */
function pill(variant: 'primary' | 'secondary', className?: string) {
  return cn(
    'inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap',
    'transition-[background-color,transform] duration-200 active:scale-[0.97]',
    variant === 'primary'
      ? 'bg-primary text-primary-foreground hover:bg-primary/85'
      : 'border-border bg-card text-foreground hover:bg-muted border',
    className,
  );
}

/** A hairline-separated list of claims. Used wherever the honest small print is
    the selling point rather than the fine print. */
function Points({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn('divide-border divide-y', className)}>
      {items.map((item) => (
        <li key={item} className="text-muted-foreground py-3 text-[15px] leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------- header */

function Header({ start }: { start: Cta }) {
  return (
    <header className="material border-border/60 sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <Logo size={26} />
          <span className="text-[17px] font-semibold tracking-tight">Nutrition</span>
        </a>

        <nav className="text-muted-foreground ml-auto hidden items-center gap-7 text-sm md:flex">
          <a href="#how" className="hover:text-foreground transition-colors">
            How it works
          </a>
          <a href="#target" className="hover:text-foreground transition-colors">
            Your target
          </a>
          <a href="#open" className="hover:text-foreground transition-colors">
            Open source
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
            <p className="text-lede text-muted-foreground mx-auto mt-6 max-w-xl text-pretty">
              A calorie journal you talk to. No forms, no food database, no barcode to hunt
              for — describe the meal in your own words and the day adds itself up.
            </p>
          </Reveal>

          <Reveal delay={170}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href={start.href} className={pill('primary', 'h-12 px-6 text-[15px]')}>
                {start.label}
              </Link>
              <a href="#how" className={pill('secondary', 'h-12 px-6 text-[15px]')}>
                See how it works
              </a>
            </div>
            <p className="text-footnote text-muted-foreground mt-5">
              Free and open source. Runs on your own server.
            </p>
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
    body: '“Two eggs, toast and some cheese.” That is the whole interaction. It reads the sentence, works out the items and logs the meal.',
  },
  {
    Icon: Camera,
    title: 'Or photograph it',
    body: 'A plate, a menu, the back of a packet. The photo goes up and the numbers come back — and a guess arrives labelled as a guess.',
  },
  {
    Icon: RotateCcw,
    title: 'Or ask for your usual',
    body: '“My usual breakfast” looks up what you actually ate before and reuses those quantities. Your own history, not a stranger’s database.',
  },
] as const;

function ThreeWaysIn() {
  return (
    <Section id="how">
      <Reveal>
        <h2 className="text-section-title max-w-2xl text-balance">
          Three ways in. None of them is a form.
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
        {WAYS.map(({ Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 80}>
            <Icon size={24} strokeWidth={1.9} style={{ color: 'var(--calories)' }} />
            <h3 className="mt-4 text-[17px] font-semibold tracking-tight">{title}</h3>
            <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">{body}</p>
          </Reveal>
        ))}
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
          <p className="text-muted-foreground mt-5 text-[17px] leading-relaxed">
            “Actually there were three eggs.” The meal you already logged is corrected in
            place — not appended to, not logged twice, and never left for you to go and fix
            on a screen somewhere else.
          </p>
          <p className="text-muted-foreground mt-4 text-[17px] leading-relaxed">
            It can do that because a meal is stored item by item rather than as one number.
            Correcting the eggs leaves the toast alone.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="bg-card rounded-2xl px-5 py-4 shadow-sm">
            <p className="text-footnote text-muted-foreground font-medium tracking-wide uppercase">
              Breakfast · one entry
            </p>

            <ul className="divide-border mt-2 divide-y">
              {ITEMS.map((item) => (
                <li
                  key={item.name}
                  className="grid grid-cols-[1fr_auto_4.5rem] items-baseline gap-3 py-3"
                >
                  <span className="truncate text-[15px]">{item.name}</span>
                  <span className="tnum text-footnote text-muted-foreground">
                    {item.after ? (
                      <>
                        <s>{item.before}</s>{' '}
                        <span className="font-medium text-[var(--calories)]">{item.after}</span>
                      </>
                    ) : (
                      item.before
                    )}
                  </span>
                  <span className="tnum text-right text-[15px]">
                    {item.after ? (
                      <span className="font-medium text-[var(--calories)]">{item.kcalAfter}</span>
                    ) : (
                      item.kcal
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-border flex items-baseline justify-between border-t pt-3">
              <span className="text-[15px] font-medium">Total</span>
              <span className="tnum text-[15px]">
                <s className="text-muted-foreground">407</s>{' '}
                <span className="font-semibold">479 kcal</span>
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
  'Ten logged days and four weigh-ins before it will move at all. Below that the estimate is noise.',
  'Two hundred calories a pass at most, scaled by how well you logged — so successive weeks converge instead of oscillating.',
  'Never further than 35% from the formula’s prediction. A fortnight of water weight can imply almost anything.',
  'A number you set by hand is never touched.',
];

function AdaptiveTarget() {
  return (
    <Section id="target">
      <Reveal>
        <h2 className="text-section-title max-w-2xl text-balance">
          Your target learns what you actually burn.
        </h2>
        <p className="text-muted-foreground mt-5 max-w-2xl text-[17px] leading-relaxed">
          Every calculator on the internet predicts what a population of people your size
          burns. After a fortnight of logging there is something better available: what{' '}
          <em className="text-foreground not-italic">you</em> burn, read off the only
          experiment that matters.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <div className="bg-card h-full rounded-2xl p-6 shadow-sm sm:p-7">
            <p className="text-footnote text-muted-foreground font-medium tracking-wide uppercase">
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
            <p className="text-muted-foreground mt-5 text-[15px] leading-relaxed">
              Eat 2,000 while losing half a kilo a week and you were burning about 2,550. The
              arithmetic is three lines. What takes the work is knowing when not to believe it.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="bg-card h-full rounded-2xl p-6 pb-3 shadow-sm sm:p-7 sm:pb-4">
            <p className="text-footnote text-muted-foreground font-medium tracking-wide uppercase">
              Before it moves anything
            </p>
            <Points items={GUARDRAILS} className="mt-1" />
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
          <p className="text-muted-foreground mt-5 text-[17px] leading-relaxed">
            Every number in it is computed in SQL. The model is handed those numbers and
            writes the prose — because anything asked to both recall and narrate will get one
            of them wrong, and it is always the recall.
          </p>
          <p className="text-muted-foreground mt-4 text-[17px] leading-relaxed">
            It runs after the target has already moved, so it explains a change rather than
            proposing one. An unexplained calorie target is one people ignore.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="bg-card space-y-3 rounded-2xl px-5 py-5 shadow-sm">
            <p className="text-footnote text-muted-foreground">11 – 17 August</p>
            <p className="text-[15px] leading-relaxed">
              You averaged 2,180 calories against a target of 2,290, and protein held above
              150g on six days of seven. Weight is down 0.4 kg over the fortnight — close to
              the half-kilo a week you asked for, and steadier than the week before.
            </p>
            <p className="text-[15px] leading-relaxed">
              Your target goes up today. You have been eating below the old number and losing
              at the rate you wanted, which means the old number was too low.
            </p>

            <div className="bg-muted/50 rounded-xl px-3 py-2.5">
              <div className="tnum flex items-center gap-2 text-[15px] font-medium">
                <span className="text-muted-foreground">2,290</span>
                <ArrowRight size={14} className="text-muted-foreground" />
                <span className="text-[var(--calories)]">2,480 kcal</span>
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
    body: 'Your 1am snack counts toward the evening it belonged to, not the morning after. Move the hour to wherever your day actually ends.',
  },
  {
    title: 'Exercise is logged, never spent.',
    body: 'A run shows up on your day and in your trends. It does not quietly enlarge your calorie budget on the way past.',
  },
  {
    title: 'A guess is marked as a guess.',
    body: 'A weighed portion and a restaurant estimate are not the same evidence, and the target maths weighs them differently.',
  },
  {
    title: 'Phone and desktop are different layouts.',
    body: 'Not one scaled to fit. The day rides beside the conversation on a wide screen, and gets a tab of its own on a phone.',
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
            <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
            <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">{body}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- open source */

function OpenSource() {
  return (
    <Section id="open">
      <Reveal>
        <div
          className="relative overflow-hidden rounded-[2rem] px-8 py-14 sm:px-12 sm:py-16"
          style={{
            // The mark's indigo-to-purple ramp, pinned dark rather than taken
            // from the tokens: `--calories` lightens in dark mode, and white
            // text on it would fall under 4.5:1 exactly where it matters most.
            background: 'linear-gradient(135deg, #4b49c4 0%, #7f45c0 100%)',
          }}
        >
          <h2 className="text-section-title max-w-xl text-balance text-white">
            Your meals live in your database.
          </h2>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/80">
            Nutrition is open source under Apache 2.0. There is no third-party sign-in, no
            analytics, no advertising and nothing to sell — your meals are rows in a Postgres
            you own. Run it on a five-dollar VPS, or on the laptop under your desk.
          </p>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-[15px] font-medium text-[#1c1c1e] transition-transform active:scale-[0.97]"
          >
            Read the source
            <ArrowUpRight size={17} strokeWidth={2.2} />
          </a>
        </div>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------- closing */

function Closing({ start }: { start: Cta }) {
  return (
    <Section className="text-center">
      <Reveal>
        <h2 className="text-section-title text-balance">Start with breakfast.</h2>
        <p className="text-muted-foreground mx-auto mt-5 max-w-md text-[17px] leading-relaxed">
          It takes about a minute. The journal asks you a few things — your height, your
          weight, what you are aiming at — and works the rest out from there.
        </p>
        <Link href={start.href} className={pill('primary', 'mt-8 h-12 px-6 text-[15px]')}>
          {start.label}
        </Link>
      </Reveal>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-border border-t px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={22} />
          <span className="text-sm font-medium">Nutrition</span>
        </div>
        <nav className="text-muted-foreground flex items-center gap-6 text-sm">
          <Link href="/login" className="hover:text-foreground transition-colors">
            Sign in
          </Link>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <span>Apache-2.0</span>
        </nav>
      </div>
    </footer>
  );
}
