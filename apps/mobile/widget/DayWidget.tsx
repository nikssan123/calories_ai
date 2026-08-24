import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { ringSvg } from './ring';
import { DISPLAY, OPEN_JOURNAL, type WidgetPalette } from './theme';
import { Empty } from './Empty';
import type { DaySnapshot } from '@/lib/snapshot';

/**
 * The wide one, which changes shape rather than scaling.
 *
 * Two rows and it is the ring plus the sentence underneath it from Today — what
 * is left, what that is out of, and the burn if there was any. Dragged down to
 * one row the ring goes entirely and a bar takes its place, because a 40dp
 * circle is a dot, not a dial, and the number is the part worth keeping.
 *
 * That is the whole argument for a resizable widget: not the same picture at
 * two sizes, but the right picture for the room available.
 */
export function DayWidget({
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
  const ratio = snapshot.target > 0 ? snapshot.consumed / snapshot.target : 0;

  const label = over ? 'over' : 'left';
  const spoken = `${Math.abs(remaining).toLocaleString()} kcal ${label} today`;
  const shell = {
    ...OPEN_JOURNAL,
    accessibilityLabel: spoken,
    style: {
      height: 'match_parent' as const,
      width: 'match_parent' as const,
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 2,
      borderRadius: 28,
    },
  };

  /*
   * 108dp is roughly a two-row cell on a normal launcher. Below it there is not
   * enough height for a ring that still reads as one, so the layout changes
   * instead of shrinking.
   */
  if (height < 108) {
    const track = Math.max(40, width - 36);
    /*
     * Measured against the height the launcher actually gave us, because a row
     * is not a fixed number of points: the first cut used a comfortable padding
     * and a 26pt figure, overflowed a one-row cell by about four points, and
     * Android answered by clipping the bar off the bottom — silently, so the
     * widget simply looked like it had no bar.
     */
    const pad = 10;
    const barHeight = 6;
    const gap = 6;
    const figure = Math.max(15, Math.min(24, Math.round((height - pad * 2 - barHeight - gap) * 0.7)));
    return (
      <FlexWidget
        {...shell}
        style={{
          ...shell.style,
          justifyContent: 'center',
          paddingHorizontal: 16,
          paddingVertical: pad,
        }}
      >
        <FlexWidget
          style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}
        >
          <TextWidget
            text={Math.abs(remaining).toLocaleString()}
            style={{ fontSize: figure, fontFamily: DISPLAY, color: colors.foreground }}
          />
          <TextWidget
            text={` ${label}`}
            style={{
              fontSize: Math.max(10, Math.round(figure * 0.5)),
              fontWeight: '600',
              color: colors.mutedForeground,
            }}
          />
          <FlexWidget style={{ flex: 1 }} />
          <TextWidget
            text={`${snapshot.consumed.toLocaleString()} / ${snapshot.target.toLocaleString()}`}
            style={{
              fontSize: Math.max(10, Math.round(figure * 0.48)),
              fontWeight: '600',
              color: colors.mutedForeground,
            }}
          />
        </FlexWidget>
        {/*
          * The bar is two nested boxes rather than a drawn shape: `RemoteViews`
          * has no percentage widths, so the fill is measured in dp from the
          * width the launcher reported.
          */}
        <FlexWidget
          style={{
            height: barHeight,
            width: track,
            backgroundColor: colors.muted,
            borderRadius: 999,
            marginTop: gap,
          }}
        >
          <FlexWidget
            style={{
              height: barHeight,
              width: Math.round(track * Math.min(1, Math.max(0, ratio))),
              backgroundColor: over ? colors.foreground : colors.calories,
              borderRadius: 999,
            }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }

  const box = Math.max(0, Math.min(height - 26, Math.round(width * 0.42)));
  const stroke = Math.max(8, Math.round(box * 0.13));

  return (
    <FlexWidget
      {...shell}
      style={{ ...shell.style, flexDirection: 'row', alignItems: 'center', padding: 12 }}
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
            style={{
              fontSize: Math.max(16, Math.round(box * 0.27)),
              fontFamily: DISPLAY,
              color: colors.foreground,
            }}
          />
        </FlexWidget>
      </OverlapWidget>

      <FlexWidget style={{ flex: 1, marginLeft: 14, justifyContent: 'center' }}>
        <TextWidget
          text={`${Math.abs(remaining).toLocaleString()} ${label}`}
          style={{ fontSize: 17, fontWeight: 'bold', color: colors.foreground }}
        />
        <TextWidget
          text={`${snapshot.consumed.toLocaleString()} of ${snapshot.target.toLocaleString()} kcal`}
          style={{ fontSize: 12, fontWeight: '600', color: colors.mutedForeground, marginTop: 2 }}
        />
        {snapshot.burned > 0 && (
          <TextWidget
            text={`−${snapshot.burned.toLocaleString()} burned`}
            style={{ fontSize: 12, fontWeight: '600', color: colors.burn, marginTop: 2 }}
          />
        )}
      </FlexWidget>
    </FlexWidget>
  );
}
