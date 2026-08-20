'use client';

import { useAuth } from '@/components/AuthGate';
import { Journal } from '@/components/Journal';
import { Landing } from '@/components/landing/Landing';

/**
 * One address, two audiences. A visitor gets the landing page; a signed-in
 * account gets the journal. <AuthGate> resolves the session before anything
 * renders, so neither one ever flashes on top of the other.
 */
export default function HomePage() {
  const { authenticated } = useAuth();
  return authenticated ? <Journal /> : <Landing />;
}
