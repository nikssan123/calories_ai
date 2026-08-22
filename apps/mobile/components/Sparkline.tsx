import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
  readout,
}: {
  points: TrendPoint[];
  accessor?: 'value' | 'average';
  stroke: string;
  target?: number | null;
  variant?: 'line' | 'bars';
  height?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * Opt in to inspecting a single day. The caller draws the contents, because
   * only it knows what the day *was* — this component has a date and a number
   * and nothing else. Bars only: a bar is a day you can point at, where a
   * line's value between two samples is an interpolation nobody logged.
   */
  readout?: (point: TrendPoint, index: number) => React.ReactNode;
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
  /** The bar being read, while a finger is down on it. */
  const [held, setHeld] = useState<number | null>(null);

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
      <Bars
        points={points}
        accessor={accessor}
        stroke={stroke}
        y={y}
        height={height}
        view={VIEW}
        held={held}
        card={colors.foreground}
      />
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

  /*
   * Scrubbing, which is the touch spelling of the web's hover.
   *
   * A finger is not a cursor: it cannot rest on a bar without also being a tap,
   * and it covers the thing it is pointing at. So the readout is held only
   * while the finger is down and clears on lift — a card left parked over the
   * chart after a tap would be worse than no card at all — and it is drawn
   * above the bars rather than beside them, where the hand is not.
   */
  const active = held !== null && held < points.length ? held : null;
  const pick = (x: number) => {
    const ratio = x / (width || 1);
    setHeld(Math.min(points.length - 1, Math.max(0, Math.floor(ratio * points.length))));
  };

  const scrubbing = readout !== undefined && variant === 'bars';
  const drawn = (width * height) / VIEW;

  return (
    <View
      style={style}
      onLayout={onLayout}
      accessible={scrubbing}
      accessibilityLabel={scrubbing ? 'Chart. Touch and drag to read a day.' : undefined}
      onStartShouldSetResponder={() => scrubbing}
      onMoveShouldSetResponder={() => scrubbing}
      onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
      onResponderMove={(e) => pick(e.nativeEvent.locationX)}
      onResponderRelease={() => setHeld(null)}
      onResponderTerminate={() => setHeld(null)}
    >
      {width > 0 && (
        <Svg width={width} height={drawn} viewBox={`0 0 ${VIEW} ${height}`}>
          {targetLine}
          {body}
        </Svg>
      )}
      {active !== null && readout && (
        <Readout position={(active + 0.5) / points.length} width={width}>
          {readout(points[active]!, active)}
        </Readout>
      )}
    </View>
  );
}

/** The readout's widest allowed size, as a fraction of the chart. */
const READOUT_MAX = 0.7;

/**
 * The card, parked over the top of the chart and anchored to the day under the
 * finger.
 *
 * It slides rather than flips at the ends: the shift runs from 0 at the left
 * edge through half in the middle to the full width at the right, which keeps
 * the card inside the chart without jumping sideways as the finger crosses some
 * threshold. `READOUT_MAX` is what makes that arithmetic safe — a card no wider
 * than that fraction can always be fitted.
 */
function Readout({
  position,
  width,
  children,
}: {
  position: number;
  width: number;
  children: React.ReactNode;
}) {
  const colors = useColors();
  const max = width * READOUT_MAX;
  const left = position * width;
  const shift = Math.min(Math.max(max / 2, left + max - width), left);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.readout,
        {
          left: left - shift,
          maxWidth: max,
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {children}
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
  held,
  card,
}: {
  points: TrendPoint[];
  accessor: 'value' | 'average';
  stroke: string;
  y: (v: number) => number;
  height: number;
  view: number;
  held: number | null;
  card: string;
}) {
  // Leave a hairline of gap between bars, but never let them vanish on a
  // 365-day window — below about a pixel the chart reads as an empty box.
  const slot = view / points.length;
  const barWidth = Math.max(1.5, slot * 0.66);

  return (
    <>
      {/* The whole slot lights up rather than the bar: a rest day has no bar to
          light and still has to be findable. */}
      {held !== null && (
        <Rect
          x={slot * held}
          y={0}
          width={slot}
          height={height}
          rx={Math.min(4, slot / 2)}
          fill={card}
          opacity={0.1}
        />
      )}
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
            opacity={held === null || held === i ? 1 : 0.35}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  readout: {
    position: 'absolute',
    top: 0,
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});

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
