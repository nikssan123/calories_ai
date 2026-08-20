import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppFrame } from '@/components/AppFrame';
import { AuthGate } from '@/components/AuthGate';
import { Toaster } from '@/components/ui/sonner';
import { THEME_INIT_SCRIPT, ThemeSync } from '@/components/ThemeSync';
import { KeyboardInset } from '@/components/KeyboardInset';

const DESCRIPTION =
  'Say what you ate. No forms, no food database, no barcodes — describe the meal in your own words and the day adds itself up.';

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
    { media: '(prefers-color-scheme: light)', color: '#f6f4f1' },
    { media: '(prefers-color-scheme: dark)', color: '#121110' },
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
    <html lang="en" suppressHydrationWarning>
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
