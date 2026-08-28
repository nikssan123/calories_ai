import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { font, type as t, useColors, withAlpha } from '@/theme';
import { haptics } from '@/lib/haptics';

/**
 * The numeric side of setup.
 *
 * Three controls, and the reason they are here rather than reused from
 * `components/Field.tsx` is a difference in job rather than in taste. Those are
 * settings-screen fields: small, right-aligned, sitting in a row beside a
 * label, built to be scanned past. These are the only thing on their screen,
 * and the number is the screen's subject — so it is set in the display face at
 * four times the body size, and the unit is a quiet noun beside it rather than
 * a suffix inside the box.
 */

/**
 * Metric or imperial, as two halves of one object.
 *
 * This is not really a preference question and it is deliberately not asked as
 * one. It is here because the next control cannot be drawn without an answer,
 * and putting it on the same screen as the height and the weight is what keeps
 * it from becoming a step of its own — the old conversation made exactly that
 * argument about the sentence it asked units in, and it survives the move to a
 * form intact.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  const colors = useColors();

  return (
    <View style={[styles.segmented, { backgroundColor: colors.muted }]}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (on) return;
              haptics.selected();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [
              styles.segment,
              on && { backgroundColor: colors.card, borderColor: colors.border },
              { opacity: pressed && !on ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[
                t.footnoteBold,
                { color: on ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {option.label}
            </Text>
            {option.hint && (
              <Text style={[styles.segmentHint, { color: colors.mutedForeground }]}>
                {option.hint}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A measurement: what it is, the figure, and the unit it is in.
 *
 * `parts` rather than one field, because imperial height is two numbers and
 * pretending otherwise produces the worst control on any of these screens —
 * a decimal foot. Each part carries its own unit, so `5 ft 10 in` reads as a
 * height and not as a pair of unrelated boxes.
 */
export function Measure({
  label,
  parts,
  focusHint,
}: {
  label: string;
  parts: {
    key: string;
    value: string;
    unit: string;
    onChangeText: (next: string) => void;
    /** Feet are one digit; a weight in pounds is four including a decimal. */
    maxLength?: number;
    autoFocus?: boolean;
  }[];
  /** Said under the row when the figure is not usable yet. */
  focusHint?: string | null;
}) {
  const colors = useColors();

  return (
    <Chunk depth={3} radius={20} contentStyle={[styles.measure, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>{label}</Text>

      <View style={styles.measureRow}>
        {parts.map((part) => (
          <View key={part.key} style={styles.measurePart}>
            <TextInput
              value={part.value}
              onChangeText={part.onChangeText}
              keyboardType="decimal-pad"
              inputMode="decimal"
              maxLength={part.maxLength ?? 5}
              autoFocus={part.autoFocus}
              selectTextOnFocus
              placeholder="—"
              placeholderTextColor={withAlpha(colors.mutedForeground, 0.5)}
              accessibilityLabel={`${label} ${part.unit}`}
              style={[styles.figure, { color: colors.foreground }]}
            />
            <Text style={[t.bodySemibold, styles.unit, { color: colors.mutedForeground }]}>
              {part.unit}
            </Text>
          </View>
        ))}
      </View>

      {focusHint && (
        <Text style={[t.footnote, { color: colors.destructive }]}>{focusHint}</Text>
      )}
    </Chunk>
  );
}

/**
 * A number you nudge rather than type.
 *
 * Used for the goal weight, which is the one figure on these screens nobody
 * knows to the digit — it is arrived at by moving away from where you are now
 * and seeing how it looks. A keyboard is the wrong instrument for that: it
 * asks for a decision before showing you what the decision costs, and it
 * covers the very line that says so.
 */
export function Stepper({
  value,
  unit,
  step,
  onChange,
  caption,
  min,
  max,
}: {
  value: number;
  unit: string;
  step: number;
  onChange: (next: number) => void;
  /** The line underneath — how far this is from where they are now. */
  caption?: string;
  min: number;
  max: number;
}) {
  const colors = useColors();

  const nudge = (delta: number) => {
    const next = Math.min(max, Math.max(min, Math.round((value + delta) * 10) / 10));
    if (next === value) return;
    onChange(next);
  };

  return (
    <View style={styles.stepper}>
      <View style={styles.stepperRow}>
        <Nudge sign="minus" onPress={() => nudge(-step)} disabled={value <= min} />

        <View style={styles.stepperValue}>
          <Text style={[styles.stepperFigure, { color: colors.foreground }]}>
            {formatFigure(value)}
          </Text>
          <Text style={[t.bodySemibold, styles.unit, { color: colors.mutedForeground }]}>
            {unit}
          </Text>
        </View>

        <Nudge sign="plus" onPress={() => nudge(step)} disabled={value >= max} />
      </View>

      {caption && (
        <Text style={[t.bodySemibold, styles.caption, { color: colors.caloriesText }]}>
          {caption}
        </Text>
      )}
    </View>
  );
}

/** One trailing digit, and none at all when it would be a zero. */
function formatFigure(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function Nudge({
  sign,
  onPress,
  disabled,
}: {
  sign: 'minus' | 'plus';
  onPress: () => void;
  disabled: boolean;
}) {
  const colors = useColors();
  return (
    <PressableChunk
      depth={3}
      radius={999}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sign}
      style={{ opacity: disabled ? 0.35 : 1 }}
      contentStyle={[styles.nudge, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path
          d={sign === 'minus' ? 'M5 12h14' : 'M12 5v14M5 12h14'}
          stroke={colors.foreground}
          strokeWidth={2.6}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </PressableChunk>
  );
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', borderRadius: 999, padding: 4, gap: 4, marginBottom: 20 },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  segmentHint: { fontFamily: font.medium, fontSize: 11, lineHeight: 14 },

  measure: { gap: 6, paddingVertical: 16, paddingHorizontal: 18, borderWidth: 2 },
  measureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 18 },
  measurePart: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  figure: {
    fontFamily: font.display,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.5,
    minWidth: 72,
    padding: 0,
  },
  unit: { paddingBottom: 4 },

  stepper: { alignItems: 'center', gap: 18 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  stepperValue: { flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: 150, justifyContent: 'center' },
  stepperFigure: { fontFamily: font.display, fontSize: 52, lineHeight: 60, letterSpacing: -0.8 },
  nudge: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  caption: { textAlign: 'center' },
});
