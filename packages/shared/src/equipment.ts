import { z } from 'zod';
import { muscleLabel, type MuscleGroup } from './muscles.ts';

/**
 * What you pick up, as a second axis beside what it works.
 *
 * The muscle map says a curl trains biceps. It cannot say which curl, and
 * "Barbell curl" versus "Cable curl" versus "Preacher curl" is exactly the
 * distinction somebody is trying to draw when they are standing in front of the
 * rack deciding what they did. Two cheap axes — the muscles it lights and the
 * thing you hold — carry most of an exercise's identity between them, for six
 * glyphs rather than two hundred and twenty drawings.
 *
 * Stored on the row rather than read out of the name. A pattern that finds
 * "machine" in "Machine row" also finds it in "Smith machine squat" and then
 * misses "Hack squat" entirely, and the failure is silent: a wrong glyph looks
 * exactly like a right one, so nobody ever reports it.
 *
 * Nullable throughout. A sport has no equipment, and an exercise somebody
 * invented in the picker must not be held up for one — the whole point of
 * `defineExercise` is that it asks for a name and nothing else.
 */
export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'bodyweight',
  'kettlebell',
  /** A band, a medicine ball, a sled — real, and not worth its own glyph. */
  'other',
] as const;

export const Equipment = z.enum(EQUIPMENT);
export type Equipment = z.infer<typeof Equipment>;

const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  other: 'Other',
};

export const equipmentLabel = (kit: Equipment): string => EQUIPMENT_LABEL[kit];

/**
 * What somebody might type to mean this kit, for the picker's search.
 *
 * Same job as `muscleTerms`: "bw" and "calisthenics" both have to reach the
 * bodyweight exercises, and neither is a word the catalogue uses.
 */
const EQUIPMENT_TERMS: Record<Equipment, string[]> = {
  barbell: ['barbell', 'bar', 'bb', 'free weight', 'free weights'],
  dumbbell: ['dumbbell', 'dumbbells', 'db', 'free weight', 'free weights'],
  cable: ['cable', 'cables', 'pulley'],
  machine: ['machine', 'machines', 'selectorised', 'plate loaded'],
  bodyweight: ['bodyweight', 'body weight', 'bw', 'calisthenics', 'no equipment'],
  kettlebell: ['kettlebell', 'kettlebells', 'kb'],
  other: ['band', 'bands', 'resistance band', 'medicine ball', 'sled'],
};

export const equipmentTerms = (kit: Equipment): string[] => EQUIPMENT_TERMS[kit];

/**
 * The catalogue row that means "this muscle, exercise unspecified".
 *
 * The problem it exists for: somebody knows they trained biceps and does not
 * know, or does not care, that the machine they used is called a preacher
 * curl. Today the picker has no answer for that person and the session is
 * either mis-logged or abandoned — and an abandoned session is worse than a
 * vague one, because a vague one still carries the muscle, the burn and the
 * volume.
 *
 * These are ordinary `ExerciseType` rows with exactly one muscle, not a special
 * case in the schema: they get a MET, they group under their muscle, they carry
 * sets and reps, they can be corrected to a real exercise later. Nothing
 * downstream has to know they are different.
 *
 * The suffix is what makes them readable in a history that is otherwise all
 * proper names — "Biceps" alone in a list of sessions is ambiguous with a
 * routine called Biceps, and "Biceps work — 3 × 12 @ 30 kg" is not.
 */
export const genericMuscleName = (muscle: MuscleGroup): string => `${muscleLabel(muscle)} work`;

/**
 * Reads that suffix back off a row, or null for an ordinary exercise.
 *
 * Derived rather than stored as a column. It is genuinely a fact about the name,
 * and a boolean beside it would be a second source of truth that a rename could
 * put out of step — the migration writes these names and this reads them, so
 * there is exactly one definition of what a generic row is.
 */
export function genericMuscleOf(type: {
  name: string;
  muscles: readonly MuscleGroup[];
}): MuscleGroup | null {
  if (type.muscles.length !== 1) return null;
  const [muscle] = type.muscles;
  if (muscle === undefined) return null;
  return type.name === genericMuscleName(muscle) ? muscle : null;
}
