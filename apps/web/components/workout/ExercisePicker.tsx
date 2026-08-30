'use client';

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { ExerciseType, MuscleGroup } from '@ct/shared';
import { byMuscleGroup, exerciseMatches, muscleLabel } from '@ct/shared';
import { useT } from '@/lib/i18n';
import { Input } from '@/components/ui/input';

/**
 * Finding the exercise you did. The web twin of the mobile picker, and the same
 * argument: see `apps/mobile/components/workout/ExercisePicker.tsx`.
 *
 * The short version. Twenty-five chips in one alphabetical run worked because
 * twenty-five is a number you can read; the catalogue is now about two hundred
 * and twenty, which is not. So the list stops being the way in and becomes
 * something you ask a question of — searched by name, by the aliases a gym
 * actually uses ("RDL", "OHP", "pulldown"), and by muscle, which is the one
 * that matters: somebody who cannot remember "Romanian deadlift" can always
 * remember it is the one for the back of their legs.
 *
 * And for somebody who cannot name it at all, fourteen muscle chips: two taps
 * to anywhere in the catalogue, no vocabulary required.
 */
export function ExercisePicker({
  types,
  chosen,
  onPick,
  onDefine,
}: {
  /** Null while the catalogue is still loading. */
  types: ExerciseType[] | null;
  /** Type ids already in the session, which are not offered again. */
  chosen: Set<string | null>;
  onPick: (type: ExerciseType) => void;
  /** Teaches the app a new one and adds it. Absent to hide the offer. */
  onDefine?: (name: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);

  const available = useMemo(
    () => (types ?? []).filter((type) => !chosen.has(type.id)),
    [types, chosen],
  );

  /* Every sport and every run has an empty `muscles`, so offering "Chest /
     Back / Legs" over football and swimming would filter nothing. */
  const hasMuscles = available.some((type) => type.muscles.length > 0);
  const searching = query.trim().length > 0;

  const shown = useMemo(() => {
    if (searching) return available.filter((type) => exerciseMatches(type, query));
    if (!hasMuscles) return available;
    if (muscle) return available.filter((type) => type.muscles[0] === muscle);
    return [];
  }, [available, query, searching, hasMuscles, muscle]);

  /* Their own history first, and only when nothing narrower has been asked. */
  const recents = useMemo(
    () =>
      searching || muscle
        ? []
        : available.filter((type) => type.previous.length > 0).slice(0, 12),
    [available, searching, muscle],
  );

  const groups = useMemo(() => byMuscleGroup(shown), [shown]);
  const muscles = useMemo(
    () =>
      byMuscleGroup(available)
        .map(({ muscle: key }) => key)
        .filter((key): key is MuscleGroup => key !== null),
    [available],
  );

  const typed = query.trim();
  const exact = (types ?? []).some((type) => type.name.toLowerCase() === typed.toLowerCase());
  const offerDefine = onDefine !== undefined && typed.length > 1 && !exact;

  if (types === null) {
    return <p className="text-footnote text-muted-foreground">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={14}
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('workout.searchExercises')}
          aria-label={t('workout.searchExercises')}
          autoComplete="off"
          className="bg-card text-footnote h-9 rounded-lg border-0 pl-9"
        />
      </div>

      {recents.length > 0 && (
        <Group heading={t('workout.doneThese')}>
          {recents.map((type) => (
            <Chip key={type.id} type={type} onPick={onPick} known />
          ))}
        </Group>
      )}

      {hasMuscles && !searching && (
        <Group heading={t('workout.browseMuscle')}>
          {muscles.map((key) => {
            const on = muscle === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMuscle(on ? null : key)}
                aria-pressed={on}
                className={`text-footnote rounded-full px-3 py-1.5 transition-colors ${
                  on
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 hover:bg-muted text-muted-foreground'
                }`}
              >
                {muscleLabel(key)}
              </button>
            );
          })}
        </Group>
      )}

      {groups.map(({ muscle: key, types: list }) => (
        <Group
          key={key ?? 'other'}
          /* No heading over an ungrouped list: "Football, Tennis, Volleyball"
             does not belong under a body part, and one reading "Other" over the
             whole sport catalogue would say nothing at all. */
          heading={key !== null && searching ? muscleLabel(key) : undefined}
        >
          {list.map((type) => (
            <Chip key={type.id} type={type} onPick={onPick} />
          ))}
        </Group>
      ))}

      {searching && shown.length === 0 && !offerDefine && (
        <p className="text-footnote text-muted-foreground">{t('workout.nothingMatches')}</p>
      )}

      {offerDefine && (
        <button
          type="button"
          onClick={() => {
            onDefine?.(typed);
            setQuery('');
          }}
          className="text-footnote hover:bg-muted/60 flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5"
        >
          <Plus size={13} />
          {t('workout.addNamed')(typed)}
        </button>
      )}
    </div>
  );
}

function Group({ heading, children }: { heading?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {heading && (
        <p className="text-muted-foreground text-[10.5px] font-semibold tracking-widest uppercase">
          {heading}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  type,
  onPick,
  known,
}: {
  type: ExerciseType;
  onPick: (type: ExerciseType) => void;
  /* A hairline of the accent on anything they have done before. Not a fill:
     these are still offers, and a filled chip in this app means chosen. */
  known?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(type)}
      className={`bg-muted/60 hover:bg-muted text-footnote flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2.5 ${
        known ? 'ring-primary ring-1' : ''
      }`}
    >
      <span aria-hidden>{type.emoji}</span>
      {type.name}
    </button>
  );
}
