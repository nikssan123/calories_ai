import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { ringSvg } from './ring';
import { CAST_GAP, LINE_HEIGHT, dayLayout, detailLines, type DayCard, type DayLine } from './layout';
import { castSvg, companion } from './cast';
import { DISPLAY, type WidgetPalette } from './theme';
import { Shell } from './Shell';
import { Bar } from './Bar';
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

  const tile = { colors, width, height, spoken };

  return layout.shape === 'line' ? (
    <Line tile={tile} layout={layout} over={remaining < 0} snapshot={snapshot} />
  ) : (
    <Card tile={tile} layout={layout} snapshot={snapshot} text={text} />
  );
}

/** What `<Shell>` needs, which is the same for both shapes. */
interface Tile {
  colors: WidgetPalette;
  width: number;
  height: number;
  spoken: string;
}

/** The app's own corner. See `<Shell>` for the rest of the surface. */
const RADIUS = 28;

/**
 * One row: the figure, the word, the ratio, and a bar under all three.
 *
 * The ratio is the only part that can be dropped, and it is dropped by
 * measurement rather than by a guess about how many cells wide the reader
 * chose — see `dayLayout`.
 *
 * Where the whole line fits with room to spare, one of the cast stands at its
 * start (CAST.md). See `companion` for who, and `dayLayout` for when.
 */
function Line({
  tile,
  layout,
  over,
  snapshot,
}: {
  tile: Tile;
  layout: DayLine;
  over: boolean;
  snapshot: DaySnapshot;
}) {
  const { colors } = tile;
  const who = layout.cast > 0 ? companion(snapshot) : null;

  return (
    <Shell
      {...tile}
      radius={RADIUS}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: layout.paddingHorizontal,
        paddingVertical: layout.padding,
      }}
    >
      {who && (
        <SvgWidget
          svg={castSvg({
            width: layout.cast,
            height: layout.cast,
            placed: [{ ...who, x: 0, y: 0, size: layout.cast }],
            shadow: colors.shadow,
            shadowOpacity: colors.shadowOpacity,
          })}
          style={{ height: layout.cast, width: layout.cast, marginRight: CAST_GAP }}
        />
      )}
      <FlexWidget style={{ width: layout.track, justifyContent: 'center' }}>
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
        <Bar
          colors={colors}
          height={layout.bar}
          track={layout.track}
          fill={layout.fill}
          color={over ? colors.foreground : colors.calories}
          style={{ marginTop: layout.gap }}
        />
      </FlexWidget>
    </Shell>
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
  tile,
  layout,
  snapshot,
  text,
}: {
  tile: Tile;
  layout: DayCard;
  snapshot: DaySnapshot;
  text: WidgetText;
}) {
  const { colors } = tile;
  return (
    <Shell
      {...tile}
      radius={RADIUS}
      style={{ flexDirection: 'row', alignItems: 'center', padding: layout.padding }}
    >
      <OverlapWidget style={{ height: layout.box, width: layout.box }}>
        <SvgWidget
          svg={ringSvg({
            consumed: snapshot.consumed,
            target: snapshot.target,
            size: layout.box,
            strokeWidth: layout.stroke,
            fill: colors.calories,
            ramp: colors.ramp,
            track: colors.track,
            trackOpacity: colors.trackOpacity,
            over: colors.foreground,
            rimGlint: colors.rimGlint,
            rimLit: colors.rimLit,
            rimShade: colors.rimShade,
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
        {detailLines(snapshot, layout.detailRows, text).map((line) => (
          <TextWidget
            key={line.key}
            text={line.text}
            allowFontScaling={false}
            maxLines={1}
            truncate="END"
            style={{
              fontSize: layout.detail,
              fontWeight: '600',
              color: line.tone === 'burn' ? colors.burn : colors.mutedForeground,
              marginTop: 2,
            }}
          />
        ))}
      </FlexWidget>
    </Shell>
  );
}
