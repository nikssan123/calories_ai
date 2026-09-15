import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';
import { Character } from './Character';

/**
 * The empty plate, with the three looking over its rim.
 *
 * For a day with nothing in it yet. It replaced a lone plate icon, which said
 * "empty" and nothing else. Three faces peeking over the edge say it is early,
 * which is true of most empty days.
 *
 * The figures are drawn first and the plate over them, so the rim cuts them off
 * at the chest. Laid out on a 210 × 104 grid and scaled whole, so it keeps its
 * composition at any width.
 */
const W = 210;
const H = 104;

const PLATE = {
  light: { ramp: ['#ffffff', '#f6efe4', '#e3d6c4'], rim: '#eadcc9', shadow: 'rgba(120, 80, 20, 0.14)' },
  dark: { ramp: ['#ebe2d6', '#d3c5b3', '#a99784'], rim: '#bfb09c', shadow: 'rgba(0, 0, 0, 0.4)' },
} as const;

export function CastPlate({ width = W }: { width?: number }) {
  const { scheme } = useTheme();
  const id = useId().replace(/:/g, '');
  const s = width / W;
  const plate = PLATE[scheme];

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height: H * s }}
    >
      <Character name="ember" mood="idle" size={62 * s} shadow={false} style={[styles.at, { left: 34 * s, top: 18 * s }]} />
      <Character name="skye" mood="wave" size={62 * s} shadow={false} delay={400} style={[styles.at, { left: 74 * s, top: 9 * s }]} />
      <Character name="plum" mood="hopeful" size={62 * s} shadow={false} delay={900} style={[styles.at, { left: 114 * s, top: 19 * s }]} />

      <Svg width={width} height={H * s} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`${id}-p`} cx="0.45" cy="0.35" r="0.75">
            <Stop offset="0" stopColor={plate.ramp[0]} />
            <Stop offset="0.7" stopColor={plate.ramp[1]} />
            <Stop offset="1" stopColor={plate.ramp[2]} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={105} cy={88} rx={92} ry={16} fill={plate.shadow} />
        <Ellipse cx={105} cy={80} rx={92} ry={19} fill={`url(#${id}-p)`} />
        <Ellipse cx={105} cy={78} rx={62} ry={11} fill="none" stroke={plate.rim} strokeWidth={1.6} />
        <Ellipse cx={80} cy={73} rx={20} ry={3} fill="#ffffff" opacity={0.7} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  at: { position: 'absolute' },
});
