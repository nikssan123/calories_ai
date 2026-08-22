import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { font, type as t, useColors } from '@/theme';

/**
 * How much of it you actually ate.
 *
 * A recipe without this quietly assumes one serving, which is wrong often
 * enough to matter: a traybake that makes four gets eaten two at a time, and
 * half a portion is what is left at nine o'clock. Logging 300 kcal when someone
 * ate 600 is the failure mode the whole app exists to avoid, and it is worse
 * than not logging at all — a wrong number is trusted, a missing one is not.
 *
 * Halves rather than free text. A stepper cannot be given nonsense, needs no
 * keyboard, and "1½ portions" is as fine-grained as anybody's estimate of what
 * they ate actually is — three decimal places would be false precision.
 */

export const SERVING_STEP = 0.5;
export const MAX_SERVINGS = 12;

export function Servings({
  value,
  onChange,
  unit,
  style,
}: {
  value: number;
  onChange: (next: number) => void;
  /** What one of them is, in the recipe's own words. */
  unit: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const step = (delta: number) =>
    onChange(clamp(Math.round((value + delta) / SERVING_STEP) * SERVING_STEP));

  return (
    <View style={[styles.row, style]}>
      <View style={styles.label}>
        <Text style={[t.body, { color: colors.foreground }]}>How much did you have?</Text>
        <Text numberOfLines={1} style={[t.footnote, { color: colors.mutedForeground }]}>
          {formatServings(value)} × {unit}
        </Text>
      </View>

      <View style={[styles.stepper, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Step
          sign="minus"
          onPress={() => step(-SERVING_STEP)}
          disabled={value <= SERVING_STEP}
          label="Less"
        />
        <Text
          accessibilityLabel={`${formatServings(value)} servings`}
          style={[t.figure, styles.count, { color: colors.foreground }]}
        >
          {formatServings(value)}
        </Text>
        <Step
          sign="plus"
          onPress={() => step(SERVING_STEP)}
          disabled={value >= MAX_SERVINGS}
          label="More"
        />
      </View>
    </View>
  );
}

function Step({
  sign,
  onPress,
  disabled,
  label,
}: {
  sign: 'minus' | 'plus';
  onPress: () => void;
  disabled: boolean;
  label: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.step, { opacity: disabled ? 0.4 : pressed ? 0.5 : 1 }]}
    >
      <Svg width={15} height={15} viewBox="0 0 24 24">
        <Path
          d={sign === 'plus' ? 'M12 5v14M5 12h14' : 'M5 12h14'}
          stroke={colors.mutedForeground}
          strokeWidth={2.6}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

function clamp(n: number): number {
  return Math.min(MAX_SERVINGS, Math.max(SERVING_STEP, n));
}

/** "½", "1½", "2" — a fraction reads faster than 1.5 at this size. */
export function formatServings(value: number): string {
  const whole = Math.floor(value);
  const half = value - whole >= 0.25;
  if (whole === 0) return '½';
  return half ? `${whole}½` : String(whole);
}

/** Macros for `servings` of something priced per serving. */
export function scale(perServing: number, servings: number): number {
  return perServing * servings;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { flexShrink: 1, minWidth: 0 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 999 },
  step: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  count: { width: 40, textAlign: 'center', fontSize: 16, lineHeight: 24, fontFamily: font.display },
});
