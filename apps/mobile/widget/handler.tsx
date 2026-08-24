import type { WidgetInfo, WidgetTaskHandlerProps } from 'react-native-android-widget';
import { DayWidget } from './DayWidget';
import { RingWidget } from './RingWidget';
import { DARK, LIGHT } from './theme';
import { readDaySnapshot, type DaySnapshot } from '@/lib/snapshot';

/**
 * What the launcher calls when it wants a widget drawn.
 *
 * Headless: no navigation, no providers, no screen. Everything it needs comes
 * off disk, which is what the day snapshot is for.
 *
 * Every action draws. `WIDGET_DELETED` is the exception and needs no branch —
 * there is nothing left to draw on — and a click is handled by the deep link
 * declared on the widget itself, so it too only has to repaint. Repainting on a
 * click is not waste: it is the one moment we know somebody is looking.
 */
export async function widgetTaskHandler({
  widgetInfo,
  widgetAction,
  renderWidget,
}: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED') return;

  const snapshot = await readDaySnapshot();
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
  const props = { snapshot, width, height };

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
