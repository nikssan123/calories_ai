import type {
  ExerciseCategory,
  ExerciseTracks,
  ExerciseType,
  MuscleGroup,
  SetValues,
  UnitSystem,
  WorkoutExercise,
} from '@ct/shared';
import { distanceToKm, loadToKg, toDistance, toLoad } from '@ct/shared';

/**
 * A session while it is being typed, and the arithmetic that turns it back into
 * something the server will take.
 *
 * Split out of the card because three things now need it — the card, the row
 * editor and the picker — and because the interesting decision in here is not
 * about rendering: it is that **the model stays one row per set** even though
 * the card no longer draws one row per set.
 *
 * "Three sets of ten at sixty" is one line on screen and three rows in
 * `exercise_sets`, and it has to stay three rows, because the fourth set is
 * where the reps drop and a count would throw away the only record of that. So
 * the compact line is a *writer* over the array rather than a replacement for
 * it: moving the sets stepper adds or drops copies, and everything downstream —
 * `toExercise`, the payload, `writeSets` — is untouched.
 */

export interface DraftSet {
  reps: number | null;
  /** In whatever the reader uses; converted to kilograms on the way out. */
  weight: number | null;
  minutes: number | null;
  /** In whatever the reader uses; converted to metres on the way out. */
  distance: number | null;
}

export interface DraftExercise {
  name: string;
  typeId: string | null;
  tracks: ExerciseTracks;
  emoji: string;
  muscles: MuscleGroup[];
  sets: DraftSet[];
  /**
   * What they did last time, for the line above the numbers.
   *
   * Kept beside the sets rather than compared against them, because it has to
   * survive being edited: the whole point of printing it is that somebody who
   * has just added 2.5 kg can still see what they are beating.
   */
  previous: DraftSet[];
}

export const blankSet = (): DraftSet => ({
  reps: null,
  weight: null,
  minutes: null,
  distance: null,
});

/** What a set of this kind is measured in, when the catalogue cannot say. */
export const CATEGORY_TRACKS: Record<ExerciseCategory, ExerciseTracks> = {
  strength: 'reps',
  cardio: 'duration',
  class: 'duration',
  sport: 'duration',
  flexibility: 'duration',
};

export const CATEGORY_EMOJI: Record<ExerciseCategory, string> = {
  strength: '🏋️',
  cardio: '🏃',
  class: '🤸',
  sport: '⚽',
  flexibility: '🧘',
};

/** A stored set, in the units the person reading it uses. */
export function toDraftSet(set: SetValues, units: UnitSystem): DraftSet {
  return {
    reps: set.reps,
    weight: set.weight_kg === null ? null : round(toLoad(set.weight_kg, units)),
    minutes: set.duration_sec === null ? null : Math.round(set.duration_sec / 60),
    distance:
      set.distance_m === null ? null : round(toDistance(set.distance_m / 1000, units), 2),
  };
}

/**
 * A catalogue entry, ready to go into the card.
 *
 * Opens on what they did last time rather than on blanks — which is the single
 * change this whole redesign rests on. `previous` comes from the picker's
 * `with_previous` read, so this costs nothing at the moment of tapping.
 *
 * Falls back to one empty set for an exercise never done before. That is the
 * honest state: there is nothing to offer, and a made-up 3 × 10 would be the
 * app inventing a training history.
 */
export function draftFromType(type: ExerciseType, units: UnitSystem): DraftExercise {
  const previous = type.previous.map((set) => toDraftSet(set, units));
  return {
    name: type.name,
    typeId: type.id,
    tracks: type.tracks,
    emoji: type.emoji,
    muscles: type.muscles,
    sets: previous.length > 0 ? previous.map((set) => ({ ...set })) : [blankSet()],
    previous,
  };
}

/**
 * The one set every set in this exercise is, or null when they differ.
 *
 * Null is what puts the per-set grid on screen. A drop set, a pyramid and a set
 * somebody failed early are all real, and all three are exactly the case the
 * compact line cannot describe — so it stops claiming to.
 */
