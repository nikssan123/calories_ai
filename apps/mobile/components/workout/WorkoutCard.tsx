import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type {
  ChatCard,
  ExerciseCategory,
  ExerciseEntry,
  ExerciseSet,
  ExerciseTracks,
  ExerciseType,
  LastWorkout,
  MuscleGroup,
  Routine,
  UnitSystem,
  WorkoutExercise,
} from '@ct/shared';
import {
  EXERCISE_CATEGORIES,
  ROUTINE_MATCH_LIKELY,
  loadToKg,
  loadUnit,
  matchRoutine,
  nameFromMuscles,
  namingStyleOf,
  toLoad,
} from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';
import { haptics } from '@/lib/haptics';

/**
 * The question a session prompts, answered in the conversation.
 *
 * What the app actually needs from a session is small: the burn is category,
 * bodyweight and time, and the reps and kilos contribute nothing to it. So the
 * complete answer here is a kind and a duration — two taps, one of them usually
 * already made by the agent — and the sets underneath are a training record
 * that is worth keeping and not worth demanding.
 *
 * The port that first landed this screen asked for the opposite: a free-text
 * field per exercise and two number pads per set, with none of the catalogue
 * the web has had all along. Typing "Bulgarian split squat" on a phone after
 * training is exactly the friction that stops people logging at all, so the
 * picker is here now, and `tracks` decides which fields a set gets rather than
 * every exercise being asked for reps and a weight.
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

/**
 * The durations a session actually comes in. Chips rather than a number pad,
 * because nobody times a gym session to the minute and "about an hour" is both
 * the true answer and the one that costs a single tap.
 */
const DURATIONS = [30, 45, 60, 75, 90];

interface DraftSet {
  reps: number | null;
  weight: number | null;
  minutes: number | null;
}

interface DraftExercise {
  name: string;
  typeId: string | null;
  tracks: ExerciseTracks;
  emoji: string;
  muscles: MuscleGroup[];
  sets: DraftSet[];
}

/**
 * Enough of a session for the card to reopen on it.
 *
 * Deliberately not `ExerciseEntry`: the journal holds a *card*, not an entry,
 * and the card carries the work but not the bookkeeping — no `source`, no
 * `local_date`. Asking for the whole entry would mean a fetch on every tap of
 * an edit button to collect fields this form never reads.
 *
 * `performed_at` is optional for the same reason. Omitted, the server leaves
 * the session on the day it already had, which is the right answer for a
 * correction that says nothing about when.
 */
export interface EditableSession {
  id: string;
  category: ExerciseCategory | null;
  duration_min: number | null;
  sets: ExerciseSet[];
  performed_at?: string;
}

