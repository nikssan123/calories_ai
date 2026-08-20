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
    <nav className="material border-border keyboard:hidden sticky bottom-0 z-30 border-t-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="flex">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-0.5 pt-1.5 pb-2 transition-colors',
                  active
                    ? 'text-[var(--calories-text)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {/*
                  The active tab wears a tinted lozenge rather than simply
                  changing colour. With six of them the bar is tight, and a
                  filled shape is the only difference a thumb can find at a
                  glance in a row that narrow — colour alone reads as noise.
                */}
                <span
                  className={cn(
                    'flex h-8 w-[calc(100%-4px)] max-w-14 items-center justify-center rounded-full transition-[background-color,transform] duration-[var(--dur-spring)] ease-[var(--ease-spring)]',
                    active
                      ? 'scale-100 bg-[color-mix(in_oklch,var(--calories),transparent_84%)]'
                      : 'scale-90 bg-transparent',
                  )}
                >
                  <Icon size={21} strokeWidth={active ? 2.6 : 2.1} />
                </span>
                <span
                  className={cn(
                    'w-full truncate text-center text-[10px] tracking-tight',
                    active ? 'font-extrabold' : 'font-bold',
                  )}
                >
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