export function uniformSet(sets: DraftSet[]): DraftSet | null {
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

/** The same change to every set — what the compact line's steppers write. */
export function setEvery(exercise: DraftExercise, patch: Partial<DraftSet>): DraftExercise {
  return { ...exercise, sets: exercise.sets.map((set) => ({ ...set, ...patch })) };
}

/**
 * Grow or shrink the set list.
 *
 * A new set copies the last one, because the second set of anything is almost
 * always the same as the first and retyping it is the difference between
 * logging four sets and logging one.
 */
export function resize(exercise: DraftExercise, count: number): DraftExercise {
  const wanted = Math.min(30, Math.max(1, count));
  const sets = exercise.sets.slice(0, wanted);
  while (sets.length < wanted) sets.push({ ...(sets.at(-1) ?? blankSet()) });
  return { ...exercise, sets };
}

/**
 * A draft becomes an exercise only once at least one set has a number in it.
 *
 * A set with nothing in it is a row somebody added and did not fill, not a set
 * of zero reps — dropping it is the honest reading. The load leaves here in
 * kilograms and the distance in metres, whatever the fields said, which is the
 * only conversion on the way out.
 */
export function toExercise(draft: DraftExercise, units: UnitSystem): WorkoutExercise | null {
  const sets = draft.sets
    .map((set) => {
      if (draft.tracks === 'reps') {
        if (set.reps === null && set.weight === null) return null;
        return {
          reps: set.reps,
          weight_kg: set.weight === null ? null : loadToKg(set.weight, units),
        };
      }
      if (draft.tracks === 'distance') {
        // Distance-tracked work is a run or a swim, and both of those have a
        // clock on them too. Either number alone is a complete answer.
        if (set.distance === null && set.minutes === null) return null;
        return {
          distance_m:
            set.distance === null
              ? null
              : Math.round(distanceToKm(set.distance, units) * 1000),
          duration_sec: set.minutes === null ? null : Math.round(set.minutes * 60),
        };
      }
      return set.minutes === null ? null : { duration_sec: Math.round(set.minutes * 60) };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (sets.length === 0) return null;
  return { name: draft.name, type_id: draft.typeId, sets };
}

export const isExercise = (e: WorkoutExercise | null): e is WorkoutExercise => e !== null;

/** Trailing zeros are noise on a number somebody is about to read at a glance. */
export function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** What the agent heard, before the card fills in what it did not say. */
export interface HeardExercise {
  name: string;
  sets: number | null;
  reps: number | null;
  weight_kg: number | null;
}

/**
 * A part-dictated session, opened as a card.
 *
 * The rule is that **what they said wins, and history answers the rest**. Say
 * "squats and RDLs" and both arrive at last week's numbers; say "squats, four
 * by eight" and the sets and reps are theirs while the load still comes from
 * history. Nothing is invented: an exercise with no history and no numbers said
 * about it opens blank, which is the honest state.
 *
 * This is what makes the handover from the chat lossless, and lossless is the
 * whole precondition for nudging anyone toward the card. Handing somebody an
 * empty form after they have just named three exercises is punishing them for
 * having used the conversation.
 */
export function draftsFromHeard(
  heard: HeardExercise[],
  types: ExerciseType[],
  units: UnitSystem,
  category: ExerciseCategory,
): DraftExercise[] {
  const byName = new Map(types.map((type) => [type.name.toLowerCase(), type]));
  return heard.map((said) => {
    const type = byName.get(said.name.trim().toLowerCase());
    const base: DraftExercise = type
      ? draftFromType(type, units)
      : {
          name: said.name.trim(),
          typeId: null,
          tracks: CATEGORY_TRACKS[category],
          emoji: CATEGORY_EMOJI[category],
          muscles: [],
          sets: [blankSet()],
          previous: [],
        };

    const stated: Partial<DraftSet> = {};
    if (said.reps !== null) stated.reps = said.reps;
    if (said.weight_kg !== null) stated.weight = round(toLoad(said.weight_kg, units));

    let draft = Object.keys(stated).length > 0 ? setEvery(base, stated) : base;
    if (said.sets !== null) draft = resize(draft, said.sets);
    return draft;
  });
}
