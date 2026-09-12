'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Camera,
  ChefHat,
  ChevronDown,
  Dumbbell,
  Footprints,
  Globe,
  Languages,
  LayoutGrid,
  MessageSquareText,
  Moon,
  RotateCcw,
  ScanBarcode,
  Trophy,
  WifiOff,
  X,
  Activity,
} from 'lucide-react';
import { LOCALES_BY_NAME, LOCALE_NAMES, formatNumber, matchLocale, type DayQuality, type Locale } from '@ct/shared';
import { DietQuality } from '@/components/DietQuality';
import { Logo } from '@/components/Logo';
import { HeroDemo } from '@/components/landing/HeroDemo';
import { Reveal } from '@/components/landing/Reveal';
import { StoreLinks, STORE_HREF, APP_STORE_HREF } from '@/components/landing/StoreLinks';
import type { LandingCopy } from '@/components/landing/copy/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { blogIndexPath } from '@/lib/blog';
import { LocaleScope } from '@/lib/i18n';
import { landingPath } from '@/lib/landing';
import { cn } from '@/lib/utils';

/**
 * The public face of the app: `/` to anyone without a session, and `/bg`,
 * `/de` and the other eleven to everybody.
 *
 * Three rules, taken from the same HIG the product is built on. Clarity: one
 * idea per section, said in the fewest words it survives. Deference: the only
 * saturated colour on the page is data — the ring, the macro bars, the mark —
 * plus one gradient that belongs to the project itself. Depth: content floats
 * on the recessed grouped background rather than inside boxes with borders.
 *
 * **The order is the order of a visitor's questions**, which is what the 2026-09
 * restructure was for. The page used to run six two-column feature bands in a
 * row, each as long as the last, and a reader who wanted the price scrolled
 * past an explanation of the TDEE formula to reach it. Now: what is it (hero),
 * how do I use it (four ways in, corrections), will it work for the food I eat
 * (home cooking, quality), what makes it better over time (the target, Plus),
 * what else is in it (a grid you can scan in one look), what does it cost,
 * and what did I not think to ask (FAQ). The technical proofs moved to
 * /how-it-works, one link away, where the people who want them already go.
 *
 * **Every word comes in as `copy`**, one language of it, from the page file on
 * the server. See ./copy — the English is the contract and the twelve others
 * are typed against it. The app components drawn inside (the ring, the chat
 * card, the quality panel) take their labels from the app's own catalogues,
 * held to this page's language by `<LocaleScope>` rather than the reader's.
 */
export function Landing({
  locale,
  copy,
  suggestions,
}: {
  locale: Locale;
  copy: LandingCopy;
  suggestions: Record<Locale, LandingCopy['switcher']>;
}) {
  // The app shell owns the viewport and never scrolls the document. A landing
  // page is a document, so it asks for the window back while it is mounted.
  useEffect(() => {
    document.documentElement.dataset.scroll = 'document';
    // A link to `/de#pricing` arrives before the document can scroll, so the
    // browser's own jump to the fragment has already happened, onto nothing.
    // A frame later, because the router restores the scroll position after
    // its own effects and would put the page straight back at the top.
    const frame = location.hash
      ? requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' }))
      : 0;
    return () => {
      cancelAnimationFrame(frame);
      delete document.documentElement.dataset.scroll;
    };
  }, []);

  const start = useStart(copy, locale);

  return (
    <LocaleScope locale={locale}>
      <div lang={locale} className="bg-background text-foreground min-h-dvh">
        <LanguageSuggestion locale={locale} suggestions={suggestions} />
        <Header copy={copy} locale={locale} start={start} />

        <main>
          <Hero copy={copy} locale={locale} start={start} />
          <WaysIn copy={copy.ways} />
          <Corrections copy={copy.corrections} locale={locale} />
          <HomeCooking copy={copy.homeCooking} />
          <BeyondCalories copy={copy.quality} />
          <AdaptiveTarget copy={copy.target} locale={locale} />
          <Features copy={copy.features} />
          <Pricing copy={copy.pricing} start={start} />
          <Faq copy={copy.faq} />
          <Privacy copy={copy.privacy} />
          <Closing copy={copy.closing} start={start} storeSoon={copy.cta.storeSoon} />
        </main>

        <Footer copy={copy.footer} locale={locale} />
      </div>
    </LocaleScope>
  );
}

