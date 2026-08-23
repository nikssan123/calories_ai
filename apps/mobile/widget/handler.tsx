import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { DayWidget } from './DayWidget';
import { readDaySnapshot } from '@/lib/snapshot';

/**
 * What the launcher calls when it wants the widget drawn.
 *
 * This runs headless: no navigation, no providers, no screen. Everything it
 * needs has to come off disk, which is what `readDaySnapshot` is for and why
 * the app writes one every time it loads a day.
 *
 * Every action draws. `WIDGET_DELETED` is the exception and needs no branch —
 * there is nothing left to draw on — and a click is handled by the deep link
 * declared on the widget itself, so it too only has to repaint. Repainting on a
 * click is not wasted: it is the one moment we know somebody is looking.
 */
export async function widgetTaskHandler({
  widgetAction,
  renderWidget,
}: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED') return;

  const snapshot = await readDaySnapshot();
  renderWidget(<DayWidget snapshot={snapshot} />);
}
