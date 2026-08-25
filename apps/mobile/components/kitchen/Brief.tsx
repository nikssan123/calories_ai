import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Meal, RecipeBrief } from '@ct/shared';
import { NumberField } from '@/components/Field';
import { useT, type StringKey } from '@/lib/i18n';
import { font, type as t, useColors } from '@/theme';

/**
 * What you need from the kitchen this time.
 *
 * Behind a sheet by default, and that is the important part: the useful default
 * is still "just tell me what I could cook", and a screen that opens with six
 * empty fields asks people to specify things they do not care about before they
 * are allowed to see anything. Everything here refines an answer they can
 * already get by pressing the button.
 *
 * What you never eat is not here — it belongs on the profile, because it is
 * true of every meal and should not have to be restated each time.
 */

const MINUTES = [15, 30, 60] as const;
const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** The meal chips say what the rest of the app says. See the web twin. */
const MEAL_KEYS: Record<Meal, StringKey> = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  dinner: 'meal.dinner',
  snack: 'meal.snack',
};

/**
 * How many fields are actually constraining the answer.
 *
 * `wants` counts, and that matters more than the other five: it is the only one
 * that persists as a *sentence* rather than a chip, so a craving typed on
 * Tuesday would otherwise still be steering Friday's dinner with nothing on
 * screen to say so. The badge on the shut sheet is the whole safeguard.
 */
export function briefCount(value: RecipeBrief): number {
  return [
    value.wants?.trim() ? value.wants : null,
    value.minutes,
    value.meal,
    value.portions,
    value.protein_min,
    value.kcal_max,
  ].filter((v) => v !== null && v !== undefined && v !== '').length;
}

/**
 * The trigger, which sits next to the button it modifies.
 *
 * That pairing is deliberate: "find me something" and "but like this" are the
 * same thought. The count rides along so a shut sheet never hides a setting
 * somebody forgot they left on.
 */
export function BriefToggle({ value, onPress }: { value: RecipeBrief; onPress: () => void }) {
  const colors = useColors();
  const tr = useT();
  const active = briefCount(value);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.toggle,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Svg width={13} height={13} viewBox="0 0 24 24">
        <Path
          d="M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M7 16v4"
          stroke={colors.mutedForeground}
          strokeWidth={2.2}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <Text style={[t.footnote, { color: colors.mutedForeground }]}>
        {tr('cook.anythingSpecific')}
      </Text>
      {active > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[styles.badgeText, { color: colors.secondaryForeground }]}>{active}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Brief({
  value,
  onChange,
}: {
  value: RecipeBrief;
  onChange: (next: RecipeBrief) => void;
}) {
  const colors = useColors();
  const tr = useT();
  const set = (patch: Partial<RecipeBrief>) => onChange({ ...value, ...patch });

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
      {/*
        The free-text steer, and the reason it is in here rather than on the
        screen. Out there it read as a second search box nobody could explain;
        in here its job is obvious from its company — it is the row for the
        constraints that were never going to be an enum. "One-pan" is not a chip.
      */}
      <View>
        <Text style={[t.footnote, styles.label, { color: colors.mutedForeground }]}>
          {tr('brief.anythingElse')}
        </Text>
        <TextInput
          value={value.wants ?? ''}
          onChangeText={(next) => set({ wants: next || undefined })}
          maxLength={300}
          placeholder={tr('brief.wantsPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          style={[
            t.body,
            styles.wants,
            {
              backgroundColor: colors.mutedField,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
        />
      </View>

      <Row label={tr('brief.time')}>
        {MINUTES.map((m) => (
          <Chip
            key={m}
            on={value.minutes === m}
            onPress={() => set({ minutes: value.minutes === m ? null : m })}
            label={tr('brief.minutes')(m)}
          />
        ))}
      </Row>

      <Row label={tr('brief.meal')}>
        {MEALS.map((m) => (
          <Chip
            key={m}
            on={value.meal === m}
            onPress={() => set({ meal: value.meal === m ? null : m })}
            label={tr(MEAL_KEYS[m])}
          />
        ))}
      </Row>

      {/* More than one portion is batch prep: the quantities scale and the
          macros stay per portion, so cooking four and eating one logs exactly
          what it logged before. */}
      <Row label={tr('brief.cook')}>
        {[1, 2, 4].map((p) => (
          <Chip
            key={p}
            on={(value.portions ?? 1) === p}
            onPress={() => set({ portions: p === 1 ? null : p })}
            label={p === 1 ? tr('brief.justTonight') : tr('brief.portions')(p)}
          />
        ))}
      </Row>

      <View style={styles.numbers}>
        <View style={styles.number}>
          <Text style={[t.footnote, styles.label, { color: colors.mutedForeground }]}>
            {tr('brief.proteinAtLeast')}
          </Text>
          <NumberField
            value={value.protein_min ?? null}
            onChange={(n) => set({ protein_min: n })}
            unit="g"
            style={styles.numberField}
          />
        </View>
        <View style={styles.number}>
          <Text style={[t.footnote, styles.label, { color: colors.mutedForeground }]}>
            {tr('brief.caloriesAtMost')}
          </Text>
          <NumberField
            value={value.kcal_max ?? null}
            onChange={(n) => set({ kcal_max: n })}
            unit="kcal"
            style={styles.numberField}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View>
      <Text style={[t.footnote, styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: on ? colors.primary : colors.muted,
          borderColor: on ? 'transparent' : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          { color: on ? colors.primaryForeground : colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Matches Cook's other ways in — see the note on `way` there.
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontFamily: font.bold, fontSize: 11, lineHeight: 15 },
  body: { paddingHorizontal: 20, paddingVertical: 12, gap: 14 },
  label: { marginBottom: 6 },
  wants: {
    height: 44,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipLabel: { fontFamily: font.bold, fontSize: 13, lineHeight: 18, textTransform: 'capitalize' },
  numbers: { flexDirection: 'row', gap: 12 },
  number: { flex: 1 },
  numberField: { width: '100%' },
});
