'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ChartLine,
  ChefHat,
  Flame,
  LogOut,
  MessageSquareText,
  PersonStanding,
  Shield,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/components/AuthGate';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { useT, type StringKey } from '@/lib/i18n';

/** A vertical list has room for History, which the phone's bottom bar does not. */
const TABS: readonly { href: string; label: StringKey; Icon: LucideIcon }[] = [
  { href: '/', label: 'nav.journal', Icon: MessageSquareText },
  { href: '/today', label: 'nav.today', Icon: Flame },
  { href: '/history', label: 'nav.history', Icon: CalendarDays },
  { href: '/progress', label: 'nav.progress', Icon: ChartLine },
  { href: '/exercise', label: 'nav.exercise', Icon: PersonStanding },
  { href: '/cook', label: 'nav.cook', Icon: ChefHat },
  { href: '/setup', label: 'nav.you', Icon: User },
];

/**
 * Desktop navigation. Replaces the bottom tab bar from `lg` up — the same
 * destinations, but in the persistent sidebar a pointer-driven window expects.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { profile, isAdmin, signOut } = useAuth();
  const t = useT();

  if (pathname === '/login') return null;

  return (
    <aside className="border-border hidden w-64 shrink-0 flex-col border-r-2 lg:flex">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <p className="text-title-2">Day So Far</p>
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
                    'flex items-center gap-3 rounded-2xl border-2 px-3 py-2 text-body transition-colors',
                    active
                      ? 'chunk border-border bg-card text-foreground font-extrabold [--chunk-depth:3px]'
                      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground border-transparent font-bold',
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.6 : 2.1}
                    style={active ? { color: 'var(--calories-text)' } : undefined}
                  />
                  {t(label)}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Kept out of TABS: admin is not a peer of the four product screens,
            and most accounts never see it. */}
        {isAdmin && (
          <ul className="border-border mt-3 space-y-0.5 border-t-2 pt-3">
            <li>
              <Link
                href="/admin"
                aria-current={pathname === '/admin' ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border-2 px-3 py-2 text-body transition-colors',
                  pathname === '/admin'
                    ? 'chunk border-border bg-card text-foreground font-extrabold [--chunk-depth:3px]'
                    : 'text-muted-foreground hover:bg-card/70 hover:text-foreground border-transparent font-bold',
                )}
              >
                <Shield
                  size={20}
                  strokeWidth={pathname === '/admin' ? 2.6 : 2.1}
                  style={pathname === '/admin' ? { color: 'var(--calories-text)' } : undefined}
                />
                {t('nav.admin')}
              </Link>
            </li>
          </ul>
        )}
      </nav>

      <button
        type="button"
        onClick={() => void signOut()}
        className="text-muted-foreground hover:text-foreground m-3 flex items-center gap-3 rounded-2xl px-3 py-2 text-body font-bold transition-colors"
      >
        <LogOut size={20} strokeWidth={2.1} />
        {t('nav.signOut')}
      </button>
    </aside>
  );
}
