'use client';

import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import {
  LOCALES,
  LOCALES_BY_NAME,
  LOCALE_NAMES,
  LOCALE_NAMES_IN,
  suggestedLocales,
  type Locale,
} from '@ct/shared';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * The language control, in the one shape it takes everywhere.
 *
 * Five things about it are deliberate and would be easy to undo by accident:
 *
 * **Every option leads with its own name.** `LOCALE_NAMES` says "Български",
 * not "Bulgarian", and "Deutsch", not "German". A picker that names a language
 * in a language you cannot read is a picker for somebody who did not need it —
 * by the time you can read "German" you did not have to look for it.
 *
 * **Under it, the name in the language the screen is in** — "Ελληνικά", then
 * "Greek" or "Гръцки". That line is for the other direction: somebody reading
 * the current screen, scanning for a language whose own alphabet they do not
 * read. It is left off the screen's own language, where it would say the same
 * word twice.
 *
 * **A globe on the trigger.** It is the one part of this control that reads the
 * same whatever language the screen is in, and on the sign-in screen the person
 * who cannot read the screen is exactly who the control is for.
 *
 * **Suggested first, then the rest by their own names.** The language in use,
 * then any of the browser's own that this app speaks — `navigator.languages`,
 * the whole preference list, rather than `navigator.language`'s first entry.
 * Everything else follows in `LOCALES_BY_NAME` order, which sorts the column
 * the eye is actually scanning.
 *
 * **Each option carries `lang`**, so the browser applies that language's rules
 * and a screen reader picks a voice that can pronounce it.
 *
 * Thirteen languages is past where a row of buttons works and short of where a
 * search box earns its place. The menu's own typeahead covers the gap — type
 * "hr" and it lands on Hrvatski — and `label` on each item is what it matches,
 * so it matches the name somebody would type rather than both lines run
 * together.
 */
export function LanguagePicker({
  value,
  onChange,
  className,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
  className?: string;
}) {
  const t = useT();
  const screen = useLocale();

  /*
   * Read after mount. The sign-in page is rendered on the server for its first
   * paint, where there is no `navigator`, and a list that differed between the
   * two renders would be a hydration mismatch bought for nothing.
   */
  const [browserTags, setBrowserTags] = useState<readonly string[]>([]);
  useEffect(() => {
    setBrowserTags(navigator.languages?.length ? navigator.languages : [navigator.language]);
  }, []);

  /*
   * The cast the control's API forces, narrowed against the real list rather
   * than asserted — a stale value from storage cannot get through as a Locale.
   */
  const pick = (next: string | null) => {
    const match = LOCALES.find((locale) => locale === next);
    if (match && match !== value) onChange(match);
  };

  const suggested = suggestedLocales(value, browserTags);
  const rest = LOCALES_BY_NAME.filter((locale) => !suggested.includes(locale));

  const option = (locale: Locale) => (
    <SelectItem key={locale} value={locale} label={LOCALE_NAMES[locale]} className="py-2">
      <span className="flex flex-col gap-0.5">
        <span lang={locale} className="text-sm font-bold">
          {LOCALE_NAMES[locale]}
        </span>
        {locale !== screen && (
          <span lang={screen} className="text-muted-foreground text-xs font-medium">
            {LOCALE_NAMES_IN[screen][locale]}
          </span>
        )}
      </span>
    </SelectItem>
  );

  return (
    <Select value={value} onValueChange={pick}>
      <SelectTrigger
        className={cn('w-auto gap-2 pr-2.5', className)}
        aria-label={t('setup.language')}
      >
        <Globe aria-hidden className="text-muted-foreground" />
        <SelectValue className="flex-none">
          {(selected) => <span lang={selected as string}>{LOCALE_NAMES[selected as Locale]}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel className="text-eyebrow">{t('setup.languageSuggested')}</SelectLabel>
          {suggested.map(option)}
        </SelectGroup>
        {rest.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="text-eyebrow">{t('setup.languageAll')}</SelectLabel>
              {rest.map(option)}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
