import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { Sidebar } from '@/components/Sidebar';
import { AuthGate } from '@/components/AuthGate';
import { Toaster } from '@/components/ui/sonner';
import { THEME_INIT_SCRIPT, ThemeSync } from '@/components/ThemeSync';
import { KeyboardInset } from '@/components/KeyboardInset';

export const metadata: Metadata = {
  title: 'Nutrition',
  description: 'What did I eat and how am I doing today?',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Nutrition' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
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
          {/*
            One shell, two shapes. Below `lg` it is a phone: a single column with
            the tab bar at the bottom. From `lg` up the sidebar takes over
            navigation and the content area gets the full window to lay itself
            out in — each screen decides its own desktop composition.
          */}
          <div className="bg-background h-shell flex w-full overflow-hidden">
            <Sidebar />
            <div className="border-border mx-auto flex h-full w-full max-w-lg min-w-0 flex-col overflow-hidden sm:border-x lg:mx-0 lg:max-w-none lg:border-x-0">
              {children}
              <Nav />
            </div>
          </div>
        </AuthGate>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
