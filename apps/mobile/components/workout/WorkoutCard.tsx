import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type {
  ChatCard,
  ExerciseCategory,
  ExerciseEntry,
  ExerciseSet,
  ExerciseType,
  LastWorkout,
  Locale,
  MuscleGroup,
  Routine,
  UnitSystem,
} from '@ct/shared';
import {
  EXERCISE_CATEGORIES,
  ROUTINE_MATCH_LIKELY,
  SESSION_DURATIONS,
  matchRoutine,
  nameFromMuscles,
  namingStyleOf,
  routineOnWeekday,
  sessionDurationLabel,
} from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';
import { haptics } from '@/lib/haptics';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { messageOf } from '@/lib/errors';
import { ExercisePicker } from './ExercisePicker';
import { SetEditor } from './SetEditor';
import {
  CATEGORY_EMOJI,
  CATEGORY_TRACKS,
  blankSet,
  categoryOf,
  draftFromType,
  draftsFromHeard,
  guessLength,
  toDraftSet,
  toExercise,
  withSessionLength,
  type DraftExercise,
} from './draft';

/**
 * The question a session prompts, answered in the conversation.
 *
 * What the app actually needs from a session is small: the burn is category,
 * bodyweight and time, and the reps and kilos contribute nothing to it. So the
 * complete answer here is a kind and a duration — and the sets underneath are a
 * training record that is worth keeping and not worth demanding.
 *
 * The second pass over this card (GYM-CARD.md) is about everything *around* the
 * `3 × 10 @ 60` line, which was the only part that was working. Four questions
 * were being asked in one chat bubble and only one of them was the user's:
 *
 * - **The kind is no longer asked.** `ExerciseType.category` has always been on
 *   the row, so picking "Bench press" already said "strength" — `categoryOf`
 *   reads it back. The chips survive only for a session with no exercises at
 *   all, where there is nothing to read and the kind is the whole answer.
 *   Deleting them also deletes the trap where changing kind wiped the grid.
 * - **The length is a guess you can correct**, not a labelled row of seven
 *   chips above the exercises. It prices the burn and nothing else.
 * - **One "start from" row**, and only while the card is empty. It used to be
 *   four offers competing for the same job, all on screen at once.
 * - **The picker is a full-screen sheet that multi-selects.** It used to sit
 *   inline and collapse after every pick, so four exercises meant four trips
 *   back down the card past a submit button that kept moving.
 *
 * `message_id` travels with it so the server can rewrite this message's card
 * into a receipt. Without it, reopening the app shows a question that was
 * answered days ago.
 */

