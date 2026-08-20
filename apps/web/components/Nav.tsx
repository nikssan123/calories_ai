'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartLine, ChefHat, Flame, MessageSquareText, PersonStanding, User } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Six, which is one past where a bottom bar is usually said to stop.
 *
 * It was five, and Cook was worth the sixth slot rather than worth demoting
 * something for: every other tab is somewhere you go to look at what you have
 * already done, and this is the only one that tells you what to do next. The
 * cost is real — the targets narrow, and the labels are tight on a small phone
 * — so seven is not available, and anything else earns its place by replacing
 * one of these.
 *
 * History is still not here. It is reached by tapping the date on Today, and
 * the sidebar, which has no such constraint, lists it outright.
 */
const TABS = [
  { href: '/', label: 'Journal', Icon: MessageSquareText },
  { href: '/today', label: 'Today', Icon: Flame },
  { href: '/progress', label: 'Progress', Icon: ChartLine },
  { href: '/exercise', label: 'Exercise', Icon: PersonStanding },
  { href: '/cook', label: 'Cook', Icon: ChefHat },
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
                  'flex flex-col items-center gap-1 px-0.5 py-2 transition-colors',
                  active ? 'text-[var(--calories-text)]' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {/* The lift is small on purpose: it should register as the tab
                    answering you, not as the bar rearranging itself. */}
                <Icon
                  size={22}
                  strokeWidth={active ? 2.4 : 1.9}
                  className="transition-transform duration-[var(--dur-spring)] ease-[var(--ease-spring)]"
                  style={{ transform: active ? 'scale(1.08)' : 'scale(1)' }}
                />
                <span className="w-full truncate text-center text-[10px] font-medium tracking-tight">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