interface Cta {
  href: string;
  label: string;
  /** A store, rather than a page of ours. Opens in its own tab. */
  external?: boolean;
}

/**
 * Where every primary button points, and what it says.
 *
 * The store listing, in this page's language — `hl` is what makes Play's web
 * page open in Bulgarian for a visitor who came from a Bulgarian page.
 *
 * On an iPhone, while there is no App Store listing, the Play link is a button
 * to somewhere the visitor cannot go. So there it says so, and scrolls to the
 * store row at the bottom rather than pretending. Decided after mount: the
 * server cannot see the device, and the markup it sends has to be the one every
 * visitor hydrates.
 */
function useStart(copy: LandingCopy, locale: Locale): Cta {
  const [iphone, setIphone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS reports itself as a Mac; the touch points give it away.
    setIphone(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));
  }, []);

  if (iphone && APP_STORE_HREF) return { href: APP_STORE_HREF, label: copy.cta.get, external: true };
  if (iphone || !STORE_HREF) return { href: '#get', label: iphone ? copy.cta.iphone : copy.cta.get };
  return { href: `${STORE_HREF}&hl=${locale}`, label: copy.cta.get, external: true };
}

/**
 * The page's primary button, drawn once so its placements cannot drift.
 *
 * A plain `<a>` in both shapes, like every other anchor on this page and unlike
 * the `<Link>`s in the footer. Neither destination is a route: one is a store
 * on somebody else's domain, and the other is a section of this page — and
 * `<Link>` intercepts a bare hash into a router navigation whose scroll never
 * happens here, because the landing page hands scrolling to the document while
 * the rest of the app keeps it in a fixed shell.
 */
function StartButton({ start, label, className }: { start: Cta; label?: string; className?: string }) {
  return (
    <a
      href={start.href}
      className={className}
      {...(start.external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {label ?? start.label}
    </a>
  );
}

/* ---------------------------------------------------------------- primitives */

/**
 * `*this*` becomes emphasis, and that is the whole of the markup the copy may
 * carry. Anything richer would be a reason to hand translators HTML.
 */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/).map((part, i) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <em key={i} className="text-foreground not-italic">
            {part.slice(1, -1)}
          </em>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * The hero's wash, and the page's only piece of pure decoration.
 *
 * A page this long that lights its accent once at the top and then runs flat
 * for six screens reads as a single unbroken field of paper — or, on dark, of
 * ink. So the same radial the mark carries comes back further down, at the
 * places the page changes subject. Turned far enough down that you would not
 * point at it, which is the whole idea — it is the ground warming, not a shape.
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
        'relative scroll-mt-16 px-6 py-16 sm:py-20 lg:py-24',
        glow && 'overflow-hidden',
        className,
      )}
    >
      {glow && <Glow />}
      <div className="relative mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

function Title({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn('text-section-title max-w-2xl text-balance', className)}>{children}</h2>;
}

function Lede({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-muted-foreground mt-5 max-w-2xl text-[17px] leading-relaxed font-medium text-pretty', className)}>
      {children}
    </p>
  );
}

/** A card on the grouped background: the one surface every illustration sits on. */
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('bg-card border-border chunk rounded-[var(--radius)] border-2', className)}>
      {children}
    </div>
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

/** The accent disc an icon sits on: three bare line icons on an empty ground
    was the most "dashboard" moment the page had. */
function IconDisc({ Icon }: { Icon: typeof Camera }) {
  return (
    <span
      className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
      style={{ background: 'color-mix(in oklch, var(--calories), transparent 86%)' }}
    >
      <Icon size={24} strokeWidth={2.4} style={{ color: 'var(--calories-text)' }} />
    </span>
  );
}

/** A separated list of claims. Used wherever the honest small print is the
    selling point rather than the fine print. */