const CATEGORY_LABEL: Record<ExerciseCategory, StringKey> = {
  strength: 'workout.strength',
  cardio: 'workout.cardio',
  class: 'workout.classMobile',
  sport: 'workout.sport',
  flexibility: 'workout.flexibilityMobile',
};

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
  const tr = useT();
  const locale = useLocale();
  const units = useUnits();

  /**
   * What the session is when its exercises cannot say.
   *
   * Still needed after the chips went, for two cases that are both real: a
   * card that has nothing in it yet, and one that is only ever going to be a
   * duration. `suggested_category` is the agent's read of the sentence, which
   * is the best guess available before anybody has picked anything.
   */
  const opensOn: ExerciseCategory = editing?.category ?? card?.suggested_category ?? 'strength';
  /** Only consulted while the session is empty; `categoryOf` wins otherwise. */
  const [fallbackCategory, setFallbackCategory] = useState<ExerciseCategory>(opensOn);
  /** Null means "use the guess" — see `guessLength`. */
  const [minutes, setMinutes] = useState<number | null>(editing?.duration_min ?? null);
  const [showLength, setShowLength] = useState(false);
  const [picking, setPicking] = useState(false);
  const [types, setTypes] = useState<ExerciseType[] | null>(null);
  const [last, setLast] = useState<LastWorkout | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  /** Which saved routine this session is, once one has been tapped. */
  const [routineId, setRoutineId] = useState<string | null>(null);
  /** Non-null once they have asked for this session to become a routine. */
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [saving, setSaving] = useState(false);

  const category = categoryOf(exercises, fallbackCategory);
  const empty = exercises.length === 0;

  /*
   * The catalogue, whole.
   *
   * No category argument any more, which is what lets the chips go: the picker
   * has to be able to reach a sport from a card that opened on strength,
   * because the card no longer knows which it is until something is picked.
   * `listExerciseTypes` has always taken the filter as optional, so this costs
   * one read of a couple of hundred rows and no server change.
   */
  useEffect(() => {
    let cancelled = false;
    void api
      .exerciseTypes(undefined, { withPrevious: true })
      .then(({ types }) => !cancelled && setTypes(types))
      .catch(() => !cancelled && setTypes([]));
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * The two "start from" reads, on the kind the card opened on.
   *
   * Deliberately not on the derived category: these only ever appear while the
   * session is empty, so the derived answer is `fallbackCategory` anyway, and
   * re-reading them every time an exercise is added would be a round trip to
   * refresh offers that are no longer on screen.
   */
  useEffect(() => {
    let cancelled = false;
    setLast(null);
    setRoutines([]);
    void api
      .lastWorkout(fallbackCategory)
      .then(({ workout }) => !cancelled && setLast(workout))
      .catch(() => {
        /* Never having done one is an ordinary answer; so is a failed lookup. */
      });
    void api
      .routines(fallbackCategory)
      .then(({ routines }) => !cancelled && setRoutines(routines))
      .catch(() => {
        /* Having saved none is the normal state for a new account. */
      });
    return () => {
      cancelled = true;
    };
  }, [fallbackCategory]);

  /*
   * The grid, filled in from the session being corrected.
   *
   * Waits for the catalogue because a draft needs `tracks` to know whether a
   * set is reps-and-a-load or a duration, and the stored set carries only its
   * name — the same match `lastWorkout` does on the server, done here because
   * this is where the catalogue already is. Once, guarded by the ref.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || types === null) return;
    if (editing) {
      seeded.current = true;
      setExercises(draftsFrom(editing, types, units));
      return;
    }
    /*
     * A card handed over from the conversation, holding what was already said.
     *
     * `?? []` rather than a bare read: cards are stored as JSON on the message
     * and every one written before this field existed comes back without it.
     */
    const heard = card?.exercises ?? [];
    if (heard.length === 0) return;
    seeded.current = true;
    setExercises(draftsFromHeard(heard, types, units, fallbackCategory));
  }, [editing, card, types, units, fallbackCategory]);

  const filled = exercises.filter((e) => toExercise(e, units) !== null);
  /**
   * The length that will actually be sent.
   *
   * A stated number always wins. Past that, a session with exercises in it gets
   * the guess — it is only pricing a burn the app already reports as an
   * estimate — and an empty one gets nothing, because then the duration is the
   * entire content of the session and guessing it would be inventing the whole
   * record.
   */
  const guessed = guessLength(routineOf(routineId, routines)?.duration_min ?? null, last?.duration_min ?? null);
  const length = minutes ?? (empty ? null : guessed);
  const counted = withSessionLength(exercises, units, length);
  const canSend = (length !== null || counted.length > 0) && !saving;
  const today = new Date().getDay();
  /*
   * Today's workout first, then whatever was done most recently. Still only an
   * ordering — nothing is preselected, because logging the wrong workout is a
   * worse outcome than one extra tap.
   */
  const todays = routineOnWeekday(routines, today);
  const ordered = [...routines].sort(
    (a, b) => Number(b.id === todays?.id) - Number(a.id === todays?.id),
  );
  const alreadySaved =
    routineId !== null ||
    matchRoutine(
      filled.map((e) => e.typeId).filter((id): id is string => id !== null),
      routines,
      ROUTINE_MATCH_LIKELY,
    ) !== null;
  const offerSave = !alreadySaved && canSend && !empty;
  // Named in the words they already use: somebody whose routines are "Push" and
  // "Pull" should not be offered "Chest & Triceps".
  const suggestedName =
    exercises.length === 1 && exercises[0]!.muscles.length === 0
      ? exercises[0]!.name
      : filled.length > 0
        ? nameFromMuscles(
            filled.map((e) => e.muscles[0]).filter((m): m is MuscleGroup => m !== undefined),
            namingStyleOf(routines.map((r) => r.name)),
          )
        : tr(CATEGORY_LABEL[category]);

  /**
   * Everything ticked in the picker, in one go.
   *
   * `draftFromType` reads `type.previous`, which arrived with the catalogue, so
   * this is the moment the whole change pays out: tapping four exercises and
   * Add puts four filled lines on screen rather than four empty grids.
   */
  function addExercises(picked: ExerciseType[]) {
    haptics.press();
    setExercises((prev) => [...prev, ...picked.map((type) => draftFromType(type, units))]);
    setPicking(false);
  }

  /**
   * Teaching the app an exercise it has never heard of, and adding it.
   *
   * The name and the kind are all that is sent; the server fills the rest in.
   * Somebody who has just failed to find their exercise wants it to exist, and
   * asking them for a metabolic equivalent is how a two-second fix becomes an
   * abandoned form. The kind is the session's current one, which is the only
   * thing the card knows about what they are doing.
   */
  async function defineExercise(name: string) {
    try {
      const { type } = await api.defineExercise({ name, category });
      setTypes((prev) => (prev ? [type, ...prev.filter((t) => t.id !== type.id)] : [type]));
      addExercises([type]);
    } catch (e) {
      onError(messageOf(e, tr));
    }
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
        muscles: exercise.muscles ?? [],
        equipment: exercise.equipment ?? null,
        category: fallbackCategory,
        sets: exercise.sets.map((set) => toDraftSet(set, units)),
        // These *are* last time. Printing "last time" above numbers somebody
        // is looking at as last time's would be saying it twice.
        previous: [],
      })),
    );
    // Whatever it actually was, not the nearest chip to it.
    if (minutes === null && last.duration_min !== null) setMinutes(last.duration_min);
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
        const previous = exercise.previous.map((set) => toDraftSet(set, units));
        // Never fewer rows than the plan calls for: a routine that says three
        // sets shows three, even the first time, when there is no history.
        const wanted = Math.max(exercise.target_sets ?? 1, previous.length, 1);
        return {
          name: exercise.name,
          typeId: exercise.type_id,
          tracks: exercise.tracks,
          emoji: exercise.emoji,
          muscles: exercise.muscles,
          equipment: exercise.equipment ?? null,
          category: routine.category ?? fallbackCategory,
          sets: Array.from(
            { length: wanted },
            (_, i) => previous[i] ?? { ...(previous.at(-1) ?? blankSet()) },
          ),
          previous,
        };
      }),
    );
    // A routine that is only a length carries it here: there is no grid to open
    // and the duration *is* the workout.
    if (routine.duration_min !== null) setMinutes(routine.duration_min);
    // Saving one of these again would be saving what it already is.
    setSaveAs(null);
  }

  async function send() {
    setSaving(true);
    try {
      const payload = {
        category,
        exercises: counted,
        duration_min: length,
        routine_id: routineId,
        /*
         * A correction keeps the session where it happened. Falling through to
         * now would quietly move Tuesday's session onto Thursday because
         * somebody fixed a typo in it.
         */
        performed_at: editing?.performed_at ?? card?.performed_at,
      };

      const entry = editing
        ? await api.updateWorkout(editing.id, payload)
        : await api.logWorkout({ ...payload, message_id: messageId });

      /*
       * Saving the routine comes after the session and never instead of it. A
       * failure here must not cost them the workout.
       */
      if (saveAs && saveAs.trim().length > 0) {
        await api
          .saveRoutine({
            name: saveAs.trim(),
            category,
            from_entry_id: entry.id,
            duration_min: length,
          })
          .catch(() => onError(tr('workout.routineNotSavedMobile')));
      }

      haptics.logged();
      onLogged(entry);
    } catch (e) {
      onError(messageOf(e, tr));
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
        {editing ? tr('workout.fixWhatsWrong') : tr('workout.whatDidYouDo')}
      </Text>
      {card?.heard && (
        <Text style={[t.footnote, styles.heard, { color: colors.mutedForeground }]}>
          {card.heard}
        </Text>
      )}

      {/*
        One row of "you probably did this", and only while there is nothing to
        undo by tapping it. This used to be four separate offers — routine
        chips under their own heading, "same as Tuesday", "add what you did",
        and the picker's own recents — all competing for one job and all on
        screen at once, which is most of why the card read as a form.
      */}
      {empty && (ordered.length > 0 || last !== null) && (
        <View style={styles.offers}>
          {ordered.map((routine) => (
            <Pressable
              key={routine.id}
              onPress={() => openRoutine(routine)}
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
                {routine.emoji} {routine.name}
                {routine.id === todays?.id ? ` ${tr('workout.today')}` : ''}
              </Text>
            </Pressable>
          ))}
          {last && (
            <Pressable
              onPress={repeatLast}
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
                {tr('workout.sameAsShort')(when(last.local_date, locale, tr))}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {exercises.map((exercise, i) => (
        <SetEditor
          key={`${exercise.typeId ?? exercise.name}-${i}`}
          exercise={exercise}
          units={units}
          onChange={(next) => setExercises((prev) => prev.map((e, j) => (j === i ? next : e)))}
          onRemove={() => setExercises((prev) => prev.filter((_, j) => j !== i))}
        />
      ))}

      <Pressable
        onPress={() => {
          haptics.press();
          setPicking(true);
        }}
        accessibilityRole="button"
        hitSlop={6}
        style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[t.footnoteBold, { color: colors.exerciseText }]}>
          {tr('workout.addExercises')}
        </Text>
      </Pressable>

      {/*
        The length, demoted.
        Its only job is pricing the burn — the sets contribute nothing to it —
        so it stopped being the loudest control on the card. With exercises in
        the session it is a guess printed the way this app prints every other
        estimate; with none, it is the whole answer and has to be asked for.
      */}
      <Pressable
        onPress={() => {
          haptics.press();
          setShowLength((was) => !was);
        }}
        accessibilityRole="button"
        accessibilityLabel={tr('workout.howLong')}
        hitSlop={6}
        style={({ pressed }) => [styles.lengthRow, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.lengthValue, { color: colors.mutedForeground }]}>
          {length === null
            ? tr('workout.howLong')
            : minutes === null
              ? tr('workout.aboutLength')(String(length))
              : tr('workout.exactLength')(String(length))}
        </Text>
        {length !== null && minutes === null && (
          <Text style={[styles.lengthHint, { color: colors.mutedForeground }]}>
            {tr('workout.tapToFix')}
          </Text>
        )}
      </Pressable>

      {(showLength || (empty && length === null)) && (
        <Duration minutes={minutes} onChange={setMinutes} />
      )}

      {/*
        The kind, asked only when nothing can answer it.
        `categoryOf` reads it off the exercises the moment there is one, which
        is what deleted this row from the top of the card — but a session that
        is only a duration has nothing to read, and the burn depends on it.
      */}
      {empty && (
        <>
          <Text style={[t.footnote, styles.label, { color: colors.mutedForeground }]}>
            {tr('workout.whatKind')}
          </Text>
          <View style={styles.chips}>
            {EXERCISE_CATEGORIES.map((key) => {
              const on = fallbackCategory === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    haptics.press();
                    setFallbackCategory(key);
                    setRoutineId(null);
                    setSaveAs(null);
                  }}
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
                      styles.categoryLabel,
                      { color: on ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {tr(CATEGORY_LABEL[key])}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
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
              {tr('workout.saveThisAs')(suggestedName)}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.saveRow}>
            <TextInput
              value={saveAs}
              onChangeText={setSaveAs}
              accessibilityLabel={tr('workout.nameForThis')}
              placeholder={tr('workout.nameIt')}
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
              accessibilityLabel={tr('workout.dontSave')}
              hitSlop={8}
            >
              <Cross color={colors.mutedForeground} />
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
                ? tr('common.saving')
                : tr('workout.saveChanges')
              : saving
                ? tr('common.saving')
                : tr('workout.logIt')}
          </Text>
        </PressableChunk>
      </View>

      <PickerSheet
        open={picking}
        types={types}
        chosen={chosen}
        onClose={() => setPicking(false)}
        onAdd={addExercises}
        onDefine={(name) => void defineExercise(name)}
      />
    </Chunk>
  );
}

/**
 * The picker, full screen.
 *
 * It used to live inline at the bottom of the card, which cost twice: the card
 * grew by a search box, fourteen chips and a list every time it opened, and
 * every pick collapsed it again and pushed "Log it" further away. Four
 * exercises was four trips down a growing card.
 *
 * A modal is also what makes multi-select honest — the tick marks have somewhere
 * to live, and "Add 4" has a footer to sit in that does not move.
 */
function PickerSheet({
  open,
  types,
  chosen,
  onClose,
  onAdd,
  onDefine,
}: {
  open: boolean;
  types: ExerciseType[] | null;
  chosen: Set<string | null>;
  onClose: () => void;
  onAdd: (types: ExerciseType[]) => void;
  onDefine: (name: string) => void;
}) {
  const colors = useColors();
  const tr = useT();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View
          style={[styles.sheetBar, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}
        >
          <Text style={[t.bodyBold, { color: colors.foreground }]}>
            {tr('workout.pickExercises')}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={tr('common.close')}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Cross color={colors.mutedForeground} size={20} />
          </Pressable>
        </View>
        <View style={[styles.sheetBody, { paddingBottom: insets.bottom }]}>
          <ExercisePicker types={types} chosen={chosen} onAdd={onAdd} onDefine={onDefine} />
        </View>
      </View>
    </Modal>
  );
}

function Cross({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 6l12 12M18 6L6 18"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/** The routine a session came from, for reading its length back off. */
function routineOf(id: string | null, routines: Routine[]): Routine | null {
  return routines.find((routine) => routine.id === id) ?? null;
}

/**
 * How long it took, when they want to say rather than accept the guess.
 *
 * Chips, because nobody times a gym session to the minute and "about an hour"
 * is both the true answer and the one that costs a single tap. Two hours of
 * football is an ordinary Sunday, so 120 is on the scale, and "Other" opens a
 * keypad for everything else.
 */
function Duration({
  minutes,
  onChange,
}: {
  minutes: number | null;
  onChange: (next: number | null) => void;
}) {
  const colors = useColors();
  const tr = useT();
  const offScale = minutes !== null && !SESSION_DURATIONS.some((d) => d === minutes);
  const [typing, setTyping] = useState(offScale);

  return (
    <>
      <View style={styles.durations}>
        {SESSION_DURATIONS.map((value) => {
          const on = minutes === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                haptics.press();
                setTyping(false);
                onChange(on ? null : value);
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
                {sessionDurationLabel(value)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            haptics.press();
            setTyping((was) => !was);
          }}
          accessibilityRole="button"
          accessibilityLabel={tr('workout.otherLength')}
          accessibilityState={{ selected: typing || offScale }}
          style={({ pressed }) => [
            styles.duration,
            {
              backgroundColor: offScale ? colors.primary : colors.muted,
              borderColor: offScale ? 'transparent' : colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.durationLabel,
              { color: offScale ? colors.primaryForeground : colors.mutedForeground },
            ]}
          >
            {tr('workout.otherLength')}
          </Text>
        </Pressable>
      </View>

      {typing && (
        <TextInput
          value={offScale && minutes !== null ? String(minutes) : ''}
          onChangeText={(next) => {
            const cleaned = next.replace(/[^0-9]/g, '');
            onChange(cleaned === '' ? null : Math.min(1440, Number(cleaned)));
          }}
          placeholder={tr('workout.minutesLabel')}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={tr('workout.minutesLabel')}
          keyboardType="number-pad"
          autoFocus
          style={[
            t.bodySemibold,
            styles.otherLength,
            {
              backgroundColor: colors.mutedField,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
        />
      )}
    </>
  );
}

/**
 * A logged session, back in the shape the card collects.
 *
 * Sets arrive flat and carry the exercise they belong to as a `position`, so
 * they are regrouped here in that order. The load comes back out in whatever
 * the reader uses — it went in as kilograms, and the field it lands in is the
 * same field it was typed into.
 *
 * `previous` is left empty deliberately. These *are* the numbers being
 * corrected, and printing "last time" above a set somebody is fixing would be
 * showing them a session they are already looking at.
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
        equipment: type?.equipment ?? null,
        category: type?.category ?? category,
        sets: [],
        previous: [],
      };
      byPosition.set(set.position, draft);
    }
    draft.sets.push(toDraftSet(set, units));
  }

  return [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, draft]) => draft);
}

/**
 * "Tuesday" for anything inside the last week, a date beyond it. A session two
 * months old is worth offering back but not worth calling recent.
 */
function when(localDate: string, locale: Locale, tr: ReturnType<typeof useT>): string {
  const then = new Date(`${localDate}T12:00:00`);
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return tr('common.today').toLocaleLowerCase(locale);
  if (days === 1) return tr('common.yesterday').toLocaleLowerCase(locale);
  // `undefined` used to mean "whatever locale the OS is in", which is not the
  // language the rest of this sentence is written in.
  if (days < 7) return then.toLocaleDateString(locale, { weekday: 'long' });
  return then.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14 },
  heard: { marginTop: 4, lineHeight: 20 },
  label: { marginTop: 14, marginBottom: 6 },
  offers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  categoryLabel: { fontFamily: font.bold, fontSize: 13, lineHeight: 18 },
  addRow: { marginTop: 14 },
  lengthRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 },
  lengthValue: { fontFamily: font.displaySemibold, fontSize: 15, lineHeight: 20 },
  lengthHint: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  durations: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  duration: { flex: 1, alignItems: 'center', borderWidth: 2, borderRadius: 999, paddingVertical: 8 },
  durationLabel: { fontFamily: font.display, fontSize: 15, lineHeight: 18 },
  otherLength: {
    height: 40,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
    marginTop: 6,
  },
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
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 2,
    marginTop: 14,
    paddingTop: 14,
  },
  send: { paddingHorizontal: 18, paddingVertical: 9 },
  sheet: { flex: 1 },
  sheetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sheetBody: { flex: 1 },
});
