import { formatNumber, type Locale } from '@ct/shared';
import { messagesFor } from '@/messages';

/**
 * What the widget says, in the language the app was last read in.
 *
 * Everything the two widgets draw, resolved once and handed down — including
 * the number formatter, because `1,240` in English is `1 240` in Bulgarian and
 * that is a difference the layout has to measure, not just a difference the
 * reader sees.
 *
 * Most of the keys are the ones the screens already use: the ring on Today says
 * "to go" and so does the ring on the home screen, and a widget that invented
 * its own word for it would be a second translation to keep in step. Only the
 * three things a widget says and a screen does not are new.
 */
export interface WidgetText {
  /** A figure, grouped the way this language groups figures. */
  n: (value: number) => string;
  toGo: string;
  over: string;
  /** "to go today" — the word above, given its day. */
  today: (label: string) => string;
  of: (consumed: string, target: string) => string;
  burned: (kcal: string) => string;
  tapToStart: string;
}

export function widgetText(locale: Locale): WidgetText {
  const t = messagesFor(locale);
  return {
    n: (value) => formatNumber(value, locale),
    toGo: t['today.toGo'],
    over: t['today.over'],
    today: t['widget.today'],
    of: t['widget.of'],
    burned: t['today.burned'],
    tapToStart: t['widget.tapToStart'],
  };
}
