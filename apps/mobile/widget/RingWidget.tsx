import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { ringSvg } from './ring';
import { DISPLAY, OPEN_JOURNAL, type WidgetPalette } from './theme';
import { Empty } from './Empty';
import type { DaySnapshot } from '@/lib/snapshot';

/**
 * The ring, square, filling whatever it is given.
 *
 * The first version drew a fixed 132pt ring in the middle of a 150dp box and
 * looked exactly like what it was: a small circle marooned in a large empty
 * card. A widget has no scroll and no second screen — the space it takes is the
 * whole of it — so anything that does not use its box is asking for room it
 * does not need.
 *
 * So the ring is measured from the box rather than declared, and the stroke
 * scales with it: a ring twice the size with the same 16pt stroke reads as a
 * hoop rather than as the app's own dial.
 */
export function RingWidget({
  snapshot,
  colors,
  width,
  height,
}: {
  snapshot: DaySnapshot | null;
  colors: WidgetPalette;
  width: number;
  height: number;
}) {
  if (!snapshot) return <Empty colors={colors} />;

  const remaining = snapshot.target - snapshot.consumed;
  const over = remaining < 0;

  /*
   * The card keeps its own padding and border out of the ring's diameter, so
   * the arc never touches the outline. 26 is the two paddings plus the two
   * border widths plus a hair, arrived at by drawing it rather than by theory.
   */
  const box = Math.max(0, Math.min(width, height) - 26);
  const stroke = Math.max(8, Math.round(box * 0.12));
  /*
   * Capped at both ends. Proportional alone gives 58pt numerals in a 4x4 cell,
   * which stops looking like the app's dial and starts looking like a clock.
   */
  const figure = Math.max(18, Math.min(40, Math.round(box * 0.26)));
  const caption = Math.max(9, Math.min(14, Math.round(figure * 0.36)));

  return (
    <FlexWidget
      {...OPEN_JOURNAL}
      accessibilityLabel={
        over
          ? `${Math.abs(remaining).toLocaleString()} kcal over today`
          : `${remaining.toLocaleString()} kcal left today`
      }
      style={{
        height: 'match_parent',
        width: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 2,
        borderRadius: 28,
        padding: 10,
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
            over: colors.foreground,
          })}
          style={{ height: box, width: box }}
        />
        <FlexWidget
          style={{ height: box, width: box, justifyContent: 'center', alignItems: 'center' }}
        >
          <TextWidget
            text={Math.abs(remaining).toLocaleString()}
            style={{ fontSize: figure, fontFamily: DISPLAY, color: colors.foreground }}
          />
          <TextWidget
            text={over ? 'over' : 'to go'}
            style={{ fontSize: caption, fontWeight: '600', color: colors.mutedForeground }}
          />
        </FlexWidget>
      </OverlapWidget>
    </FlexWidget>
  );
}
