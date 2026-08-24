'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

/**
 * The shell both legal documents are set in.
 *
 * A legal page is the one screen in this product where the design has nothing
 * to add. So it does almost nothing: one column at a comfortable measure, the
 * same two faces as everywhere else, and no reveal animations — a person here
 * is looking for a specific clause, and content that fades in as you scroll is
 * content you cannot Ctrl-F. The only concession to the rest of the app is the
 * header, which exists so the reader can get back out.
 */
export function LegalPage({
  title,
  summary,
  updated,
  children,
}: {
  title: string;
  /** The one-paragraph version, set above the rule. Not a substitute for the text. */
  summary: string;
  /** ISO date this document last changed. Rendered long-form. */
  updated: string;
  children: React.ReactNode;
}) {
  // The app shell owns the viewport and never scrolls the document. A policy is
  // a document, so it asks for the window back while it is mounted — the same
  // arrangement the landing page has.
  useEffect(() => {
    document.documentElement.dataset.scroll = 'document';
    return () => {
      delete document.documentElement.dataset.scroll;
    };
  }, []);

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <header className="material border-border sticky top-0 z-40 border-b-2">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="font-[family-name:var(--font-display)] text-[19px] font-extrabold tracking-[-0.01em]">
              Day So Far
            </span>
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft size={15} /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 pt-12 pb-20 sm:pt-16">
        <h1 className="text-section-title text-balance">{title}</h1>
        <p className="text-muted-foreground mt-5 text-lede text-pretty">{summary}</p>
        <p className="text-footnote text-muted-foreground mt-6 font-semibold">
          Last updated {longDate(updated)}
        </p>

        <div className="border-border mt-10 border-t-2 pt-2">{children}</div>

        <footer className="border-border text-muted-foreground mt-16 flex flex-col gap-3 border-t-2 pt-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <a href="mailto:support@daysofar.com" className="hover:text-foreground transition-colors">
              Contact
            </a>
          </nav>
          <span>© {new Date().getFullYear()} Day So Far</span>
        </footer>
      </main>
    </div>
  );
}

/** `2026-08-23` → `23 August 2026`. Written out because `08/09` is two dates. */
function longDate(iso: string): string {
  /*
   * The one display `en-GB` the localisation pass deliberately left alone.
   *
   * Privacy and Terms are not translated — they are legal text, and a
   * dictionary translation of a document somebody may have to rely on is worse
   * than an English one they can read. While the page around it is English, its
   * "last updated" line is too. See LANGUAGES.md.
   */
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/* ---------------------------------------------------------------- primitives */

/**
 * A numbered clause.
 *
 * The number is part of the heading rather than a list marker, because the
 * whole point of numbering a legal document is that someone can write "see §7"
 * in an email — and a browser-generated marker is not selectable text. The
 * `id` is derived from the same number, so §7 has a link as well as a name.
 */
export function Clause({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`s${n}`} className="scroll-mt-24 pt-10">
      <h2 className="font-[family-name:var(--font-display)] text-[23px] leading-tight font-extrabold tracking-[-0.01em]">
        <a href={`#s${n}`} className="hover:opacity-70">
          <span className="text-muted-foreground tnum">{n}.</span> {title}
        </a>
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function P({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn('text-body leading-relaxed font-medium', className)}>{children}</p>;
}

/** A sub-heading inside a clause, for the parts long enough to need one. */
export function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="text-eyebrow text-muted-foreground pt-2">{children}</h3>;
}

export function List({ children }: { children: React.ReactNode }) {
  return (
    <ul className="marker:text-muted-foreground list-disc space-y-2.5 pl-5 text-body leading-relaxed font-medium">
      {children}
    </ul>
  );
}

/**
 * A two-column table for the parts of a policy that are genuinely tabular —
 * who receives what, and how long a thing is kept. Prose would hide it.
 */
export function Rows({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border-border divide-border chunk divide-y-2 overflow-hidden rounded-[var(--radius)] border-2">
      {children}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <span className="text-body font-extrabold">{label}</span>
      <span className="text-muted-foreground text-body leading-relaxed font-medium">{children}</span>
    </div>
  );
}

/** An external link. Every one in these documents leaves the site. */
export function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[var(--calories-text)] underline decoration-2 underline-offset-2"
    >
      {children}
    </a>
  );
}
