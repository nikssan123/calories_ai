import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { ringSvg } from './ring';
import { LINE_HEIGHT, dayLayout, type DayCard, type DayLine } from './layout';
import { DISPLAY, OPEN_JOURNAL, type WidgetPalette } from './theme';
import { Empty } from './Empty';
import type { WidgetText } from './text';
import type { DaySnapshot } from '@/lib/snapshot';

/**
 * The wide one, which changes shape rather than scaling.
 *
 * It comes down one row high, which is the size the reading actually needs: a
 * number, the word for what the number is, and a bar to say how far through the
 * day the plate is. Dragged taller the bar gives way to the ring and the
 * sentence gains its second and third lines — the burn included, which is the
 * one figure there is no room for on a single row.
 *
 * The two shapes are picked in `layout.ts` and spent here. Nothing in this file
 * decides a size.
 */
export function DayWidget({
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

  const layout = dayLayout({ width, height, ...snapshot, text });
  const remaining = snapshot.target - snapshot.consumed;
  const spoken = `${text.n(Math.abs(remaining))} kcal ${text.today(layout.label)}`;

  return layout.shape === 'line' ? (
    <Line layout={layout} colors={colors} spoken={spoken} over={remaining < 0} />
  ) : (
    <Card layout={layout} colors={colors} spoken={spoken} snapshot={snapshot} text={text} />
  );
}

/** The card every shape is drawn on: the app's own, at the app's own radius. */
const card = (colors: WidgetPalette) =>
  ({
    height: 'match_parent',
    width: 'match_parent',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: 28,
  }) as const;

/**
 * One row: the figure, the word, the ratio, and a bar under all three.
 *
 * The ratio is the only part that can be dropped, and it is dropped by
 * measurement rather than by a guess about how many cells wide the reader
 * chose — see `dayLayout`.
 */
function Line({
  layout,
  colors,
  spoken,
  over,
}: {
  layout: DayLine;
  colors: WidgetPalette;
  spoken: string;
  over: boolean;
}) {
  return (
    <FlexWidget
      {...OPEN_JOURNAL}
      accessibilityLabel={spoken}
      style={{
        ...card(colors),
        justifyContent: 'center',
        paddingHorizontal: layout.paddingHorizontal,
        paddingVertical: layout.padding,
      }}
    >
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget
          text={layout.figureText}
          allowFontScaling={false}
          maxLines={1}
          style={{
            fontSize: layout.figure,
            lineHeight: Math.round(layout.figure * LINE_HEIGHT),
            fontFamily: DISPLAY,
            color: colors.foreground,
          }}
        />
        <TextWidget
          text={` ${layout.label}`}
          allowFontScaling={false}
          maxLines={1}
          style={{
            fontSize: layout.wording,
            fontWeight: '600',
            color: colors.mutedForeground,
          }}
        />
        <FlexWidget style={{ flex: 1 }} />
        {layout.ratio > 0 && (
          <TextWidget
            text={layout.ratioText}
            allowFontScaling={false}
            maxLines={1}
            style={{ fontSize: layout.ratio, fontWeight: '600', color: colors.mutedForeground }}
          />
        )}
      </FlexWidget>
      {/*
        * The bar is two nested boxes rather than a drawn shape: `RemoteViews`
        * has no percentage widths, so the fill is measured in dp from the
        * width the launcher reported.
        */}
      <FlexWidget
        style={{
          height: layout.bar,
          width: layout.track,
          backgroundColor: colors.muted,
          borderRadius: 999,
          marginTop: layout.gap,
        }}
      >
        {layout.fill > 0 && (
          <FlexWidget
            style={{
              height: layout.bar,
              width: layout.fill,
              backgroundColor: over ? colors.foreground : colors.calories,
              borderRadius: 999,
            }}
          />
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

/**
 * Two rows and up: the dial on the left, and beside it the three things the
 * dial cannot say — what the figure means, what it is out of, and the burn.
 *
 * The number is inside the ring and nowhere else. An earlier cut set it in the
 * column as well, which meant the widest, boldest thing on the card was a
 * number already being shown four points to its left.
 */
function Card({
  layout,
  colors,
  spoken,
  snapshot,
  text,
}: {
  layout: DayCard;
  colors: WidgetPalette;
  spoken: string;
  snapshot: DaySnapshot;
  text: WidgetText;
}) {
  return (
    <FlexWidget
      {...OPEN_JOURNAL}
      accessibilityLabel={spoken}
      style={{
        ...card(colors),
        flexDirection: 'row',
        alignItems: 'center',
        padding: layout.padding,
      }}
    >
      <OverlapWidget style={{ height: layout.box, width: layout.box }}>
        <SvgWidget
          svg={ringSvg({
            consumed: snapshot.consumed,
            target: snapshot.target,
            size: layout.box,
            strokeWidth: layout.stroke,
            track: colors.muted,
            fill: colors.calories,
            ramp: colors.ramp,
            ledge: colors.ledge,
            ledgeOpacity: colors.ledgeOpacity,
            over: colors.foreground,
          })}
          style={{ height: layout.box, width: layout.box }}
        />
        <FlexWidget
          style={{
            height: layout.box,
            width: layout.box,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {layout.figure > 0 && (
            <TextWidget
              text={layout.figureText}
              allowFontScaling={false}
              maxLines={1}
              style={{
                fontSize: layout.figure,
                lineHeight: Math.round(layout.figure * LINE_HEIGHT),
                fontFamily: DISPLAY,
                color: colors.foreground,
              }}
            />
          )}
        </FlexWidget>
      </OverlapWidget>

      <FlexWidget style={{ flex: 1, marginLeft: 14, justifyContent: 'center' }}>
        <TextWidget
          text={text.today(layout.label)}
          allowFontScaling={false}
          maxLines={1}
          style={{ fontSize: layout.title, fontWeight: 'bold', color: colors.foreground }}
        />
        <TextWidget
          text={text.of(text.n(snapshot.consumed), text.n(snapshot.target))}
          allowFontScaling={false}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: layout.detail,
            fontWeight: '600',
            color: colors.mutedForeground,
            marginTop: 2,
          }}
        />
        {snapshot.burned > 0 && (
          <TextWidget
            text={text.burned(text.n(snapshot.burned))}
            allowFontScaling={false}
            maxLines={1}
            truncate="END"
            style={{
              fontSize: layout.detail,
              fontWeight: '600',
              color: colors.burn,
              marginTop: 2,
            }}
          />
        )}
      </FlexWidget>
    </FlexWidget>
  );
}
