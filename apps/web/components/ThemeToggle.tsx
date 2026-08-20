'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { type ThemePreference, useTheme } from '@/components/ThemeSync';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Three states rather than a switch, because "follow my system" is a real
 * preference and not the absence of one — a plain light/dark toggle silently
 * pins you to whichever you last tapped and stops tracking sunset.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn('bg-muted/70 grid grid-cols-3 gap-1 rounded-[12px] p-1', className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-[9px] py-2 text-[13px] font-medium',
              'transition-[background-color,color,transform] duration-[var(--dur-quick)]',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none active:scale-95',
              active
                ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(23,22,20,0.08)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={15} strokeWidth={active ? 2.3 : 1.9} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
