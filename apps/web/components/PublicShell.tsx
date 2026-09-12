import Link from 'next/link';
import type { Locale } from '@ct/shared';
import { Logo } from '@/components/Logo';
import { DocumentScroll } from '@/components/DocumentScroll';
import { STORE_HREF } from '@/components/landing/StoreLinks';
import { blogIndexPath } from '@/lib/blog';
import { messagesFor } from '@/lib/i18n-server';

/**
 * The frame around a public content page.
 *
 * The blog and the recipe library were each a bare column on an empty
 * background: no way back, no way to the other one, no way to the app, and
 * nothing to say what site you were on. That is fine for a page nobody arrives
 * at cold, and these are the only pages anybody *does* arrive at cold.
 *
 * So: a header that goes somewhere, a footer that goes somewhere, and a
 * measure in the middle that stays a measure. Prose is not widened to fill the
 * window — seventy-odd characters is where it stays readable, and a 1,200-word
 * article set across a 27" display is worse, not better.
 *
 * What the first attempt got wrong was alignment rather than width. The header
 * ran to one container width and the article to a narrower one, both centred,
 * so the logo sat at the far left while the text began somewhere near the
 * middle and nothing on the page shared an edge. One width per page now, used
 * by all three bands, so the column reads as the page rather than as a
 * fragment floating on it.
 *
 * A server component. Everything here is a link.
 */
export function PublicShell({
  locale,
  children,
  /** Wider than prose, for pages that are lists rather than articles. */
  wide = false,
}: {
  locale: Locale;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const t = messagesFor(locale);
  // One width, shared by the header, the content and the footer. Lists get room
  // for two columns; an article gets a measure and no more.
  const width = wide ? 'max-w-5xl' : 'max-w-3xl';
  const links = [
    { href: blogIndexPath(locale), label: t('blog.title') },
    { href: '/cook/library', label: t('site.recipes') },
    { href: '/how-it-works', label: t('site.howItWorks') },
  ];

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <DocumentScroll />

      <header className="border-border sticky top-0 z-10 border-b-2 backdrop-blur-sm">
        <div className={`mx-auto flex w-full ${width} items-center gap-3 px-5 py-3 sm:px-6`}>
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Logo size={24} />
            <span className="text-sm font-bold">Day So Far</span>
          </Link>

          <nav className="text-footnote text-muted-foreground ml-auto flex items-center gap-4">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-foreground hidden sm:inline">
                {link.label}
              </Link>
            ))}
            {STORE_HREF && (
              <a
                href={STORE_HREF}
                className="bg-foreground text-background inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-bold"
              >
                {t('site.getTheApp')}
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className={`mx-auto w-full ${width} px-5 py-10 sm:px-6 sm:py-14`}>
          {children}
        </div>
      </main>

      <footer className="border-border mt-8 border-t-2">
        <div className={`mx-auto w-full ${width} px-5 py-8 sm:px-6`}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/" className="flex items-center gap-2">
              <Logo size={20} />
              <span className="text-sm font-bold">Day So Far</span>
            </Link>
            <nav className="text-footnote text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link href={blogIndexPath(locale)} className="hover:text-foreground">
                {t('blog.title')}
              </Link>
              <Link href="/cook/library" className="hover:text-foreground">
                {t('site.recipes')}
              </Link>
              <Link href="/how-it-works" className="hover:text-foreground">
                {t('site.howItWorks')}
              </Link>
              <Link href="/accuracy" className="hover:text-foreground">
                {t('site.accuracy')}
              </Link>
              <Link href="/privacy" className="hover:text-foreground">
                {t('auth.privacyPolicy')}
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                {t('auth.terms')}
              </Link>
            </nav>
            <span className="text-footnote text-muted-foreground ml-auto">
              © {new Date().getFullYear()} Day So Far
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
