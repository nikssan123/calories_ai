'use client';

import { LOCALES, LOCALE_NAMES, type Locale } from '@ct/shared';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * The language control, in the one shape it takes everywhere.
 *
 * Three things about it are deliberate and would be easy to undo by accident:
 *
 * **Every option is written in its own language.** `LOCALE_NAMES` says
 * "Български", not "Bulgarian", and "Deutsch", not "German". A picker that
 * names a language in a language you cannot read is a picker for somebody who
 * did not need it — by the time you can read "German" you did not have to look
 * for it. This is the only string in the app that never goes through `useT`.
 *
 * **Each option carries `lang`**, so the browser applies that language's rules
 * and — the load-bearing part — so the Cyrillic display swap in `globals.css`
 * reaches "Български" even while the rest of the page is English. Without it
 * this control is the one place in the app where the fallback face shows, on
 * the one screen where somebody is looking hard at letterforms.
 *
 * **It changes shape with the number of languages.** Two or three fit on one
 * line and cost one tap, which is worth keeping while it is true; five do not.
 * Past `INLINE_LIMIT` it becomes a menu — one tap, a list, a dismiss, but a
 * list that still reads at any length. The threshold is here rather than at the
 * two call sites so the sign-in screen and Settings can never disagree about it.
 */

/**
 * How many languages still fit as a row of buttons.
 *
 * Four is where a segmented control stops being one glance on a narrow phone —
 * it is roughly where the labels start needing to shrink to fit, and a shrunk
 * label in a script you are trying to read is worse than a menu.
 */
const INLINE_LIMIT = 4;

export function LanguagePicker({
  value,
  onChange,
  className,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
  className?: string;
}) {
  /*
   * The cast the two control APIs force, narrowed against the real list rather
   * than asserted — a stale value from storage cannot get through as a Locale.
   */
  const pick = (next: string | null) => {
    const match = LOCALES.find((locale) => locale === next);
    if (match) onChange(match);
  };

  if (LOCALES.length > INLINE_LIMIT) {
    return (
      <Select value={value} onValueChange={pick}>
        <SelectTrigger className={cn('w-auto gap-2 pr-2.5', className)} aria-label="Language">
          <SelectValue className="flex-none">
            {(selected) => (
              <span lang={selected as string}>{LOCALE_NAMES[selected as Locale]}</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {LOCALES.map((locale) => (
            <SelectItem key={locale} value={locale} lang={locale}>
              {LOCALE_NAMES[locale]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(values) => {
        const next = values[0];
        if (next) pick(next);
      }}
      className={cn('bg-muted rounded-full p-0.5', className)}
    >
      {LOCALES.map((locale) => (
        <ToggleGroupItem
          key={locale}
          value={locale}
          aria-label={LOCALE_NAMES[locale]}
          lang={locale}
          className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-9 rounded-full px-3.5 text-footnote font-bold transition-colors"
        >
          {LOCALE_NAMES[locale]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
