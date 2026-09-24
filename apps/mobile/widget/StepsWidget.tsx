import { TextWidget } from 'react-native-android-widget';
import { LINE_HEIGHT, stepsLayout } from './layout';
import { DISPLAY, type WidgetPalette } from './theme';
import { Shell } from './Shell';
import { Bar } from './Bar';
import { Empty } from './Empty';
import type { WidgetText } from './text';
import type { DaySnapshot } from '@/lib/snapshot';

/**
 * The one where the steps lead.
 *
 * Its own widget rather than a mode of the Day one, because the two are read
 * for different reasons and the hierarchy is the whole difference: over there a
 * step count is the third muted line under a ring, and here it is the figure
 * somebody put a rectangle on their home screen to see. Plenty of people watch
 * their steps more closely than their calories, and a widget that made them
 * hunt for the number under two other readings would be the wrong shape for
 * them.
 *
 * What it deliberately does not have is a ring. A ring needs a goal, this app
 * has never had a step goal, and the obvious ten thousand is a number from a
 * 1960s Japanese pedometer advertisement rather than anything this app knows
 * about the person reading it. So the bar runs to *their own* recent average —
 * a fact about them — and past it simply fills, because walking more than usual
 * is not going over anything.
 *
 * Same bargain as everywhere else in here: no reading at all means `Empty`
 * rather than a confident nought. Nobody has ever walked exactly no steps, so
 * a zero on a home screen is a wrong fact rather than a missing one.
 */
export function StepsWidget({
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
  if (!snapshot || snapshot.steps === null) {
    return <Empty colors={colors} width={width} height={height} text={text} dial={false} />;
  }

  const layout = stepsLayout({ width, height, ...snapshot, average: snapshot.stepsAverage, text });
  const spoken = text.steps(snapshot.steps);

  return (
    <Shell
      colors={colors}
      width={width}
      height={height}
      radius={layout.radius}
      spoken={spoken}
      style={{
        justifyContent: 'center',
        paddingHorizontal: layout.padding,
        paddingVertical: layout.padding,
      }}
    >
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
      {layout.caption > 0 && (
        <TextWidget
          text={layout.captionText}
          allowFontScaling={false}
          maxLines={1}
          style={{ fontSize: layout.caption, fontWeight: '600', color: colors.mutedForeground }}
        />
      )}

      {/* The bar, and only when there is a week behind it to measure against. */}
      {layout.bar > 0 && (
        <Bar
          colors={colors}
          height={layout.bar}
          track={layout.track}
          fill={layout.fill}
          color={colors.calories}
          style={{ marginTop: layout.gap }}
        />
      )}

      {layout.detail > 0 && (
        <TextWidget
          text={layout.detailText}
          allowFontScaling={false}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: layout.detail,
            fontWeight: '600',
            color: colors.mutedForeground,
            marginTop: 4,
          }}
        />
      )}

      {/* The day, quietly, where the shape is wide enough to hold both. Somebody
          who came for the steps should still not have to open the app to see
          where their eating stands. */}
      {layout.kcal > 0 && (
        <TextWidget
          text={layout.kcalText}
          allowFontScaling={false}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: layout.kcal,
            fontWeight: '600',
            color: colors.mutedForeground,
            marginTop: 4,
          }}
        />
      )}
    </Shell>
  );
}
