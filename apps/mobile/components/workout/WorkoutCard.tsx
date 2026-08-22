import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ChatCard, ExerciseCategory, ExerciseEntry } from '@ct/shared';
import { EXERCISE_CATEGORIES, loadToKg, loadUnit } from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';

/**
 * The question a session prompts, answered in the conversation.
 *
 * A strength session summed to one calorie figure is the least interesting
 * thing about it — the number nobody trained for. What was actually done is the
 * load and the reps, and neither is something a model can guess from "did
 * legs". So the agent asks, and this is the form: one row per exercise, one
 * line per set, and no round trip to a model when it is sent — the card
 * collected everything and the server does arithmetic.
 *
 * `message_id` travels with it so the server can rewrite this message's card
 * into a receipt. Without it, reopening the app shows a question that was
 * answered days ago.
 */

const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  strength: 'Weights',
  cardio: 'Cardio',
  class: 'A class',
  sport: 'Sport',
  flexibility: 'Stretching',
};

interface DraftSet {
  reps: number | null;
  weight: number | null;
}

interface DraftExercise {
  name: string;
  sets: DraftSet[];
}

export function WorkoutCard({
  card,
  messageId,
  onLogged,
  onError,
}: {
  card: Extract<ChatCard, { type: 'workout_prompt' }>;
  messageId: string;
  onLogged: (entry: ExerciseEntry) => void;
  onError: (message: string) => void;
}) {
  const colors = useColors();
  const units = useUnits();

  const [category, setCategory] = useState<ExerciseCategory>(
    card.suggested_category ?? 'strength',
  );
  const [exercises, setExercises] = useState<DraftExercise[]>([
    { name: '', sets: [{ reps: null, weight: null }] },
  ]);
  const [saving, setSaving] = useState(false);

  const named = exercises.filter((e) => e.name.trim().length > 0);
  const canSend = named.length > 0 && !saving;

  function patch(index: number, next: Partial<DraftExercise>) {
    setExercises((prev) => prev.map((e, i) => (i === index ? { ...e, ...next } : e)));
  }

  function patchSet(exercise: number, set: number, next: Partial<DraftSet>) {
    setExercises((prev) =>
      prev.map((e, i) =>
        i === exercise ? { ...e, sets: e.sets.map((s, j) => (j === set ? { ...s, ...next } : s)) } : e,
      ),
    );
  }

  async function send() {
    setSaving(true);
    try {
      const entry = await api.logWorkout({
        category,
        performed_at: card.performed_at,
        message_id: messageId,
        exercises: named.map((e) => ({
          name: e.name.trim(),
          // A set with nothing in it is a row somebody added and did not fill,
          // not a set of zero reps — dropping it is the honest reading.
          sets: e.sets
            .filter((s) => s.reps !== null || s.weight !== null)
            .map((s) => ({
              reps: s.reps,
              weight_kg: s.weight === null ? null : loadToKg(s.weight, units),
            })),
        })).filter((e) => e.sets.length > 0),
      });
      onLogged(entry);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Chunk
      contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Text style={[t.bodyBold, { color: colors.foreground }]}>What did you do?</Text>
      {card.heard && (
        <Text style={[t.footnote, styles.heard, { color: colors.mutedForeground }]}>
          {card.heard}
        </Text>
      )}

      <View style={styles.categories}>
        {EXERCISE_CATEGORIES.map((key) => {
          const on = category === key;
          return (
            <Pressable
              key={key}
              onPress={() => setCategory(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [
                styles.category,
                {
                  backgroundColor: on ? colors.primary : colors.muted,
                  borderColor: on ? 'transparent' : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.categoryLabel,
                  { color: on ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {CATEGORY_LABEL[key]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {exercises.map((exercise, i) => (
        <View key={i} style={[styles.exercise, { borderTopColor: colors.border }]}>
          <TextInput
            value={exercise.name}
            onChangeText={(name) => patch(i, { name })}
            placeholder="Exercise — “bench press”"
            placeholderTextColor={colors.mutedForeground}
            style={[
              t.bodySemibold,
              styles.name,
              {
                backgroundColor: colors.mutedField,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />

          {exercise.sets.map((set, j) => (
            <View key={j} style={styles.setRow}>
              <Text style={[t.footnote, styles.setNumber, { color: colors.mutedForeground }]}>
                {j + 1}
              </Text>
              <Cell
                value={set.reps}
                onChange={(reps) => patchSet(i, j, { reps })}
                unit="reps"
              />
              <Cell
                value={set.weight}
                onChange={(weight) => patchSet(i, j, { weight })}
                unit={loadUnit(units)}
                decimal
              />
            </View>
          ))}

          <Pressable
            onPress={() => patch(i, { sets: [...exercise.sets, { reps: null, weight: null }] })}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [styles.addSet, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Svg width={13} height={13} viewBox="0 0 24 24">
              <Path
                d="M12 5v14M5 12h14"
                stroke={colors.mutedForeground}
                strokeWidth={2.6}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>another set</Text>
          </Pressable>
        </View>
      ))}

      <View style={[styles.foot, { borderTopColor: colors.border }]}>
        <Pressable
          onPress={() =>
            setExercises((prev) => [...prev, { name: '', sets: [{ reps: null, weight: null }] }])
          }
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => [styles.addSet, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Svg width={13} height={13} viewBox="0 0 24 24">
            <Path
              d="M12 5v14M5 12h14"
              stroke={colors.mutedForeground}
              strokeWidth={2.6}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            another exercise
          </Text>
        </Pressable>

        <PressableChunk
          depth={3}
          radius={999}
          color={colors.caloriesDeep}
          onPress={() => void send()}
          disabled={!canSend}
          accessibilityRole="button"
          style={{ opacity: canSend ? 1 : 0.4 }}
          contentStyle={[styles.send, { backgroundColor: colors.primary }]}
        >
          <Text style={[t.footnoteBold, { color: colors.primaryForeground }]}>
            {saving ? 'Logging…' : 'Log it'}
          </Text>
        </PressableChunk>
      </View>
    </Chunk>
  );
}

function Cell({
  value,
  onChange,
  unit,
  decimal,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  unit: string;
  decimal?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.cell, { backgroundColor: colors.mutedField, borderColor: colors.border }]}>
      <TextInput
        value={value === null ? '' : String(value)}
        onChangeText={(next) => {
          const cleaned = next.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
          onChange(cleaned === '' ? null : Number(cleaned));
        }}
        placeholder="—"
        placeholderTextColor={colors.mutedForeground}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        style={[styles.cellInput, { color: colors.foreground }]}
      />
      <Text style={[t.footnote, { color: colors.mutedForeground }]}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14 },
  heard: { marginTop: 4, lineHeight: 20 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  category: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  categoryLabel: { fontFamily: font.bold, fontSize: 13, lineHeight: 18 },
  exercise: { borderTopWidth: 2, marginTop: 12, paddingTop: 12, gap: 8 },
  name: {
    height: 40,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setNumber: { width: 16 },
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    height: 36,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  cellInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.display,
    fontSize: 15,
    textAlign: 'right',
    paddingVertical: 0,
  },
  addSet: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 2,
    marginTop: 12,
    paddingTop: 12,
  },
  send: { height: 36, borderRadius: 999, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
});
