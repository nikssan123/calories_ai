'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Loader2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
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
  WorkoutExercise,
} from '@ct/shared';
import {
  ROUTINE_MATCH_LIKELY,
  SESSION_DURATIONS,
  distanceToKm,
  distanceUnit,
  formatNumber,
  loadStep,
  loadToKg,
  loadUnit,
  matchRoutine,
  nameFromMuscles,
  namingStyleOf,
  routineOnWeekday,
  sessionDurationLabel,
  toDistance,
  toLoad,
} from '@ct/shared';
import { ExercisePicker } from './ExercisePicker';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * The card that asks.
 *
 * Every other card in this app is a receipt for something that already
 * happened. "Went to the gym" is not one of those — it is not a loggable fact,
 * and the things that would make it one are things the user knows and the model
 * would only guess at.
 *
 * What it asks for is deliberately small. The burn — the only number this app
 * structurally needs from a session — is category, bodyweight and time; reps
 * and kilos contribute nothing to it. So the complete answer is a kind and a
 * duration, which is one tap, and everything below that is a training record
 * the app is glad to keep and has no standing to demand.
 *
 * The first version of this card demanded it anyway: twenty-four catalogue
 * chips, then two number fields per set. On 2026-08-23 it was drawn for a full
 * body session, left untouched, and the session was typed into the chat instead
 * as a sentence. Eleven exercises and twenty-eight sets is fifty-six numbers to
 * enter from memory after the fact, which is a during-the-session logger's job
 * and not this one's.
 */

const CATEGORIES: { key: ExerciseCategory; label: StringKey; emoji: string }[] = [
  { key: 'strength', label: 'workout.strength', emoji: '🏋️' },
  { key: 'cardio', label: 'workout.cardio', emoji: '🏃' },
  { key: 'class', label: 'workout.class', emoji: '🤸' },
  { key: 'sport', label: 'workout.sport', emoji: '⚽' },
  { key: 'flexibility', label: 'workout.flexibility', emoji: '🧘' },
];

type DraftSet = { reps: string; weight: string; minutes: string; distance: string };

