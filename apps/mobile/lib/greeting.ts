import { dayPartAt } from '@/theme';
import type { useT } from '@/lib/i18n';

/**
 * The line over the sky, for the hour it is.
 *
 * One function rather than four call sites choosing between four keys, because
 * the hour boundaries are the sky's (`dayPartAt`) and the greeting has to turn
 * at the same moment the sky does — "Good afternoon" under a dusk sky reads as
 * the app not looking out of the window.
 */
export function greetingFor(tr: ReturnType<typeof useT>, name: string | null, now = new Date()): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  switch (dayPartAt(now)) {
    case 'morning':
      return tr('today.greetMorning')(first);
    case 'afternoon':
      return tr('today.greetAfternoon')(first);
    case 'evening':
      return tr('today.greetEvening')(first);
    case 'night':
      return tr('today.greetNight')(first);
  }
}
