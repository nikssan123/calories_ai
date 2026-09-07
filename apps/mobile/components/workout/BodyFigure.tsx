import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';
import type { BodyShape, BodyView, MuscleGroup } from '@ct/shared';
import {
  BODY_MAP_BOX,
  BODY_REGIONS,
  FIGURE_BOX,
  FIGURE_OFFSET,
  FIGURE_PARTS,
  MUSCLE_GROUPS,
  litRegions,
  muscleLabel,
  muscleOnView,
  viewForMuscles,
} from '@ct/shared';
import { withAlpha, useColors } from '@/theme';

/**
 * An exercise drawn as the muscles it works.
 *
 * The catalogue has five emoji across two hundred and twenty exercises, so 🏋️
 * says "strength" and every barbell lift wears it — the picker was a wall of
 * identical glyphs and no amount of choosing better emoji fixes it, because
 * there is no emoji for a Romanian deadlift.
 *
 * `muscles` is already on every row, primary first. Painting it onto a body
 * gives all two hundred and twenty a different icon for no assets, in both
 * themes, and it stays right when the catalogue grows. It also answers the more
 * useful question: somebody who cannot tell a good morning from a rack pull by
 * name reads "the back of your legs" at a glance.
 *
 * Geometry is in `@ct/shared` so the phone and the web cannot disagree about
 * where a deltoid is. This file is only the `react-native-svg` half of it.
 */

/** How wide the icon is drawn. The height follows from the figure's aspect. */
const heightFor = (width: number) => Math.round((width * FIGURE_BOX.height) / FIGURE_BOX.width);

function Shapes({ shapes, fill }: { shapes: readonly BodyShape[]; fill: string }) {
  return (
    <>
      {shapes.map(([x, y, w, h, r], i) => (
        <Rect key={i} x={x} y={y} width={w} height={h} rx={r} ry={r} fill={fill} />
      ))}
    </>
  );
}

function Silhouette({ x, fill }: { x: number; fill: string }) {
  const [cx, cy, r] = FIGURE_PARTS.head;
  return (
    // A transform string rather than the `x` prop: `x` on a `G` is the
    // deprecated spelling in react-native-svg 15 and warns.
    <G transform={`translate(${x}, 0)`}>
      <Circle cx={cx} cy={cy} r={r} fill={fill} />
      <Shapes shapes={FIGURE_PARTS.blocks} fill={fill} />
    </G>
  );
}

/**
 * One figure, lit for one exercise.
 *
 * Which side is shown is decided by the primary muscle rather than offered as a
 * choice — at twenty-four points there is room for one body, and the primary is
 * the thing the exercise is chosen for.
 */
export const BodyFigure = memo(function BodyFigure({
  muscles,
  size = 24,
  view,
}: {
  /** Primary first, exactly as the catalogue stores it. */
  muscles: readonly MuscleGroup[];
  size?: number;
  /** Overrides the side the primary muscle would pick. */
  view?: BodyView;
}) {
  const colors = useColors();
  if (muscles.length === 0) return null;

  const shown = view ?? viewForMuscles(muscles);
  const lit = litRegions(muscles, shown);
  const label = muscles.map(muscleLabel).join(', ');

  return (
    <Svg
      width={size}
      height={heightFor(size)}
      viewBox={`0 0 ${FIGURE_BOX.width} ${FIGURE_BOX.height}`}
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Silhouette x={0} fill={colors.border} />
      {lit.map((region, i) => (
        <Shapes
          key={i}
          shapes={region.shapes}
          // Primary solid, everything else faded. An exercise that lit four
          // muscles equally would say "compound" and nothing more; the
          // secondaries are what separates a chin-up from a lat pulldown.
          fill={region.primary ? colors.exercise : withAlpha(colors.exercise, 0.34)}
        />
      ))}
    </Svg>
  );
});

/**
 * Both figures, every muscle a target.
 *
 * The picker's front door, and the reason this component exists rather than
 * just the icon. Plenty of people know they trained biceps and do not know that
 * the machine was called a preacher curl — for them a search box is a locked
 * door, and pointing at an arm is the whole interaction.
 *
 * The chip row beside it in the picker is not a fallback nobody uses: it is the
 * text path, for a screen reader and for anyone who would rather read the word.
 * Both set the same filter.
 */
export const BodyMap = memo(function BodyMap({
  active,
  onPick,
  width,
}: {
  active: MuscleGroup | null;
  onPick: (muscle: MuscleGroup) => void;
  width: number;
}) {
  const colors = useColors();
  const height = Math.round((width * BODY_MAP_BOX.height) / BODY_MAP_BOX.width);

  return (
    <View style={styles.map}>
      <Svg width={width} height={height} viewBox={`0 0 ${BODY_MAP_BOX.width} ${BODY_MAP_BOX.height}`}>
        <Silhouette x={FIGURE_OFFSET.front} fill={colors.border} />
        <Silhouette x={FIGURE_OFFSET.back} fill={colors.border} />

        {MUSCLE_GROUPS.map((muscle) =>
          (['front', 'back'] as const).map((side) => {
            if (!muscleOnView(muscle, side)) return null;
            const on = active === muscle;
            return (
              <G
                key={`${muscle}-${side}`}
                transform={`translate(${FIGURE_OFFSET[side]}, 0)`}
                onPress={() => onPick(muscle)}
                accessibilityRole="button"
                accessibilityLabel={muscleLabel(muscle)}
                accessibilityState={{ selected: on }}
              >
                {BODY_REGIONS[muscle].shapes.map(([x, y, w, h, r], i) => (
                  <Rect
                    key={i}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={r}
                    ry={r}
                    fill={on ? colors.exercise : colors.foreground}
                    // An untouched region is invisible but still a target. A
                    // `fill` of `none` is not hit-tested by react-native-svg, so
                    // the alternative to this is a body you cannot tap.
                    fillOpacity={on ? 1 : 0.001}
                  />
                ))}
              </G>
            );
          }),
        )}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  map: { alignItems: 'center' },
});
