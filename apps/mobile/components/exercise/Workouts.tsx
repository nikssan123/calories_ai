import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ExerciseType, Routine, WeekSchedule } from '@ct/shared';
import { WEEK_ORDER, weekdayName } from '@ct/shared';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { PressableChunk } from '@/components/Chunk';
import { WorkoutCard } from '@/components/workout/WorkoutCard';
import { api } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { font, type as t, useColors } from '@/theme';
import { useLocale, useT } from '@/lib/i18n';

/**
 * Saved workouts and the week they sit in, on the Exercise screen.
 *
 * The conversation is still the fastest way to log a session and this does not
 * replace it. It is the other half: the journal is where you *say* what
 * happened, and there was nowhere at all to see what you have saved, fix a
 * routine that has drifted, or state a split you already know.
 *
 * The week is the part worth reading twice. The app infers a routine's usual
 * day from history, which needs no setup and knows nothing for a fortnight;
 * anything set here outranks that immediately. Days left alone keep following
 * the inference, so a half-filled week is useful rather than a set of holes.
 */
export function Workouts({ onLogged }: { onLogged: () => void }) {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [week, setWeek] = useState<WeekSchedule | null>(null);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The read failed, as opposed to came back empty.
   *
   * Kept apart from `routines` on purpose. Falling back to `[]` here drew the
   * "nothing saved yet" copy for a request that never landed — so a dropped
   * connection was indistinguishable from having none, and worse, somebody who
   * had just logged a session read it as their session not having saved.
   */
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ routines }, { week }] = await Promise.all([api.routines(), api.schedule()]);
      setRoutines(routines);
      setWeek(week);
      setFailed(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setDay(weekday: number, routineId: string | null) {
    haptics.press();
    try {
      const { week } = await api.saveSchedule({ days: [{ weekday, routine_id: routineId }] });
      setWeek(week);
      setRoutines((await api.routines()).routines);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(routine: Routine) {
    setRoutines((prev) => prev?.filter((r) => r.id !== routine.id) ?? prev);
    try {
      await api.deleteRoutine(routine.id);
    } catch (e) {
      setError((e as Error).message);
    }
    void load();
  }

  if (editing) {
    return (
      <RoutineEditor
        routine={editing === 'new' ? null : editing}
        onDone={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  if (logging) {
    return (
      <View style={styles.stack}>
        <WorkoutCard
          card={{
            type: 'workout_prompt',
            suggested_category: null,
            performed_at: new Date().toISOString(),
            heard: null,
          }}
          onLogged={() => {
            setLogging(false);
            onLogged();
            void load();
          }}
          onError={setError}
        />
        <Pressable onPress={() => setLogging(false)} accessibilityRole="button" hitSlop={8}>
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('common.cancel')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {error && (
        <Text style={[t.footnote, { color: colors.destructive }]} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <PressableChunk
        depth={3}
        radius={16}
        color={colors.caloriesDeep}
        onPress={() => {
          haptics.press();
          setLogging(true);
        }}
        accessibilityRole="button"
        contentStyle={[styles.logButton, { backgroundColor: colors.primary }]}
      >
        <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>{tr('workouts.logActionMobile')}</Text>
      </PressableChunk>

      <InsetGroup
        title={tr('workouts.savedTitle')}
        trailing={
          <Pressable onPress={() => setEditing('new')} accessibilityRole="button" hitSlop={8}>
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('workouts.buildOne')}</Text>
          </Pressable>
        }
        footer={
          failed
            ? undefined
            : routines && routines.length > 0
              ? tr('workouts.reuseHint')
              : // Says where the session went. Empty here does not mean nothing
                // was logged — the sessions are in the history further down the
                // screen — and this panel sitting empty right after logging one
                // is exactly the moment that reads as a lost workout.
                tr('workouts.whereSessionsGo')
        }
      >
        {failed ? (
          <View style={styles.failedBlock}>
            <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>
              {tr('workouts.loadFailed')}
            </Text>
            <Pressable onPress={() => void load()} accessibilityRole="button" hitSlop={8}>
              <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>{tr('common.retry')}</Text>
            </Pressable>
          </View>
        ) : routines === null ? (
          <InsetRow>
            <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('common.loading')}</Text>
          </InsetRow>
        ) : routines.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>
              {tr('workouts.noneSavedMobile')}
            </Text>
          </View>
        ) : (
          routines.map((routine) => (
            <InsetRow key={routine.id}>
              <Text style={styles.emoji}>{routine.emoji}</Text>
              <View style={styles.grow}>
                <Text style={[t.body, { color: colors.foreground }]} numberOfLines={1}>
                  {routine.name}
                </Text>
                <Text style={[t.footnote, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {/* A routine saved off a duration-only session has no list to
                      count. "0 exercises" would describe it as empty when it is
                      simply measured the other way — and one with neither is
                      measured by nothing at all, which is a row that says its
                      name and stops rather than one that says "null min". The
                      save path will not make one; the type allows it, and it is
                      the server that decides what this row is handed.
                      
                      The parts carry their own leading separator, which is
                      right for every part except whichever one comes first, so
                      the join drops it. Without that, dropping the measurement
                      leaves the row starting on a bullet. */}
                  {[
                    routine.exercises.length > 0
                      ? tr('workouts.exerciseCount')(routine.exercises.length)
                      : routine.duration_min !== null
                        ? tr('exercise.minutes')(String(routine.duration_min))
                        : '',
                    routine.times_done > 0
                      ? tr('workouts.doneTimes')(String(routine.times_done))
                      : '',
                    routine.scheduled_weekdays.length > 0
                      ? ` · ${routine.scheduled_weekdays
                          .map((d) => weekdayName(d, locale, 'short'))
                          .join(', ')}`
                      : '',
                  ]
                    .join('')
                    .replace(/^\s*·\s*/, '')}
                </Text>
              </View>
              <Pressable
                onPress={() => setEditing(routine)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${routine.name}`}
                hitSlop={8}
              >
                <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('common.edit')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void remove(routine)}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${routine.name}`}
                hitSlop={8}
              >
                <Cross color={colors.mutedForeground} />
              </Pressable>
            </InsetRow>
          ))
        )}
      </InsetGroup>

      {!failed && routines !== null && routines.length > 0 && (
        <InsetGroup
          title={tr('workouts.weekTitle')}
          footer={tr('workouts.weekFooter')}
        >
          {WEEK_ORDER.map((weekday) => {
            const day = week?.find((d) => d.weekday === weekday);
            const declared = day?.source === 'declared';
            return (
              <InsetRow key={weekday}>
                <Text style={[t.body, styles.dayName, { color: colors.foreground }]}>
                  {weekdayName(weekday, locale, 'short')}
                </Text>
                {/* A row of chips rather than a picker: a phone select is a
                    modal, and choosing between four things does not deserve one. */}
                <View style={styles.dayChips}>
                  {routines.map((routine) => {
                    const on = declared && day?.routine_id === routine.id;
                    return (
                      <Pressable
                        key={routine.id}
                        onPress={() => void setDay(weekday, on ? null : routine.id)}
                        accessibilityRole="button"
                        accessibilityLabel={tr('workouts.routineOn')(
                          routine.name,
                          weekdayName(weekday, locale),
                        )}
                        accessibilityState={{ selected: on }}
                        style={({ pressed }) => [
                          styles.dayChip,
                          {
                            backgroundColor: on ? colors.primary : colors.muted,
                            borderColor: on ? 'transparent' : colors.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayChipLabel,
                            { color: on ? colors.primaryForeground : colors.mutedForeground },
                          ]}
                        >
                          {routine.emoji}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {/* Said out loud, because the two are not the same claim: one is
                    a decision they made, the other a pattern the app noticed. */}
                <Text
                  style={[t.footnote, styles.daySource, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {declared
                    ? tr('workouts.set')
                    : day?.source === 'learned'
                      ? tr('workouts.learnedGuess')(day.routine_name ?? '')
                      : ''}
                </Text>
              </InsetRow>
            );
          })}
        </InsetGroup>
      )}
    </View>
  );
}

/**
 * Building or fixing a routine.
 *
 * Sets, not loads — the rule the whole feature rests on. "Three sets of bench"
 * is part of the plan; sixty kilos happened last Tuesday and will be different
 * next Tuesday, so it comes from history when the card opens.
 */
function RoutineEditor({ routine, onDone }: { routine: Routine | null; onDone: () => void }) {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const [name, setName] = useState(routine?.name ?? '');
  const [types, setTypes] = useState<ExerciseType[] | null>(null);
  const [chosen, setChosen] = useState<{ name: string; typeId: string | null; sets: number }[]>(
    routine?.exercises.map((e) => ({ name: e.name, typeId: e.type_id, sets: e.target_sets ?? 3 })) ??
      [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .exerciseTypes(routine?.category ?? 'strength')
      .then(({ types }) => setTypes(types))
      .catch(() => setTypes([]));
  }, [routine?.category]);

  /*
   * A routine that is only a length can be renamed without gaining a grid.
   * Its exercise list is empty and staying empty is a legitimate answer, so the
   * "at least one exercise" gate has to let it through or the pencil on a
   * duration-only workout opens a form that can never be saved.
   */
  const byDuration = chosen.length === 0 && (routine?.duration_min ?? null) !== null;
  const ready = name.trim().length > 0 && (chosen.length > 0 || byDuration) && !saving;
  const picked = new Set(chosen.map((c) => c.typeId));

  async function save() {
    setSaving(true);
    try {
      await api.saveRoutine({
        name: name.trim(),
        category: routine?.category ?? 'strength',
        exercises: chosen.map((c) => ({ name: c.name, type_id: c.typeId, target_sets: c.sets })),
        duration_min: byDuration ? (routine?.duration_min ?? null) : null,
      });
      // Renaming is a save under the new name, so the old row has to go or they
      // end up with both.
      if (routine && routine.name.toLowerCase() !== name.trim().toLowerCase()) {
        await api.deleteRoutine(routine.id);
      }
      haptics.logged();
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <InsetGroup title={routine ? tr('workouts.editTitle') : tr('workouts.buildTitle')}>
      <View style={styles.editor}>
        {error && <Text style={[t.footnote, { color: colors.destructive }]}>{error}</Text>}

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={tr('workouts.namePlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={tr('workouts.nameLabel')}
          style={[
            t.bodySemibold,
            styles.nameField,
            {
              backgroundColor: colors.mutedField,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
        />

        {chosen.map((exercise, i) => (
          <View
            key={`${exercise.typeId ?? exercise.name}-${i}`}
            style={[styles.chosenRow, { backgroundColor: colors.muted }]}
          >
            <Text style={[t.footnoteSemibold, styles.grow, { color: colors.foreground }]} numberOfLines={1}>
              {exercise.name}
            </Text>
            <Stepper
              value={exercise.sets}
              onChange={(sets) =>
                setChosen((prev) => prev.map((c, j) => (j === i ? { ...c, sets } : c)))
              }
            />
            <Pressable
              onPress={() => setChosen((prev) => prev.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${exercise.name}`}
              hitSlop={8}
            >
              <Cross color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}

        {types === null ? (
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('common.loading')}</Text>
        ) : (
          <View style={styles.chips}>
            {types
              .filter((type) => !picked.has(type.id))
              .map((type) => (
                <Pressable
                  key={type.id}
                  onPress={() => {
                    haptics.press();
                    setChosen((prev) => [...prev, { name: type.name, typeId: type.id, sets: 3 }]);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
                    {type.emoji} {type.name}
                  </Text>
                </Pressable>
              ))}
          </View>
        )}

        <View style={styles.editorFoot}>
          <Pressable onPress={onDone} accessibilityRole="button" hitSlop={8}>
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('common.cancel')}</Text>
          </Pressable>
          <PressableChunk
            depth={3}
            radius={999}
            color={colors.caloriesDeep}
            onPress={() => void save()}
            disabled={!ready}
            accessibilityRole="button"
            style={{ opacity: ready ? 1 : 0.4 }}
            contentStyle={[styles.save, { backgroundColor: colors.primary }]}
          >
            <Text style={[t.footnoteBold, { color: colors.primaryForeground }]}>
              {saving ? tr('setup.saving') : tr('common.save')}
            </Text>
          </PressableChunk>
        </View>
      </View>
    </InsetGroup>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const step = (delta: number) => () => {
    haptics.press();
    onChange(Math.min(30, Math.max(1, value + delta)));
  };
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={step(-1)}
        accessibilityRole="button"
        accessibilityLabel={tr('workouts.oneFewerSetShort')}
        hitSlop={6}
        style={[styles.stepButton, { backgroundColor: colors.card }]}
      >
        <Text style={[t.footnoteBold, { color: colors.mutedForeground }]}>−</Text>
      </Pressable>
      <Text style={[t.footnote, styles.stepValue, { color: colors.foreground }]}>
        {value} set{value === 1 ? '' : 's'}
      </Text>
      <Pressable
        onPress={step(1)}
        accessibilityRole="button"
        accessibilityLabel={tr('workouts.oneMoreSetShort')}
        hitSlop={6}
        style={[styles.stepButton, { backgroundColor: colors.card }]}
      >
        <Text style={[t.footnoteBold, { color: colors.mutedForeground }]}>+</Text>
      </Pressable>
    </View>
  );
}

function Cross({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.6} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  grow: { flex: 1, minWidth: 0 },
  centred: { textAlign: 'center' },
  emoji: { fontSize: 20 },
  empty: { paddingHorizontal: 16, paddingVertical: 32 },
  failedBlock: { paddingHorizontal: 16, paddingVertical: 32, alignItems: 'center', gap: 8 },
  logButton: { alignItems: 'center', paddingVertical: 13 },
  dayName: { width: 38 },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  dayChip: {
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  dayChipLabel: { fontFamily: font.bold, fontSize: 13, lineHeight: 18 },
  daySource: { width: 66, textAlign: 'right' },
  editor: { padding: 12, gap: 10 },
  nameField: {
    height: 40,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  chosenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepValue: { width: 48, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  editorFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  save: { paddingHorizontal: 18, paddingVertical: 9 },
});