interface Draft {
  name: string;
  typeId: string | null;
  tracks: ExerciseType['tracks'];
  emoji: string;
  muscles: MuscleGroup[];
  sets: DraftSet[];
  /**
   * What they did last time, for the line above the numbers.
   *
   * Kept beside the sets rather than compared against them, because it has to
   * survive being edited: the whole point of printing it is that somebody who
   * has just added a plate can still see what they are beating.
   */
  previous: DraftSet[];
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
}) {
  /* Held apart so the initial `detail` can read it without narrowing itself. */
  const opensOn: ExerciseCategory | null = editing?.category ?? card?.suggested_category ?? null;
  const [category, setCategory] = useState<ExerciseCategory | null>(opensOn);
  const [minutes, setMinutes] = useState<number | null>(editing?.duration_min ?? null);
  /*
   * Whether the exercises are on screen.
   *
   * True for a correction — the numbers being fixed are in there, and making
   * somebody click "add what you did" to reach their own sets would be hiding
   * the entire reason the card reopened.
   *
   * True for everything that is not strength, which is the change: a sport, a
   * class and a run are all *named things of a length*, so the picker naming
   * them has to be the first thing on screen. Strength keeps the offer behind a
   * click, because a saved routine fills the whole card in one and the picker
   * would be a second, longer way to do what the chips above already did.
   */
  const [detail, setDetail] = useState(
    editing !== undefined || (opensOn !== null && opensOn !== 'strength'),
  );
  const [types, setTypes] = useState<ExerciseType[] | null>(null);
  const [last, setLast] = useState<LastWorkout | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  /** Which saved routine this session is, once one has been tapped. */
  const [routineId, setRoutineId] = useState<string | null>(null);
  /** Non-null once they have asked for this session to become a routine. */
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const t = useT();
  const locale = useLocale();
  const units = useUnits();
  // Latched the moment a post goes out, and only released if it fails. The
  // disabled button covers the second tap of a double-tap on a slow phone;
  // this covers the one that beats the re-render to it.
  const posted = useRef(false);

  /*
   * Both reads fire on the kind, not on opening the detail section: the "same
   * as last time" line has to be on screen *before* anyone decides whether
   * filling a grid is worth it, or it is an offer nobody sees.
   */
  useEffect(() => {
    if (!category) return;
    let cancelled = false;
    setTypes(null);
    setLast(null);
    setRoutines([]);
    setRoutineId(null);
    /* `withPrevious` is what makes tapping an exercise land on real numbers:
       one extra join on the server, no extra round trip here. */
    void api
      .exerciseTypes(category, { withPrevious: true })
      .then(({ types }) => !cancelled && setTypes(types))
      .catch(() => !cancelled && setTypes([]));
    void api
      .lastWorkout(category)
      .then(({ workout }) => !cancelled && setLast(workout))
      .catch(() => {
        /* No previous session is an ordinary answer; so is a failed lookup. */
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

  /**
   * Adding one from the picker, opened on the last time they did it.
   *
   * `type.previous` arrived with the catalogue, so this is where the change
   * pays out: tapping "Bench press" puts 3 × 10 @ 60 on screen rather than
   * three empty rows. An exercise never done before still gets one blank set —
   * that is the honest state, and a made-up 3 × 10 would be the app inventing a
   * training history.
   */
  function addExercise(type: ExerciseType) {
    const previous = type.previous.map((set) => toDraftSet(set, units));
    setDrafts((prev) => [
      ...prev,
      {
        name: type.name,
        typeId: type.id,
        tracks: type.tracks,
        emoji: type.emoji,
        muscles: type.muscles,
        sets: previous.length > 0 ? previous.map((set) => ({ ...set })) : [blankSet()],
        previous,
      },
    ]);
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
    if (!category) return;
    try {
      const { type } = await api.defineExercise({ name, category });
      setTypes((prev) => (prev ? [type, ...prev.filter((t) => t.id !== type.id)] : [type]));
      addExercise(type);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** Opens the grid on the last session of this kind rather than on nothing. */
  function repeatLast() {
    if (!last) return;
    setDrafts(
      last.exercises.map((exercise) => ({
        name: exercise.name,
        typeId: exercise.type_id,
        tracks: exercise.tracks,
        emoji: exercise.emoji,
        muscles: [],
        sets: exercise.sets.map((set) => toDraftSet(set, units)),
        // These *are* last time. Printing "last time" above numbers somebody is
        // looking at as last time's would be saying it twice.
        previous: [],
      })),
    );
    // Whatever it actually was, not the nearest chip to it. Rounding a
    // remembered two hours down to ninety was how a long session quietly lost
    // half an hour every time it was offered back.
    if (minutes === null && last.duration_min !== null) setMinutes(last.duration_min);
    setDetail(true);
  }

  /**
   * Tapping a saved workout fills the whole grid in.
   *
   * Including the numbers: `previous` is what they did last time this exercise
   * came up, which is the right thing to put in front of somebody about to do
   * it again. They adjust the one lift that moved and send it, which is the
   * whole feature — the alternative is retyping eight exercises to say that one
   * of them went up two and a half kilos.
   */
  function openRoutine(routine: Routine) {
    setRoutineId(routine.id);
    setDrafts(
      routine.exercises.map((exercise) => {
        const previous = exercise.previous.map((set) => toDraftSet(set, units));
        // Never fewer rows than the plan calls for: a routine that says three
        // sets shows three, even the first time, when there is no history.
        const wanted = Math.max(exercise.target_sets ?? 1, previous.length, 1);
        const sets = Array.from(
          { length: wanted },
          (_, i) => previous[i] ?? { ...(previous.at(-1) ?? blankSet()) },
        );
        return {
          name: exercise.name,
          typeId: exercise.type_id,
          tracks: exercise.tracks,
          emoji: exercise.emoji,
          muscles: exercise.muscles,
          sets,
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
    setDrafts(draftsFrom(editing, types, units));
  }, [editing, types, units]);

  async function submit() {
    const exercises = drafts
      .map((d) => toExercise(d, units))
      .filter((e): e is WorkoutExercise => e !== null);
    // Either half is a complete answer, but one of them has to be there: with
    // no duration and no sets there is nothing to compute a session from.
    if (!category || posted.current || (minutes === null && exercises.length === 0)) return;

    posted.current = true;
    setSaving(true);
    try {
      const payload = {
        category,
        exercises,
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
       * Saving the routine comes after the session and never instead of it.
       *
       * A failure here must not cost them the workout — the session is the
       * thing they came to record, and a routine that did not save is worth a
       * toast and nothing more.
       */
      if (saveAs && saveAs.trim().length > 0) {
        try {
          await api.saveRoutine({
          name: saveAs.trim(),
          category,
          from_entry_id: entry.id,
          duration_min: minutes,
        });
          toast.success(t('workout.savedRoutine')(saveAs.trim()));
        } catch {
          toast.error(t('workout.routineNotSaved'));
        }
      }

      const burned = formatNumber(Math.round(entry.kcal_burned), locale);
      toast.success(
        editing
          ? t('workout.updated')(entry.description, burned)
          : t('workout.logged')(entry.description, burned),
      );
      // The parent swaps this card for the receipt; nothing here needs to
      // stand back up afterwards.
      onLogged(entry);
    } catch (e) {
      // A session that never landed is worth another go — one that did is not.
      posted.current = false;
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Picking a kind -------------------------------------------------------

  if (!category) {
    return (
      <Shell heard={card?.heard ?? null} editing={editing !== undefined}>
        <div className="grid grid-cols-5 gap-1.5 px-3 pb-3">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setCategory(c.key);
                // A sport picker has to be on screen the moment Sport is
                // chosen, or naming the sport is a second click for no reason.
                setDetail(c.key !== 'strength');
              }}
              className="bg-muted/60 hover:bg-muted flex flex-col items-center gap-1 rounded-xl px-1 py-2.5"
            >
              <span className="text-xl" aria-hidden>
                {c.emoji}
              </span>
              <span className="text-[11px] leading-tight">{t(c.label)}</span>
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  // ---- The session ----------------------------------------------------------

  const chosen = new Set(drafts.map((d) => d.typeId));

  const detailBlock = detail ? (
    <div className="space-y-3">
      {drafts.map((draft, i) => (
        <ExerciseRow
          key={`${draft.typeId ?? draft.name}-${i}`}
          draft={draft}
          onChange={(next) => setDrafts((prev) => prev.map((d, j) => (j === i ? next : d)))}
          onRemove={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
        />
      ))}
      <ExercisePicker
        types={types}
        chosen={chosen}
        onPick={addExercise}
        onDefine={(name) => void defineExercise(name)}
      />
    </div>
  ) : null;
  const filled = drafts.filter((d) => toExercise(d, units) !== null);
  const ready = minutes !== null || filled.length > 0;
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
      filled.map((d) => d.typeId).filter((id): id is string => id !== null),
      routines,
      ROUTINE_MATCH_LIKELY,
    ) !== null;
  const offerSave = !alreadySaved && ready;
  // Named in the words they already use: somebody whose routines are "Push" and
  // "Pull" should not be offered "Chest & Triceps".
  const suggestedName =
    filled.length > 0
      ? nameFromMuscles(
          filled.map((d) => d.muscles[0]).filter((m): m is MuscleGroup => m !== undefined),
          namingStyleOf(routines.map((r) => r.name)),
        )
      : // Nothing to read muscles off. The kind is all this session is, so it is
        // also the most it can honestly be called.
        (() => {
          const label = CATEGORIES.find((c) => c.key === category)?.label;
          return label ? t(label) : t('workout.fallbackName');
        })();

  return (
    <Shell heard={card?.heard ?? null} editing={editing !== undefined}>
      <div className="space-y-3 px-3 pb-3">
        <div className="flex items-center justify-between">
          <p className="text-footnote text-muted-foreground">
            {(() => {
              const label = CATEGORIES.find((c) => c.key === category)?.label;
              return label ? t(label) : null;
            })()}
          </p>
          <button
            type="button"
            onClick={() => {
              setCategory(null);
              setMinutes(null);
              setDetail(false);
              setDrafts([]);
              setRoutineId(null);
              setSaveAs(null);
            }}
            className="text-footnote text-muted-foreground hover:text-foreground"
          >
            {t('workout.change')}
          </button>
        </div>

        {/* Their own workouts, before anything the app came up with. One tap
            fills the entire grid, which is the point of having saved them. */}
        {ordered.length > 0 && (
          <div>
            <p className="text-footnote text-muted-foreground mb-1.5">
              {t('workout.yourWorkouts')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ordered.map((routine) => {
                const on = routineId === routine.id;
                return (
                  <button
                    key={routine.id}
                    type="button"
                    onClick={() => openRoutine(routine)}
                    aria-pressed={on}
                    className={`text-footnote flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2.5 transition-colors ${
                      on ? 'bg-primary text-primary-foreground' : 'bg-muted/60 hover:bg-muted'
                    }`}
                  >
                    <span aria-hidden>{routine.emoji}</span>
                    {routine.name}
                    {routine.id === todays?.id && !on && (
                      <span className="text-muted-foreground">{t('workout.today')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/*
          Which half of the card leads, decided by the kind of session.

          A sport or a class *is* its length — "two hours of volleyball" is the
          whole answer — so the question comes first and the picker sits above
          it naming which sport, one click. A strength session is the opposite:
          the exercises are the session and the duration is the throwaway that
          prices the burn, so it stays where it was and the grid follows it.
        */}
        {category !== 'strength' && detailBlock}

        <div>
          <p className="text-footnote text-muted-foreground mb-1.5">{t('workout.howLong')}</p>
          <Duration minutes={minutes} onChange={setMinutes} />
        </div>

        {category === 'strength' && detailBlock}

        {!detail && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <button
              type="button"
              onClick={() => setDetail(true)}
              className="text-footnote text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Plus size={13} />
              {t('workout.addWhatYouDid')}
            </button>
            {last && (
              <button
                type="button"
                onClick={repeatLast}
                className="text-footnote text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <RotateCcw size={12} />
                {t('workout.sameAs')(when(last.local_date, locale, t))}
                <span className="opacity-70">
                  {t('workout.exerciseCount')(last.exercises.length)}
                </span>
              </button>
            )}
          </div>
        )}

        {offerSave &&
          (saveAs === null ? (
            <button
              type="button"
              onClick={() => setSaveAs(suggestedName)}
              className="text-footnote text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Bookmark size={12} />
              {t('workout.saveThisAs')(suggestedName)}
            </button>
          ) : (
            <div className="bg-muted/40 flex items-center gap-2 rounded-xl p-2.5">
              <Bookmark size={14} className="text-muted-foreground shrink-0" />
              <Input
                value={saveAs}
                onChange={(e) => setSaveAs(e.target.value)}
                aria-label={t('workout.nameForThis')}
                className="bg-card text-footnote h-9 rounded-lg border-0"
              />
              <button
                type="button"
                onClick={() => setSaveAs(null)}
                aria-label={t('workout.dontSave')}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ))}

        <Button
          onClick={() => void submit()}
          disabled={!ready || saving}
          className="h-10 w-full gap-2 rounded-xl"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {editing
            ? saving
              ? t('setup.saving')
              : t('workout.saveChanges')
            : saving
              ? t('recipe.logging')
              : t('workout.logSession')}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({
  heard,
  editing,
  children,
}: {
  heard: string | null;
  editing?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="bg-card animate-land overflow-hidden rounded-[var(--radius)] shadow-[0_1px_2px_rgba(23,22,20,0.05)]">
      <div className="px-4 pt-3.5 pb-2.5">
        <p className="text-body font-medium">
          {editing ? t('workout.fixWhatsWrong') : (heard ?? t('workout.whatDidYouDo'))}
        </p>
        <p className="text-footnote text-muted-foreground">{t('workout.roughlyIsFine')}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * One exercise in the card.
 *
 * The shape this replaced drew one row per set, each row two number fields:
 * nine fields for "three sets of ten at sixty", holding two distinct numbers.
 * That is the right form for a session where every set is different and the
 * wrong one for the ninety percent where they are not — and it was being paid
 * on every session because it was the only form there was.
 *
 * Three states, and which one you land in is decided for you: a **summary**
 * line when the numbers are already right (usually because they came from the
 * last time you did this), **steppers** when they are being changed, and the
 * old per-set **grid** the moment two sets disagree — which is the one case a
 * summary genuinely cannot describe.
 *
 * The model underneath never changes: one row per set, written out in full,
 * because the fourth set is where the reps drop and a count would throw away
 * the only record of that.
 */
function ExerciseRow({
  draft,
  onChange,
  onRemove,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const units = useUnits();

  const uniform = uniformSet(draft.sets);
  const [asked, setAsked] = useState<'summary' | 'steppers' | 'grid'>(() =>
    uniform !== null && anyValue(uniform) ? 'summary' : 'steppers',
  );
  // Two sets that disagree cannot be summarised or stepped, whatever was asked
  // for — so the grid wins outright rather than the line quietly lying.
  const mode = uniform === null ? 'grid' : asked;

  const previous = uniformSet(draft.previous);
  const setSets = (sets: DraftSet[]) => onChange({ ...draft, sets });
  const patch = (i: number, key: keyof DraftSet, value: string) =>
    setSets(draft.sets.map((s, j) => (j === i ? { ...s, [key]: value } : s)));
  const patchEvery = (key: keyof DraftSet, value: string) =>
    setSets(draft.sets.map((s) => ({ ...s, [key]: value })));

  return (
    <div className="bg-muted/40 space-y-2 rounded-xl p-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden>{draft.emoji}</span>
        <span className="text-footnote flex-1 truncate font-medium">{draft.name}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('workout.removeNamed')(draft.name)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>

      {/*
        What they did last time, printed rather than merely used.

        Hevy autofills the fields and the number becomes indistinguishable from
        one somebody entered. A prefilled figure is a claim you *accepted*, not
        one you made, and this app says where its numbers come from everywhere
        else. It is also the more useful of the two: the line you are trying to
        beat is the line you want on screen while you decide.
      */}
      {previous !== null && anyValue(previous) && (
        <p className="text-footnote text-muted-foreground">
          {t('workout.lastTime')(summarise(draft.previous, previous, draft.tracks, units, t))}
        </p>
      )}

      {mode === 'summary' && uniform !== null && (
        <button
          type="button"
          onClick={() => setAsked('steppers')}
          className="bg-card hover:bg-card/70 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors"
        >
          <span className="text-body font-display tabular-nums">
            {summarise(draft.sets, uniform, draft.tracks, units, t)}
          </span>
          <span className="text-footnote text-muted-foreground">{t('workout.adjust')}</span>
        </button>
      )}

      {mode === 'steppers' && uniform !== null && (
        <>
          <div className="flex gap-1.5">
            {/* A run is one effort, not three, and a sets stepper on it is a
                control nobody reaches for. Intervals go in the grid. */}
            {draft.tracks !== 'distance' && (
              <Stepper
                value={String(draft.sets.length)}
                caption={t('workout.setsLabel')}
                onStep={(d) => setSets(resize(draft.sets, draft.sets.length + d))}
                onType={(v) => setSets(resize(draft.sets, Number(v) || 1))}
                stepBy={1}
              />
            )}
            {draft.tracks === 'reps' && (
              <>
                <Stepper
                  value={uniform.reps}
                  caption={t('workout.reps')}
                  onStep={(d) => patchEvery('reps', step(uniform.reps, d))}
                  onType={(v) => patchEvery('reps', v)}
                  stepBy={1}
                />
                <Stepper
                  value={uniform.weight}
                  caption={loadUnit(units)}
                  onStep={(d) => patchEvery('weight', step(uniform.weight, d))}
                  onType={(v) => patchEvery('weight', v)}
                  stepBy={loadStep(units)}
                />
              </>
            )}
            {draft.tracks === 'duration' && (
              <Stepper
                value={uniform.minutes}
                caption={t('workout.min')}
                onStep={(d) => patchEvery('minutes', step(uniform.minutes, d))}
                onType={(v) => patchEvery('minutes', v)}
                stepBy={5}
              />
            )}
            {draft.tracks === 'distance' && (
              <>
                <Stepper
                  value={uniform.distance}
                  caption={distanceUnit(units)}
                  onStep={(d) => patchEvery('distance', step(uniform.distance, d))}
                  onType={(v) => patchEvery('distance', v)}
                  stepBy={0.5}
                />
                <Stepper
                  value={uniform.minutes}
                  caption={t('workout.min')}
                  onStep={(d) => patchEvery('minutes', step(uniform.minutes, d))}
                  onType={(v) => patchEvery('minutes', v)}
                  stepBy={5}
                />
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setAsked('grid')}
            className="text-footnote text-muted-foreground hover:text-foreground"
          >
            {t('workout.setsDiffered')}
          </button>
        </>
      )}

      {mode === 'grid' && (
        <>
          <div className="space-y-1.5">
            {draft.sets.map((set, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-footnote text-muted-foreground w-6 shrink-0 tabular-nums">
                  {i + 1}
                </span>
                {draft.tracks === 'reps' ? (
                  <>
                    <Field
                      value={set.reps}
                      onChange={(v) => patch(i, 'reps', v)}
                      suffix={t('workout.reps')}
                    />
                    <Field
                      value={set.weight}
                      onChange={(v) => patch(i, 'weight', v)}
                      suffix={loadUnit(units)}
                    />
                  </>
                ) : draft.tracks === 'distance' ? (
                  <>
                    <Field
                      value={set.distance}
                      onChange={(v) => patch(i, 'distance', v)}
                      suffix={distanceUnit(units)}
                    />
                    <Field
                      value={set.minutes}
                      onChange={(v) => patch(i, 'minutes', v)}
                      suffix={t('workout.min')}
                    />
                  </>
                ) : (
                  <Field
                    value={set.minutes}
                    onChange={(v) => patch(i, 'minutes', v)}
                    suffix={t('workout.min')}
                  />
                )}
                {draft.sets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSets(draft.sets.filter((_, j) => j !== i))}
                    aria-label={t('workout.removeSet')(String(i + 1))}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Minus size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSets(resize(draft.sets, draft.sets.length + 1))}
              className="text-footnote text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Plus size={13} />
              {t('workout.anotherSet')}
            </button>
            {/* The way back out. Without it, one mistyped set in the grid is a
                one-way door into the form this redesign exists to avoid. */}
            <button
              type="button"
              onClick={() => {
                const first = draft.sets[0] ?? blankSet();
                setSets(draft.sets.map(() => ({ ...first })));
                setAsked('steppers');
              }}
              className="text-footnote text-muted-foreground hover:text-foreground"
            >
              {t('workout.sameEverySet')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A number with a minus and a plus, and the number itself typeable.
 *
 * Both affordances, because they answer different questions. The steppers are
 * for the change that actually happens — one more rep, one more plate — and the
 * field is for the first time you ever enter a lift, where stepping up from
 * nothing would be absurd.
 *
 * `stepBy` is the unit the thing really moves in: a rep, five minutes, and for
 * a load `loadStep` — 2.5 kg or 5 lb, a pair of the smallest plates most gyms
 * own. A stepper that moved a barbell by one kilogram would need three clicks
 * to express the smallest change anybody makes.
 */
function Stepper({
  value,
  caption,
  onStep,
  onType,
  stepBy,
}: {
  value: string;
  caption: string;
  onStep: (delta: number) => void;
  onType: (value: string) => void;
  stepBy: number;
}) {
  return (
    <div className="bg-card flex-1 rounded-lg px-1 py-1">
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => onStep(-stepBy)}
          aria-label={`Less ${caption}`}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/60 grid size-6 shrink-0 place-items-center rounded"
        >
          <Minus size={13} />
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onType(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="—"
          aria-label={caption}
          className="text-body font-display w-full min-w-0 bg-transparent text-center tabular-nums outline-none"
        />
        <button
          type="button"
          onClick={() => onStep(stepBy)}
          aria-label={`More ${caption}`}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/60 grid size-6 shrink-0 place-items-center rounded"
        >
          <Plus size={13} />
        </button>
      </div>
      <p className="text-muted-foreground text-center text-[10.5px] leading-tight">{caption}</p>
    </div>
  );
}

/**
 * How long it took.
 *
 * Chips, because nobody times a gym session to the minute. The scale used to
 * stop at 90, which was not a rounding problem: two hours of football is an
 * ordinary Sunday and there was no chip for it and no way to type one, so the
 * card could not log it at all and the session had to go through the chat.
 */
function Duration({
  minutes,
  onChange,
}: {
  minutes: number | null;
  onChange: (next: number | null) => void;
}) {
  const t = useT();
  const offScale = minutes !== null && !SESSION_DURATIONS.some((d) => d === minutes);
  const [typing, setTyping] = useState(offScale);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {SESSION_DURATIONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTyping(false);
              onChange(minutes === value ? null : value);
            }}
            aria-pressed={minutes === value}
            className={`text-footnote flex-1 rounded-full py-2 tabular-nums transition-colors ${
              minutes === value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 hover:bg-muted'
            }`}
          >
            {sessionDurationLabel(value)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTyping((was) => !was)}
          aria-pressed={typing || offScale}
          className={`text-footnote flex-1 rounded-full py-2 transition-colors ${
            offScale ? 'bg-primary text-primary-foreground' : 'bg-muted/60 hover:bg-muted'
          }`}
        >
          {t('workout.otherLength')}
        </button>
      </div>
      {typing && (
        <Input
          type="text"
          inputMode="numeric"
          value={offScale && minutes !== null ? String(minutes) : ''}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9]/g, '');
            onChange(cleaned === '' ? null : Math.min(1440, Number(cleaned)));
          }}
          placeholder={t('workout.minutesLabel')}
          aria-label={t('workout.minutesLabel')}
          className="bg-card text-footnote h-9 rounded-lg border-0 tabular-nums"
        />
      )}
    </div>
  );
}

/**
 * A session in the words people use for it: "3 × 10 @ 60 kg".
 *
 * Falls back to a count when the sets disagree, because there is no honest
 * single line for a drop set and "3 sets" at least says how much work it was.
 */
function summarise(
  sets: DraftSet[],
  uniform: DraftSet | null,
  tracks: ExerciseType['tracks'],
  units: UnitSystem,
  t: ReturnType<typeof useT>,
): string {
  if (uniform === null) return `${sets.length} × ${t('workout.setsLabel')}`;
  const count = sets.length;
  if (tracks === 'reps') {
    const reps = `${count} × ${uniform.reps || '—'}`;
    return uniform.weight === '' ? reps : `${reps} @ ${uniform.weight} ${loadUnit(units)}`;
  }
  if (tracks === 'distance') {
    const far = uniform.distance === '' ? null : `${uniform.distance} ${distanceUnit(units)}`;
    const time = uniform.minutes === '' ? null : `${uniform.minutes} ${t('workout.min')}`;
    return [far, time].filter(Boolean).join(' · ') || '—';
  }
  const time = `${uniform.minutes || '—'} ${t('workout.min')}`;
  return count > 1 ? `${count} × ${time}` : time;
}

function Field({
  value,
  onChange,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix: string;
}) {
  return (
    <div className="relative flex-1">
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="bg-card text-footnote h-9 rounded-lg border-0 pr-10 tabular-nums"
      />
      <span className="text-footnote text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2">
        {suffix}
      </span>
    </div>
  );
}

/**
 * What a set of this kind is measured in, and what it looks like, when the
 * catalogue cannot say. Mirrors the server's fallback in `lastWorkout` — a set
 * typed as free text still deserves the right fields around it.
 */
const CATEGORY_TRACKS: Record<ExerciseCategory, ExerciseType['tracks']> = {
  strength: 'reps',
  cardio: 'duration',
  class: 'duration',
  sport: 'duration',
  flexibility: 'duration',
};

/**
 * A logged session, back in the shape the card collects.
 *
 * Sets arrive flat and carry the exercise they belong to as a `position`, so
 * they are regrouped here in that order. The load comes back out in whatever
 * the reader uses — it went in as kilograms, and the field it lands in is the
 * same field it was typed into.
 */
function draftsFrom(entry: EditableSession, types: ExerciseType[], units: UnitSystem): Draft[] {
  const category = entry.category ?? 'strength';
  const byName = new Map(types.map((type) => [type.name.toLowerCase(), type]));
  const byPosition = new Map<number, Draft>();

  for (const set of entry.sets) {
    let draft = byPosition.get(set.position);
    if (!draft) {
      const type = byName.get(set.name.toLowerCase());
      draft = {
        name: type?.name ?? set.name,
        typeId: type?.id ?? null,
        tracks: type?.tracks ?? CATEGORY_TRACKS[category],
        emoji: type?.emoji ?? CATEGORIES.find((c) => c.key === category)!.emoji,
        muscles: type?.muscles ?? [],
        sets: [],
        /* These *are* the numbers being corrected. Printing "last time" above a
           set somebody is fixing would be showing them a session they are
           already looking at. */
        previous: [],
      };
      byPosition.set(set.position, draft);
    }
    draft.sets.push(toDraftSet(set, units));
  }

  return [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, draft]) => draft);
}

const blankSet = (): DraftSet => ({ reps: '', weight: '', minutes: '', distance: '' });

/** A stored set, in the units the person reading it uses. */
function toDraftSet(
  set: { reps: number | null; weight_kg: number | null; duration_sec: number | null; distance_m?: number | null },
  units: UnitSystem,
): DraftSet {
  return {
    reps: set.reps === null ? '' : String(set.reps),
    weight: set.weight_kg === null ? '' : String(round(toLoad(set.weight_kg, units))),
    minutes: set.duration_sec === null ? '' : String(Math.round(set.duration_sec / 60)),
    distance:
      set.distance_m === null || set.distance_m === undefined
        ? ''
        : String(round(toDistance(set.distance_m / 1000, units), 2)),
  };
}

/** Trailing noise on a number somebody is about to read at a glance. */
function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * The one set every set in this exercise is, or null when they differ.
 *
 * Null is what puts the per-set grid on screen. A drop set, a pyramid and a set
 * somebody failed early are all real, and all three are exactly the case the
 * compact line cannot describe — so it stops claiming to.
 */
function uniformSet(sets: DraftSet[]): DraftSet | null {
  const [first] = sets;
  if (!first) return null;
  const same = sets.every(
    (set) =>
      set.reps === first.reps &&
      set.weight === first.weight &&
      set.minutes === first.minutes &&
      set.distance === first.distance,
  );
  return same ? first : null;
}

const anyValue = (set: DraftSet): boolean =>
  [set.reps, set.weight, set.minutes, set.distance].some((v) => v.trim() !== '');

/**
 * Grow or shrink the set list. A new set copies the last one, because the
 * second set of anything is almost always the same as the first.
 */
function resize(sets: DraftSet[], count: number): DraftSet[] {
  const wanted = Math.min(30, Math.max(1, count));
  const next = sets.slice(0, wanted);
  while (next.length < wanted) next.push({ ...(next.at(-1) ?? blankSet()) });
  return next;
}

/** Steps a numeric field held as a string, landing on the step from empty. */
function step(value: string, delta: number, min = 0): string {
  const current = value.trim() === '' ? (delta > 0 ? 0 : Math.abs(delta)) : Number(value);
  if (Number.isNaN(current)) return value;
  return String(round(Math.max(min, current + delta), 2));
}

/**
 * A draft becomes an exercise only once at least one set has a number in it.
 *
 * The load leaves here in kilograms whatever the field said, which is the only
 * conversion on this screen: everything above it is the number the person
 * typed, and everything below it is what the API stores.
 */
function toExercise(draft: Draft, units: UnitSystem): WorkoutExercise | null {
  const sets = draft.sets
    .map((set) => {
      const reps = num(set.reps);
      const weight = num(set.weight);
      const minutes = num(set.minutes);
      const distance = num(set.distance);
      if (draft.tracks === 'reps') {
        return reps === null
          ? null
          : { reps, weight_kg: weight === null ? null : loadToKg(weight, units) };
      }
      if (draft.tracks === 'distance') {
        // Distance-tracked work is a run or a swim, and both have a clock on
        // them too. Either number alone is a complete answer.
        if (distance === null && minutes === null) return null;
        return {
          distance_m: distance === null ? null : Math.round(distanceToKm(distance, units) * 1000),
          duration_sec: minutes === null ? null : Math.round(minutes * 60),
        };
      }
      return minutes === null ? null : { duration_sec: Math.round(minutes * 60) };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (sets.length === 0) return null;
  return { name: draft.name, type_id: draft.typeId, sets };
}

function num(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * "Tuesday" for anything inside the last week, a date beyond it. A session two
 * months old is worth offering back but not worth calling recent.
 */
function when(localDate: string, locale: Locale, t: ReturnType<typeof useT>): string {
  const then = new Date(`${localDate}T12:00:00`);
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return t('common.today').toLocaleLowerCase(locale);
  if (days === 1) return t('common.yesterday').toLocaleLowerCase(locale);
  // `undefined` here used to mean "the runtime's locale", which on a server-
  // rendered page is the container's and on a phone is whatever the OS says —
  // neither of which is the language the rest of this sentence is in.
  if (days < 7) return then.toLocaleDateString(locale, { weekday: 'long' });
  return then.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