export function WorkoutCard({
  card,
  editing,
  messageId,
  onLogged,
  onError,
}: {
  /**
   * The question this card is answering. Absent when it is correcting a session
   * instead — an edit has no question, only an answer that was already given.
   */
  card?: Extract<ChatCard, { type: 'workout_prompt' }>;
  /**
   * The session being corrected, opened with its own answers already in it.
   *
   * The same card either way, deliberately. Somebody fixing the third set is
   * doing the thing they did ten seconds ago, and a separate edit screen would
   * be a second layout to build, to keep in step and to learn — for a form that
   * already knows how to collect exactly this.
   */
  editing?: EditableSession;
  /**
   * The chat message this card is answering, when it is sitting in the
   * conversation. Absent when the card was opened from the Exercise tab, where
   * there is no question to rewrite into a receipt.
   */
  messageId?: string;
  onLogged: (entry: ExerciseEntry) => void;
  onError: (message: string) => void;
}) {
  const colors = useColors();
  const units = useUnits();

  const [category, setCategory] = useState<ExerciseCategory>(
    editing?.category ?? card?.suggested_category ?? 'strength',
  );
  const [minutes, setMinutes] = useState<number | null>(editing?.duration_min ?? null);
  // A correction opens on the grid. The numbers being fixed are in it, and
  // making somebody tap "add what you did" to reach their own sets would be
  // hiding the entire reason the card reopened.
  const [detail, setDetail] = useState(editing !== undefined);
  const [types, setTypes] = useState<ExerciseType[] | null>(null);
  const [last, setLast] = useState<LastWorkout | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  /** Which saved routine this session is, once one has been tapped. */
  const [routineId, setRoutineId] = useState<string | null>(null);
  /** Non-null once they have asked for this session to become a routine. */
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [saving, setSaving] = useState(false);

  /*
   * Both reads fire on the kind, not on opening the detail section: the "same
   * as last time" offer has to be on screen *before* anyone decides whether
   * filling a grid is worth it, or it is an offer nobody ever sees.
   */
  useEffect(() => {
    let cancelled = false;
    setTypes(null);
    setLast(null);
    setRoutines([]);
    setRoutineId(null);
    void api
      .exerciseTypes(category)
      .then(({ types }) => !cancelled && setTypes(types))
      .catch(() => !cancelled && setTypes([]));
    void api
      .lastWorkout(category)
      .then(({ workout }) => !cancelled && setLast(workout))
      .catch(() => {
        /* Never having done one is an ordinary answer; so is a failed lookup. */
      });
    void api
      .routines(category)
      .then(({ routines }) => !cancelled && setRoutines(routines))
      .catch(() => {
        /* Having saved none is the normal state for a new account. */
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  /*
   * The grid, filled in from the session being corrected.
   *
   * Waits for the catalogue because a draft needs `tracks` to know whether a
   * set is reps-and-a-load or a duration, and the stored set carries only its
   * name — the same match `lastWorkout` does on the server, done here because
   * this is where the catalogue already is. Once, guarded by the ref: the
   * effect re-runs whenever the kind changes, and re-seeding then would undo
   * every edit made since.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (!editing || seeded.current || types === null) return;
    seeded.current = true;
    setExercises(draftsFrom(editing, types, units));
  }, [editing, types, units]);

  const filled = exercises.filter((e) => toExercise(e, units) !== null);
  const counted = exercises.map((e) => toExercise(e, units)).filter(isExercise);
  const canSend = (minutes !== null || counted.length > 0) && !saving;
  const today = new Date().getDay();
  // Today's habit first, then whatever was done most recently. Only ever an
  // ordering — nothing is preselected, because logging the wrong workout is a
  // worse outcome than one extra tap.
  const ordered = [...routines].sort(
    (a, b) => Number(b.usual_weekday === today) - Number(a.usual_weekday === today),
  );
  /*
   * Anything they can log, they can save.
   *
   * The bar used to be two exercises, on the reasoning that one is a fragment.
   * That quietly excluded the whole fast path: a duration-only session is a
   * complete answer to this card, and the people using it — "cardio, 45 min",
   * three times a week — were the only ones never offered the one-tap repeat
   * that saving exists to give them. The offer was reserved for the people
   * already doing the most typing, which is exactly backwards.
   *
   * A session that is plainly a routine they own is still not worth offering to
   * save twice, whether or not they got to it by tapping the chip.
   */
  const alreadySaved =
    routineId !== null ||
    matchRoutine(
      filled.map((e) => e.typeId).filter((id): id is string => id !== null),
      routines,
      ROUTINE_MATCH_LIKELY,
    ) !== null;
  const offerSave = !alreadySaved && canSend;
  // Named in the words they already use: somebody whose routines are "Push" and
  // "Pull" should not be offered "Chest & Triceps".
  const suggestedName =
    filled.length > 0
      ? nameFromMuscles(
          filled.map((e) => e.muscles[0]).filter((m): m is MuscleGroup => m !== undefined),
          namingStyleOf(routines.map((r) => r.name)),
        )
      : // Nothing to read muscles off. The kind is all this session is, so it is
        // also the most it can honestly be called.
        CATEGORY_LABEL[category];

  function patchSet(exercise: number, set: number, next: Partial<DraftSet>) {
    setExercises((prev) =>
      prev.map((e, i) =>
        i === exercise ? { ...e, sets: e.sets.map((s, j) => (j === set ? { ...s, ...next } : s)) } : e,
      ),
    );
  }

  function addExercise(type: ExerciseType) {
    haptics.press();
    setExercises((prev) => [
      ...prev,
      {
        name: type.name,
        typeId: type.id,
        tracks: type.tracks,
        emoji: type.emoji,
        muscles: type.muscles,
        sets: [blankSet()],
      },
    ]);
  }

  /** Opens the grid on the last session of this kind rather than on nothing. */
  function repeatLast() {
    if (!last) return;
    haptics.press();
    setExercises(
      last.exercises.map((exercise) => ({
        name: exercise.name,
        typeId: exercise.type_id,
        tracks: exercise.tracks,
        emoji: exercise.emoji,
        muscles: [],
        sets: exercise.sets.map((set) => ({
          reps: set.reps,
          weight: set.weight_kg === null ? null : toLoad(set.weight_kg, units),
          minutes: set.duration_sec === null ? null : Math.round(set.duration_sec / 60),
        })),
      })),
    );
    if (minutes === null && last.duration_min !== null) {
      setMinutes(nearestDuration(last.duration_min));
    }
    setDetail(true);
  }

  /**
   * Tapping a saved workout fills the whole grid in, numbers included.
   *
   * `previous` is what they did last time this exercise came up, which is the
   * right thing to put in front of somebody about to do it again: they adjust
   * the one lift that moved and send it.
   */
  function openRoutine(routine: Routine) {
    haptics.press();
    setRoutineId(routine.id);
    setExercises(
      routine.exercises.map((exercise) => {
        const previous = exercise.previous.map((set) => ({
          reps: set.reps,
          weight: set.weight_kg === null ? null : toLoad(set.weight_kg, units),
          minutes: set.duration_sec === null ? null : Math.round(set.duration_sec / 60),
        }));
        // Never fewer rows than the plan calls for: a routine that says three
        // sets shows three, even the first time, when there is no history.
        const wanted = Math.max(exercise.target_sets ?? 1, previous.length, 1);
        return {
          name: exercise.name,
          typeId: exercise.type_id,
          tracks: exercise.tracks,
          emoji: exercise.emoji,
          muscles: exercise.muscles,
          sets: Array.from({ length: wanted }, (_, i) => previous[i] ?? blankSet()),
        };
      }),
    );
    // A routine that is only a length carries it here: there is no grid to open
    // and the duration *is* the workout, so tapping the chip has to fill it in
    // or the chip does nothing at all.
    if (routine.duration_min !== null) setMinutes(nearestDuration(routine.duration_min));
    // Saving one of these again would be saving what it already is.
    setSaveAs(null);
    setDetail(routine.exercises.length > 0);
  }

  async function send() {
    setSaving(true);
    try {
      const payload = {
        category,
        exercises: counted,
        duration_min: minutes,
        routine_id: routineId,
        /*
         * A correction keeps the session where it happened. Falling through to
         * now would quietly move Tuesday's session onto Thursday because
         * somebody fixed a typo in it — and on a day boundary it would move it
         * off the day whose totals it belongs to.
         */
        performed_at: editing?.performed_at ?? card?.performed_at,
      };

      const entry = editing
        ? await api.updateWorkout(editing.id, payload)
        : await api.logWorkout({ ...payload, message_id: messageId });

      /*
       * Saving the routine comes after the session and never instead of it. A
       * failure here must not cost them the workout, which is the thing they
       * actually came to record.
       */
      if (saveAs && saveAs.trim().length > 0) {
        await api
          .saveRoutine({
          name: saveAs.trim(),
          category,
          from_entry_id: entry.id,
          duration_min: minutes,
        })
          .catch(() => onError('Logged, but the workout did not save'));
      }

      haptics.logged();
      onLogged(entry);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const chosen = new Set(exercises.map((e) => e.typeId));

  return (
    <Chunk
      contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Text style={[t.bodyBold, { color: colors.foreground }]}>
        {editing ? 'Fix what’s wrong' : 'What did you do?'}
      </Text>
      {card?.heard && (
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
              onPress={() => {
                haptics.press();
                setCategory(key);
                // The grid belonged to the old kind: a leg day's exercises are
                // not a swim's, and carrying them across would submit work
                // nobody did.
                setExercises([]);
                setDetail(false);
                setRoutineId(null);
                setSaveAs(null);
              }}
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

      {/* Their own workouts, before anything the app came up with. One tap
          fills the entire grid, which is the point of having saved them. */}
      {ordered.length > 0 && (
        <>
          <Text style={[t.footnote, styles.label, { color: colors.mutedForeground }]}>
            Your workouts
          </Text>
          <View style={styles.chips}>
            {ordered.map((routine) => {
              const on = routineId === routine.id;
              return (
                <Pressable
                  key={routine.id}
                  onPress={() => openRoutine(routine)}
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
                      t.footnoteSemibold,
                      { color: on ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {routine.emoji} {routine.name}
                    {routine.usual_weekday === today && !on ? ' · today' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* The whole required answer. Everything under it is optional. */}
      <Text style={[t.footnote, styles.label, { color: colors.mutedForeground }]}>How long?</Text>
      <View style={styles.durations}>
        {DURATIONS.map((value) => {
          const on = minutes === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                haptics.press();
                setMinutes(on ? null : value);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${value} minutes`}
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [
                styles.duration,
                {
                  backgroundColor: on ? colors.primary : colors.muted,
                  borderColor: on ? 'transparent' : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.durationLabel,
                  { color: on ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {value}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {detail && (
        <>
          {exercises.map((exercise, i) => (
            <View key={`${exercise.typeId ?? exercise.name}-${i}`} style={[styles.exercise, { borderTopColor: colors.border }]}>
              <View style={styles.exerciseHead}>
                <Text style={[t.bodySemibold, styles.name, { color: colors.foreground }]}>
                  {exercise.emoji} {exercise.name}
                </Text>
                <Pressable
                  onPress={() => setExercises((prev) => prev.filter((_, j) => j !== i))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${exercise.name}`}
                  hitSlop={8}
                >
                  <Svg width={13} height={13} viewBox="0 0 24 24">
                    <Path
                      d="M6 6l12 12M18 6L6 18"
                      stroke={colors.mutedForeground}
                      strokeWidth={2.6}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </Svg>
                </Pressable>
              </View>

              {exercise.sets.map((set, j) => (
                <View key={j} style={styles.setRow}>
                  <Text style={[t.footnote, styles.setNumber, { color: colors.mutedForeground }]}>
                    {j + 1}
                  </Text>
                  {exercise.tracks === 'reps' ? (
                    <>
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
                    </>
                  ) : (
                    <Cell
                      value={set.minutes}
                      onChange={(m) => patchSet(i, j, { minutes: m })}
                      unit="min"
                    />
                  )}
                </View>
              ))}

              <Pressable
                onPress={() =>
                  // Carries the last set forward: the second set of anything is
                  // almost always the same as the first, and retyping it is the
                  // difference between logging four sets and logging one.
                  setExercises((prev) =>
                    prev.map((e, j) =>
                      j === i ? { ...e, sets: [...e.sets, { ...(e.sets.at(-1) ?? blankSet()) }] } : e,
                    ),
                  )
                }
                accessibilityRole="button"
                hitSlop={6}
                style={({ pressed }) => [styles.quiet, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Plus color={colors.mutedForeground} />
                <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
                  another set
                </Text>
              </Pressable>
            </View>
          ))}

          {/* The catalogue, as chips. A picker rather than a text field because
              the names are already known, and typing them on a phone after a
              session is exactly the friction that stops people logging at all. */}
          <View style={[styles.picker, { borderTopColor: colors.border }]}>
            {types === null ? (
              <Text style={[t.footnote, { color: colors.mutedForeground }]}>Loading…</Text>
            ) : (
              <View style={styles.chips}>
                {types
                  .filter((type) => !chosen.has(type.id))
                  .map((type) => (
                    <Pressable
                      key={type.id}
                      onPress={() => addExercise(type)}
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
          </View>
        </>
      )}

      {!detail && (
        <View style={styles.offers}>
          <Pressable
            onPress={() => {
              haptics.press();
              setDetail(true);
            }}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [styles.quiet, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Plus color={colors.mutedForeground} />
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
              add what you did
            </Text>
          </Pressable>

          {last && (
            <Pressable
              onPress={repeatLast}
              accessibilityRole="button"
              hitSlop={6}
              style={({ pressed }) => [styles.quiet, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
                ↻ same as {when(last.local_date)}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {offerSave &&
        (saveAs === null ? (
          <Pressable
            onPress={() => {
              haptics.press();
              setSaveAs(suggestedName);
            }}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [styles.saveOffer, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
              ⭑ save this as “{suggestedName}”
            </Text>
          </Pressable>
        ) : (
          <View style={styles.saveRow}>
            <TextInput
              value={saveAs}
              onChangeText={setSaveAs}
              accessibilityLabel="Name for this workout"
              placeholder="Name it"
              placeholderTextColor={colors.mutedForeground}
              style={[
                t.bodySemibold,
                styles.saveField,
                {
                  backgroundColor: colors.mutedField,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
            />
            <Pressable
              onPress={() => setSaveAs(null)}
              accessibilityRole="button"
              accessibilityLabel="Don’t save this as a workout"
              hitSlop={8}
            >
              <Svg width={13} height={13} viewBox="0 0 24 24">
                <Path
                  d="M6 6l12 12M18 6L6 18"
                  stroke={colors.mutedForeground}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  fill="none"
                />
              </Svg>
            </Pressable>
          </View>
        ))}

      <View style={[styles.foot, { borderTopColor: colors.border }]}>
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
            {editing
              ? saving
                ? 'Saving…'
                : 'Save changes'
              : saving
                ? 'Logging…'
                : 'Log it'}
          </Text>
        </PressableChunk>
      </View>
    </Chunk>
  );
}

function Plus({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.6} strokeLinecap="round" fill="none" />
    </Svg>
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

/**
 * What a set of this kind is measured in, and what it looks like, when the
 * catalogue cannot say. Mirrors the server's fallback in `lastWorkout` — a set
 * typed as free text still deserves the right fields around it.
 */
const CATEGORY_TRACKS: Record<ExerciseCategory, ExerciseTracks> = {
  strength: 'reps',
  cardio: 'duration',
  class: 'duration',
  sport: 'duration',
  flexibility: 'duration',
};

const CATEGORY_EMOJI: Record<ExerciseCategory, string> = {
  strength: '🏋️',
  cardio: '🏃',
  class: '🤸',
  sport: '⚽',
  flexibility: '🧘',
};

/**
 * A logged session, back in the shape the card collects.
 *
 * Sets arrive flat and carry the exercise they belong to as a `position`, so
 * they are regrouped here in that order. The load comes back out in whatever
 * the reader uses — it went in as kilograms, and the field it lands in is the
 * same field it was typed into.
 */
function draftsFrom(
  entry: EditableSession,
  types: ExerciseType[],
  units: UnitSystem,
): DraftExercise[] {
  const category = entry.category ?? 'strength';
  const byName = new Map(types.map((type) => [type.name.toLowerCase(), type]));
  const byPosition = new Map<number, DraftExercise>();

  for (const set of entry.sets) {
    let draft = byPosition.get(set.position);
    if (!draft) {
      const type = byName.get(set.name.toLowerCase());
      draft = {
        name: type?.name ?? set.name,
        typeId: type?.id ?? null,
        tracks: type?.tracks ?? CATEGORY_TRACKS[category],
        emoji: type?.emoji ?? CATEGORY_EMOJI[category],
        muscles: type?.muscles ?? [],
        sets: [],
      };
      byPosition.set(set.position, draft);
    }
    draft.sets.push({
      reps: set.reps,
      weight: set.weight_kg === null ? null : toLoad(set.weight_kg, units),
      minutes: set.duration_sec === null ? null : Math.round(set.duration_sec / 60),
    });
  }

  return [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, draft]) => draft);
}

const blankSet = (): DraftSet => ({ reps: null, weight: null, minutes: null });

/**
 * A draft becomes an exercise only once at least one set has a number in it.
 *
 * A set with nothing in it is a row somebody added and did not fill, not a set
 * of zero reps — dropping it is the honest reading. The load leaves here in
 * kilograms whatever the field said, which is the only conversion on this
 * screen.
 */
function toExercise(draft: DraftExercise, units: UnitSystem): WorkoutExercise | null {
  const sets = draft.sets
    .map((set) => {
      if (draft.tracks === 'reps') {
        if (set.reps === null && set.weight === null) return null;
        return { reps: set.reps, weight_kg: set.weight === null ? null : loadToKg(set.weight, units) };
      }
      return set.minutes === null ? null : { duration_sec: Math.round(set.minutes * 60) };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (sets.length === 0) return null;
  return { name: draft.name, type_id: draft.typeId, sets };
}

const isExercise = (e: WorkoutExercise | null): e is WorkoutExercise => e !== null;

/** The chip nearest a remembered duration, so repeating fills that in too. */
function nearestDuration(min: number): number {
  return DURATIONS.reduce((best, d) => (Math.abs(d - min) < Math.abs(best - min) ? d : best));
}

/**
 * "Tuesday" for anything inside the last week, a date beyond it. A session two
 * months old is worth offering back but not worth calling recent.
 */
function when(localDate: string): string {
  const then = new Date(`${localDate}T12:00:00`);
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'long' });
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14 },
  heard: { marginTop: 4, lineHeight: 20 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  category: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  categoryLabel: { fontFamily: font.bold, fontSize: 13, lineHeight: 18 },
  label: { marginTop: 14, marginBottom: 6 },
  durations: { flexDirection: 'row', gap: 6 },
  duration: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 8,
  },
  durationLabel: { fontFamily: font.display, fontSize: 15, lineHeight: 18 },
  exercise: { borderTopWidth: 2, marginTop: 12, paddingTop: 12, gap: 8 },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1 },
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
  picker: { borderTopWidth: 2, marginTop: 12, paddingTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saveOffer: { marginTop: 14 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  saveField: {
    flex: 1,
    height: 40,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  offers: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 14 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 2,
    marginTop: 14,
    paddingTop: 14,
  },
  send: { paddingHorizontal: 18, paddingVertical: 9 },
});
