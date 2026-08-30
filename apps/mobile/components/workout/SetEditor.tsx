import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ExerciseTracks, UnitSystem } from '@ct/shared';
import { distanceUnit, loadStep, loadUnit } from '@ct/shared';
import { haptics } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import { font, type as t, useColors } from '@/theme';
import {
  blankSet,
  resize,
  round,
  setEvery,
  uniformSet,
  type DraftExercise,
  type DraftSet,
} from './draft';

/**
 * One exercise in the card.
 *
 * The shape this replaced drew one row per set, each row two number pads: nine
 * fields for "three sets of ten at sixty", holding two distinct numbers. That
 * is the right form for a session where every set is different and the wrong
 * one for the ninety percent where they are not — and it was being paid on
 * every session because it was the only form there was.
 *
 * So there are three states here, and which one you land in is decided for you:
 *
 *   **summary** — the numbers are already right, usually because they came from
 *   the last time you did this. Nothing to do; the line just says what will be
 *   logged. Tapping it opens the steppers.
 *
 *   **steppers** — sets, reps and load, moving by the amount a real one moves.
 *   Where an exercise is edited, and where it starts when there is no history
 *   to accept.
 *
 *   **grid** — one row per set, which is the old card exactly. Reached by
 *   asking for it, and reached automatically the moment two sets disagree,
 *   because a drop set is precisely what the summary cannot describe.
 *
 * The model underneath never changes: always one row per set, always written
 * out in full. See `draft.ts`.
 */
