import { FlexWidget, OverlapWidget, SvgWidget, type FlexWidgetStyle } from 'react-native-android-widget';
import { groundSvg } from './ground';
import { OPEN_JOURNAL, type WidgetPalette } from './theme';

/**
 * The tile every Android widget is drawn on.
 *
 * One component rather than the four copies of the same object literal this
 * replaced, which is how the tile came to be the last thing in the app still
 * wearing the old styling: the app changed in one file, and the widget's
 * surface was spelled out again in `DayWidget`, `RingWidget`, `StepsWidget` and
 * `Empty`, so nothing carried across.
 *
 * What it is now is the app's own surface. The ground the app opens on (see
 * `theme.ts` for why the ground and not the card), the washes every screen in
 * the app stands in, and a hairline outline lit along its top — which since the
 * glow-up is what every card in the app has instead of the two-point tan border
 * this used to draw. The one part that cannot come across is the shadow under
 * it: the launcher composites the tile onto a wallpaper this process never
 * sees, so there is nothing to cast onto.
 *
 * Two layers, because the wash has to be a drawing. See `groundSvg`.
 *
 * **Change this and the widget picker goes stale.** Android shows a static
 * `previewImage` per widget (`app.json`), and without one the picker draws the
 * app icon on a white card — three identical logos where the whole point is to
 * show what you are about to put on your home screen. The three PNGs in
 * `assets/widget-preview-*.png` are the real thing rather than a mock-up: the
 * library rasterises every widget it draws to
 * `files/widget_images/widget_<id>_mode_<scheme>.png` inside the app's own
 * storage, so a widget placed on an emulator leaves a pixel-exact copy of
 * itself, rounded corners and all, to be pulled with `adb` —
 *
 *     adb shell "run-as com.daysofar.app cat files/widget_images/widget_2_mode_light.png" > ring.png
 *
 * The light rendition, because the picker's sheet is dark on both themes far
 * more often than it is light, and a cream tile reads as this app on either.
 */
export function Shell({
  colors,
  width,
  height,
  radius,
  spoken,
  style,
  children,
}: {
  colors: WidgetPalette;
  /** The cell the launcher gave us, which the wash is sized against. */
  width: number;
  height: number;
  radius: number;
  /** What a screen reader says instead of reading the figures out one by one. */
  spoken: string;
  /** How the widget arranges itself inside the tile: padding, direction, gravity. */
  style: FlexWidgetStyle;
  children?: React.ReactNode;
}) {
  return (
    <OverlapWidget
      {...OPEN_JOURNAL}
      accessibilityLabel={spoken}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: colors.background,
        borderRadius: radius,
      }}
    >
      <SvgWidget
        svg={groundSvg({ width, height, radius, colors })}
        style={{ height, width }}
      />
      <FlexWidget style={{ height: 'match_parent', width: 'match_parent', ...style }}>
        {children}
      </FlexWidget>
    </OverlapWidget>
  );
}
