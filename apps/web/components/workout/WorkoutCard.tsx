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
  formatNumber,
  loadToKg,
  loadUnit,
  matchRoutine,
  nameFromMuscles,
  namingStyleOf,
  toLoad,
} from '@ct/shared';
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

/**
 * The durations a session actually comes in. Five chips rather than a number
 * field, because nobody times a gym session to the minute and "about an hour"
 * is both the true answer and the one that takes one tap.
 */
const DURATIONS = [30, 45, 60, 75, 90];

interface Draft {
  name: string;
  typeId: string | null;
  tracks: ExerciseType['tracks'];
  emoji: string;
  muscles: MuscleGroup[];
  sets: { reps: string; weight: string; minutes: string }[];
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
  const [category, setCategory] = useState<ExerciseCategory | null>(
    editing?.category ?? card?.suggested_category ?? null,
  );
  const [minutes, setMinutes] = useState<number | null>(editing?.duration_min ?? null);
  // A correction opens on the grid. The numbers being fixed are in it, and
  // making somebody click "add what you did" to reach their own sets would be
  // hiding the entire reason the card reopened.
  const [detail, setDetail] = useState(editing !== undefined);
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
    void api
      .exerciseTypes(category)
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

  function addExercise(type: ExerciseType) {
    setDrafts((prev) => [
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
    setDrafts(
      last.exercises.map((exercise) => ({
        name: exercise.name,
        typeId: exercise.type_id,
        tracks: exercise.tracks,
        emoji: exercise.emoji,
        muscles: [],
        sets: exercise.sets.map((set) => ({
          reps: set.reps === null ? '' : String(set.reps),
          weight: set.weight_kg === null ? '' : String(toLoad(set.weight_kg, units)),
          minutes: set.duration_sec === null ? '' : String(Math.round(set.duration_sec / 60)),
        })),
      })),
    );
    if (minutes === null && last.duration_min !== null) {
      setMinutes(nearestDuration(last.duration_min));
    }
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
        const previous = exercise.previous.map((set) => ({
          reps: set.reps === null ? '' : String(set.reps),
          weight: set.weight_kg === null ? '' : String(toLoad(set.weight_kg, units)),
          minutes: set.duration_sec === null ? '' : String(Math.round(set.duration_sec / 60)),
        }));
        // Never fewer rows than the plan calls for: a routine that says three
        // sets shows three, even the first time, when there is no history.
        const wanted = Math.max(exercise.target_sets ?? 1, previous.length, 1);
        const sets = Array.from({ length: wanted }, (_, i) => previous[i] ?? blankSet());
        return {
          name: exercise.name,
          typeId: exercise.type_id,
          tracks: exercise.tracks,
          emoji: exercise.emoji,
          muscles: exercise.muscles,
          sets,
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
              onClick={() => setCategory(c.key)}
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
  const filled = drafts.filter((d) => toExercise(d, units) !== null);
  const ready = minutes !== null || filled.length > 0;
  const today = new Date().getDay();
  // Today's habit first, then whatever was done most recently. The suggestion
  // is only ever an ordering — nothing is preselected, because logging the
  // wrong workout is a worse outcome than one extra tap.
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
                    {routine.usual_weekday === today && !on && (
                      <span className="text-muted-foreground">{t('workout.today')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* The whole required answer. Everything under it is optional. */}
        <div>
          <p className="text-footnote text-muted-foreground mb-1.5">{t('workout.howLong')}</p>
          <div className="flex gap-1.5">
            {DURATIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMinutes(minutes === value ? null : value)}
                aria-pressed={minutes === value}
                className={`text-footnote flex-1 rounded-full py-2 tabular-nums transition-colors ${
                  minutes === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 hover:bg-muted'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {detail && (
          <div className="space-y-3">
            {drafts.map((draft, i) => (
              <ExerciseRow
                key={`${draft.typeId ?? draft.name}-${i}`}
                draft={draft}
                onChange={(next) => setDrafts((prev) => prev.map((d, j) => (j === i ? next : d)))}
                onRemove={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}

            {/* The catalogue, as chips. A picker rather than a text field because
                the names are already known, and typing them on a phone after a
                session is exactly the friction that stops people logging at all. */}
            {types === null ? (
              <p className="text-footnote text-muted-foreground">{t('common.loading')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {types
                  .filter((t) => !chosen.has(t.id))
                  .map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => addExercise(type)}
                      className="bg-muted/60 hover:bg-muted text-footnote flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2.5"
                    >
                      <span aria-hidden>{type.emoji}</span>
                      {type.name}
                      {type.custom && (
                        <span className="text-muted-foreground">{t('workout.yours')}</span>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

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
  const setSets = (sets: Draft['sets']) => onChange({ ...draft, sets });
  const patch = (i: number, key: keyof Draft['sets'][number], value: string) =>
    setSets(draft.sets.map((s, j) => (j === i ? { ...s, [key]: value } : s)));

  return (
    <div className="bg-muted/40 rounded-xl p-2.5">
      <div className="mb-2 flex items-center gap-2">
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

      <button
        type="button"
        // Carries the last set forward: the second set of anything is almost
        // always the same as the first, and retyping it is the difference
        // between logging four sets and logging one.
        onClick={() => setSets([...draft.sets, { ...(draft.sets.at(-1) ?? blankSet()) }])}
        className="text-footnote text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1"
      >
        <Plus size={13} />
        {t('workout.anotherSet')}
      </button>
    </div>
  );
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
      };
      byPosition.set(set.position, draft);
    }
    draft.sets.push({
      reps: set.reps === null ? '' : String(set.reps),
      weight: set.weight_kg === null ? '' : String(toLoad(set.weight_kg, units)),
      minutes: set.duration_sec === null ? '' : String(Math.round(set.duration_sec / 60)),
    });
  }

  return [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, draft]) => draft);
}

const blankSet = () => ({ reps: '', weight: '', minutes: '' });

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
      if (draft.tracks === 'reps') {
        return reps === null
          ? null
          : { reps, weight_kg: weight === null ? null : loadToKg(weight, units) };
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

/** The chip nearest a remembered duration, so repeating fills that in too. */
function nearestDuration(min: number): number {
  return DURATIONS.reduce((best, d) => (Math.abs(d - min) < Math.abs(best - min) ? d : best));
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