function Points({ items, className }: { items: readonly string[]; className?: string }) {
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

const cardTitle = 'font-[family-name:var(--font-display)] text-[19px] font-extrabold tracking-[-0.01em]';

/* ------------------------------------------------------- language suggestion */

const DISMISSED_KEY = 'landing-language-dismissed';

/**
 * "This page is also in Български", to a browser that prefers Bulgarian.
 *
 * Offered rather than imposed. Redirecting on `Accept-Language` would give one
 * URL two answers, and the visitor who opened an English link on purpose — the
 * store reviewer, the friend who sent it — would be sent somewhere they did not
 * ask to go. The bar is written in the language it offers, and a "no" is kept,
 * per language, so it is asked once.
 */
function LanguageSuggestion({
  locale,
  suggestions,
}: {
  locale: Locale;
  suggestions: Record<Locale, LandingCopy['switcher']>;
}) {
  const [offer, setOffer] = useState<Locale | null>(null);

  useEffect(() => {
    const preferred = (navigator.languages ?? [navigator.language])
      .map((tag) => matchLocale(tag))
      .find((match): match is Locale => match !== null);
    if (!preferred || preferred === locale) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY) === preferred) return;
    } catch {
      // Storage refused: ask, and forget the answer.
    }
    setOffer(preferred);
  }, [locale]);

  if (!offer) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, offer);
    } catch {
      // Not remembering the answer is not a reason to ignore it.
    }
    setOffer(null);
  };

  return (
    <div lang={offer} className="bg-muted border-border border-b-2 px-6">
      <div className="mx-auto flex h-11 w-full max-w-6xl items-center gap-3 text-sm font-semibold">
        <Globe size={16} className="text-muted-foreground shrink-0" aria-hidden />
        <a href={landingPath(offer)} hrefLang={offer} className="min-w-0 truncate underline-offset-2 hover:underline">
          {suggestions[offer].suggest}
          <ArrowRight size={14} className="ml-1 inline align-[-2px]" aria-hidden />
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label={suggestions[offer].dismiss}
          className="text-muted-foreground hover:text-foreground ml-auto flex size-8 shrink-0 items-center justify-center rounded-full"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- header */

function Header({ copy, locale, start }: { copy: LandingCopy; locale: Locale; start: Cta }) {
  const links = [
    { href: '#how', label: copy.nav.how },
    { href: '#features', label: copy.nav.features },
    { href: '#pricing', label: copy.nav.pricing },
    { href: '#faq', label: copy.nav.faq },
  ];

  return (
    <header className="material border-border sticky top-0 z-40 border-b-2">
      {/* Tighter on a phone: "Преузми апликацију" is eighteen characters,
          and at 360px the mark, the globe and that button have to share one
          row without the button wrapping. */}
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <a href="#top" className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <Logo size={26} />
          <span className="font-[family-name:var(--font-display)] text-[17px] font-extrabold tracking-[-0.01em] whitespace-nowrap sm:text-[19px]">Day So Far</span>
        </a>

        <nav className="text-muted-foreground ml-auto hidden items-center gap-6 text-sm lg:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-foreground transition-colors">
              {link.label}
            </a>
          ))}
          {/*
            * The two that leave the page, grouped after the four that do not.
            *
            * The blog is the only thing this site publishes that a stranger
            * might arrive for on its own, and the footer was the only way to
            * it — which is a long way down a page this long. Its label is
            * `footer.blog` rather than a `nav.blog` beside it: it is the same
            * word in the same language, and a second copy of it in thirteen
            * files is thirteen chances for the two to drift apart.
            *
            * Per locale, so a visitor reading `/bg` goes to `/bg/blog` rather
            * than being dropped into English.
            */}
          <Link
            href={blogIndexPath(locale)}
            className="hover:text-foreground transition-colors"
          >
            {copy.footer.blog}
          </Link>
          {/* The one link on this page that leads to a sign-in: the coach's
              door, which is the only one a visitor can actually open. */}
          <a href="/login?coach=1" className="hover:text-foreground transition-colors">
            {copy.nav.coaches}
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2 lg:ml-4">
          <LanguageMenu locale={locale} label={copy.nav.language} />
          {/* One button. `/login` opens nothing a visitor owns, so a "Sign in"
              beside it would advertise a door that refuses them. */}
          <StartButton start={start} label={copy.cta.get} className={pill('primary', 'h-9 px-3 text-[13px] sm:px-4 sm:text-sm')} />
        </div>
      </div>
    </header>
  );
}

/**
 * The globe, and the thirteen pages behind it.
 *
 * Links rather than a setting: each language of this page is its own URL, so
 * choosing one is navigating to it. Every option in its own name, with `lang`
 * and `hrefLang` on it, in the order `LOCALES_BY_NAME` sorts them. The footer
 * repeats the list as plain links, because a menu's items are not in the
 * markup until it opens and a crawler never opens it.
 */
