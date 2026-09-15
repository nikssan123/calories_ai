import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { PressableChunk } from '@/components/Chunk';
import { haptics } from '@/lib/haptics';
import { type as t, useColors, withAlpha } from '@/theme';
import { EdgePeek } from '@/components/cast/Presence';

/**
 * One answer, as an object you press.
 *
 * The whole argument for replacing the conversation with a form rests on this
 * control, so it is worth saying what it has to do: be unmistakably pressable,
 * be unmistakably chosen once it is, and be large enough that answering six
 * questions never requires aim. It is the app's own chunk — the same ledge and
 * the same sink as every other pressable surface — rather than a radio row,
 * because a radio row is a settings screen and this is not one.
 *
 * It is glass over the onboarding light rather than a white card, so the
 * warmth behind the question comes through the answers too; chosen, it turns
 * nearly opaque and glows green from underneath.
 *
 * The selected state is carried by three things at once, which is one more
 * than looks necessary and exactly as many as it takes: a glowing ground, a
 * green edge, and a filled tick. Colour alone fails for the reader who
 * cannot separate the green from the cream, the border alone is invisible at
 * arm's length, and the tick alone reads as decoration until you go looking
 * for it. Together, none of them is load-bearing on its own.
 */
export function OptionCard({
  label,
  hint,
  selected,
  onPress,
  icon,
}: {
  label: string;
  /** The line under it. What the option actually means, in their words. */
  hint?: string;
  selected: boolean;
  onPress: () => void;
  /** Drawn at 26pt on the left. Optional — half the steps read better bare. */
  icon?: React.ReactNode;
}) {
  const colors = useColors();

  return (
    <View>
      {/* Picked: Skye looks over the top of the card and waves. It answers the
          choice, never what the choice is (CAST.md). */}
      <EdgePeek shown={selected} />
      <PressableChunk
        depth={selected ? 6 : 3}
        radius={22}
        color={selected ? colors.calories : undefined}
        haptic={false}
        onPress={() => {
          haptics.selected();
          onPress();
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={hint ? `${label}. ${hint}` : label}
        contentStyle={[
          styles.face,
          {
            backgroundColor: selected ? colors.glassStrong : colors.glass,
            borderColor: selected ? withAlpha(colors.primary, 0.7) : colors.glassEdge,
            borderWidth: 1.5,
          },
        ]}
      >
        {icon && <View style={styles.icon}>{icon}</View>}

        <View style={styles.text}>
          <Text style={[t.bodyBold, styles.label, { color: colors.foreground }]}>{label}</Text>
          {hint && (
            <Text style={[t.footnote, { color: colors.mutedForeground }]} numberOfLines={2}>
              {hint}
            </Text>
          )}
        </View>

        <Tick on={selected} />
      </PressableChunk>
    </View>
  );
}

/**
 * The mark in the corner.
 *
 * Always drawn, never conditionally mounted: an empty ring in the unselected
 * state is what makes the row legible as one of a set you choose between,
 * rather than as a button that happens to do something when pressed. It is
 * also what stops the label reflowing by 30pt the moment anything is picked.
 */
function Tick({ on }: { on: boolean }) {
  const colors = useColors();
  const id = `tick-${useId().replace(/:/g, '')}`;
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.calories} />
          <Stop offset="1" stopColor={colors.logoRamp} />
        </LinearGradient>
      </Defs>
      <Circle
        cx={12}
        cy={12}
        r={10.4}
        fill={on ? `url(#${id})` : 'none'}
        stroke={on ? colors.primary : colors.input}
        strokeWidth={on ? 0 : 2}
      />
      {on && (
        <Path
          d="M7.6 12.2l3 3 5.8-6"
          stroke={colors.primaryForeground}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 74,
    paddingVertical: 15,
    paddingHorizontal: 17,
  },
  label: { fontSize: 17 },
  icon: { width: 26, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
});
