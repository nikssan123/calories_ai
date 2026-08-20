'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthGate';
import { Nav } from '@/components/Nav';
import { Sidebar } from '@/components/Sidebar';

/**
 * The app shell — or, for the landing page, nothing at all.
 *
 * One shell, two shapes. Below `lg` it is a phone: a single column with the tab
 * bar at the bottom. From `lg` up the sidebar takes over navigation and the
 * content area gets the full window to lay itself out in — each screen decides
 * its own desktop composition.
 *
 * The landing page wants none of that. It is a document rather than an app: full
 * bleed, scrolled by the window, with no chrome it did not draw itself.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { authenticated } = useAuth();
  const pathname = usePathname();

  if (pathname === '/' && !authenticated) return <>{children}</>;

  return (
    <div className="bg-background h-shell flex w-full overflow-hidden">
      <Sidebar />
      <div className="border-border mx-auto flex h-full w-full max-w-lg min-w-0 flex-col overflow-hidden sm:border-x lg:mx-0 lg:max-w-none lg:border-x-0">
        {children}
        <Nav />
      </div>
    </div>
  );
}
