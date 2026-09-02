import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { ringSvg } from './ring';
import { LINE_HEIGHT, ringLayout } from './layout';
import { DISPLAY, OPEN_JOURNAL, type WidgetPalette } from './theme';
import { Empty } from './Empty';
import type { WidgetText } from './text';
import type { DaySnapshot } from '@/lib/snapshot';

/**
 * The ring, square, filling whatever it is given.
 *
 * It defaults to a single cell now — the size of an app icon — because that is
 * the size the thing actually is. The earlier default asked for four cells to
 * show one circle and a number, and a widget that takes a quarter of a home
 * screen row has to earn it against the four icons it displaced. A dial the
 * size of an icon does; a dial the size of a photograph does not.
 *
 * Everything scales off the box rather than being declared, so the same
 * component is the icon-sized dial and the big one: at a cell it is the ring
 * and the number, and only from about two cells up is there room for the word
 * that says what the number means. See `layout.ts` for the arithmetic.
 */
export function RingWidget({
  snapshot,
  colors,
  width,
  height,
  text,
}: {
  snapshot: DaySnapshot | null;
  colors: WidgetPalette;
  width: number;
  height: number;
  text: WidgetText;
}) {
  if (!snapshot) return <Empty colors={colors} width={width} height={height} text={text} />;

  const remaining = snapshot.target - snapshot.consumed;
  const over = remaining < 0;
  const { padding, radius, box, stroke, figure, figureText, caption, captionText } = ringLayout({
    width,
    height,
    remaining,
    text,
  });

  return (
    <FlexWidget
      {...OPEN_JOURNAL}
      accessibilityLabel={`${text.n(Math.abs(remaining))} kcal ${text.today(
        over ? text.over : text.toGo,
      )}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
        borderColor: colors.border,
        borderWidth: 2,
        borderRadius: radius,
        padding,
      }}
    >
      <OverlapWidget style={{ height: box, width: box }}>
        <SvgWidget
          svg={ringSvg({
            consumed: snapshot.consumed,
            target: snapshot.target,
            size: box,
            strokeWidth: stroke,
            track: colors.muted,
            fill: colors.calories,
            ramp: colors.ramp,
            ledge: colors.ledge,
            ledgeOpacity: colors.ledgeOpacity,
            over: colors.foreground,
          })}
          style={{ height: box, width: box }}
        />
        <FlexWidget
          style={{ height: box, width: box, justifyContent: 'center', alignItems: 'center' }}
        >
          {figure > 0 && (
            <TextWidget
              text={figureText}
              allowFontScaling={false}
              maxLines={1}
              style={{
                fontSize: figure,
                lineHeight: Math.round(figure * LINE_HEIGHT),
                fontFamily: DISPLAY,
                color: colors.foreground,
              }}
            />
          )}
          {caption > 0 && (
            <TextWidget
              text={captionText}
              allowFontScaling={false}
              maxLines={1}
              truncate="END"
              style={{
                fontSize: caption,
                lineHeight: Math.round(caption * 1.2),
                fontWeight: '600',
                color: colors.mutedForeground,
              }}
            />
          )}
        </FlexWidget>
      </OverlapWidget>
    </FlexWidget>
  );
}
