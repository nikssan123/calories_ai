import type { Metadata, Viewport } from 'next';
import { Baloo_2, Nunito } from 'next/font/google';
import './globals.css';
import { AppFrame } from '@/components/AppFrame';
import { AuthGate } from '@/components/AuthGate';
import { Toaster } from '@/components/ui/sonner';
import { THEME_INIT_SCRIPT, ThemeSync } from '@/components/ThemeSync';
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
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
  // The body runs at 500 and figures at 800, so the whole range has to ship.
  weight: ['400', '500', '600', '700', '800'],
});

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
    <html lang="en" className={`${nunito.variable} ${baloo.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeSync />
        <KeyboardInset />
        <AuthGate>
          <AppFrame>{children}</AppFrame>
        </AuthGate>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
