'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ChartLine,
  Flame,
  LogOut,
  MessageSquareText,
  PersonStanding,
  Shield,
  User,
} from 'lucide-react';
import { useAuth } from '@/components/AuthGate';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

/** A vertical list has room for History, which the phone's bottom bar does not. */
const TABS = [
  { href: '/', label: 'Journal', Icon: MessageSquareText },
  { href: '/today', label: 'Today', Icon: Flame },
  { href: '/history', label: 'History', Icon: CalendarDays },
  { href: '/progress', label: 'Progress', Icon: ChartLine },
  { href: '/exercise', label: 'Exercise', Icon: PersonStanding },
  { href: '/setup', label: 'You', Icon: User },
] as const;

/**
 * Desktop navigation. Replaces the bottom tab bar from `lg` up — the same
 * destinations, but in the persistent sidebar a pointer-driven window expects.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { profile, isAdmin, signOut } = useAuth();

  if (pathname === '/login') return null;

  return (
    <aside className="border-border bg-card/40 hidden w-60 shrink-0 flex-col border-r lg:flex">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <p className="text-title-2">Nutrition</p>
        </div>
        <p className="text-footnote text-muted-foreground mt-1 truncate">
          {profile?.display_name || profile?.email || ''}
        </p>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors',
                    active
                      ? 'bg-card text-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                  )}
                >
                  <Icon
                    size={19}
                    strokeWidth={active ? 2.3 : 1.9}
                    style={active ? { color: 'var(--calories)' } : undefined}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Kept out of TABS: admin is not a peer of the four product screens,
            and most accounts never see it. */}
        {isAdmin && (
          <ul className="border-border mt-3 space-y-0.5 border-t pt-3">
            <li>
              <Link
                href="/admin"
                aria-current={pathname === '/admin' ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors',
                  pathname === '/admin'
                    ? 'bg-card text-foreground font-medium shadow-sm'
                    : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                )}
              >
                <Shield
                  size={19}
                  strokeWidth={pathname === '/admin' ? 2.3 : 1.9}
                  style={pathname === '/admin' ? { color: 'var(--calories)' } : undefined}
                />
                Admin
              </Link>
            </li>
          </ul>
        )}
      </nav>

      <button
        type="button"
        onClick={() => void signOut()}
        className="text-muted-foreground hover:text-foreground m-3 flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors"
      >
        <LogOut size={19} strokeWidth={1.9} />
        Sign out
      </button>
    </aside>
  );
}
