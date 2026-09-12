'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthGate';
import { CoachFrame } from '@/components/coach/CoachFrame';
import { Nav } from '@/components/Nav';
import { Sidebar } from '@/components/Sidebar';
import {
  isCoachRoute,
  isEmailedRoute,
  isInviteRoute,
  isDocumentRoute,
  isRecipeLibraryRoute,
  isBlogRoute,
} from '@/lib/routes';

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
 *
 * The coach's dashboard is a third shape, and its own component: a roster is
 * read on a laptop, wants the whole width, and has no journal tabs to offer.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { authenticated } = useAuth();
  const pathname = usePathname();

  /*
   * The policy and the terms draw their own chrome for everybody, signed in or
   * not: they are documents, and this shell is a fixed-height box that does not
   * scroll. Nothing else would be readable inside it. An invite link is a
   * document too — one card, one code, one button to the app.
   */
  if (isDocumentRoute(pathname) || isInviteRoute(pathname)) return <>{children}</>;

  if (isCoachRoute(pathname)) return <CoachFrame>{children}</CoachFrame>;

  /*
   * No chrome for a visitor with no session.
   *
   * The landing page draws its own, and the routes reached from an email have
   * nowhere to navigate *to* — offering tabs to someone who is here to reset a
   * password just means five links that bounce them to the sign-in screen they
   * could not use. A signed-in visitor keeps the shell, because for them these
   * are ordinary pages within the app.
   */
  if (!authenticated && (pathname === '/' || isEmailedRoute(pathname))) return <>{children}</>;

  /*
   * A recipe, to a reader with no session.
   *
   * For a signed-in cook these are pages inside the app and keep the shell —
   * the tab bar is how they got here and how they leave. For someone who
   * arrived from a search result it is a document, and the shell would offer
   * them five tabs that all bounce off the sign-in form.
   */
  if (!authenticated && isRecipeLibraryRoute(pathname)) return <>{children}</>;

  // The blog is a document for everybody, signed in or not — there is no
  // version of it that belongs inside the app shell.
  if (isBlogRoute(pathname)) return <>{children}</>;

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
