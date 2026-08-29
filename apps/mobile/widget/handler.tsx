import type { WidgetInfo, WidgetTaskHandlerProps } from 'react-native-android-widget';
import { DayWidget } from './DayWidget';
import { RingWidget } from './RingWidget';
import { DARK, LIGHT } from './theme';
import { widgetText } from './text';
import { deviceLocale } from '@/messages';
import { currentDaySnapshot, type DaySnapshot } from '@/lib/snapshot';

/**
 * What the launcher calls when it wants a widget drawn.
 *
 * Headless: no navigation, no providers, no screen. What it draws comes from
 * `currentDaySnapshot`, which spends the note the app left when that note is
 * still good for today and goes to the server when it is not.
 *
 * That asymmetry is the point. This handler runs on the launcher's schedule,
 * which is to say at times nobody chose — half past every hour, and after a
 * reboot — and those are exactly the moments the app has not been open to leave
 * a fresh note. A draw that could only read is a draw that reports last night
 * every morning.
 *
 * Every action draws. `WIDGET_DELETED` is the exception and needs no branch —
 * there is nothing left to draw on — and a click is handled by the deep link
 * declared on the widget itself, so it too only has to repaint. Repainting on a
 * click is not waste: it is the one moment we know somebody is looking, and
 * with the fetch behind it the tap that opens the app now also corrects the
 * rectangle it was launched from.
 */
export async function widgetTaskHandler({
  widgetInfo,
  widgetAction,
  renderWidget,
}: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED') return;

  const snapshot = await currentDaySnapshot();
  renderWidget(paint(widgetInfo, snapshot));
}

/**
 * Both schemes, every time.
 *
 * The library hands the launcher a light and a dark rendition and lets it pick,
 * which is the only way to be right: a widget cannot ask what the wallpaper
 * looks like, and unlike a screen there is nowhere for the reader to navigate
 * away from a rectangle that has come out unreadable.
 */
export function paint(info: WidgetInfo, snapshot: DaySnapshot | null) {
  const { widgetName, width, height } = info;
  /*
   * The note carries the language it was written in. Without a note there is
   * nothing to carry it — nobody has opened the app, or they have signed out —
   * and the device's answer is both the best guess and the one `lib/i18n`
   * itself starts from.
   */
  const text = widgetText(snapshot?.locale ?? deviceLocale());
  const props = { snapshot, width, height, text };

  return widgetName === 'Ring'
    ? {
        light: <RingWidget {...props} colors={LIGHT} />,
        dark: <RingWidget {...props} colors={DARK} />,
      }
    : {
        light: <DayWidget {...props} colors={LIGHT} />,
        dark: <DayWidget {...props} colors={DARK} />,
      };
}
