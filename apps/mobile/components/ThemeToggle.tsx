import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useThemePreference, type ThemePreference } from '@/lib/theme-preference';
import { useT, type StringKey } from '@/lib/i18n';
import { font, tint, useColors } from '@/theme';

const OPTIONS: Array<{ value: ThemePreference; label: StringKey }> = [
  { value: 'system', label: 'theme.system' },
  { value: 'light', label: 'theme.light' },
  { value: 'dark', label: 'theme.dark' },
];

/**
 * Three states rather than a switch, because "follow my system" is a real
 * preference and not the absence of one — a plain light/dark toggle silently
 * pins you to whichever you last tapped and stops tracking sunset.
 *
 * The selected one is a raised chunk rather than a filled pill: this is a
 * radio group, and the accent fill used elsewhere for the active item of a
 * segmented control would make one of three equal choices look like the
 * recommended one.
 */
export function ThemeToggle({ onChange }: { onChange?: () => void }) {
  const colors = useColors();
  const tr = useT();
  const { preference, setPreference } = useThemePreference();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={tr('theme.label')}
      style={[
        styles.group,
        {
          backgroundColor: colors.glass,
          borderColor: colors.glassEdge,
          boxShadow: `${colors.shadow}, inset 0px 1px 0px ${colors.glassEdge}`,
        },
      ]}
    >
      {OPTIONS.map(({ value, label }) => {
        const active = preference === value;

        const face = (
          <View style={styles.option}>
            <Glyph
              kind={value}
              color={active ? colors.primaryForeground : colors.mutedForeground}
              weight={active ? 2.6 : 2.1}
            />
            <Text
              style={[
                styles.label,
                { color: active ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {tr(label)}
            </Text>
          </View>
        );

        return (
          <Pressable
            key={value}
            onPress={() => {
              setPreference(value);
              onChange?.();
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            style={styles.slot}
          >
            {active ? (
              // Lit like the chosen segment everywhere else (see `Segments`).
              <View
                style={[
                  styles.active,
                  {
                    backgroundColor: colors.primary,
                    experimental_backgroundImage: colors.primaryRamp,
                    boxShadow: `0px 6px 14px -6px ${tint(colors.calories, 0.8)}, inset 0px 1px 0px rgba(255, 255, 255, 0.45)`,
                  },
                ]}
              >
                {face}
              </View>
            ) : (
              face
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function Glyph({
  kind,
  color,
  weight,
}: {
  kind: ThemePreference;
  color: string;
  weight: number;
}) {
  if (kind === 'system') {
    return (
      <Svg width={15} height={15} viewBox="0 0 24 24">
        <Rect x={2} y={3} width={20} height={14} rx={2} stroke={color} strokeWidth={weight} fill="none" />
        <Path d="M8 21h8M12 17v4" stroke={color} strokeWidth={weight} strokeLinecap="round" fill="none" />
      </Svg>
    );
  }
  if (kind === 'light') {
    return (
      <Svg width={15} height={15} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={weight} fill="none" />
        <Path
          d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          stroke={color}
          strokeWidth={weight}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    );
  }
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', gap: 4, borderWidth: 1, borderRadius: 999, padding: 4 },
  slot: { flex: 1 },
  active: { borderRadius: 999 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  label: { fontFamily: font.bold, fontSize: 13, lineHeight: 18 },
});
