import { z } from 'zod';

/**
 * The muscle vocabulary, and the two maps that read off it.
 *
 * Lifted out of `index.ts` when the body map arrived. `body.ts` needs
 * `MuscleGroup` to key its regions and `equipment.ts` needs `muscleLabel` to
 * name a generic row, and both are re-exported by the barrel — so importing
 * either from `index.ts` would be a cycle. Nothing here changed in the move.
 */

/**
 * Which muscles an exercise is for.
 *
 * The category says what an exercise *is* — all of this is `strength` — and
 * this says what it is *for*, which is the thing people actually name a session
 * after. "Chest day" is a statement about muscles, and without them the app
 * cannot form the sentence, name a routine, or notice that shoulders have not
 * been trained in three weeks.
 *
 * Ordered primary-first wherever it appears: a bench press is chest and triceps
 * and front delts, and the first one is what the exercise is chosen for.
 *
 * **The order of this list is the order the picker draws its sections in**, so
 * it runs down the body the way a gym-goer scans one — chest, back, shoulders,
 * arms, legs, core — rather than alphabetically. Nothing else depends on the
 * order, and grouping the picker by anything else would mean a second list to
 * keep in step with this one.
 *
 * Fourteen is a deliberate resting place between "ten" and an anatomy chart.
 * The four added past the original ten each earn it by owning exercises that
 * were previously filed somewhere misleading:
 *
 * - `lower_back` — a back extension is not a lat pulldown, and tagging both
 *   `back` puts them under the same heading in a picker that now has a heading.
 * - `traps` — shrugs and upright rows, which people do name a set after.
 * - `forearms` — wrist curls, farmer's walks, grip work.
 * - `adductors` — the inner-thigh machine and the Copenhagen plank, which were
 *   previously either `quads` or nothing at all.
 *
 * Hip *abduction* deliberately did not get one: the abduction machine and band
 * walks are glute medius, so they are `glutes`, which is both anatomically
 * honest and where somebody training glutes would look for them.
 */
export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'lower_back',
  'traps',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
  'core',
] as const;
export const MuscleGroup = z.enum(MUSCLE_GROUPS);
export type MuscleGroup = z.infer<typeof MuscleGroup>;

/** The four that people say "legs" about, for naming a day rather than storing one. */
export const LEG_MUSCLES: MuscleGroup[] = [
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
];

/**
 * The movement pattern a muscle belongs to.
 *
 * Muscle groups alone cannot name a workout, because half the training world
 * does not split by muscle. Push/pull/legs and upper/lower are splits by what
 * the movement *does* — everything you press away from you on one day,
 * everything you pull toward you on another — and a chest-and-triceps session
 * is a "push day" to one person and a "chest day" to another. Both are looking
 * at the same set of exercises.
 *
 * So this is the second axis. `core` is deliberately neutral: abs get trained
 * on the end of everything and must never be what decides a session's name.
 */
export type MovementPattern = 'push' | 'pull' | 'legs' | 'core';

export const MUSCLE_PATTERN: Record<MuscleGroup, MovementPattern> = {
  chest: 'push',
  shoulders: 'push',
  triceps: 'push',
  back: 'pull',
  // A hinge is a pull in every split that uses the word: deadlifts and
  // hyperextensions land on pull day or leg day, never on push day.
  lower_back: 'pull',
  traps: 'pull',
  biceps: 'pull',
  // Grip work rides with pulling — it is done because the bar was slipping.
  forearms: 'pull',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  adductors: 'legs',
  calves: 'legs',
  core: 'core',
};

const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  lower_back: 'Lower back',
  traps: 'Traps',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Adductors',
  calves: 'Calves',
  core: 'Core',
};

/**
 * The words somebody might type at the picker to mean a muscle.
 *
 * Search has to answer "legs" and "abs" and "delts", none of which are stored
 * anywhere — the column says `quads` and `core` and `shoulders`. Kept beside
 * the labels rather than in the database because these are facts about English,
 * not about anybody's account, and a migration is a poor place for a thesaurus.
 */
const MUSCLE_TERMS: Record<MuscleGroup, string[]> = {
  chest: ['chest', 'pecs', 'pec', 'push'],
  back: ['back', 'lats', 'lat', 'pull', 'row'],
  lower_back: ['lower back', 'erectors', 'spinal', 'hinge', 'back'],
  traps: ['traps', 'trap', 'shrug', 'upper back', 'back'],
  shoulders: ['shoulders', 'shoulder', 'delts', 'delt', 'push'],
  biceps: ['biceps', 'bicep', 'arms', 'arm', 'curl', 'pull'],
  triceps: ['triceps', 'tricep', 'arms', 'arm', 'push'],
  forearms: ['forearms', 'forearm', 'grip', 'wrist', 'arms', 'arm'],
  quads: ['quads', 'quad', 'legs', 'leg', 'thigh'],
  hamstrings: ['hamstrings', 'hamstring', 'hams', 'legs', 'leg'],
  glutes: ['glutes', 'glute', 'bum', 'butt', 'legs', 'leg', 'hips', 'hip'],
  adductors: ['adductors', 'adductor', 'inner thigh', 'groin', 'legs', 'leg'],
  calves: ['calves', 'calf', 'legs', 'leg'],
  core: ['core', 'abs', 'ab', 'abdominals', 'obliques', 'stomach'],
};

/** Every way of saying this muscle, for the picker's search. */
export const muscleTerms = (muscle: MuscleGroup): string[] => MUSCLE_TERMS[muscle];

export const muscleLabel = (muscle: MuscleGroup) => MUSCLE_LABEL[muscle];
