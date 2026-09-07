'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut, Settings, Ticket, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/components/AuthGate';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

/**
 * The coach's shell. See COACH.md §6.
 *
 * Three destinations, because that is what a coach does here: read the roster,
 * hand out codes, and manage the seats. A sidebar from `lg` up, where a roster
 * is actually read, and a short tab strip under the wordmark below it — the
 * phone shape exists so a coach can check a client from the gym floor, not to
 * be the primary surface.
 *
 * The redirect below is convenience rather than security. Every `/coach` route
 * on the API answers 404 to an account without a seat, so a page loaded past
 * this guard shows an empty screen and a toast, never data.
 */
const LINKS: readonly { href: string; label: string; Icon: LucideIcon; exact?: boolean }[] = [
  { href: '/coach', label: 'Roster', Icon: Users },
  { href: '/coach/invites', label: 'Invites', Icon: Ticket },
  { href: '/coach/settings', label: 'Settings', Icon: Settings },
];

export function CoachFrame({ children }: { children: React.ReactNode }) {
  const { isCoach, loading, profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isCoach) router.replace('/');
  }, [loading, isCoach, router]);

  if (!isCoach) return null;

  const active = (href: string) =>
    href === '/coach' ? pathname === '/coach' || pathname.startsWith('/coach/clients') : pathname.startsWith(href);

  return (
    <div className="bg-background flex min-h-screen w-full">
      <aside className="border-border hidden w-64 shrink-0 flex-col border-r-2 lg:flex">
        <div className="px-5 pt-6 pb-4">
          <Link href="/coach" className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-title-2 whitespace-nowrap">Day So Far</span>
          </Link>
          <p className="mt-2 flex items-center gap-2">
            <span className="text-eyebrow rounded-full bg-[color-mix(in_oklch,var(--calories),transparent_82%)] px-2 py-0.5 text-[var(--calories-text)]">
              Coach
            </span>
            <span className="text-footnote text-muted-foreground truncate">
              {profile?.display_name || profile?.email || ''}
            </span>
          </p>
        </div>

        <nav className="flex-1 px-3">
          <ul className="space-y-0.5">
            {LINKS.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active(href) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border-2 px-3 py-2 text-body transition-colors',
                    active(href)
                      ? 'chunk border-border bg-card text-foreground font-extrabold [--chunk-depth:3px]'
                      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground border-transparent font-bold',
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={active(href) ? 2.6 : 2.1}
                    style={active(href) ? { color: 'var(--calories-text)' } : undefined}
                  />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="px-3 pb-5">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-muted-foreground hover:text-foreground flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-body font-bold transition-colors"
          >
            <LogOut size={20} strokeWidth={2.1} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex items-center gap-3 border-b-2 px-4 py-3 lg:hidden">
          <Link href="/coach" className="flex items-center gap-2">
            <Logo size={26} />
            <span className="text-title-2 text-[17px]">Coach</span>
          </Link>
          <nav className="ml-auto flex gap-1">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors',
                  active(href) ? 'bg-foreground text-background' : 'text-muted-foreground',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
