import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { ExercisePicker } from './ExercisePicker';
import { SetEditor } from './SetEditor';
import {
  CATEGORY_EMOJI,
  CATEGORY_TRACKS,
  blankSet,
  draftFromType,
  draftsFromHeard,
  isExercise,
  toDraftSet,
  toExercise,
  type DraftExercise,
} from './draft';

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

  /* Held apart so the initial `detail` can read it without narrowing itself. */
  const opensOn: ExerciseCategory = editing?.category ?? card?.suggested_category ?? 'strength';
  const [category, setCategory] = useState<ExerciseCategory>(opensOn);
  const [minutes, setMinutes] = useState<number | null>(editing?.duration_min ?? null);
  /*
   * Whether the exercises are on screen.
   *
   * True for a correction — the numbers being fixed are in there, and making
   * somebody tap "add what you did" to reach their own sets would be hiding the
   * entire reason the card reopened.
   *
   * True for everything that is not strength, which is the change: a sport, a
   * class and a run are all *named things of a length*, so the picker naming
   * them has to be the first thing on screen. Strength keeps the offer behind a
   * tap, because a saved routine fills the whole card in one and the picker
   * would be a second, longer way to do what the chips above already did.
   */
  const [detail, setDetail] = useState(editing !== undefined || opensOn !== 'strength');
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
    /*
     * `withPrevious` is what makes tapping an exercise land on real numbers.
     * One extra join on the server, no extra round trip here, and it is the
     * difference between the picker handing back a filled card and a blank one.
     */
    void api
      .exerciseTypes(category, { withPrevious: true })
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
    setExercises(draftsFromHeard(heard, types, units, category));
    setDetail(true);
  }, [editing, card, types, units, category]);

  const filled = exercises.filter((e) => toExercise(e, units) !== null);
  const counted = exercises.map((e) => toExercise(e, units)).filter(isExercise);
  const canSend = (minutes !== null || counted.length > 0) && !saving;
  const today = new Date().getDay();
  /*
   * Today's workout first, then whatever was done most recently.
   *
   * Read through `routineOnWeekday` rather than straight off `usual_weekday`,
   * which is what this did until a week somebody filled in by hand turned out
   * to change nothing here: they could declare Monday a push day, open the card
   * on Monday, and still be handed whatever the history had happened to notice.
   * A declared day now wins, exactly as it does on the week screen.
   *
   * Still only an ordering — nothing is preselected, because logging the wrong
   * workout is a worse outcome than one extra tap.
   */
  const todays = routineOnWeekday(routines, today);
  const ordered = [...routines].sort(
    (a, b) => Number(b.id === todays?.id) - Number(a.id === todays?.id),
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
        tr(CATEGORY_LABEL[category]);

  /**
   * Adding one from the picker, opened on the last time they did it.
   *
   * `draftFromType` reads `type.previous`, which arrived with the catalogue, so
   * this is the moment the whole change pays out: tapping "Bench press" puts
   * 3 × 10 @ 60 on screen rather than three empty rows.
   */
  function addExercise(type: ExerciseType) {
    haptics.press();
    setExercises((prev) => [...prev, draftFromType(type, units)]);
    setDetail(true);
  }

  /**
   * Teaching the app an exercise it has never heard of, and adding it.
   *
   * The name and the kind are all that is sent; the server fills the rest in
   * from the category. Somebody who has just failed to find their exercise
   * wants it to exist, and asking them for a metabolic equivalent to get there
   * is how a two-second fix becomes an abandoned form.
   */
  async function defineExercise(name: string) {
    try {
      const { type } = await api.defineExercise({ name, category });
      setTypes((prev) => (prev ? [type, ...prev.filter((t) => t.id !== type.id)] : [type]));
      addExercise(type);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  /** Opens the grid on the last session of this kind rather than on nothing. */
  function repeatLast() {
    if (!last) return;
    haptics.press();
    setExercises(
      last.exercises.map((exercise) => {
        const sets = exercise.sets.map((set) => toDraftSet(set, units));
        return {
          name: exercise.name,
          typeId: exercise.type_id,
          tracks: exercise.tracks,
          emoji: exercise.emoji,
          muscles: [],
          sets,
          // These *are* last time. Printing "last time" above numbers somebody
          // is looking at as last time's would be saying it twice.
          previous: [],
        };
      }),
    );
    // Whatever it actually was, not the nearest chip to it. Rounding a
    // remembered two hours down to ninety minutes was how a long session
    // quietly lost half an hour every time it was offered back.
    if (minutes === null && last.duration_min !== null) setMinutes(last.duration_min);
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
          sets: Array.from({ length: wanted }, (_, i) => previous[i] ?? { ...(previous.at(-1) ?? blankSet()) }),
          previous,
        };
      }),
    );
    // A routine that is only a length carries it here: there is no grid to open
    // and the duration *is* the workout, so tapping the chip has to fill it in
    // or the chip does nothing at all.
    if (routine.duration_min !== null) setMinutes(routine.duration_min);
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
          .catch(() => onError(tr('workout.routineNotSavedMobile')));
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

  const detailBlock = detail ? (
    <>
      {exercises.map((exercise, i) => (
        <SetEditor
          key={`${exercise.typeId ?? exercise.name}-${i}`}
          exercise={exercise}
          units={units}
          onChange={(next) =>
            setExercises((prev) => prev.map((e, j) => (j === i ? next : e)))
          }
          onRemove={() => setExercises((prev) => prev.filter((_, j) => j !== i))}
        />
      ))}
      <View style={[styles.picker, { borderTopColor: colors.border }]}>
        <ExercisePicker
          types={types}
          chosen={chosen}
          onPick={addExercise}
          onDefine={(name) => void defineExercise(name)}
        />
      </View>
    </>
  ) : null;

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
                setDetail(key !== 'strength');
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
                {tr(CATEGORY_LABEL[key])}
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
            {tr('workout.yourWorkouts')}
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
                    {routine.id === todays?.id && !on ? tr('workout.today') : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/*
        Which half of the card leads, decided by the kind of session.

        A sport or a class *is* its length — "two hours of volleyball" is the
        whole answer — so the question comes first and the picker sits above it
        naming which sport, one tap. A strength session is the opposite: the
        exercises are the session and the duration is the throwaway that prices
        the burn, so it stays where it was and the grid follows it.
      */}
      {category !== 'strength' && detailBlock}

      <Text style={[t.footnote, styles.label, { color: colors.mutedForeground }]}>{tr('workout.howLong')}</Text>
      <Duration minutes={minutes} onChange={setMinutes} />

      {category === 'strength' && detailBlock}


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
              {tr('workout.addWhatYouDid')}
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
                {tr('workout.sameAsShort')(when(last.local_date, locale, tr))}
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
                : tr('workout.saveChanges')
              : saving
                ? 'Logging…'
                : tr('workout.logIt')}
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

/**
 * How long it took.
 *
 * Chips, because nobody times a gym session to the minute and "about an hour"
 * is both the true answer and the one that costs a single tap. The scale used
 * to stop at 90, which was not a rounding problem: two hours of football is an
 * ordinary Sunday and there was no chip for it and no way to type one, so the
 * card could not log it at all and the session had to go through the chat.
 *
 * So 120 is on the scale, and "Other" opens a keypad for everything else.
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
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  category: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  categoryLabel: { fontFamily: font.bold, fontSize: 13, lineHeight: 18 },
  label: { marginTop: 14, marginBottom: 6 },
  durations: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  otherLength: {
    height: 40,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
    marginTop: 6,
  },
  duration: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 8,
  },
  durationLabel: { fontFamily: font.display, fontSize: 15, lineHeight: 18 },
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