function LanguageMenu({ locale, label }: { locale: Locale; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-sm font-bold transition-colors sm:px-2.5"
      >
        <Globe size={17} strokeWidth={2.2} aria-hidden />
        {/* The code and the chevron give way first on a narrow phone, where
            the header holds the mark, this and the button and nothing else. */}
        <span className="hidden uppercase min-[420px]:inline">{locale}</span>
        <ChevronDown size={14} aria-hidden className="hidden min-[420px]:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] min-w-44">
        {LOCALES_BY_NAME.map((option) => (
          <DropdownMenuItem
            key={option}
            render={<a href={landingPath(option)} hrefLang={option} lang={option} />}
            className={cn('px-2 py-1.5 text-[0.9375rem]', option === locale && 'font-extrabold')}
          >
            {LOCALE_NAMES[option]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------------- hero */

function Hero({ copy, locale, start }: { copy: LandingCopy; locale: Locale; start: Cta }) {
  return (
    <section id="top" className="relative overflow-hidden px-6 pt-14 pb-4 sm:pt-20">
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
        {/* No <Reveal> on the words. The headline is the page's largest paint,
            and fading it in from zero opacity after hydration made the most
            important sentence on the site the last thing to appear. */}
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-display text-balance">{copy.hero.title}</h1>

          <p className="text-lede text-muted-foreground mx-auto mt-6 max-w-xl text-pretty">
            {copy.hero.lede}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <StartButton start={start} className={pill('primary', 'h-12 px-6 text-body')} />
            <a href="#how" className={pill('secondary', 'h-12 px-6 text-body')}>
              {copy.cta.seeHow}
            </a>
          </div>

          <p className="text-footnote text-muted-foreground mt-5 font-semibold">{copy.hero.trust}</p>

          <StoreLinks className="mt-2.5" locale={locale} soon={copy.cta.storeSoon} />
        </div>

        <Reveal delay={120}>
          <HeroDemo className="mx-auto mt-12 max-w-4xl sm:mt-14" copy={copy.demo} locale={locale} />
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- four ways in */

/*
 * The scanner is a peer, not a footnote: it sits in the composer's menu beside
 * Take a photo, so it is a peer on the page. Its card also carries the miss
 * path — "snap the label instead" — which used to be a section of its own and
 * is worth one sentence in the shop window rather than a screen of scrolling.
 */
const WAY_ICONS = [MessageSquareText, Camera, ScanBarcode, RotateCcw] as const;

function WaysIn({ copy }: { copy: LandingCopy['ways'] }) {
  return (
    <Section id="how">
      <Reveal>
        <Title>{copy.title}</Title>
      </Reveal>

      <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
        {copy.items.map(({ title, body }, i) => (
          <Reveal key={title} delay={i * 80}>
            <IconDisc Icon={WAY_ICONS[i]!} />
            <h3 className={cn(cardTitle, 'mt-4')}>{title}</h3>
            <p className="text-muted-foreground mt-2 text-body leading-relaxed">{body}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- corrections */

const KCAL = { eggs: 143, eggsAfter: 215, toast: 160, cheese: 104 };

function Corrections({ copy, locale }: { copy: LandingCopy['corrections']; locale: Locale }) {
  const rows = [
    { name: copy.eggs, before: copy.eggsBefore, after: copy.eggsAfter, kcal: KCAL.eggs, kcalAfter: KCAL.eggsAfter },
    { name: copy.toast, before: copy.toastQuantity, after: null, kcal: KCAL.toast, kcalAfter: KCAL.toast },
    { name: copy.cheese, before: copy.cheeseQuantity, after: null, kcal: KCAL.cheese, kcalAfter: KCAL.cheese },
  ];
  const before = KCAL.eggs + KCAL.toast + KCAL.cheese;
  const after = KCAL.eggsAfter + KCAL.toast + KCAL.cheese;

  return (
    <Section>
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <Title>{copy.title}</Title>
          <Lede>{copy.body}</Lede>
        </Reveal>

        <Reveal delay={100}>
          <Card className="px-5 py-4">
            <p className="text-eyebrow text-muted-foreground">{copy.cardLabel}</p>

            <ul className="divide-border mt-2 divide-y-2">
              {rows.map((item) => (
                <li key={item.name} className="grid grid-cols-[1fr_auto_4.5rem] items-baseline gap-3 py-3">
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
              <span className="text-body font-bold">{copy.total}</span>
              <span className="tnum text-body">
                <s className="text-muted-foreground">{formatNumber(before, locale)}</s>{' '}
                <span className="text-figure">{formatNumber(after, locale)} kcal</span>
              </span>
            </div>
          </Card>
        </Reveal>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- home cooking */

/**
 * The wedge, said plainly.
 *
 * COMPETITION.md's whole argument in one band: an incumbent's moat is its food
 * database, and a database is exactly what fails on a home-cooked dinner in a
 * language it was not built in. Each language brings its own four dishes, as
 * somebody would really type them — a Bulgarian page that offered "shepherd's
 * pie" would be making the opposite point. Drawn as the journal's own bubbles,
 * because that is the claim: these sentences are the input.
 */
function HomeCooking({ copy }: { copy: LandingCopy['homeCooking'] }) {
  return (
    <Section className="text-center">
      <Reveal>
        <Title className="mx-auto">{copy.title}</Title>
        <Lede className="mx-auto">{copy.body}</Lede>
      </Reveal>

      <ul className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-3">
        {copy.examples.map((example, i) => (
          <li key={example}>
            <Reveal delay={i * 70}>
              <p className="bg-primary text-primary-foreground chunk [--chunk-color:var(--calories-deep)] [--chunk-depth:3px] rounded-[1.375rem] rounded-br-lg px-4 py-2.5 text-body leading-relaxed font-semibold">
                {example}
              </p>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------------------------------------------------------- beyond calories */

/**
 * A Tuesday, drawn by the app's own `DietQuality`.
 *
 * The day is invented but the panel is the real component: a second copy of
 * its markup is a thing that will eventually disagree with the first. It is a
 * partly-measured day on purpose, so the panel prints its own coverage line —
 * an un-estimated item is recorded as unknown, never as a zero.
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

function BeyondCalories({ copy }: { copy: LandingCopy['quality'] }) {
  return (
    <Section id="quality">
      {/* Illustration first on a wide screen, for once: five bands in a row
          with the words always on the left read as one band printed five times. */}
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal className="lg:order-2">
          <Title>{copy.title}</Title>
          <Lede>{copy.body}</Lede>
          <p className="text-muted-foreground mt-4 text-body leading-relaxed">{copy.note}</p>
        </Reveal>

        <Reveal delay={100} className="lg:order-1">
          <Card className="p-6 sm:p-7">
            <DietQuality flush quality={A_TUESDAY} />
          </Card>
        </Reveal>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------- adaptive target */

/**
 * The target and the Monday review, as one section, because they are one
 * feature: the review is the target's explanation of itself, and it runs after
 * the target has moved. Both are Plus, which the badge says here rather than
 * leaving somebody to discover it on the pricing card — this is the part of the
 * page most likely to be the reason they upgrade.
 *
 * The formula that used to sit here moved to /how-it-works. It is the proof, and
 * the proof belongs one link away from the claim, not in front of the price.
 */
function AdaptiveTarget({ copy, locale }: { copy: LandingCopy['target']; locale: Locale }) {
  return (
    <Section id="target" glow>
      <Reveal>
        <span className="text-footnote rounded-full bg-[color-mix(in_oklch,var(--calories),transparent_86%)] px-2.5 py-1 font-extrabold text-[var(--calories-text)]">
          {copy.badge}
        </span>
        <Title className="mt-4">{copy.title}</Title>
        <Lede>
          <Rich text={copy.body} />
        </Lede>
      </Reveal>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Reveal className="h-full">
          <Card className="flex h-full flex-col gap-3 px-5 py-5 sm:px-6">
            <p className="text-footnote text-muted-foreground">{copy.reviewDates}</p>
            <p className="text-body leading-relaxed">{copy.reviewIntake}</p>
            <p className="text-body leading-relaxed">{copy.reviewChange}</p>

            <div className="bg-muted border-border mt-auto rounded-2xl border-2 px-3.5 py-3">
              <div className="tnum flex items-center gap-2 text-body font-bold">
                <span className="text-muted-foreground">{formatNumber(2290, locale)}</span>
                <ArrowRight size={14} className="text-muted-foreground" />
                <span className="text-[var(--calories-text)]">{formatNumber(2480, locale)} kcal</span>
              </div>
              <p className="text-footnote text-muted-foreground mt-1">{copy.reviewBasis}</p>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={100} className="h-full">
          <Card className="flex h-full flex-col p-6 pb-4 sm:p-7 sm:pb-5">
            <p className="text-eyebrow text-muted-foreground">{copy.guardrailsTitle}</p>
            <Points items={copy.guardrails} className="mt-1" />
            <Link
              href="/how-it-works"
              className="text-body mt-auto inline-flex items-center gap-1 pt-3 font-bold text-[var(--calories-text)] underline-offset-4 hover:underline"
            >
              {copy.more}
              <ArrowRight size={15} aria-hidden />
            </Link>
          </Card>
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ features */

/**
 * Everything that ships and was nowhere on the page.
 *
 * Offline, widgets, steps, workouts and the recipe library were all built and
 * all sold in the store listing, and a visitor here could not have known any of
 * them existed. A grid rather than more bands: these are the things a person
 * checks for rather than reads about, and nine of them fit in one look.
 */
const FEATURE_ICONS = [WifiOff, LayoutGrid, Footprints, Dumbbell, ChefHat, Trophy, Moon, Activity, Languages] as const;

function Features({ copy }: { copy: LandingCopy['features'] }) {
  return (
    <Section id="features">
      <Reveal>
        <Title>{copy.title}</Title>
      </Reveal>

      <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {copy.items.map(({ title, body }, i) => (
          <Reveal key={title} delay={(i % 3) * 70} className="flex gap-4">
            <IconDisc Icon={FEATURE_ICONS[i]!} />
            <div className="min-w-0">
              <h3 className={cn(cardTitle, 'text-[17px]')}>{title}</h3>
              <p className="text-muted-foreground mt-1.5 text-body leading-relaxed">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- pricing */

/**
 * What each plan is, said the way `plans.ts` means it.
 *
 * The split down the middle is not a marketing frame — it is the architecture.
 * Typing a meal in, repeating yesterday's, scanning a barcode and adding the
 * day up cost nothing to serve and are free forever. Reading a sentence or a
 * photograph is a model, and a model has a bill.
 *
 * **The grants are stated in the card rather than in a footnote.** Ten messages
 * a month, and a photo scan that does not come back at all, are both a surprise
 * if somebody finds them in week three. A limit you can read before signing up
 * is a plan; the same limit discovered later is a bait.
 *
 * **The month is the price on the card; the year is a toggle above it.** The
 * other way round is how you make a number look smaller than the commitment
 * being asked for.
 *
 * **The two ceilings are a band at the same height on every card**, because
 * comparing tiers means reading across a row, and "how much more do I get" is
 * the one question the table exists to answer.
 *
 * Ceilings and prices are copied by hand from `plans.ts`, in thirteen
 * languages now, and have to be kept in step with it. The landing page is
 * served to visitors with no session to fetch an entitlement with.
 */
function Pricing({ copy, start }: { copy: LandingCopy['pricing']; start: Cta }) {
  // Monthly is the default because it is what most people will start on, and a
  // page that defaults to the annual number is quoting a price nobody is about
  // to pay.
  const [yearly, setYearly] = useState(false);

  return (
    <Section id="pricing" glow>
      <Reveal>
        <Title>{copy.title}</Title>
        <Lede className="max-w-xl">{copy.body}</Lede>
      </Reveal>

      <Reveal delay={60}>
        {/* A two-state segmented control rather than a switch: a switch has an
            off position, and neither of these is "off". */}
        <div
          role="radiogroup"
          aria-label={copy.period}
          className="border-border bg-card mt-9 inline-flex rounded-full border-2 p-1"
        >
          {[
            { label: copy.monthly, on: false },
            { label: copy.yearly, on: true },
          ].map(({ label, on }) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={yearly === on}
              onClick={() => setYearly(on)}
              className={cn(
                'text-footnote rounded-full px-4 py-1.5 font-bold transition-colors',
                yearly === on
                  ? 'bg-[var(--calories)] text-[var(--calories-on)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              {on && (
                <span className={cn('ml-1.5', yearly ? 'opacity-80' : 'text-[var(--calories-text)]')}>
                  {copy.saving}
                </span>
              )}
            </button>
          ))}
        </div>
      </Reveal>

      {/* `h-full` on the Reveal as well as the card: the grid item is the
          wrapper, so a card's own `h-full` would measure against a wrapper that
          has already shrunk to fit it. */}
      <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-3">
        {copy.plans.map((plan, i) => {
          const featured = i === 1;
          return (
            <Reveal key={plan.name} delay={i * 80} className="h-full">
              <div
                className={cn(
                  'chunk bg-card flex h-full flex-col rounded-[var(--radius)] border-2 px-6 py-7',
                  featured ? 'border-[var(--calories)]' : 'border-border',
                )}
              >
                <div className="flex items-baseline gap-2.5">
                  <h3 className={cardTitle}>{plan.name}</h3>
                  {featured && (
                    <span className="text-footnote rounded-full bg-[color-mix(in_oklch,var(--calories),transparent_88%)] px-2 py-0.5 font-bold text-[var(--calories-text)]">
                      {copy.recommended}
                    </span>
                  )}
                </div>

                <p className="tnum mt-4 text-[32px] leading-none font-extrabold tracking-[-0.02em]">
                  {yearly ? plan.annual : plan.monthly}
                </p>
                {/* Fixed two-line height: the cadence runs to one line on monthly
                    and two on yearly, and without this the card jumps every time
                    the toggle is pressed. */}
                <p className="text-footnote text-muted-foreground mt-1.5 min-h-[2.5em] leading-snug">
                  {yearly ? plan.annualCadence : plan.monthlyCadence}
                </p>

                {/* Two fixed lines, so pitches that wrap at different widths do
                    not land the allowance band at three different heights. */}
                <p className="mt-5 min-h-[3.25em] text-body leading-relaxed font-semibold">{plan.pitch}</p>

                {/* `flex-col-reverse` puts the figure above its label while
                    leaving <dt> ahead of <dd> in the DOM, the order a
                    description list has to be read in. */}
                <dl className="border-border mt-5 grid grid-cols-2 gap-4 border-y-2 py-5">
                  {plan.allowance.map(({ figure, unit, period }) => (
                    <div key={unit} className="flex flex-col-reverse">
                      <dt className="text-footnote text-muted-foreground mt-1.5 leading-snug">
                        <span className="block">{unit}</span>
                        <span className="block">{period}</span>
                      </dt>
                      <dd className="tnum text-[26px] leading-none font-extrabold tracking-[-0.02em]">
                        {figure}
                      </dd>
                    </div>
                  ))}
                </dl>

                <Points items={plan.points} />

                {/* `mt-auto` on the wrapper: the cards carry different numbers
                    of points, and a fixed gap lands the buttons at different
                    heights even after the cards match. */}
                <div className="mt-auto pt-6">
                  <StartButton
                    start={start}
                    label={plan.cta}
                    className={pill(featured ? 'primary' : 'secondary', 'h-11 w-full px-5 text-body')}
                  />
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal delay={200}>
        {/* The small print as four checkable lines rather than one paragraph:
            each is a separate question somebody has before paying. */}
        <ul className="text-footnote text-muted-foreground mt-8 grid max-w-4xl gap-x-10 gap-y-2 leading-relaxed sm:grid-cols-2">
          {copy.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <span aria-hidden className="text-[var(--calories-text)]">✓</span>
              {note}
            </li>
          ))}
        </ul>
        <p className="text-footnote text-muted-foreground mt-4 opacity-80">{copy.currency}</p>
      </Reveal>
    </Section>
  );
}

/* ----------------------------------------------------------------------- faq */

/**
 * The questions the page did not answer on the way down.
 *
 * `<details>`, so every answer is in the markup — for a crawler, for the
 * FAQPage structured data the page file builds from the same copy, and for a
 * reader with no JavaScript — and so the open-and-close is the browser's own,
 * keyboard and screen reader included.
 *
 * Three answers end in a link. They are matched by position, which is the one
 * thing the copy's type guarantees stays the same across languages.
 */
const FAQ_LINKS: Partial<Record<number, { href: string; label: 'accuracyLink' | 'privacyLink' | 'coachLink' }>> = {
  1: { href: '/accuracy', label: 'accuracyLink' },
  7: { href: '/privacy', label: 'privacyLink' },
  8: { href: '/login?coach=1', label: 'coachLink' },
};

function Faq({ copy }: { copy: LandingCopy['faq'] }) {
  return (
    <Section id="faq">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <Title>{copy.title}</Title>
        </Reveal>

        <Reveal delay={60}>
          <div className="divide-border border-border mt-10 divide-y-2 border-y-2">
            {copy.items.map(({ q, a }, i) => {
              const link = FAQ_LINKS[i];
              return (
                <details key={q} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center gap-4 py-4 [&::-webkit-details-marker]:hidden">
                    <span className="flex-1 text-[17px] leading-snug font-bold">{q}</span>
                    <ChevronDown
                      size={20}
                      aria-hidden
                      className="text-muted-foreground shrink-0 transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <div className="text-muted-foreground pb-5 text-body leading-relaxed">
                    <p>{a}</p>
                    {link && (
                      <a
                        href={link.href}
                        className="mt-2 inline-flex items-center gap-1 font-bold text-[var(--calories-text)] underline-offset-4 hover:underline"
                      >
                        {copy[link.label]}
                        <ArrowRight size={15} aria-hidden />
                      </a>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- privacy */

function Privacy({ copy }: { copy: LandingCopy['privacy'] }) {
  return (
    <Section id="privacy">
      <Reveal>
        <div
          className="relative overflow-hidden rounded-[2rem] px-8 py-14 sm:px-12 sm:py-16"
          style={{
            // The mark's own forest-into-jade ramp, pinned rather than taken
            // from the tokens: `--calories` lifts to mint in dark mode, and
            // white on that is barely 2:1. Every stop clears 4.7:1 against white.
            background: 'linear-gradient(140deg, #0a6b41 0%, #0b7d4c 45%, #0a7a68 100%)',
          }}
        >
          <h2 className="text-section-title max-w-xl text-balance text-white">{copy.title}</h2>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed font-medium text-white/85">{copy.body}</p>
          <Link
            href="/privacy"
            className="mt-6 inline-flex items-center gap-1 text-[15px] font-bold text-white underline decoration-2 underline-offset-4"
          >
            {copy.link}
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------- closing */

/**
 * The bottom of the page. It carries the store row, and a button only when that
 * button leads somewhere off this page — every in-page button scrolls here, and
 * a primary action whose destination is itself is a dead end with a gradient.
 */
function Closing({
  copy,
  start,
  storeSoon,
}: {
  copy: LandingCopy['closing'];
  start: Cta;
  storeSoon: string;
}) {
  return (
    <Section id="get" glow className="text-center">
      <Reveal>
        <h2 className="text-section-title text-balance">{copy.title}</h2>
        <p className="text-muted-foreground mx-auto mt-5 max-w-md text-[17px] leading-relaxed font-medium">
          {copy.body}
        </p>
        {start.external && (
          <StartButton start={start} className={pill('primary', 'mt-8 h-12 px-6 text-body')} />
        )}
        <StoreLinks className="mt-5" soon={storeSoon} />
      </Reveal>
    </Section>
  );
}

function Footer({ copy, locale }: { copy: LandingCopy['footer']; locale: Locale }) {
  // The documents are English-only, and say so by being in English; the blog is
  // written in every language, so it is the one link that follows this page's.
  const links = [
    { href: '/how-it-works', label: copy.howItWorks },
    { href: '/accuracy', label: copy.accuracy },
    { href: blogIndexPath(locale), label: copy.blog },
    { href: '/cook/library', label: copy.recipes },
    { href: '/about', label: copy.about },
    { href: '/privacy', label: copy.privacy },
    { href: '/terms', label: copy.terms },
  ];

  return (
    <footer className="border-border border-t-2 px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={22} />
            <span className="text-sm font-bold">Day So Far</span>
          </div>
          {/* Everything here is reachable without an account, which is the test
              for being here at all. */}
          <nav className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-foreground transition-colors">
                {link.label}
              </Link>
            ))}
            <span>© {new Date().getFullYear()} Day So Far</span>
          </nav>
        </div>

        {/* Plain links, in the markup, for the crawler that never opens the
            header's menu — and for the reader who scrolled past it. */}
        <nav
          aria-label={copy.languages}
          className="border-border text-muted-foreground mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t-2 pt-6 text-sm sm:justify-start"
        >
          <Globe size={15} aria-hidden className="shrink-0" />
          {LOCALES_BY_NAME.map((option) => (
            <a
              key={option}
              href={landingPath(option)}
              hrefLang={option}
              lang={option}
              aria-current={option === locale ? 'page' : undefined}
              className={cn('hover:text-foreground transition-colors', option === locale && 'text-foreground font-bold')}
            >
              {LOCALE_NAMES[option]}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
