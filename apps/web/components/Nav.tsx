'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartLine, ChefHat, Flame, MessageSquareText, PersonStanding, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT, type StringKey } from '@/lib/i18n';

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
/*
 * The label is a message *key*, not a word. Resolved at render rather than
 * here, because this array is module scope and a hook cannot run in it — and
 * because a tab bar that read its words once at import would keep them after
 * somebody changed language in the settings two screens away.
 */
const TABS: readonly { href: string; label: StringKey; Icon: LucideIcon }[] = [
  { href: '/', label: 'nav.journal', Icon: MessageSquareText },
  { href: '/today', label: 'nav.today', Icon: Flame },
  { href: '/progress', label: 'nav.progress', Icon: ChartLine },
  { href: '/exercise', label: 'nav.exercise', Icon: PersonStanding },
  { href: '/cook', label: 'nav.cook', Icon: ChefHat },
  { href: '/setup', label: 'nav.you', Icon: User },
];

export function Nav() {
  const pathname = usePathname();
  const t = useT();

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
                  {t(label)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
