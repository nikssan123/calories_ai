'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartLine, Flame, MessageSquareText, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', label: 'Journal', Icon: MessageSquareText },
  { href: '/today', label: 'Today', Icon: Flame },
  { href: '/progress', label: 'Progress', Icon: ChartLine },
  { href: '/setup', label: 'You', Icon: User },
] as const;

export function Nav() {
  const pathname = usePathname();

  // The sign-in screen is not part of the tabbed app.
  if (pathname === '/login') return null;

  // While the keyboard is up the screen is tiny; the tab bar would eat a fifth
  // of it to show tabs nobody is aiming at.
  return (
    <nav className="material border-border keyboard:hidden sticky bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="flex">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 transition-colors',
                  active ? 'text-[var(--calories)]' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
                <span className="text-[10px] font-medium tracking-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
