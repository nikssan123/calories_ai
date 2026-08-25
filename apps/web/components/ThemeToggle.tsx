'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { type ThemePreference, useTheme } from '@/components/ThemeSync';
import { useT, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ value: ThemePreference; label: StringKey; Icon: typeof Sun }> = [
  { value: 'system', label: 'theme.system', Icon: Monitor },
  { value: 'light', label: 'theme.light', Icon: Sun },
  { value: 'dark', label: 'theme.dark', Icon: Moon },
];

/**
 * Three states rather than a switch, because "follow my system" is a real
 * preference and not the absence of one — a plain light/dark toggle silently
 * pins you to whichever you last tapped and stops tracking sunset.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className={cn('bg-muted border-border grid grid-cols-3 gap-1 rounded-full border-2 p-1', className)}
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
              'flex items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-bold',
              'transition-[background-color,color,transform] duration-[var(--dur-quick)]',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none active:scale-95',
              active
                ? 'bg-card text-foreground border-border chunk-sm border-2'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={15} strokeWidth={active ? 2.6 : 2.1} />
            {t(label)}
          </button>
        );
      })}
    </div>
  );
}
