import { FlexWidget, type ColorProp, type FlexWidgetStyle } from 'react-native-android-widget';
import { GLOSS, type WidgetPalette } from './theme';

/**
 * A track and however much of it has been eaten, the way the app draws one.
 *
 * Three nested boxes rather than a drawn shape, because `RemoteViews` has no
 * percentage widths: the fill is measured in dp from the width the launcher
 * reported, which is what `layout.ts` works out.
 *
 * The track is `hairline` — a whisper of the ink — and not the opaque beige
 * slab this used to fill it with. That was `muted` before the glow-up, and a
 * second colour of card laid on top of the first is exactly what the app
 * stopped doing when it swapped its slabs for light (GLOW-UP.md).
 *
 * The third box is the gloss. `MacroBars` paints every fill in the app with a
 * white highlight over its top half, which is most of what makes a bar there
 * read as a lit capsule rather than a coloured stub — and it has to be a child
 * rather than a style, because a gradient background on Android replaces the
 * background colour underneath it instead of sitting on it.
 *
 * Two stops where the app has the highlight gone by 55% of the height, because
 * a `GradientDrawable` built from a `RemoteViews` tree takes a start and an end
 * and nothing in between. On a bar six to fourteen points tall that is the
 * difference between a highlight and a slightly softer highlight.
 */
export function Bar({
  colors,
  height,
  track,
  fill,
  color,
  style,
}: {
  colors: WidgetPalette;
  height: number;
  /** The whole width, in dp. */
  track: number;
  /** How much of it is filled, in dp. Zero draws the track alone. */
  fill: number;
  color: ColorProp;
  style?: FlexWidgetStyle;
}) {
  return (
    <FlexWidget
      style={{
        height,
        width: track,
        backgroundColor: colors.hairline,
        borderRadius: 999,
        ...style,
      }}
    >
      {fill > 0 && (
        <FlexWidget
          style={{
            height,
            width: fill,
            backgroundColor: color,
            borderRadius: 999,
          }}
        >
          <FlexWidget
            style={{
              height: 'match_parent',
              width: 'match_parent',
              backgroundGradient: { from: GLOSS.from, to: GLOSS.to, orientation: 'TOP_BOTTOM' },
              borderRadius: 999,
            }}
          />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
