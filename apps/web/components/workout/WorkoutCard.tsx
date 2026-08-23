'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Loader2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ChatCard,
  ExerciseCategory,
  ExerciseEntry,
  ExerciseType,
  LastWorkout,
  MuscleGroup,
  Routine,
  UnitSystem,
  WorkoutExercise,
} from '@ct/shared';
import {
  ROUTINE_MATCH_LIKELY,
  loadToKg,
  loadUnit,
  matchRoutine,
  nameFromMuscles,
  namingStyleOf,
  toLoad,
} from '@ct/shared';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
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

const CATEGORIES: { key: ExerciseCategory; label: string; emoji: string }[] = [
  { key: 'strength', label: 'Weights', emoji: '🏋️' },
  { key: 'cardio', label: 'Cardio', emoji: '🏃' },
  { key: 'class', label: 'Class', emoji: '🤸' },
  { key: 'sport', label: 'Sport', emoji: '⚽' },
  { key: 'flexibility', label: 'Mobility', emoji: '🧘' },
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

export function WorkoutCard({
  card,
  messageId,
  onLogged,
}: {
  card: Extract<ChatCard, { type: 'workout_prompt' }>;
  /**
   * The chat message this card is answering, when it is sitting in the
   * conversation. Absent when the card was opened from the Exercise tab, where
   * there is no question to rewrite into a receipt.
   */
  messageId?: string;
  onLogged: (entry: ExerciseEntry) => void;
}) {
  const [category, setCategory] = useState<ExerciseCategory | null>(card.suggested_category);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [detail, setDetail] = useState(false);
  const [types, setTypes] = useState<ExerciseType[] | null>(null);
  const [last, setLast] = useState<LastWorkout | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  /** Which saved routine this session is, once one has been tapped. */
  const [routineId, setRoutineId] = useState<string | null>(null);
  /** Non-null once they have asked for this session to become a routine. */
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
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
    // Saving one of these again would be saving what it already is.
    setSaveAs(null);
    setDetail(true);
  }

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
      const entry = await api.logWorkout({
        category,
        exercises,
        duration_min: minutes,
        routine_id: routineId,
        performed_at: card.performed_at,
        message_id: messageId,
      });

      /*
       * Saving the routine comes after the session and never instead of it.
       *
       * A failure here must not cost them the workout — the session is the
       * thing they came to record, and a routine that did not save is worth a
       * toast and nothing more.
       */
      if (saveAs && saveAs.trim().length > 0) {
        try {
          await api.saveRoutine({ name: saveAs.trim(), category, from_entry_id: entry.id });
          toast.success(`Saved “${saveAs.trim()}” — one tap next time`);
        } catch {
          toast.error('Logged, but the routine did not save');
        }
      }

      toast.success(`Logged ${entry.description} — ~${Math.round(entry.kcal_burned)} kcal`);
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
      <Shell heard={card.heard}>
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
              <span className="text-[11px] leading-tight">{c.label}</span>
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
   * A session worth saving is one with real work in it that they have not
   * already saved. Two exercises is the bar — one is a fragment — and a session
   * that is plainly a routine they own is not worth offering to save twice,
   * whether or not they got to it by tapping the chip.
   */
  const alreadySaved =
    routineId !== null ||
    matchRoutine(
      filled.map((d) => d.typeId).filter((id): id is string => id !== null),
      routines,
      ROUTINE_MATCH_LIKELY,
    ) !== null;
  const offerSave = !alreadySaved && filled.length >= 2;
  // Named in the words they already use: somebody whose routines are "Push" and
  // "Pull" should not be offered "Chest & Triceps".
  const suggestedName = nameFromMuscles(
    filled.map((d) => d.muscles[0]).filter((m): m is MuscleGroup => m !== undefined),
    namingStyleOf(routines.map((r) => r.name)),
  );

  return (
    <Shell heard={card.heard}>
      <div className="space-y-3 px-3 pb-3">
        <div className="flex items-center justify-between">
          <p className="text-footnote text-muted-foreground">
            {CATEGORIES.find((c) => c.key === category)?.label}
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
            Change
          </button>
        </div>

        {/* Their own workouts, before anything the app came up with. One tap
            fills the entire grid, which is the point of having saved them. */}
        {ordered.length > 0 && (
          <div>
            <p className="text-footnote text-muted-foreground mb-1.5">Your workouts</p>
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
                      <span className="text-muted-foreground">· today</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* The whole required answer. Everything under it is optional. */}
        <div>
          <p className="text-footnote text-muted-foreground mb-1.5">How long?</p>
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
              <p className="text-footnote text-muted-foreground">Loading…</p>
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
                      {type.custom && <span className="text-muted-foreground">· yours</span>}
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
              Add what you did
            </button>
            {last && (
              <button
                type="button"
                onClick={repeatLast}
                className="text-footnote text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <RotateCcw size={12} />
                Same as {when(last.local_date)}
                <span className="opacity-70">
                  ({last.exercises.length} {last.exercises.length === 1 ? 'exercise' : 'exercises'})
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
              Save this as “{suggestedName}”
            </button>
          ) : (
            <div className="bg-muted/40 flex items-center gap-2 rounded-xl p-2.5">
              <Bookmark size={14} className="text-muted-foreground shrink-0" />
              <Input
                value={saveAs}
                onChange={(e) => setSaveAs(e.target.value)}
                aria-label="Name for this workout"
                className="bg-card text-footnote h-9 rounded-lg border-0"
              />
              <button
                type="button"
                onClick={() => setSaveAs(null)}
                aria-label="Don’t save this as a workout"
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
          {saving ? 'Logging…' : 'Log this session'}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ heard, children }: { heard: string | null; children: React.ReactNode }) {
  return (
    <div className="bg-card animate-land overflow-hidden rounded-[var(--radius)] shadow-[0_1px_2px_rgba(23,22,20,0.05)]">
      <div className="px-4 pt-3.5 pb-2.5">
        <p className="text-body font-medium">{heard ?? 'What did you do?'}</p>
        <p className="text-footnote text-muted-foreground">Roughly is fine.</p>
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
          aria-label={`Remove ${draft.name}`}
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
                <Field value={set.reps} onChange={(v) => patch(i, 'reps', v)} suffix="reps" />
                <Field
                  value={set.weight}
                  onChange={(v) => patch(i, 'weight', v)}
                  suffix={loadUnit(units)}
                />
              </>
            ) : (
              <Field value={set.minutes} onChange={(v) => patch(i, 'minutes', v)} suffix="min" />
            )}
            {draft.sets.length > 1 && (
              <button
                type="button"
                onClick={() => setSets(draft.sets.filter((_, j) => j !== i))}
                aria-label={`Remove set ${i + 1}`}
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
        Another set
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
function when(localDate: string): string {
  const then = new Date(`${localDate}T12:00:00`);
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'long' });
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
