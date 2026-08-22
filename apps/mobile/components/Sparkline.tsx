import { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import type { TrendPoint } from '@ct/shared';
import { useColors } from '@/theme';

/**
 * The one chart in the product. The cards the agent draws mid-conversation
 * render through here, as Progress and Exercise will when they land, so a
 * calorie trend looks the same wherever it is met.
 *
 * Two shapes, chosen by what the data is rather than by taste: a line for a
 * quantity that exists continuously and is merely sampled (weight, intake), and
 * bars for one that only exists on the days it happened (burn). Drawing a rest
 * day as a point on a line implies a value it does not have.
 *
 * The web's touch readout is not here yet. It belongs to Progress, where a
 * chart is the subject rather than a footnote, and the cards never passed a
 * `tooltip` even on the web.
 */
export function Sparkline({
  points,
  accessor = 'average',
  stroke,
  target,
  variant = 'line',
  height = 72,
  style,
}: {
  points: TrendPoint[];
  accessor?: 'value' | 'average';
  stroke: string;
  target?: number | null;
  variant?: 'line' | 'bars';
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  /*
   * The rendered width, measured.
   *
   * On the web this is `w-full` on an SVG with a viewBox and no height, which
   * makes the browser scale the whole drawing to the container and derive the
   * height from the aspect ratio. RN has no such rule — an `Svg` lays out at
   * whatever it is given — so the container is measured and the same
   * proportional scale applied by hand. Nothing renders on the first pass,
   * which is one frame, and better than a chart that has to be drawn twice.
   */
  const [width, setWidth] = useState(0);
  /*
   * Under the new architecture `onLayout` can be delivered before the mount
   * effect has run, and setting state from it then is a state update on a
   * component React does not yet consider mounted — which it reports as a
   * side-effect in render, because that is the usual cause. The first
   * measurement is parked in a ref and applied once there is something to
   * apply it to.
   */
  const mounted = useRef(false);
  const pending = useRef(0);

  useEffect(() => {
    mounted.current = true;
    if (pending.current > 0) setWidth(pending.current);
    return () => {
      mounted.current = false;
    };
  }, []);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (!mounted.current) {
      pending.current = next;
      return;
    }
    setWidth((prev) => (prev === next ? prev : next));
  };

  const values = points.map((p) => p[accessor]);
  const present = values.filter((v): v is number => v !== null);

  // Two points is the fewest that can be a trend rather than a reading.
  if (present.length < 2) return <View style={style} onLayout={onLayout} />;

  const VIEW = 320;
  const reference = target ?? undefined;
  // Bars are read against zero; a bar chart with a floating baseline overstates
  // every difference on it.
  const lo = variant === 'bars' ? 0 : Math.min(...present, ...(reference ? [reference] : []));
  const hi = Math.max(...present, ...(reference ? [reference] : []));
  // Pad the domain so the trace sits in the body of the chart rather than
  // hugging an edge — a flat series against a distant target looks broken.
  const pad = (hi - lo || Math.abs(hi) * 0.1 || 1) * 0.18;
  const min = variant === 'bars' ? 0 : lo - pad;
  const max = hi + pad;
  const span = max - min || 1;

  const x = (i: number) => (i / Math.max(1, points.length - 1)) * VIEW;
  const y = (v: number) => height - ((v - min) / span) * (height - 10) - 5;

  const targetLine =
    reference !== undefined ? (
      <Line
        x1={0}
        x2={VIEW}
        y1={y(reference)}
        y2={y(reference)}
        stroke={colors.border}
        strokeDasharray="2 6"
        strokeWidth={2}
        strokeLinecap="round"
      />
    ) : null;

  const body =
    variant === 'bars' ? (
      <Bars points={points} accessor={accessor} stroke={stroke} y={y} height={height} view={VIEW} />
    ) : (
      <Path
        d={trace(points, accessor, x, y)}
        fill="none"
        stroke={stroke}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );

  return (
    <View style={style} onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={(width * height) / VIEW} viewBox={`0 0 ${VIEW} ${height}`}>
          {targetLine}
          {body}
        </Svg>
      )}
    </View>
  );
}

function Bars({
  points,
  accessor,
  stroke,
  y,
  height,
  view,
}: {
  points: TrendPoint[];
  accessor: 'value' | 'average';
  stroke: string;
  y: (v: number) => number;
  height: number;
  view: number;
}) {
  // Leave a hairline of gap between bars, but never let them vanish on a
  // 365-day window — below about a pixel the chart reads as an empty box.
  const slot = view / points.length;
  const barWidth = Math.max(1.5, slot * 0.66);

  return (
    <>
      {points.map((point, i) => {
        const v = point[accessor] ?? 0;
        const top = y(v);
        if (v <= 0) return null;
        return (
          <Rect
            key={point.local_date}
            x={slot * i + (slot - barWidth) / 2}
            y={top}
            width={barWidth}
            // Nothing shorter than a hairline, so a light day still registers
            // as a day rather than as a gap.
            height={Math.max(1.5, height - 5 - top)}
            rx={Math.min(3, barWidth / 2)}
            fill={stroke}
          />
        );
      })}
    </>
  );
}

/** Skips gaps rather than drawing a line through days with no data. */
function trace(
  points: TrendPoint[],
  accessor: 'value' | 'average',
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let path = '';
  let penDown = false;

  points.forEach((point, i) => {
    const v = point[accessor];
    if (v === null) {
      penDown = false;
      return;
    }
    path += `${penDown ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    penDown = true;
  });

  return path.trim();
}
