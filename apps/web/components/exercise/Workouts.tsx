'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ExerciseEntry, ExerciseType, Routine, WeekSchedule } from '@ct/shared';
import { WEEK_ORDER, weekdayName } from '@ct/shared';
import { useLocale, useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkoutCard } from '@/components/workout/WorkoutCard';

/**
 * Saved workouts and the week they sit in, on the Exercise screen.
 *
 * The conversation is still the fastest way to log a session, and this is not
 * an attempt to replace it. It is the other half: the journal is where you
 * *say* what happened, and there was nowhere at all to see what you have saved,
 * fix a routine that has drifted, or state a split you already know.
 *
 * The week is the part worth reading twice. The app infers a routine's usual
 * day from history, which needs no setup and knows nothing for a fortnight;
 * anything set here outranks that, immediately and permanently. Days left alone
 * keep following the inference, so a half-filled week is a useful week rather
 * than a set of holes.
 */
export function Workouts({ onLogged }: { onLogged: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [week, setWeek] = useState<WeekSchedule | null>(null);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  /**
   * The read failed, as opposed to came back empty.
   *
   * Kept apart from `routines` on purpose. Falling back to `[]` here drew the
   * "nothing saved yet" copy for a request that never landed — so a dropped
   * connection was indistinguishable from having none, and worse, somebody who
   * had just logged a session read it as their session not having saved. The
   * toast that said otherwise was gone four seconds later.
   */
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ routines }, { week }] = await Promise.all([api.routines(), api.schedule()]);
      setRoutines(routines);
      setWeek(week);
      setFailed(false);
    } catch (e) {
      toast.error((e as Error).message);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setDay(weekday: number, routineId: string | null) {
    // Optimistic, because a select that waits for a round trip before showing
    // the value you just picked feels broken.
    setWeek((prev) =>
      prev?.map((day) => {
        if (day.weekday !== weekday) return day;
        const routine = routines?.find((r) => r.id === routineId);
        return {
          weekday,
          routine_id: routine?.id ?? null,
          routine_name: routine?.name ?? null,
          routine_emoji: routine?.emoji ?? null,
          source: routine ? ('declared' as const) : null,
        };
      }) ?? prev,
    );
    try {
      const { week } = await api.saveSchedule({ days: [{ weekday, routine_id: routineId }] });
      setWeek(week);
      // The routines carry their own scheduled days for the card's ordering.
      setRoutines((await api.routines()).routines);
    } catch (e) {
      toast.error((e as Error).message);
      void load();
    }
  }

  async function remove(routine: Routine) {
    setRoutines((prev) => prev?.filter((r) => r.id !== routine.id) ?? prev);
    try {
      await api.deleteRoutine(routine.id);
      toast.success(`Deleted ${routine.name}`);
    } catch (e) {
      toast.error((e as Error).message);
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
      <InsetGroup title={t('workouts.logTitle')}>
        <div className="p-3">
          <WorkoutCard
            card={{
              type: 'workout_prompt',
              suggested_category: null,
              performed_at: new Date().toISOString(),
              heard: null,
            }}
            onLogged={(_entry: ExerciseEntry) => {
              setLogging(false);
              onLogged();
              void load();
            }}
          />
          <button
            type="button"
            onClick={() => setLogging(false)}
            className="text-footnote text-muted-foreground hover:text-foreground mt-3 px-1"
          >
            {t('common.cancel')}
          </button>
        </div>
      </InsetGroup>
    );
  }

  return (
    <div className="space-y-7">
      <Button onClick={() => setLogging(true)} className="h-11 w-full gap-2 rounded-xl">
        <Plus size={16} />
        {t('workouts.logAction')}
      </Button>

      <InsetGroup
        title={t('workouts.savedTitle')}
        trailing={
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="text-footnote text-muted-foreground hover:text-foreground font-semibold"
          >
            {t('workouts.buildOne')}
          </button>
        }
        footer={
          failed
            ? undefined
            : routines && routines.length > 0
              ? t('workouts.reuseHint')
              : // Says where the session went. Empty here does not mean nothing
                // was logged — the sessions are in the history further down the
                // screen — and this panel sitting empty right after logging one
                // is exactly the moment that reads as a lost workout.
                t('workouts.whereSessionsGo')
        }
      >
        {failed ? (
          <div className="px-4 py-10 text-center">
            <p className="text-muted-foreground text-body font-medium">
              {t('workouts.loadFailed')}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="text-footnote text-foreground mt-2 font-semibold underline underline-offset-4"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : routines === null ? (
          <InsetRow>
            <Loader2 size={15} className="text-muted-foreground animate-spin" />
          </InsetRow>
        ) : routines.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-muted-foreground text-body font-medium">
              {t('workouts.noneSavedTitle')}
              <br />
              {t('workouts.noneSavedHint')}
            </p>
          </div>
        ) : (
          routines.map((routine) => (
            <InsetRow key={routine.id}>
              <span aria-hidden className="text-lg">
                {routine.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body truncate font-medium">{routine.name}</p>
                <p className="text-footnote text-muted-foreground truncate">
                  {/* A routine saved off a duration-only session has no list to
                      count. "0 exercises" would describe it as empty when it is
                      simply measured the other way. */}
                  {routine.exercises.length > 0
                    ? t('workouts.exerciseCount')(routine.exercises.length)
                    : t('exercise.minutes')(String(routine.duration_min))}
                  {routine.times_done > 0 && t('workouts.doneTimes')(String(routine.times_done))}
                  {routine.scheduled_weekdays.length > 0 &&
                    ` · ${routine.scheduled_weekdays
                      .map((d) => weekdayName(d, locale, 'short'))
                      .join(', ')}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(routine)}
                aria-label={t('workouts.editNamed')(routine.name)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => void remove(routine)}
                aria-label={t('workouts.deleteNamed')(routine.name)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={15} />
              </button>
            </InsetRow>
          ))
        )}
      </InsetGroup>

      {!failed && routines !== null && routines.length > 0 && (
        <InsetGroup
          title={t('workouts.weekTitle')}
          footer={t('workouts.weekFooter')}
        >
          {WEEK_ORDER.map((weekday) => {
            const day = week?.find((d) => d.weekday === weekday);
            const learned = day?.source === 'learned';
            return (
              <InsetRow key={weekday}>
                <span className="text-body w-24 shrink-0 font-medium">
                  {weekdayName(weekday, locale)}
                </span>
                <select
                  value={day?.source === 'declared' ? (day.routine_id ?? '') : ''}
                  onChange={(e) => void setDay(weekday, e.target.value || null)}
                  aria-label={t('workouts.workoutFor')(weekdayName(weekday, locale))}
                  className="bg-muted/60 text-footnote min-w-0 flex-1 rounded-lg px-2.5 py-2 font-medium"
                >
                  <option value="">
                    {learned
                      ? t('workouts.usually')(`${day?.routine_emoji} ${day?.routine_name}`)
                      : '—'}
                  </option>
                  {routines.map((routine) => (
                    <option key={routine.id} value={routine.id}>
                      {routine.emoji} {routine.name}
                    </option>
                  ))}
                </select>
                {/* Said out loud, because the two are not the same claim: one is
                    a decision they made and the other is a pattern the app
                    noticed and will quietly stop believing. */}
                <span className="text-footnote text-muted-foreground w-20 shrink-0 text-right">
                  {day?.source === 'declared'
                    ? t('workouts.youSetThis')
                    : learned
                      ? t('workouts.learned')
                      : ''}
                </span>
              </InsetRow>
            );
          })}
        </InsetGroup>
      )}
    </div>
  );
}

/**
 * Building or fixing a routine.
 *
 * Sets, not loads — the same rule the whole feature rests on. "Three sets of
 * bench" is part of the plan; sixty kilos is a thing that happened last Tuesday
 * and will be different next Tuesday, so it is read from history at the moment
 * the card opens rather than stored here.
 */
function RoutineEditor({ routine, onDone }: { routine: Routine | null; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState(routine?.name ?? '');
  const [emoji, setEmoji] = useState(routine?.emoji ?? '🏋️');
  const [types, setTypes] = useState<ExerciseType[] | null>(null);
  const [chosen, setChosen] = useState<{ name: string; typeId: string | null; sets: number }[]>(
    routine?.exercises.map((e) => ({
      name: e.name,
      typeId: e.type_id,
      sets: e.target_sets ?? 3,
    })) ?? [],
  );
  const [saving, setSaving] = useState(false);

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

  async function save() {
    setSaving(true);
    try {
      await api.saveRoutine({
        // Renaming is a save under the new name, so the old row has to go or
        // they end up with both. Handled below, after the new one lands.
        name: name.trim(),
        emoji,
        category: routine?.category ?? 'strength',
        exercises: chosen.map((c) => ({ name: c.name, type_id: c.typeId, target_sets: c.sets })),
        duration_min: byDuration ? (routine?.duration_min ?? null) : null,
      });
      if (routine && routine.name.toLowerCase() !== name.trim().toLowerCase()) {
        await api.deleteRoutine(routine.id);
      }
      toast.success(`Saved ${name.trim()}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  }

  const picked = new Set(chosen.map((c) => c.typeId));

  return (
    <InsetGroup title={routine ? t('workouts.editTitle') : t('workouts.buildTitle')}>
      <div className="space-y-3 p-3">
        <div className="flex gap-2">
          <Input
            value={emoji}
            onChange={(e) => setEmoji([...e.target.value].slice(0, 2).join(''))}
            aria-label={t('workouts.icon')}
            className="w-14 text-center"
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('workouts.namePlaceholder')}
            aria-label={t('workouts.nameLabel')}
            className="flex-1"
          />
        </div>

        {chosen.map((exercise, i) => (
          <div key={`${exercise.typeId ?? exercise.name}-${i}`} className="bg-muted/40 flex items-center gap-2 rounded-xl p-2.5">
            <span className="text-footnote min-w-0 flex-1 truncate font-medium">
              {exercise.name}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setChosen((prev) =>
                    prev.map((c, j) => (j === i ? { ...c, sets: Math.max(1, c.sets - 1) } : c)),
                  )
                }
                aria-label={t('workouts.oneFewerSet')(exercise.name)}
                className="bg-card text-muted-foreground hover:text-foreground size-7 rounded-lg"
              >
                −
              </button>
              <span className="text-footnote w-14 text-center tabular-nums">
                {t('workouts.sets')(exercise.sets)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setChosen((prev) =>
                    prev.map((c, j) => (j === i ? { ...c, sets: Math.min(30, c.sets + 1) } : c)),
                  )
                }
                aria-label={t('workouts.oneMoreSet')(exercise.name)}
                className="bg-card text-muted-foreground hover:text-foreground size-7 rounded-lg"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => setChosen((prev) => prev.filter((_, j) => j !== i))}
              aria-label={t('workouts.removeExercise')(exercise.name)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {types === null ? (
          <p className="text-footnote text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {types
              .filter((t) => !picked.has(t.id))
              .map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() =>
                    setChosen((prev) => [...prev, { name: type.name, typeId: type.id, sets: 3 }])
                  }
                  className="bg-muted/60 hover:bg-muted text-footnote flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2.5"
                >
                  <span aria-hidden>{type.emoji}</span>
                  {type.name}
                </button>
              ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={!ready} className="h-10 flex-1 gap-2 rounded-xl">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {t('common.save')}
          </Button>
          <Button variant="ghost" onClick={onDone} className="h-10 rounded-xl">
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </InsetGroup>
  );
}
