import type { Metadata, Viewport } from 'next';
import { Baloo_2, Nunito } from 'next/font/google';
import './globals.css';
import { AppFrame } from '@/components/AppFrame';
import { AuthGate } from '@/components/AuthGate';
import { Toaster } from '@/components/ui/sonner';
import { THEME_INIT_SCRIPT, ThemeSync } from '@/components/ThemeSync';
import { LOCALE_INIT_SCRIPT, LocaleSync } from '@/lib/i18n';
import { KeyboardInset } from '@/components/KeyboardInset';

/*
 * Two rounded faces, loaded as variables and referenced from --font-sans and
 * --font-display in globals.css.
 *
 * Nunito reads at 13px without turning to mush, which the app needs because
 * half of it is small print under a number. Baloo is there for the shouting —
 * headings, the ring's figure, the landing headline — where its heavier, wider
 * bowls do the work a thick outline does elsewhere in the system.
 */
const nunito = Nunito({
  /*
   * Cyrillic rides along because Nunito is also the Cyrillic *display* face —
   * see `--font-display-cyrillic` in globals.css. Google serves each subset as
   * its own file behind a `unicode-range`, so a reader who never types a
   * Cyrillic character never downloads it: the cost of this line to an English
   * session is zero bytes.
   */
  subsets: ['latin', 'cyrillic'],
  variable: '--font-nunito',
  display: 'swap',
  // The body runs at 500 and figures at 800, so the whole range has to ship.
  // 900 is the extra one: it is what stands in for Baloo where Baloo cannot go.
  weight: ['400', '500', '600', '700', '800', '900'],
});

/*
 * Latin only, and not by omission.
 *
 * Baloo 2 has no Cyrillic glyphs at all — not a subset Google declines to
 * serve, but 0 codepoints in U+0400–04FF in the font itself. Asking for a
 * subset it does not have would fail the build; asking for it at render time
 * is what produces the mixed-face heading this whole arrangement exists to
 * avoid. See LANGUAGES.md, "The font problem".
 */
const baloo = Baloo_2({
  subsets: ['latin'],
  variable: '--font-baloo',
  display: 'swap',
  weight: ['600', '700', '800'],
});

/**
 * One sentence, feeding the meta description, the Open Graph card and the
 * Twitter card below.
 *
 * It used to end "no barcodes", which the scanner now contradicts. The claim
 * underneath survived the feature intact, because what the page is selling is
 * not the absence of a scanner — it is the absence of *hunting*: the search
 * box, the forty results for "chicken breast", the picking. A scanner that
 * reads a packet in one motion is on the same side of that argument. It is the
 * search box it replaces, not the sentence.
 */
const DESCRIPTION =
  'A calorie journal you talk to. No forms, no database to search, no forty results for "chicken breast" — describe the meal in your own words and the day adds itself up.';

export const metadata: Metadata = {
  /**
   * Without this, Next resolves `opengraph-image.png` against localhost — there
   * is no VERCEL_URL to fall back on when self-hosting, so the card would point
   * at an address no crawler can reach and the preview would stay blank.
   * APP_URL is already the canonical origin everywhere else in the stack.
   */
  metadataBase: new URL(process.env.APP_URL ?? 'https://daysofar.com'),
  title: 'Day So Far',
  description: DESCRIPTION,
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Day So Far' },
  // `/` is the landing page to anyone not signed in, so it is a link people
  // paste at each other; without this it unfurls as a bare URL.
  openGraph: {
    type: 'website',
    siteName: 'Day So Far',
    title: 'Day So Far — just say what you ate',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Day So Far — just say what you ate',
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fff6ec' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1512' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // The composer is fixed to the bottom; stop iOS zooming the page on focus.
  maximumScale: 1,
  // Chrome shrinks the layout viewport for the keyboard rather than painting it
  // over the page. iOS ignores this — see <KeyboardInset>.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions commonly inject attributes onto <body>, which would
    // otherwise surface as a hydration mismatch in development.
    /*
      * `lang` is corrected before paint by LOCALE_INIT_SCRIPT and again by
      * <LocaleSync> once the session resolves. It stays "en" in the markup so
      * the server-rendered HTML is stable — the attribute is what swaps the
      * display face, and a value that depended on the request would have to
      * vary the cached page to say so.
      */
    <html lang="en" className={`${nunito.variable} ${baloo.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeSync />
        <KeyboardInset />
        <AuthGate>
          {/*
            * Inside the gate, not beside it. `useAuth` reads a context with a
            * default value rather than throwing, so a <LocaleSync> mounted as a
            * sibling would compile, run, and quietly see `profile: null`
            * forever — the account's language would never reach the document
            * and the display face would never swap for anyone signed in.
            */}
          <LocaleSync />
          <AppFrame>{children}</AppFrame>
        </AuthGate>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
