'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartLine, Flame, LogOut, MessageSquareText, User } from 'lucide-react';
import { useAuth } from '@/components/AuthGate';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', label: 'Journal', Icon: MessageSquareText },
  { href: '/today', label: 'Today', Icon: Flame },
  { href: '/progress', label: 'Progress', Icon: ChartLine },
  { href: '/setup', label: 'You', Icon: User },
] as const;

/**
 * Desktop navigation. Replaces the bottom tab bar from `lg` up — the same
 * destinations, but in the persistent sidebar a pointer-driven window expects.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();

  if (pathname === '/login') return null;

  return (
    <aside className="border-border bg-card/40 hidden w-60 shrink-0 flex-col border-r lg:flex">
      <div className="px-5 pt-6 pb-4">
        <p className="text-title-2">Nutrition</p>
        <p className="text-footnote text-muted-foreground mt-0.5 truncate">
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
