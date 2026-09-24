import { useState } from 'react';
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
    <View style={[styles.segmented, { backgroundColor: colors.hairline }]}>
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
              on && { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge, boxShadow: colors.shadow },
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

/** One figure of a measurement: what is in the box, and what it is measured in. */
export interface MeasurePart {
  key: string;
  value: string;
  unit: string;
  onChangeText: (next: string) => void;
  /**
   * A figure the app put there, not one the reader typed.
   *
   * Drawn in the muted ink until it is touched, which is the whole of how a
   * suggestion is told apart from an answer without a sentence saying so. The
   * alternative — full-strength ink on a number nobody chose — is a walk that
   * quietly builds somebody a plan for a body that is not theirs, and the
   * plan is the one thing on this walk that has to be right.
   *
   * It goes the moment a key is pressed, and it does not come back for a
   * change of units: converting 178 cm into 5'10" is the app carrying an
   * answer across, not proposing a new one.
   */
  provisional?: boolean;
  /** Feet are one digit; a weight in pounds is four including a decimal. */
  maxLength?: number;
  /**
   * Where the keyboard's action key goes. The figures sit above a footer
   * button that rises with the keyboard and hides whatever is below the field
   * being typed in, so each box hands on to the next one itself — height to
   * weight — and the last one moves the walk on, rather than leaving somebody
   * to find a field the button is covering.
   *
   * Android honours both on the decimal pad, as a tab glyph and a tick in the
   * bottom-right key. Neither says what it does, though, which is the half of
   * this the rule under the box is for: the hand-off is a shortcut for anybody
   * who finds it, never the way through.
   */
  inputRef?: React.Ref<TextInput>;
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
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
  parts: MeasurePart[];
  /** Said under the row when the figure is not usable yet. */
  focusHint?: string | null;
}) {
  const colors = useColors();

  return (
    <Chunk depth={3} radius={22} contentStyle={[styles.measure, { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge }]}>
      <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>{label}</Text>

      <View style={styles.measureRow}>
        {parts.map((part) => (
          <Figure key={part.key} part={part} label={label} />
        ))}
      </View>

      {focusHint && (
        <Text style={[t.footnote, { color: colors.destructive }]}>{focusHint}</Text>
      )}
    </Chunk>
  );
}

/**
 * One box of a measurement, and the rule under it that says it is one.
 *
 * The rule is the whole reason this is a component rather than three lines
 * inside the map. Empty, these boxes were a grey em-dash beside a unit — which
 * is exactly how this app draws a figure it is *telling* you: the goal weight
 * on the very next screen is the same serif at the same size, nudged with two
 * buttons and never typed into. So the one question in the walk that asks to be
 * written in looked like a question that had already answered itself. Nothing
 * on the screen carried a caret, the keyboard never came up, and the funnel
 * lost half of everybody who reached it — more than the other five questions
 * lost between them.
 *
 * Underlined, an empty box is a blank to fill in, which is a thing anybody who
 * has seen a form already knows how to read. The rule goes once there is a
 * figure on it and comes back in the accent under the caret, so it only ever
 * says the one thing it is there to say.
 */
function Figure({ part, label }: { part: MeasurePart; label: string }) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const empty = part.value.trim() === '';

  return (
    <View style={styles.measurePart}>
      <TextInput
        value={part.value}
        onChangeText={part.onChangeText}
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={part.maxLength ?? 5}
        ref={part.inputRef}
        returnKeyType={part.returnKeyType}
        onSubmitEditing={part.onSubmitEditing}
        submitBehavior={part.returnKeyType === 'next' ? 'submit' : 'blurAndSubmit'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectTextOnFocus
        placeholder="—"
        placeholderTextColor={withAlpha(colors.mutedForeground, 0.5)}
        accessibilityLabel={`${label} ${part.unit}`}
        style={[
          styles.figure,
          {
            /* Muted while it is only a suggestion — but never while it is being
               edited, where it has to read as the text it now is. */
            color: part.provisional && !focused ? colors.mutedForeground : colors.foreground,
            /*
             * The border is always two points and only sometimes coloured. One
             * that came and went would move the text baseline the unit beside
             * it is aligned to, every time a box was touched.
             */
            borderBottomColor: focused
              ? colors.primary
              : empty
                ? withAlpha(colors.mutedForeground, 0.45)
                : 'transparent',
          },
        ]}
      />
      <Text style={[t.bodySemibold, styles.unit, { color: colors.mutedForeground }]}>
        {part.unit}
      </Text>
    </View>
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
      contentStyle={[styles.nudge, { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge }]}
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentHint: { fontFamily: font.medium, fontSize: 11, lineHeight: 14 },

  measure: { gap: 6, paddingVertical: 16, paddingHorizontal: 18, borderWidth: 1 },
  measureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 18 },
  measurePart: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  /* The serif, like every other number onboarding introduces. */
  figure: {
    fontFamily: font.serifMedium,
    fontSize: 42,
    lineHeight: 50,
    letterSpacing: -0.6,
    minWidth: 72,
    padding: 0,
    /* The blank to fill in. `Figure` colours it; the width never changes. */
    borderBottomWidth: 2,
  },
  unit: { paddingBottom: 4 },

  stepper: { alignItems: 'center', gap: 18 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  stepperValue: { flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: 150, justifyContent: 'center' },
  stepperFigure: { fontFamily: font.serifMedium, fontSize: 56, lineHeight: 66, letterSpacing: -1 },
  nudge: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  caption: { textAlign: 'center' },
});
