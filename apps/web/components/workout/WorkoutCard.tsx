'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ChatCard,
  ExerciseCategory,
  ExerciseEntry,
  ExerciseType,
  WorkoutExercise,
} from '@ct/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * The card that asks.
 *
 * Every other card in this app is a receipt for something that already
 * happened. "Went to the gym" is not one of those — it is not a loggable fact,
 * and the three things that would make it one are things the user knows and the
 * model would only guess at.
 *
 * The whole reason it is a card rather than a conversation: asking "which kind?
 * which exercises? how many?" in chat would be three more model calls and the
 * better part of a minute, to collect something anyone can tap out in fifteen
 * seconds. This collects the lot and posts once, to a route with no model
 * behind it at all.
 */

const CATEGORIES: { key: ExerciseCategory; label: string; emoji: string }[] = [
  { key: 'strength', label: 'Weights', emoji: '🏋️' },
  { key: 'cardio', label: 'Cardio', emoji: '🏃' },
  { key: 'class', label: 'Class', emoji: '🤸' },
  { key: 'sport', label: 'Sport', emoji: '⚽' },
  { key: 'flexibility', label: 'Mobility', emoji: '🧘' },
];

interface Draft {
  name: string;
  typeId: string | null;
  tracks: ExerciseType['tracks'];
  emoji: string;
  sets: { reps: string; weight: string; minutes: string }[];
}

export function WorkoutCard({
  card,
  messageId,
  onLogged,
}: {
  card: Extract<ChatCard, { type: 'workout_prompt' }>;
  messageId: string;
  onLogged: (entry: ExerciseEntry) => void;
}) {
  const [category, setCategory] = useState<ExerciseCategory | null>(card.suggested_category);
  const [types, setTypes] = useState<ExerciseType[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!category) return;
    let cancelled = false;
    void api
      .exerciseTypes(category)
      .then(({ types }) => {
        if (!cancelled) setTypes(types);
      })
      .catch(() => {
        if (!cancelled) setTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  function addExercise(type: ExerciseType) {
    setDrafts((prev) => [
      ...prev,
      { name: type.name, typeId: type.id, tracks: type.tracks, emoji: type.emoji, sets: [blankSet()] },
    ]);
  }

  async function submit() {
    const exercises = drafts.map(toExercise).filter((e): e is WorkoutExercise => e !== null);
    if (!category || exercises.length === 0) return;

    setSaving(true);
    try {
      const entry = await api.logWorkout({
        category,
        exercises,
        performed_at: card.performed_at,
        message_id: messageId,
      });
      toast.success(`Logged ${entry.description} — ~${Math.round(entry.kcal_burned)} kcal`);
      onLogged(entry);
    } catch (e) {
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

  // ---- Building the session -------------------------------------------------

  const chosen = new Set(drafts.map((d) => d.typeId));
  const ready = drafts.some((d) => toExercise(d) !== null);

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
              setDrafts([]);
            }}
            className="text-footnote text-muted-foreground hover:text-foreground"
          >
            Change
          </button>
        </div>

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
        <p className="text-footnote text-muted-foreground">Tap what you got through.</p>
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
                <Field value={set.weight} onChange={(v) => patch(i, 'weight', v)} suffix="kg" />
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

/** A draft becomes an exercise only once at least one set has a number in it. */
function toExercise(draft: Draft): WorkoutExercise | null {
  const sets = draft.sets
    .map((set) => {
      const reps = num(set.reps);
      const weight = num(set.weight);
      const minutes = num(set.minutes);
      if (draft.tracks === 'reps') {
        return reps === null ? null : { reps, weight_kg: weight };
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
