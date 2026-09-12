'use client';

import type { ComponentProps } from 'react';
import { useAuth } from '@/components/AuthGate';
import { Journal } from '@/components/Journal';
import { Landing } from '@/components/landing/Landing';

/**
 * One address, two audiences. A visitor gets the landing page; a signed-in
 * account gets the journal. <AuthGate> resolves the session before anything
 * renders, so neither one ever flashes on top of the other.
 *
 * With one exception, which is deliberate: `/` is now drawn before the session
 * is known so that the landing page reaches crawlers that do not run
 * JavaScript. Until `api.me()` answers, `authenticated` is false and this is
 * the landing page — for a visitor that is the final answer, and for the few
 * accounts the web journal is still open to it is one paint they then lose.
 * See `isPrerenderableRoute` in lib/routes.ts.
 */
export function Home({ landing }: { landing: ComponentProps<typeof Landing> }) {
  const { authenticated } = useAuth();
  return authenticated ? <Journal /> : <Landing {...landing} />;
}