export function SetEditor({
  exercise,
  units,
  onChange,
  onRemove,
}: {
  exercise: DraftExercise;
  units: UnitSystem;
  onChange: (next: DraftExercise) => void;
  onRemove: () => void;
}) {
  const colors = useColors();
  const tr = useT();

  const uniform = uniformSet(exercise.sets);
  const [asked, setAsked] = useState<'summary' | 'steppers' | 'grid'>(() =>
    uniform !== null && filled(uniform) ? 'summary' : 'steppers',
  );
  // Two sets that disagree cannot be summarised or stepped, whatever was asked
  // for — so the grid wins outright rather than the line quietly lying.
  const mode = uniform === null ? 'grid' : asked;

  const previous = uniformSet(exercise.previous);
  const step = loadStep(units);

  function patchEvery(patch: Partial<DraftSet>) {
    onChange(setEvery(exercise, patch));
  }

  function patchSet(index: number, patch: Partial<DraftSet>) {
    onChange({
      ...exercise,
      sets: exercise.sets.map((set, i) => (i === index ? { ...set, ...patch } : set)),
    });
  }

  return (
    <View style={[styles.exercise, { borderTopColor: colors.border }]}>
      <View style={styles.head}>
        <Text style={[t.bodySemibold, styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {exercise.emoji} {exercise.name}
        </Text>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={tr('workout.removeNamed')(exercise.name)}
          hitSlop={8}
        >
          <Cross color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/*
        What they did last time, printed rather than merely used.

        Hevy autofills the fields and the number becomes indistinguishable from
        one somebody entered. A prefilled figure is a claim you *accepted*, not
        one you made, and this app says where its numbers come from everywhere
        else — `confidence` on every entry, "partly measured" on a day total.
        It is also the more useful of the two: the line you are trying to beat
        is the line you want on screen while you decide.
      */}
      {previous !== null && filled(previous) && (
        <Text style={[t.footnote, { color: colors.mutedForeground }]}>
          {tr('workout.lastTime')(
            summarise(exercise.previous, previous, exercise.tracks, units, tr),
          )}
        </Text>
      )}

      {mode === 'summary' && uniform !== null && (
        <Pressable
          onPress={() => {
            haptics.press();
            setAsked('steppers');
          }}
          accessibilityRole="button"
          accessibilityLabel={tr('workout.adjust')}
          style={({ pressed }) => [
            styles.summary,
            {
              backgroundColor: colors.mutedField,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.figure, { color: colors.foreground }]}>
            {summarise(exercise.sets, uniform, exercise.tracks, units, tr)}
          </Text>
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            {tr('workout.adjust')}
          </Text>
        </Pressable>
      )}

      {mode === 'steppers' && uniform !== null && (
        <>
          <View style={styles.steppers}>
            {/* A run is one effort, not three, and a sets stepper on it is a
                control nobody reaches for. Intervals go in the grid. */}
            {exercise.tracks !== 'distance' && (
              <Stepper
                value={exercise.sets.length}
                caption={tr('workout.setsLabel')}
                step={1}
                min={1}
                max={30}
                onChange={(count) => onChange(resize(exercise, count ?? 1))}
              />
            )}
            {exercise.tracks === 'reps' && (
              <>
                <Stepper
                  value={uniform.reps}
                  caption={tr('workout.reps')}
                  step={1}
                  min={0}
                  max={999}
                  onChange={(reps) => patchEvery({ reps })}
                />
                <Stepper
                  value={uniform.weight}
                  caption={loadUnit(units)}
                  step={step}
                  min={0}
                  max={999}
                  decimal
                  onChange={(weight) => patchEvery({ weight })}
                />
              </>
            )}
            {exercise.tracks === 'duration' && (
              <Stepper
                value={uniform.minutes}
                caption={tr('workout.min')}
                step={5}
                min={0}
                max={999}
                onChange={(minutes) => patchEvery({ minutes })}
              />
            )}
            {exercise.tracks === 'distance' && (
              <>
                <Stepper
                  value={uniform.distance}
                  caption={distanceUnit(units)}
                  step={0.5}
                  min={0}
                  max={999}
                  decimal
                  onChange={(distance) => patchEvery({ distance })}
                />
                <Stepper
                  value={uniform.minutes}
                  caption={tr('workout.min')}
                  step={5}
                  min={0}
                  max={999}
                  onChange={(minutes) => patchEvery({ minutes })}
                />
              </>
            )}
          </View>
          <Pressable
            onPress={() => {
              haptics.press();
              setAsked('grid');
            }}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [styles.quiet, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
              {tr('workout.setsDiffered')}
            </Text>
          </Pressable>
        </>
      )}

      {mode === 'grid' && (
        <>
          {exercise.sets.map((set, i) => (
            <View key={i} style={styles.setRow}>
              <Text style={[t.footnote, styles.setNumber, { color: colors.mutedForeground }]}>
                {i + 1}
              </Text>
              {exercise.tracks === 'reps' ? (
                <>
                  <Cell
                    value={set.reps}
                    onChange={(reps) => patchSet(i, { reps })}
                    unit={tr('workout.reps')}
                  />
                  <Cell
                    value={set.weight}
                    onChange={(weight) => patchSet(i, { weight })}
                    unit={loadUnit(units)}
                    decimal
                  />
                </>
              ) : exercise.tracks === 'distance' ? (
                <>
                  <Cell
                    value={set.distance}
                    onChange={(distance) => patchSet(i, { distance })}
                    unit={distanceUnit(units)}
                    decimal
                  />
                  <Cell
                    value={set.minutes}
                    onChange={(minutes) => patchSet(i, { minutes })}
                    unit={tr('workout.min')}
                  />
                </>
              ) : (
                <Cell
                  value={set.minutes}
                  onChange={(minutes) => patchSet(i, { minutes })}
                  unit={tr('workout.min')}
                />
              )}
            </View>
          ))}

          <View style={styles.gridFoot}>
            <Pressable
              onPress={() => {
                haptics.press();
                onChange(resize(exercise, exercise.sets.length + 1));
              }}
              accessibilityRole="button"
              hitSlop={6}
              style={({ pressed }) => [styles.quiet, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Plus color={colors.mutedForeground} />
              <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
                {tr('workout.anotherSet')}
              </Text>
            </Pressable>

            {/* The way back out. Without it, one mistyped set in the grid is a
                one-way door into the form this redesign exists to avoid. */}
            <Pressable
              onPress={() => {
                haptics.press();
                onChange(setEvery(exercise, exercise.sets[0] ?? blankSet()));
                setAsked('steppers');
              }}
              accessibilityRole="button"
              hitSlop={6}
              style={({ pressed }) => [styles.quiet, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
                {tr('workout.sameEverySet')}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/**
 * A number with a minus and a plus, and the number itself typeable.
 *
 * Both affordances in one control, because they answer different questions.
 * The steppers are for the change that actually happens — one more rep, one
 * more plate — and the keypad is for the first time you ever enter a lift,
 * where stepping up from nothing would be absurd.
 *
 * `step` is the unit the thing really moves in: a rep, five minutes, and for a
 * load `loadStep` — 2.5 kg or 5 lb, a pair of the smallest plates most gyms
 * own. A stepper that moved a barbell by one kilogram would need three taps to
 * express the smallest change anybody makes.
 */
function Stepper({
  value,
  caption,
  step,
  min,
  max,
  decimal,
  onChange,
}: {
  value: number | null;
  caption: string;
  step: number;
  min: number;
  max: number;
  decimal?: boolean;
  onChange: (next: number | null) => void;
}) {
  const colors = useColors();
  const move = (delta: number) => () => {
    haptics.press();
    // Stepping from nothing lands on the step itself rather than on zero, which
    // is never a real answer: tapping "+" under an empty load means "put
    // something here", and the first plate is a better guess than nought.
    const base = value ?? (delta > 0 ? 0 : step);
    onChange(round(Math.min(max, Math.max(min, base + delta)), decimal ? 2 : 0));
  };
  return (
    <View style={[styles.stepper, { backgroundColor: colors.mutedField, borderColor: colors.border }]}>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={move(-step)}
          accessibilityRole="button"
          accessibilityLabel={`Less ${caption}`}
          hitSlop={4}
          style={({ pressed }) => [
            styles.stepButton,
            { backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.stepGlyph, { color: colors.mutedForeground }]}>−</Text>
        </Pressable>
        <TextInput
          value={value === null ? '' : String(value)}
          onChangeText={(next) => {
            const cleaned = next.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
            onChange(cleaned === '' ? null : Number(cleaned));
          }}
          placeholder="—"
          placeholderTextColor={colors.mutedForeground}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          accessibilityLabel={caption}
          style={[styles.stepValue, { color: colors.foreground }]}
        />
        <Pressable
          onPress={move(step)}
          accessibilityRole="button"
          accessibilityLabel={`More ${caption}`}
          hitSlop={4}
          style={({ pressed }) => [
            styles.stepButton,
            { backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.stepGlyph, { color: colors.mutedForeground }]}>+</Text>
        </Pressable>
      </View>
      <Text style={[styles.stepCaption, { color: colors.mutedForeground }]}>{caption}</Text>
    </View>
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

/** Any number at all in it — an untouched row is not a set of zero reps. */
export const filled = (set: DraftSet): boolean =>
  set.reps !== null || set.weight !== null || set.minutes !== null || set.distance !== null;

/**
 * A session in the words people use for it: "3 × 10 @ 60 kg".
 *
 * Falls back to a count when the sets disagree, because there is no honest
 * single line for a drop set and "3 sets" at least says how much work it was.
 */
export function summarise(
  sets: DraftSet[],
  uniform: DraftSet | null,
  tracks: ExerciseTracks,
  units: UnitSystem,
  tr: ReturnType<typeof useT>,
): string {
  if (uniform === null) return `${sets.length} × ${tr('workout.setsLabel')}`;
  const count = sets.length;
  if (tracks === 'reps') {
    const reps = `${count} × ${uniform.reps ?? '—'}`;
    return uniform.weight === null ? reps : `${reps} @ ${uniform.weight} ${loadUnit(units)}`;
  }
  if (tracks === 'distance') {
    const far = uniform.distance === null ? null : `${uniform.distance} ${distanceUnit(units)}`;
    const time = uniform.minutes === null ? null : `${uniform.minutes} ${tr('workout.min')}`;
    return [far, time].filter(Boolean).join(' · ') || '—';
  }
  const time = `${uniform.minutes ?? '—'} ${tr('workout.min')}`;
  return count > 1 ? `${count} × ${time}` : time;
}

function Cross({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.6} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function Plus({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.6} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  exercise: { borderTopWidth: 2, marginTop: 12, paddingTop: 12, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, minWidth: 0 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  figure: { fontFamily: font.display, fontSize: 19, lineHeight: 24 },
  steppers: { flexDirection: 'row', gap: 6 },
  stepper: {
    flex: 1,
    minWidth: 0,
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingTop: 5,
    paddingBottom: 4,
    alignItems: 'center',
    gap: 1,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: 2,
  },
  stepButton: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontFamily: font.display, fontSize: 15, lineHeight: 19 },
  stepValue: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.display,
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'center',
    paddingVertical: 0,
  },
  stepCaption: { fontFamily: font.bold, fontSize: 10.5, lineHeight: 14, letterSpacing: 0.3 },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
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
});
