import { z } from 'zod';
import { UnitSystem } from './units.ts';

/**
 * The wire contract between the API and any client (web today, React Native later).
 * Nothing in this file may import node-only modules.
 */

/** Conversion between what is stored and what is read. See UNITS.md. */
export * from './units.ts';

/**
 * Day boundaries and the arithmetic that turns entries into a `DaySummary`.
 *
 * Re-exported from here rather than left as its own entry point because every
 * consumer already imports the shapes it operates on from this module, and a
 * second import line to add up the rows you just fetched is friction for
 * nothing. `day.ts` imports from here type-only, so the cycle is erased.
 */
export * from './day.ts';

/**
 * Folding client-side changes into a day before the server has heard about
 * them. Same reasoning as `day.ts`, and it builds on it.
 */
export * from './pending.ts';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const Meal = z.enum(MEALS);
export type Meal = z.infer<typeof Meal>;

/** How sure the AI was. Drives whether we show "~650" and how we weight adaptive targets. */
export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export const Confidence = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof Confidence>;

/**
 * How the entry got here. `barcode` means the numbers were read off a label
 * rather than estimated by a model, which is the one thing a correction screen
 * most wants to know.
 *
 * Shared with `ExerciseEntry`, so this list is wider than either table's CHECK
 * constraint strictly needs: `exercise_entries.source` still refuses 'barcode',
 * and nothing writes one, because there is no path from a packet to a workout.
 * That mismatch is deliberate — splitting this into two enums would double the
 * commonest three values to keep one impossible row honest.
 */
export const ENTRY_SOURCES = ['text', 'photo', 'quick', 'manual', 'barcode'] as const;
export const EntrySource = z.enum(ENTRY_SOURCES);
export type EntrySource = z.infer<typeof EntrySource>;

export const SEXES = ['male', 'female'] as const;
export const Sex = z.enum(SEXES);
export type Sex = z.infer<typeof Sex>;

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export const ActivityLevel = z.enum(ACTIVITY_LEVELS);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

export const GOALS = ['lose', 'maintain', 'gain'] as const;
export const Goal = z.enum(GOALS);
export type Goal = z.infer<typeof Goal>;

/**
 * What an account is entitled to.
 *
 * There is no billing behind this yet, and that is the point: the routes that
 * cost money read their ceilings from the plan from the first commit, so
 * gating a feature later is setting a number rather than auditing every route.
 *
 * `free` used to be described here as "deliberately generous — the daily
 * journal is the habit the product lives on and must never be the thing
 * someone hits a wall in." That reasoning was correct while a model round trip
 * was the *only* way to log a meal. It is not any more: manual entry, repeat,
 * barcode and the offline outbox all log without spending a token, so a free
 * account that runs out of model still has a working food diary. The wall
 * stopped being an exit, which is what lets the AI allowance be small.
 *
 * Three tiers rather than two. `pro` was renamed to `plus` in `034` — same
 * accounts, same column — because the kitchen turned out to need a tier of its
 * own: it is output-dominated, so no amount of caching or model choice moves
 * it, and bundling it into one paid tier put a $0.41 meal plan inside a
 * subscription that nets a few dollars a month.
 */
/**
 * A dietary pattern. Four, because these are the ones that change what an
 * ingredient list may contain and that a recipe writer can actually honour.
 * Anything narrower — an allergy, a dislike, half a religious observance —
 * belongs in `avoids`, where it can be said in the user's own words.
 */
export const DIETS = ['none', 'vegetarian', 'vegan', 'pescatarian'] as const;
export const Diet = z.enum(DIETS);
export type Diet = z.infer<typeof Diet>;

export const PLANS = ['free', 'plus', 'coach'] as const;
export const PlanName = z.enum(PLANS);
export type PlanName = z.infer<typeof PlanName>;

/**
 * The metered dimensions, named once so the server and both clients agree.
 *
 * These are the things an allowance is counted in. They are deliberately *not*
 * `TurnKind`: a turn kind is what the ledger recorded, and a meter is what the
 * user was sold. `chat` covers `text_log` and `setup` together, because
 * somebody halfway through onboarding is not spending a different budget, and
 * `photo` is metered separately from chat despite also being a journal turn
 * because it costs six times as much.
 */
export const METERS = ['chat', 'photo', 'pantry_scan', 'recipe', 'meal_plan'] as const;
export const MeterName = z.enum(METERS);
export type MeterName = z.infer<typeof MeterName>;

/**
 * What is left of one meter, for a screen that has to say so *before* the
 * button is pressed.
 *
 * `allowed` null means the meter does not apply to this plan at all — the
 * kitchen on `free`, which is a locked feature rather than a spent one. Zero
 * means it applies and is gone. The two look identical in a counter and read
 * completely differently in a sentence, so the client needs to tell them apart.
 *
 * `period` is what the wall says when it refuses. `ever` is the free tier's
 * single lifetime photo: there is no reset, and a countdown that never moves is
 * crueller than a sentence that says so.
 */
export const Allowance = z.object({
  meter: MeterName,
  allowed: z.number().nullable(),
  used: z.number(),
  period: z.enum(['month', 'ever']),
  /** When the oldest run in the window ages out. Null when nothing is waiting. */
  resets_at: z.string().nullable(),
  /**
   * Scans bought outright, still unspent. Photos only; zero everywhere else.
   *
   * Deliberately a separate number rather than being folded into `allowed`.
   * They behave differently and a screen has to be able to say so: the grant
   * comes back every month and these do not come back at all, they are stock.
   * A single "37 left" would be true this month and a lie the next, which is
   * the same mistake `allowed: null` versus `0` exists to avoid.
   *
   * Defaulted so a client built against the older shape still parses.
   */
  credits: z.number().default(0),
});
export type Allowance = z.infer<typeof Allowance>;

/**
 * What one tier is worth, as the tier itself rather than as this account's
 * remainder.
 *
 * The wall has to say what paying buys, and there are only two places that
 * sentence can be written: next to the numbers in `plans.ts`, or a second time
 * in a paywall screen. The second is how a tier quietly changes and the screen
 * selling it goes on advertising last month's ceilings — so the ceilings are
 * shipped to the client and the copy is generated from them.
 *
 * Prices are deliberately *not* here. A store knows what this person's currency
 * is and what the local tax does to the number; a server hardcoding "$79.99"
 * would be wrong in most of the world. The price comes off the store's own
 * product, and this carries only what the money gets you.
 */
export const PlanTier = z.object({
  plan: PlanName,
  meters: z.array(
    z.object({
      meter: MeterName,
      allowed: z.number().nullable(),
      period: z.enum(['month', 'ever']),
    }),
  ),
  reviews_per_day: z.number().int(),
  nudges_per_week: z.number().int(),
});
export type PlanTier = z.infer<typeof PlanTier>;

/**
 * Everything a screen needs to talk about money, in one request.
 *
 * One endpoint rather than a meter at a time, because every surface that has an
 * opinion about the plan needs more than one of these at once: the wall names
 * what was spent *and* what the next tier holds, and the settings screen lists
 * all five. Five round trips to draw one card is the kind of thing that makes a
 * paywall feel slow, and a paywall that feels slow does not get read.
 */
export const Entitlements = z.object({
  plan: PlanName,
  /** One per meter, in `METERS` order. */
  allowances: z.array(Allowance),
  /** Every tier, including the one they are on, so the wall can compare. */
  tiers: z.array(PlanTier),
});
export type Entitlements = z.infer<typeof Entitlements>;

/**
 * The three questions every screen asks an allowance, answered once.
 *
 * `allowed: null` and `used >= allowed` both mean "this button will 402", and
 * every surface that draws a button has to collapse them — but they read
 * completely differently in a sentence, so the distinction has to survive as
 * far as the copy. Two predicates rather than one enum because that is how the
 * call sites actually branch: shut the button on `spent`, choose the words on
 * `locked`.
 *
 * Written here rather than in either client because both of them had a copy,
 * and both copies were the same bug: `used >= allowed` against a null `allowed`
 * is `0 >= null`, which is *false*, so a locked kitchen drew an enabled button
 * that failed on press. That is the exact shape of failure the null was
 * introduced to prevent.
 */
export function meterLocked(allowance: Allowance): boolean {
  return allowance.allowed === null;
}

export function meterSpent(allowance: Allowance): boolean {
  return allowance.allowed === null || allowance.used >= allowance.allowed;
}

/** How many are left. Zero on a locked meter, which is true and is not a count. */
export function meterRemaining(allowance: Allowance): number {
  return allowance.allowed === null ? 0 : Math.max(0, allowance.allowed - allowance.used);
}

/** Macros in grams + energy in kcal. Shared by items, entries and daily totals. */
export const Nutrition = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});
export type Nutrition = z.infer<typeof Nutrition>;

/**
 * The four figures that say something about the quality of food rather than its
 * quantity. Estimated per item, exactly where the macros are.
 *
 * Every one of them is nullable, and null is a real answer rather than a gap to
 * be filled with a zero: it means nobody ever estimated this, which is true of
 * every item logged before these fields existed and of anything the model
 * genuinely cannot judge. A zero is a claim — "this has no fiber" — and a plate
 * of pasta reported as zero-fiber is a worse day total than one reported as
 * partly unknown.
 *
 * Deliberately not folded into `Nutrition`. That shape is also a day's totals
 * and the shape `Targets` is built around, so widening it would force four more
 * fields into every literal that adds up a day, for nothing: a target has no
 * business carrying a nullable sodium figure.
 */
export const DietQuality = z.object({
  fiber_g: z.number().nullable(),
  sodium_mg: z.number().nullable(),
  sat_fat_g: z.number().nullable(),
  sugar_g: z.number().nullable(),
});
export type DietQuality = z.infer<typeof DietQuality>;

export const FoodItem = z.object({
  id: z.string().uuid(),
  entry_id: z.string().uuid(),
  name: z.string(),
  /** Resolved quantity. Null when the food isn't sensibly weighed (e.g. "a coffee"). */
  quantity_g: z.number().nullable(),
  /** What the AI actually assumed, in words — "1 medium banana", "2 slices". */
  quantity_desc: z.string().nullable(),
  ...Nutrition.shape,
  ...DietQuality.shape,
});
export type FoodItem = z.infer<typeof FoodItem>;

export const FoodEntry = z.object({
  id: z.string().uuid(),
  meal: Meal,
  /** Instant the food was eaten (not when it was logged). */
  eaten_at: z.string(),
  /** The day this entry counts toward, honouring the user's day_start_hour. */
  local_date: z.string(),
  description: z.string(),
  note: z.string().nullable(),
  confidence: Confidence,
  source: EntrySource,
  photo_id: z.string().uuid().nullable(),
  items: z.array(FoodItem),
  ...Nutrition.shape,
  /** Summed over the items that carry them; null when none of them did. */
  ...DietQuality.shape,
});
export type FoodEntry = z.infer<typeof FoodEntry>;

/**
 * What kind of session it was. Five, because these are the distinctions that
 * change what the app should ask you next: a strength session wants sets and a
 * load, a run wants a distance, and a yoga class wants neither.
 */
export const EXERCISE_CATEGORIES = ['strength', 'cardio', 'class', 'sport', 'flexibility'] as const;
export const ExerciseCategory = z.enum(EXERCISE_CATEGORIES);
export type ExerciseCategory = z.infer<typeof ExerciseCategory>;

/** What one set of an exercise is measured in — and so which fields to draw. */
export const EXERCISE_TRACKS = ['reps', 'duration', 'distance'] as const;
export const ExerciseTracks = z.enum(EXERCISE_TRACKS);
export type ExerciseTracks = z.infer<typeof ExerciseTracks>;

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
 */
export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
] as const;
export const MuscleGroup = z.enum(MUSCLE_GROUPS);
export type MuscleGroup = z.infer<typeof MuscleGroup>;

/** The four that people say "legs" about, for naming a day rather than storing one. */
export const LEG_MUSCLES: MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves'];

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
  biceps: 'pull',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  core: 'core',
};

const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
};

export const muscleLabel = (muscle: MuscleGroup) => MUSCLE_LABEL[muscle];

/**
 * Which vocabulary someone names their workouts in.
 *
 * `pattern` is push/pull/legs/upper/lower; `muscle` is chest day, back day. The
 * app has no business having an opinion about which is correct — they describe
 * the same training and people are loyal to the words they learned it in — so
 * it reads theirs off the routines they have already named and follows suit.
 *
 * Null until they have named one, which is the only time a default is needed.
 */
export type NamingStyle = 'pattern' | 'muscle';

const PATTERN_WORDS = ['push', 'pull', 'leg', 'upper', 'lower', 'full body', 'ppl'];

export function namingStyleOf(existingNames: string[]): NamingStyle | null {
  let pattern = 0;
  let muscle = 0;
  for (const raw of existingNames) {
    const name = raw.toLowerCase();
    // "Leg day" reads as both; it is the one word the two systems share, so it
    // votes for neither rather than for whichever is tested first.
    const isLegs = name.includes('leg');
    const saysPattern = PATTERN_WORDS.some((word) => name.includes(word));
    const saysMuscle = MUSCLE_GROUPS.some((m) => m !== 'core' && name.includes(m.slice(0, 5)));
    if (isLegs && !saysMuscle) continue;
    if (saysPattern) pattern += 1;
    else if (saysMuscle) muscle += 1;
  }
  if (pattern === muscle) return null;
  return pattern > muscle ? 'pattern' : 'muscle';
}

/**
 * What to call a session, from the muscles it actually hit.
 *
 * Counts primary muscles only — a bench press is a chest exercise that happens
 * to involve triceps, and letting the secondary muscles vote turns every push
 * day into "chest and triceps and shoulders".
 *
 * The order of the tests is the whole design, and it is what makes one function
 * serve both splits:
 *
 *   1. One muscle carrying most of the work names the day outright. A session
 *      that is three chest movements and a pushdown is a chest day in anybody's
 *      vocabulary.
 *   2. Otherwise the movement pattern names it. Bench, overhead press, laterals,
 *      dips and pushdowns is not "shoulders and triceps" — it is a push day, and
 *      the only reason the muscle counts do not say so is that push days are
 *      spread across three muscles by design.
 *   3. Push and pull together, with no legs, is an upper day.
 *   4. Anything touching all three is full body.
 *
 * `style` breaks the genuine ties — a back-and-biceps session is "Pull" to one
 * person and "Back & Biceps" to another, and both are right. It comes from the
 * routines they have already named, so the app converges on their words after
 * the first one rather than insisting on its own.
 */
export function nameFromMuscles(
  primaries: MuscleGroup[],
  style: NamingStyle | null = null,
): string {
  if (primaries.length === 0) return 'Workout';

  // Core rides along with everything and decides nothing — unless it is all
  // there was, in which case it is the honest answer.
  const working = primaries.filter((m) => MUSCLE_PATTERN[m] !== 'core');
  if (working.length === 0) return 'Core day';

  const total = working.length;

  const muscles = new Map<string, number>();
  const patterns = new Map<MovementPattern, number>();
  for (const muscle of working) {
    const key = LEG_MUSCLES.includes(muscle) ? 'Legs' : MUSCLE_LABEL[muscle];
    muscles.set(key, (muscles.get(key) ?? 0) + 1);
    const pattern = MUSCLE_PATTERN[muscle];
    patterns.set(pattern, (patterns.get(pattern) ?? 0) + 1);
  }

  const byMuscle = [...muscles.entries()].sort((a, b) => b[1] - a[1]);
  const byPattern = [...patterns.entries()].sort((a, b) => b[1] - a[1]);
  const [topMuscle] = byMuscle;
  const [topPattern] = byPattern;
  if (!topMuscle || !topPattern) return 'Workout';

  // 1. A session that is essentially one muscle is that muscle's day, in
  //    anybody's vocabulary. Somebody who trains push/pull/legs and spends a
  //    whole session on shoulders has still had a shoulders day, and calling it
  //    "Push" throws away the only interesting thing about it.
  if (topMuscle[1] / total >= 0.85) return `${topMuscle[0]} day`;

  // 2. One muscle carrying most of it names the day too — but this is the test
  //    that a pattern-namer would disagree with, because a back-heavy session
  //    with curls on the end is "Pull" to them and "Back day" to somebody who
  //    splits by body part. Legs are exempt: "Legs" is what both camps say.
  if (style !== 'pattern' || topMuscle[0] === 'Legs') {
    if (topMuscle[1] / total >= 0.7) return `${topMuscle[0]} day`;
  }

  // 3. Arms are their own session in both systems, and neither "Upper" nor
  //    "Push" describes an hour of curls and pushdowns.
  if (working.every((m) => m === 'biceps' || m === 'triceps')) return 'Arms';

  // 4. One movement pattern carries it. Not exclusivity — a pull day with one
  //    rear-delt movement in it is still a pull day.
  if (topPattern[1] / total >= 0.8) {
    if (topPattern[0] === 'legs') return 'Legs day';
    // Two muscles and no stated preference for patterns reads better named:
    // "Chest & Triceps" says more than "Push" and is wrong for nobody.
    if (style !== 'pattern' && byMuscle.length === 2) {
      return `${byMuscle[0]![0]} & ${byMuscle[1]![0]}`;
    }
    return topPattern[0] === 'push' ? 'Push' : 'Pull';
  }

  // 5. Everything above the waist.
  if (!patterns.has('legs')) {
    if (style !== 'pattern' && byMuscle.length === 2) {
      return `${byMuscle[0]![0]} & ${byMuscle[1]![0]}`;
    }
    return 'Upper';
  }

  // 6. Legs plus enough upper work to not be a leg day.
  return 'Full body';
}

export const ExerciseType = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: ExerciseCategory,
  emoji: z.string(),
  tracks: ExerciseTracks,
  /** Primary first. Empty for anything that is not lifting. */
  muscles: z.array(MuscleGroup).default([]),
  /** True when this account invented it rather than it shipping with the app. */
  custom: z.boolean(),
});
export type ExerciseType = z.infer<typeof ExerciseType>;

/**
 * One set. "3×8 at 80kg" is three of these, not one saying three — the last set
 * is where the reps drop, and a count throws away the only record of that.
 */
export const ExerciseSet = z.object({
  name: z.string(),
  position: z.number().int(),
  set_number: z.number().int(),
  reps: z.number().int().nullable(),
  weight_kg: z.number().nullable(),
  duration_sec: z.number().int().nullable(),
  distance_m: z.number().int().nullable(),
});
export type ExerciseSet = z.infer<typeof ExerciseSet>;

export const ExerciseEntry = z.object({
  id: z.string().uuid(),
  description: z.string(),
  performed_at: z.string(),
  local_date: z.string(),
  duration_min: z.number().nullable(),
  distance_km: z.number().nullable(),
  kcal_burned: z.number(),
  confidence: Confidence,
  source: EntrySource,
  category: ExerciseCategory.nullable(),
  /**
   * Whether the numbers were read off a sentence or filled in by a person.
   * `counted` means the burn is arithmetic over the sets below rather than a
   * guess about them, which is worth saying out loud on the card.
   */
  detail: z.enum(['estimated', 'counted']),
  sets: z.array(ExerciseSet).default([]),
});
export type ExerciseEntry = z.infer<typeof ExerciseEntry>;

/** One exercise within a session, as the card submits it. */
export const WorkoutExercise = z.object({
  name: z.string().min(1).max(80),
  type_id: z.string().uuid().nullable().optional(),
  sets: z
    .array(
      z.object({
        reps: z.number().int().min(1).max(1000).nullable().optional(),
        weight_kg: z.number().min(0).max(500).nullable().optional(),
        duration_sec: z.number().int().min(1).max(86400).nullable().optional(),
        distance_m: z.number().int().min(1).max(500000).nullable().optional(),
      }),
    )
    .min(1)
    .max(30),
});
export type WorkoutExercise = z.infer<typeof WorkoutExercise>;

/**
 * A finished session, submitted in one go.
 *
 * Deliberately one request rather than a conversation. Asking "which exercise?
 * how many sets? how heavy?" as three chat turns would be three model calls and
 * the better part of a minute to log something the user already knows; the card
 * collects it all and posts once, and the model is not involved at all.
 */
export const WorkoutRequest = z
  .object({
    category: ExerciseCategory,
    /**
     * What was lifted — and empty is the ordinary case, not a degenerate one.
     *
     * The burn is category, bodyweight and time; the sets contribute nothing to
     * it. They are a training record the app is glad to keep and has no
     * standing to demand, so a session can be logged without one.
     */
    exercises: z.array(WorkoutExercise).max(20).default([]),
    /**
     * Total session time. Required when no exercises came with it, since then
     * there is nothing left to estimate the minutes from.
     */
    duration_min: z.number().min(1).max(600).nullable().optional(),
    /** ISO instant. Defaults to now; the card carries the one the agent meant. */
    performed_at: z.string().optional(),
    /**
     * The routine this session was, when it came from one. Written onto the
     * entry so the weekday habit can be read back out of the history later —
     * "Monday is chest day" is a fact about these rows, not a setting.
     */
    routine_id: z.string().uuid().nullable().optional(),
    /**
     * The chat message whose question this answers. Given it, the server rewrites
     * that message's card into a receipt — otherwise reopening the app shows a
     * question that was answered days ago.
     */
    message_id: z.string().uuid().optional(),
  })
  .refine((body) => body.exercises.length > 0 || (body.duration_min ?? null) !== null, {
    message: 'Say how long the session took, or what was in it',
    path: ['duration_min'],
  });
export type WorkoutRequest = z.infer<typeof WorkoutRequest>;

/**
 * The last session of a given kind, shaped for the card to open with.
 *
 * The second push day of someone's life is the first one with five kilos on it,
 * and retyping eleven exercises to say so is the friction that stops people
 * keeping a log at all. So the card offers the last one back and asks them to
 * correct it, which is a different and much smaller job than remembering it.
 *
 * Carries `tracks` and `emoji` per exercise so the card can draw the right
 * fields without a second round trip to the catalogue.
 */
export const LastWorkout = z.object({
  entry_id: z.string().uuid(),
  local_date: z.string(),
  duration_min: z.number().nullable(),
  category: ExerciseCategory,
  exercises: z.array(
    z.object({
      name: z.string(),
      type_id: z.string().uuid().nullable(),
      tracks: ExerciseTracks,
      emoji: z.string(),
      sets: z.array(
        z.object({
          reps: z.number().int().nullable(),
          weight_kg: z.number().nullable(),
          duration_sec: z.number().int().nullable(),
          distance_m: z.number().int().nullable(),
        }),
      ),
    }),
  ),
});
export type LastWorkout = z.infer<typeof LastWorkout>;

// ---- Routines ---------------------------------------------------------------

/** The numbers of one set, however it happens to be measured. */
export const SetValues = z.object({
  reps: z.number().int().nullable(),
  weight_kg: z.number().nullable(),
  duration_sec: z.number().int().nullable(),
  distance_m: z.number().int().nullable(),
});
export type SetValues = z.infer<typeof SetValues>;

/**
 * One exercise in a saved routine, with what happened last time it was done.
 *
 * `previous` is the whole reason a routine can stay a list of names: the load
 * to put in front of somebody is the one they used last time, which the sets
 * table already knows and the routine would only get wrong. It is empty the
 * first time — a routine can name an exercise they have never performed.
 */
export const RoutineExercise = z.object({
  name: z.string(),
  type_id: z.string().uuid().nullable(),
  tracks: ExerciseTracks,
  emoji: z.string(),
  muscles: z.array(MuscleGroup).default([]),
  /** How many sets the plan calls for. The load is not part of the plan. */
  target_sets: z.number().int().nullable(),
  previous: z.array(SetValues).default([]),
});
export type RoutineExercise = z.infer<typeof RoutineExercise>;

/**
 * A workout somebody does often enough to have named.
 *
 * The picker on the card is a list of these, and tapping one fills the grid in
 * completely — which is the difference between logging a session in one tap and
 * abandoning the card, and the entire point of the feature.
 */
export const Routine = z.object({
  id: z.string().uuid(),
  name: z.string(),
  emoji: z.string(),
  category: ExerciseCategory,
  last_used_at: z.string().nullable(),
  /** How many times it has been done. Nothing is claimed from one session. */
  times_done: z.number().int(),
  /**
   * The weekday it usually falls on, 0 = Sunday, or null when there is no habit
   * to speak of yet. This is "Monday is chest day" *observed* — read out of the
   * history, because nobody sets that up and everybody has one.
   */
  usual_weekday: z.number().int().min(0).max(6).nullable(),
  /**
   * The days they have said this routine belongs on. Several, because push/pull/
   * legs runs twice through a six-day week and Push is Monday *and* Thursday.
   * Empty when they have never filled the schedule in, which is the normal case.
   */
  scheduled_weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  /**
   * How long the session runs, for a routine that is a kind and a length rather
   * than a list — "my 45 minute swim". Null whenever the exercises define it,
   * which is every routine with a grid behind it: their length is however long
   * those sets take, and a number here would only go stale against them.
   */
  duration_min: z.number().int().nullable().default(null),
  exercises: z.array(RoutineExercise).default([]),
});
export type Routine = z.infer<typeof Routine>;

/**
 * How completely a session and a routine are the same workout.
 *
 * The problem this solves: somebody with a "Push" routine does their push day
 * and logs it by typing it out, or by tapping exercises rather than the routine
 * chip. Nothing links the two, so the session is called "Bench press and 4
 * more", the weekday habit never builds, and the app keeps offering to save a
 * routine they already have. Matching on the exercises themselves is what makes
 * "Monday is push day" readable however the session got logged.
 *
 * The score is the harmonic mean of two coverages — how much of the routine the
 * session did, and how much of the session the routine explains — because
 * either alone is easy to fool. A leg day shares one exercise with a five-move
 * push routine and would score 1.0 on routine coverage if only the intersection
 * mattered; a two-exercise session that is a strict subset of a big routine
 * would score 1.0 the other way.
 */
export function routineOverlap(sessionTypeIds: string[], routineTypeIds: string[]): number {
  const session = new Set(sessionTypeIds.filter(Boolean));
  const routine = new Set(routineTypeIds.filter(Boolean));
  if (session.size === 0 || routine.size === 0) return 0;

  let shared = 0;
  for (const id of session) if (routine.has(id)) shared += 1;
  // One exercise in common is a coincidence — squats appear in half of all
  // routines — so it is never a match however small the two sets are.
  if (shared < 2) return 0;

  const ofRoutine = shared / routine.size;
  const ofSession = shared / session.size;
  return (2 * ofRoutine * ofSession) / (ofRoutine + ofSession);
}

/**
 * Enough alike to put the routine's name on the session and count it toward
 * that routine's habit. Set high: a wrong link mislabels a workout and teaches
 * the app the wrong day, and the cost of missing one is only that the session
 * keeps its own name.
 */
export const ROUTINE_MATCH_CERTAIN = 0.75;

/** Enough alike to stop offering to save what is plainly already saved. */
export const ROUTINE_MATCH_LIKELY = 0.55;

/** The routine a session most resembles, or null when none is close enough. */
/**
 * One day of the training week, and where the app's opinion about it came from.
 *
 * `declared` is what they said; `learned` is what the history says; null is a
 * day with neither. Keeping the source rather than flattening to a routine id
 * is what lets the app be honest on screen — "you set this" and "you've done
 * this three Mondays running" deserve to read differently, and only one of them
 * should be silently overwritten when the habit changes.
 */
export const ScheduledDay = z.object({
  weekday: z.number().int().min(0).max(6),
  routine_id: z.string().uuid().nullable(),
  routine_name: z.string().nullable(),
  routine_emoji: z.string().nullable(),
  source: z.enum(['declared', 'learned']).nullable(),
});
export type ScheduledDay = z.infer<typeof ScheduledDay>;

/** Sunday first, seven entries, always — a week with holes is still a week. */
export const WeekSchedule = z.array(ScheduledDay).length(7);
export type WeekSchedule = z.infer<typeof WeekSchedule>;

/**
 * Setting the week. A day mapped to null is cleared back to whatever the
 * history infers, which is why this is not simply a delete.
 */
export const SaveScheduleRequest = z.object({
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        routine_id: z.string().uuid().nullable(),
      }),
    )
    .max(7),
});
export type SaveScheduleRequest = z.infer<typeof SaveScheduleRequest>;

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Monday-first ordering for display, since almost nobody plans a week from Sunday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function matchRoutine<T extends { exercises: { type_id: string | null }[] }>(
  sessionTypeIds: string[],
  routines: T[],
  threshold: number = ROUTINE_MATCH_CERTAIN,
): { routine: T; score: number } | null {
  let best: { routine: T; score: number } | null = null;
  for (const routine of routines) {
    const ids = routine.exercises
      .map((e) => e.type_id)
      .filter((id): id is string => id !== null);
    const score = routineOverlap(sessionTypeIds, ids);
    if (score >= threshold && (best === null || score > best.score)) {
      best = { routine, score };
    }
  }
  return best;
}

/**
 * Saving one.
 *
 * Two ways in, and the first is the one that matters: `from_entry_id` points at
 * a session they have just logged, and the server reads the exercise list off
 * it. That is a single tap at the only moment somebody has both the list and
 * their phone in hand. Naming the exercises explicitly is the other way, for
 * the agent building one from a sentence.
 */
export const SaveRoutineRequest = z
  .object({
    name: z.string().min(1).max(60),
    emoji: z.string().max(8).optional(),
    category: ExerciseCategory.optional(),
    from_entry_id: z.string().uuid().optional(),
    /**
     * The length of a routine with no exercises in it. Ignored when the
     * exercises are known, whether they were sent or read off a session: the
     * grid already says how long the workout is.
     */
    duration_min: z.number().int().min(1).max(1440).nullable().optional(),
    exercises: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          type_id: z.string().uuid().nullable().optional(),
          target_sets: z.number().int().min(1).max(30).nullable().optional(),
        }),
      )
      .max(20)
      .optional(),
  })
  .refine(
    (body) =>
      body.from_entry_id !== undefined ||
      (body.exercises?.length ?? 0) > 0 ||
      body.duration_min != null,
    {
      message: 'Say which session to save, or what is in it',
      path: ['exercises'],
    },
  );
export type SaveRoutineRequest = z.infer<typeof SaveRoutineRequest>;

export const WeightEntry = z.object({
  id: z.string().uuid(),
  measured_at: z.string(),
  local_date: z.string(),
  weight_kg: z.number(),
});
export type WeightEntry = z.infer<typeof WeightEntry>;

/** Which pass produced a target row: the profile formula, the weekly adaptive
 * pass, or the user typing a number. */
export const TARGET_SOURCES = ['calculated', 'adaptive', 'manual'] as const;
export const TargetSource = z.enum(TARGET_SOURCES);
export type TargetSource = z.infer<typeof TargetSource>;

export const Targets = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  /** True once the user has overridden the calculated values. */
  is_custom: z.boolean(),
  source: TargetSource.default('calculated'),
});
export type Targets = z.infer<typeof Targets>;

/**
 * Which way a quality target points.
 *
 * Stated rather than left implicit, because the four are not all the same kind
 * of number and a screen that treats them alike is actively misleading: more
 * fiber is better and more sodium is not. Nothing should ever throw confetti
 * for reaching a sodium target the way `MacroBars` does for protein.
 */
export const QUALITY_DIRECTIONS = ['floor', 'ceiling'] as const;
export const QualityDirection = z.enum(QUALITY_DIRECTIONS);
export type QualityDirection = z.infer<typeof QualityDirection>;

export const QualityTarget = z.object({
  value: z.number(),
  direction: QualityDirection,
});
export type QualityTarget = z.infer<typeof QualityTarget>;

/**
 * Derived from the calorie target rather than stored against the user. There is
 * nothing personal in them to version — they are the same function of the same
 * number for everybody — so a `targets` row would only be a copy that could go
 * stale the day the arithmetic changed.
 */
export const QualityTargets = z.object({
  fiber_g: QualityTarget,
  sodium_mg: QualityTarget,
  sat_fat_g: QualityTarget,
  sugar_g: QualityTarget,
});
export type QualityTargets = z.infer<typeof QualityTargets>;

/**
 * A day's diet quality, and how much of the day it actually speaks for.
 *
 * `coverage` is the share of the day's calories that came from items carrying
 * the figures. It travels with the sums rather than being worked out by each
 * screen, because a total without it is a lie by omission: 12g of fiber across
 * a day where only breakfast was ever estimated is not a 12g day, and no amount
 * of care in the UI can recover that once the number has been handed over bare.
 *
 * Below roughly 0.6 the honest thing to print is "partly measured", not a
 * total — the same posture as weighting an adaptive target by how much data
 * stands behind it.
 */
/**
 * Below this, a day's quality figures are a fragment rather than a total, and
 * every surface says "partly measured" instead of printing a number.
 *
 * 0.6 is a judgement, not a derivation: roughly "two of the three meals are
 * accounted for", which is where a fiber total starts being worth reading. Here
 * rather than in the API so the web, the agent and the nudge triggers cannot
 * each quietly pick their own threshold.
 */
export const QUALITY_COVERAGE_FLOOR = 0.6;

export const DayQuality = z.object({
  /** Null where nothing logged that day carried the figure at all. */
  ...DietQuality.shape,
  /** 0-1. */
  coverage: z.number(),
  targets: QualityTargets,
});
export type DayQuality = z.infer<typeof DayQuality>;

/**
 * §9: food and exercise are reported separately. `net` is derived for callers that
 * want it, but the UI leads with food vs target.
 */
export const DaySummary = z.object({
  local_date: z.string(),
  consumed: Nutrition,
  quality: DayQuality,
  burned_kcal: z.number(),
  net_kcal: z.number(),
  targets: Targets,
  food_entries: z.array(FoodEntry),
  exercise_entries: z.array(ExerciseEntry),
  weight: WeightEntry.nullable(),
});
export type DaySummary = z.infer<typeof DaySummary>;

export const Profile = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  /**
   * Whether the address has been proved. Nothing is gated on it — the app works
   * either way — but a password reset can only ever reach a mailbox someone can
   * actually open, so the setup screen offers to send the link again.
   */
  email_verified: z.boolean(),
  display_name: z.string().nullable(),
  sex: Sex.nullable(),
  birth_date: z.string().nullable(),
  height_cm: z.number().nullable(),
  target_weight_kg: z.number().nullable(),
  activity_level: ActivityLevel.nullable(),
  goal: Goal.nullable(),
  timezone: z.string(),
  /**
   * Which units they read. Null means onboarding has not asked yet, which is
   * not the same as metric — it is what lets the journal ask once and never
   * again. Everything that renders a number goes through `unitsOf()`, which
   * resolves null to metric, so null is a special case only here and in the
   * onboarding brief. Nothing about the stored data changes with it: see
   * UNITS.md.
   */
  units: UnitSystem.nullable(),
  /** §"Day boundaries": 4 means 1am counts toward the previous day. */
  day_start_hour: z.number().int().min(0).max(12),
  is_setup_complete: z.boolean(),
  /** Read-only here — a plan changes by paying, never by PATCHing a profile. */
  plan: PlanName,
  /**
   * What the kitchen must never suggest. Held on the profile rather than as a
   * standing note because it is true of every meal this person will ever eat,
   * and a fact that permanent should not depend on having mentioned it in a
   * chat once.
   */
  diet: Diet,
  avoids: z.array(z.string()),
  /**
   * Monday's review, in the inbox. The only notification this server sends that
   * is a matter of taste — everything else is about the account itself and is
   * not something to have an opinion about receiving.
   */
  notify_weekly_review: z.boolean(),
  /**
   * Opt-in, unlike the review above, because a nudge arrives unprompted. It
   * governs the email only — the in-app message is always written, since a
   * message waiting in the journal is not an interruption.
   */
  notify_nudges: z.boolean(),
});
export type Profile = z.infer<typeof Profile>;

export const ProfileUpdate = Profile.omit({
  id: true,
  email: true,
  // Proved by clicking a link, never by asking to be believed.
  email_verified: true,
  is_setup_complete: true,
  // Granted by a payment, never by the client claiming it.
  plan: true,
}).partial();
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;

// ---- Accounts --------------------------------------------------------------

export const Credentials = z.object({
  email: z.string().email().max(254),
  // Long enough to matter, short enough that scrypt stays fast.
  password: z.string().min(8).max(200),
});
export type Credentials = z.infer<typeof Credentials>;

export const SignupRequest = Credentials.extend({
  display_name: z.string().max(80).nullable().optional(),
  /** Sent by the browser so the very first day boundary is already correct. */
  timezone: z.string().max(60).optional(),
});
export type SignupRequest = z.infer<typeof SignupRequest>;

/**
 * The last step of signing into the native app with Google: a one-time code
 * that came back through the app's own URL scheme, and the verifier it is
 * bound to.
 *
 * Both are 256-bit values in base64url, and the length floor is the point of
 * the schema rather than a formality — it is the one place the shape of these
 * two secrets is stated, and a short one is a client that has generated
 * something weaker than the flow assumes.
 */
export const GoogleExchange = z.object({
  code: z.string().min(32).max(200),
  verifier: z.string().min(32).max(200),
});
export type GoogleExchange = z.infer<typeof GoogleExchange>;

/**
 * Sent as `x-session-transport: bearer` by a client that holds its own session
 * token rather than relying on the cookie — which in practice means the native
 * app, since a phone has no cookie jar worth trusting a 60-day session to.
 *
 * It is opt-in rather than the default because the browser must never receive
 * the raw token. The session cookie is httpOnly precisely so that script on the
 * page cannot read it, and returning the same value in a JSON body would hand
 * an XSS the session it was written to protect.
 */
export const SESSION_TRANSPORT_HEADER = 'x-session-transport';

export const AuthStatus = z.object({
  authenticated: z.boolean(),
  profile: Profile.nullable(),
  /** False once the deployment has been locked down to its existing accounts. */
  signup_allowed: z.boolean(),
  /** False on a brand-new server, so the form can open on "create account". */
  has_accounts: z.boolean(),
  /** Whether this account may open /admin. Decided by ADMIN_EMAILS on the API. */
  is_admin: z.boolean(),
  /**
   * Whether this deployment has a Google client configured. The sign-in screen
   * asks before it offers the button: a self-hosted install that has not set
   * one up should show an email form and nothing else, rather than a second
   * option that fails the moment it is pressed.
   */
  google_enabled: z.boolean(),
  /**
   * The raw session token, returned by signup and login only to a client that
   * asked for it with SESSION_TRANSPORT_HEADER. Absent everywhere else — the
   * browser's copy stays in the httpOnly cookie and is never readable here.
   */
  token: z.string().optional(),
});
export type AuthStatus = z.infer<typeof AuthStatus>;

/**
 * Closing your own account. The password is asked for again rather than taken
 * from the session, because the session is exactly what an unlocked phone or a
 * lifted token already has, and this is the one request in the product where
 * that should not be enough.
 */
export const DeleteAccountRequest = z.object({
  password: z.string().min(1).max(200),
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequest>;

/**
 * Asking for a reset link.
 *
 * The response is the same whether or not the address has an account, which is
 * why this schema is so thin: anything richer would be a way to ask the server
 * who has registered.
 */
export const PasswordResetRequest = z.object({
  email: z.string().email().max(254),
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>;

/** Spending the link. The token is the proof, so no session is involved. */
export const PasswordReset = z.object({
  token: z.string().min(1).max(400),
  password: z.string().min(8).max(200),
});
export type PasswordReset = z.infer<typeof PasswordReset>;

/**
 * Proving an address — by the code, or by the link.
 *
 * Two ways into the same token row, and exactly one of them per request. The
 * code is for reading mail on a phone while signed in on a laptop; the link is
 * for the reverse. Spending either spends both.
 */
export const EmailVerification = z.union([
  z.object({ code: z.string().regex(/^\s*\d{6}\s*$/, 'Enter the six digits from the email.') }),
  z.object({ token: z.string().min(1).max(400) }),
]);
export type EmailVerification = z.infer<typeof EmailVerification>;

/**
 * What a 403 says when the session is fine but the address is not proved.
 *
 * A string the client matches on, rather than a status code it has to guess at:
 * an unverified account must be sent to the confirmation screen, not signed out
 * and dropped at the login form, and only a distinguishable error tells it which
 * of the two a 403 means.
 */
export const EMAIL_UNVERIFIED = 'email_unverified';

/**
 * What an endpoint that must not reveal anything says. Both password reset and
 * "send me another confirmation link" answer with this and nothing else — the
 * message is written for someone who is looking at the screen, and says the
 * same thing to someone probing for registered addresses.
 */
export const Acknowledged = z.object({
  ok: z.literal(true),
  message: z.string(),
});
export type Acknowledged = z.infer<typeof Acknowledged>;

/** What was destroyed, so the confirmation can say it rather than imply it. */
export const AccountDeletion = z.object({
  food_entries: z.number(),
  chat_messages: z.number(),
  photos: z.number(),
});
export type AccountDeletion = z.infer<typeof AccountDeletion>;

/**
 * What onboarding still needs before targets mean anything. The journal uses
 * this to decide whether to open in setup mode.
 */
export const OnboardingState = z.object({
  complete: z.boolean(),
  missing: z.array(z.string()),
});
export type OnboardingState = z.infer<typeof OnboardingState>;

// ---- Kitchen ---------------------------------------------------------------

/**
 * The kitchen: what you have, and what you could cook with it.
 *
 * The premise is the intersection nothing else can reach — a recipe site knows
 * good recipes, but it does not know that there is chicken in your fridge, that
 * you have 74g of protein left today, and that you cook the same eight things.
 */

/**
 * One thing in the kitchen.
 *
 * `last_seen_at` is carried all the way to the client rather than being cleaned
 * up on the server, because the screen has to be able to say "three weeks ago"
 * out loud. A pantry that presents stale items as current is worse than no
 * pantry: it builds a meal on an ingredient that was thrown out.
 */
export const PantryItem = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** The amount in the user's own words. Never a tracked count. */
  quantity_desc: z.string().nullable(),
  /** Assumed always present, and exempt from ageing. */
  is_staple: z.boolean(),
  last_seen_at: z.string(),
  source: z.enum(['typed', 'photo']),
});
export type PantryItem = z.infer<typeof PantryItem>;

/** Adding or refreshing an item. Matching is on the name, case-insensitively. */
export const PantryItemInput = z.object({
  name: z.string().min(1).max(80),
  quantity_desc: z.string().max(120).nullable().optional(),
  is_staple: z.boolean().optional(),
  source: z.enum(['typed', 'photo']).optional(),
});
export type PantryItemInput = z.infer<typeof PantryItemInput>;

export const PantryAddRequest = z.object({
  items: z.array(PantryItemInput).min(1).max(60),
});
export type PantryAddRequest = z.infer<typeof PantryAddRequest>;

export const PantryUpdate = z.object({
  name: z.string().min(1).max(80).optional(),
  quantity_desc: z.string().max(120).nullable().optional(),
  is_staple: z.boolean().optional(),
  /** Bump `last_seen_at` to now — "yes, still there". */
  seen: z.boolean().optional(),
});
export type PantryUpdate = z.infer<typeof PantryUpdate>;

/**
 * What the model thinks it saw in a fridge photo.
 *
 * Deliberately not a `PantryItem`: nothing is written until the user says so.
 * A photo shows the front row of one shelf, and the difference between "the
 * model read this" and "the user owns this" is the whole reason the scan
 * proposes instead of saving.
 */
export const PantryFind = z.object({
  name: z.string(),
  quantity_desc: z.string().nullable(),
  /** How sure the model is it identified this correctly. */
  confidence: Confidence,
});
export type PantryFind = z.infer<typeof PantryFind>;

export const PantryScanProposal = z.object({
  found: z.array(PantryFind),
  /** One line on what the photo showed, including what it could not make out. */
  note: z.string().nullable(),
  /** Names already in the pantry, so the screen can show what is merely a refresh. */
  already_known: z.array(z.string()),
});
export type PantryScanProposal = z.infer<typeof PantryScanProposal>;

/**
 * An ingredient with its macros already settled.
 *
 * The same shape as a logged `FoodItem` minus its database identity, which is
 * what makes "I cooked this" a single hand-off: the array goes straight into a
 * food entry with nothing re-estimated on the way.
 */
export const RecipeIngredient = z.object({
  name: z.string(),
  quantity_g: z.number().nullable(),
  quantity_desc: z.string().nullable(),
  /** True when this is not in the pantry and has to be bought. */
  missing: z.boolean().default(false),
  ...Nutrition.shape,
  ...DietQuality.shape,
});
export type RecipeIngredient = z.infer<typeof RecipeIngredient>;

/** Where a generated recipe came from, which is how much to trust its numbers. */
export const RECIPE_ORIGINS = ['invented', 'adapted', 'imported'] as const;
export const RecipeOrigin = z.enum(RECIPE_ORIGINS);
export type RecipeOrigin = z.infer<typeof RecipeOrigin>;

/** The budget a recipe was written against, so it can explain itself later. */
export const RecipeContext = z.object({
  local_date: z.string(),
  kcal_remaining: z.number(),
  protein_remaining: z.number(),
});
export type RecipeContext = z.infer<typeof RecipeContext>;

export const Recipe = z.object({
  id: z.string().uuid(),
  title: z.string(),
  /** One line on why this, right now. */
  summary: z.string().nullable(),
  portions: z.number().int(),
  minutes: z.number().int().nullable(),
  steps: z.array(z.string()),
  ingredients: z.array(RecipeIngredient),
  /** Per portion — the figure the card prints, and what cooking one logs. */
  ...Nutrition.shape,
  ...DietQuality.shape,
  confidence: Confidence,
  generated_for: RecipeContext.nullable(),
  origin: RecipeOrigin,
  /** The library recipe an adaptation started from, if it was one. */
  adapted_from: z.string().nullable(),
  saved: z.boolean(),
  cooked_at: z.string().nullable(),
  created_at: z.string(),
});
export type Recipe = z.infer<typeof Recipe>;

/**
 * What you need from the kitchen this time.
 *
 * The persistent half of "fit me" lives on the profile — `diet` and `avoids`
 * are true of every meal. This is the half that changes: how long you have
 * tonight, what you are trying to hit, how many portions you want to end up
 * with. All of it optional, because the useful default is still "just tell me
 * what I could cook".
 */
export const RecipeBrief = z.object({
  /**
   * Anything not covered by a field — "something one-pan", "use up the
   * spinach". Free text, because the interesting constraints never were an
   * enum anyone could write.
   */
  wants: z.string().max(300).optional(),
  /** Which meal it is for. Null infers from the time of day. */
  meal: Meal.nullable().optional(),
  /** Minutes available, start to plate. */
  minutes: z.number().int().min(5).max(240).nullable().optional(),
  /**
   * How many servings to cook. More than one is batch prep: the ingredient
   * quantities scale and the macros stay per portion, so cooking four and
   * eating one logs the same figure it always did.
   */
  portions: z.number().int().min(1).max(12).nullable().optional(),
  /** A floor on protein per portion, for a day that needs it. */
  protein_min: z.number().min(0).max(300).nullable().optional(),
  /**
   * A ceiling on calories per portion. Overrides the day's remaining budget,
   * which is otherwise what the kitchen aims at.
   */
  kcal_max: z.number().min(50).max(3000).nullable().optional(),
  /**
   * Ingredients to build the dish *around*, rather than merely permit.
   *
   * The pantry is the whole shelf and the model weighs all of it evenly. This
   * is the handful that prompted the ask — what a photo just found, what is
   * about to turn — and it is the difference between "you have spinach" and
   * "this is a spinach dish".
   *
   * Kept apart from `wants` because that field is the user's own words and
   * this is not. Writing "use the spinach and the feta" into a box the screen
   * echoes back would put a sentence in their mouth they never typed.
   */
  focus: z.array(z.string().min(1).max(60)).max(20).nullable().optional(),
});
export type RecipeBrief = z.infer<typeof RecipeBrief>;

/**
 * What is left of the recipe budget today.
 *
 * Sent with every list and every run so the screen can say the number before
 * the button is pressed rather than after. `resets_at` is only set once the
 * budget is spent — the window is a rolling twenty-four hours, so what matters
 * is when the oldest run ages out, not midnight.
 */
export const RecipeAllowance = z.object({
  allowed: z.number().int(),
  used: z.number().int(),
  resets_at: z.string().nullable(),
});
export type RecipeAllowance = z.infer<typeof RecipeAllowance>;

/** The original ask: invent something from the kitchen. */
export const RecipeSuggestRequest = RecipeBrief;
export type RecipeSuggestRequest = z.infer<typeof RecipeSuggestRequest>;

/**
 * Bring your own recipe and have it priced.
 *
 * Text rather than a URL, deliberately. Someone pasting the thing they already
 * cook is using their own recipe; a server that fetched and stored arbitrary
 * pages would be doing something else entirely.
 */
export const RecipeImportRequest = RecipeBrief.extend({
  text: z.string().min(20).max(6000),
});
export type RecipeImportRequest = z.infer<typeof RecipeImportRequest>;


/** Logging a recipe as eaten. Portions defaults to one — the card's figure. */
export const CookRequest = z.object({
  portions: z.number().positive().max(20).optional(),
  meal: Meal.optional(),
  eaten_at: z.string().optional(),
});
export type CookRequest = z.infer<typeof CookRequest>;

// ---- Barcode ---------------------------------------------------------------

/** Which catalogue answered. Shown on the card, because ODbL requires it. */
export const BARCODE_SOURCES = ['off', 'fdc'] as const;
export const BarcodeSource = z.enum(BARCODE_SOURCES);
export type BarcodeSource = z.infer<typeof BarcodeSource>;

/**
 * A product as the packet describes it — never as a meal.
 *
 * Everything here is per 100g, whichever catalogue answered, because that is
 * the only basis every label agrees on. The portion is not in this shape and
 * deliberately so: a lookup says what the food is, a person says how much of it
 * they ate, and folding the two together is how a scanner logs a whole 500g jar
 * of peanut butter as one snack.
 */
export const BarcodeProduct = z.object({
  /** Normalised to GTIN-13, so the code echoed back may not be the one sent. */
  barcode: z.string(),
  brand: z.string().nullable(),
  name: z.string(),
  kcal_100g: z.number(),
  protein_100g: z.number(),
  carbs_100g: z.number(),
  fat_100g: z.number(),
  /**
   * What the label calls one serving. Null when it does not say, which is
   * common and is not a failure — it decides only whether the portion picker
   * can offer "1 serving" or has to open on 100g.
   */
  serving_g: z.number().nullable(),
  serving_desc: z.string().nullable(),
  source: BarcodeSource,
  source_url: z.string().nullable(),
});
export type BarcodeProduct = z.infer<typeof BarcodeProduct>;

/**
 * Logging a scanned product. Grams or servings, one or the other.
 *
 * Servings is not sugar for grams. It is what the user picked, and the card
 * offering "2 servings" against a label that says nothing about servings is a
 * different bug from one that multiplies wrongly — so the two arrive named,
 * and the route refuses servings on a product with no `serving_g`.
 */
export const BarcodeLogRequest = z
  .object({
    grams: z.number().positive().max(5000).optional(),
    servings: z.number().positive().max(50).optional(),
    meal: Meal.optional(),
    eaten_at: z.string().optional(),
  })
  .refine((body) => (body.grams === undefined) !== (body.servings === undefined), {
    message: 'Say either grams or servings',
  });
export type BarcodeLogRequest = z.infer<typeof BarcodeLogRequest>;

/** Declared here rather than with Progress: the chat cards below build on it. */
export const TrendPoint = z.object({
  local_date: z.string(),
  value: z.number().nullable(),
  /** 7-day rolling mean; the number §12 says to lead with. */
  average: z.number().nullable(),
});
export type TrendPoint = z.infer<typeof TrendPoint>;

export const ChatRole = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRole>;

/**
 * The visual half of a turn.
 *
 * Every number a card displays is put there by the server from the database —
 * the model chooses *what* to show and never *what it says*. A model that could
 * fill in the points of its own chart could draw a weight loss that did not
 * happen, and a chart is believed far more readily than a sentence.
 */
export const ChatCard = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('food'),
    entry_id: z.string().uuid(),
    meal: Meal,
    description: z.string(),
    confidence: Confidence,
    items: z.array(z.object({ name: z.string(), quantity: z.string().nullable() })),
    ...Nutrition.shape,
    /**
     * Where the meal left the day — the half of the card people actually read.
     *
     * A meal's calories mean nothing on their own: 640 is most of a day or a
     * quarter of one depending on whose day it is, and asking someone to work
     * that out by subtracting one figure from another is asking them to do
     * arithmetic to find out how they are doing. Carrying the day's before and
     * after lets the card draw it instead, with this meal as its own band.
     *
     * `kcal_before` is the day *without* this entry rather than the day as it
     * stood at some earlier moment, so a correction redraws honestly: the band
     * is always what this entry is currently worth, not what it first cost.
     *
     * Nullable because it is younger than the cards already on disk, and an
     * older row is a card without a bar rather than a card that fails to parse.
     */
    day: z
      .object({
        local_date: z.string(),
        kcal_before: z.number(),
        kcal_after: z.number(),
        target_kcal: z.number(),
      })
      .nullable()
      .default(null),
  }),
  z.object({
    type: z.literal('exercise'),
    entry_id: z.string().uuid(),
    description: z.string(),
    confidence: Confidence,
    kcal_burned: z.number(),
    duration_min: z.number().nullable(),
    distance_km: z.number().nullable(),
    category: ExerciseCategory.nullable().default(null),
    /** The sets, when there were any. A strength card is a table, not a total. */
    sets: z.array(ExerciseSet).default([]),
  }),
  z.object({
    type: z.literal('weight'),
    weight_kg: z.number(),
    change_7d_kg: z.number().nullable(),
    series: z.array(TrendPoint),
    /**
     * The day this weigh-in is filed under, so the card can be corrected.
     *
     * A weight row is keyed by `(user_id, local_date)` rather than by an
     * instant, and that date is the user's — their timezone, their
     * `day_start_hour`. Without it on the card, an edit would have to invent a
     * timestamp and hope the server derived the same date back from it, which
     * is exactly the arithmetic that puts a correction on the wrong day.
     *
     * Nullable because it is younger than the cards already on disk. An older
     * row is a card that cannot be edited rather than one that fails to parse.
     */
    local_date: z.string().nullable().default(null),
  }),
  /** Requested by the model via `show_chart`; the series is read from Postgres. */
  z.object({
    type: z.literal('trend'),
    metric: z.enum(['calories', 'protein', 'weight', 'exercise']),
    title: z.string(),
    caption: z.string().nullable(),
    unit: z.string(),
    /** Reference line — the target for the metric, where it has one. */
    target: z.number().nullable(),
    average: z.number().nullable(),
    series: z.array(TrendPoint),
  }),
  /**
   * Recipes the model asked the kitchen for, mid-conversation.
   *
   * The whole `Recipe` rather than a summary, because the card in the journal
   * is the same card as on the Cook tab — servings stepper, cook button and
   * all. Answering "what can I make tonight?" with a teaser that sends someone
   * to another screen to act on it would be a worse answer than the sentence.
   */
  z.object({
    type: z.literal('recipes'),
    recipes: z.array(Recipe),
  }),
  /**
   * The one card that asks instead of reporting.
   *
   * Every other card here is a receipt — a picture of something that already
   * happened. This one is a question with the answer still missing, because
   * "went to the gym" is not a loggable fact and the three things needed to
   * make it one are things the user knows and the model would only guess at.
   *
   * Asking them in chat would be three more model calls and most of a minute.
   * The card collects the lot and posts once to `/exercise/workout`, so the
   * conversation carries the question and the arithmetic stays out of it.
   */
  z.object({
    type: z.literal('workout_prompt'),
    /** Where the agent thinks it should open, from what they already said. */
    suggested_category: ExerciseCategory.nullable(),
    /** The instant to log against, so a session mentioned late still lands right. */
    performed_at: z.string(),
    /** What the agent understood, echoed so the question does not feel blind. */
    heard: z.string().nullable(),
  }),
  /** Requested by the model via `show_day`. A day at a glance, mid-conversation. */
  z.object({
    type: z.literal('day'),
    local_date: z.string(),
    caption: z.string().nullable(),
    consumed: Nutrition,
    targets: Targets,
    burned_kcal: z.number(),
  }),
  /**
   * The week's dinners, drawn rather than recited.
   *
   * A projection of `MealPlan` rather than the plan itself: the card needs a
   * line per night and nothing else, and shipping seven whole recipes — steps,
   * ingredients, macros per ingredient — through a chat message to draw seven
   * titles would be most of a chat history's weight for none of its use. The
   * plan screen is one tap away for anyone who wants the rest.
   */
  z.object({
    type: z.literal('plan'),
    week_start: z.string(),
    nights: z.array(
      z.object({
        slot_id: z.string().uuid(),
        local_date: z.string(),
        weekday: z.string(),
        /** Null on a night with nothing planned — an ordinary state, not a gap. */
        title: z.string().nullable(),
        /** Per portion, as the plan screen shows it. Null with no recipe. */
        kcal: z.number().nullable(),
        protein_g: z.number().nullable(),
        minutes: z.number().nullable(),
        /** How many the cook makes. More than one is a batch; `covers` says which nights. */
        portions: z.number().int(),
        covers: z.array(z.string()),
        cooked: z.boolean(),
      }),
    ),
  }),
]);
export type ChatCard = z.infer<typeof ChatCard>;

/** What the model actually did this turn, so the UI can render cards instead of prose. */
export const ChatAction = z.object({
  kind: z.enum([
    'food_logged',
    'food_updated',
    'food_deleted',
    'exercise_logged',
    'weight_logged',
    'card_shown',
    'recipes_suggested',
    'workout_asked',
    'plan_made',
    'plan_shown',
  ]),
  entry_id: z.string().uuid().nullable(),
  summary: z.string(),
  /** Absent for actions with nothing to draw — a deletion is a line of text. */
  card: ChatCard.nullable().default(null),
  /**
   * The entry this card is a picture of has since been deleted.
   *
   * Written onto the stored action when the entry goes, wherever it goes from
   * — the Today tab, the exercise screen, or a later turn. The card is not
   * dropped with it: the turn did happen, and a conversation that quietly
   * loses rows is one nobody can trust. It just stops claiming the meal counts.
   *
   * Optional rather than defaulted, because an action is written twenty-odd
   * places and none of them is ever describing something already gone. Absent
   * means present.
   */
  removed: z.boolean().optional(),
});
export type ChatAction = z.infer<typeof ChatAction>;

export const ChatMessage = z.object({
  id: z.string().uuid(),
  role: ChatRole,
  content: z.string(),
  photo_id: z.string().uuid().nullable(),
  /**
   * A signed, time-limited path to the photo — join it to the client's own API
   * base and it can go straight into an `<img>` or `<Image>`.
   *
   * Minted per response rather than stored, because an image element fetches on
   * its own and cannot be given an Authorization header. Without this the photo
   * route is reachable from the browser (which attaches its cookie unbidden)
   * and from nowhere else.
   */
  photo_url: z.string().nullable().default(null),
  created_at: z.string(),
  /**
   * Stored with the message rather than returned only live, so reopening the app
   * does not silently downgrade a conversation full of cards into plain text.
   */
  actions: z.array(ChatAction).default([]),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatResponse = z.object({
  message: ChatMessage,
  /** The same array as `message.actions`, kept for callers holding the response. */
  actions: z.array(ChatAction),
  /** Always echoed back so the dashboard updates without a second round trip. */
  day: DaySummary,
  /**
   * The profile as it stands after the turn, for the same reason as `day`.
   *
   * `set_profile` is an ordinary tool: someone can say "switch me to pounds",
   * or "I'm vegetarian now", and the model will do it mid-conversation. Without
   * this the client holds a profile from page load and keeps rendering kilos at
   * somebody who just asked it not to, until they happen to reload.
   *
   * Free to include — the turn already read it.
   */
  profile: Profile,
  /**
   * What is left of the meter this turn just spent.
   *
   * Optional because it is an addition and an older client must not fail to
   * parse a reply without it — but present on every turn the current API
   * serves, and free: the gate counted this exact number a moment ago in order
   * to decide the turn was allowed at all, so this is that count plus the turn,
   * not a second query.
   *
   * It exists so the journal can warn *before* the wall instead of at it. A
   * limit that arrives as a refusal is a trap; the same limit arriving as
   * “three left” two turns earlier is a plan. Nothing else on the client can
   * know this without asking, and asking after every turn to draw a quiet line
   * of small text is not worth a round trip.
   */
  allowance: Allowance.optional(),
});
export type ChatResponse = z.infer<typeof ChatResponse>;

/**
 * What a scan leaves behind.
 *
 * The entry, because the scanner card is what asked for it — and the journal
 * message it was written into, because a scan is a log the conversation never
 * saw. The chat tool that logs a barcode already draws its card as part of a
 * turn; the scanner has no turn to draw one in, so the server writes the
 * message and hands it back here rather than making the client re-read a page
 * of history to find the one row it just caused.
 */
export const BarcodeLogResponse = z.object({
  entry: FoodEntry,
  message: ChatMessage,
});
export type BarcodeLogResponse = z.infer<typeof BarcodeLogResponse>;

/**
 * What `POST /chat/stream` sends, frame by frame.
 *
 * A turn takes twenty seconds, and twenty silent seconds read as broken. These
 * are the events that fill them — deliberately describing what the reader
 * should *see* rather than mirroring any model vendor's stream format, because
 * the two Claude lanes stream at very different granularities and neither shape
 * should reach a client.
 *
 * `text` is additive and in order. `tool` and `reset` both clear what has been
 * shown so far, for reasons worth knowing:
 *
 *   - `tool` means the model stopped talking in order to act, so the text
 *     before it was a preamble ("Let me log that") rather than the answer. The
 *     reply that gets persisted is the model's *final* message, so a client
 *     that keeps the preamble ends up showing something that jumps when the
 *     real answer arrives. Clear on this, and what was streamed matches what
 *     was stored.
 *   - `reset` means the turn restarted — a stale session, retried.
 *
 * Exactly one terminal frame ends the stream: `done` carries the same
 * `ChatResponse` that `POST /chat` would have returned, and is what a client
 * should actually render; `error` carries a failure that arrived too late to be
 * a status code.
 *
 * A plain type rather than a Zod schema, unlike everything else in this file:
 * the payload that matters is `ChatResponse`, which is already the contract,
 * and the envelope around it is produced and consumed by code in this
 * repository. There is nothing here for a schema to defend that the shape of
 * the union does not.
 */
export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'reset' }
  | { type: 'done'; response: ChatResponse }
  | { type: 'error'; error: string };

/**
 * What the API will accept as an image. Named because two routes take a photo —
 * a meal for the journal, a fridge for the kitchen — and the day they disagree
 * about which formats are allowed is a bug nobody would look for.
 */
export const PHOTO_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const PhotoMediaType = z.enum(PHOTO_MEDIA_TYPES);
export type PhotoMediaType = z.infer<typeof PhotoMediaType>;

export const ChatRequest = z.object({
  text: z.string().min(1).max(4000),
  /**
   * Data URL or base64 payload of a meal photo.
   *
   * The original way to send one, and still supported: a client with no bucket
   * to upload to — a local-disk deployment — has no alternative, and an app
   * already installed on somebody's phone goes on speaking it. `photo_key`
   * below is the way that does not put the bytes through the API at all.
   */
  photo_base64: z.string().optional(),
  /**
   * The key of an object the client already PUT to the bucket, from
   * `POST /photos/upload-url`. Checked against the caller before it is
   * believed — the owner is in the key.
   */
  photo_key: z.string().max(200).optional(),
  photo_media_type: PhotoMediaType.optional(),
  /**
   * Set by a client that tried the bucket, failed, and sent the bytes instead.
   *
   * The fallback is right for the person logging the meal — it still gets
   * logged — and wrong for whoever runs the deployment, because a bucket that
   * has quietly stopped accepting writes then looks identical to one nobody has
   * configured. This is the flag that tells them apart, and the API logs it.
   * Diagnostic only: nothing behaves differently either way.
   */
  photo_upload_failed: z.boolean().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

/** What `POST /photos/upload-url` answers with. */
export const PhotoUploadTicket = z.object({
  /** Null when the deployment stores photos on local disk: send bytes instead. */
  key: z.string().nullable(),
  url: z.string().nullable(),
  expires_in_seconds: z.number().nullable(),
});
export type PhotoUploadTicket = z.infer<typeof PhotoUploadTicket>;

export const PhotoUploadRequest = z.object({
  media_type: PhotoMediaType,
});
export type PhotoUploadRequest = z.infer<typeof PhotoUploadRequest>;

export const Progress = z.object({
  weight: z.object({
    current_kg: z.number().nullable(),
    average_7d_kg: z.number().nullable(),
    change_7d_kg: z.number().nullable(),
    change_since_start_kg: z.number().nullable(),
    to_target_kg: z.number().nullable(),
    series: z.array(TrendPoint),
  }),
  calories: z.object({
    average_kcal: z.number().nullable(),
    target_kcal: z.number(),
    series: z.array(TrendPoint),
  }),
  protein: z.object({
    average_g: z.number().nullable(),
    target_g: z.number(),
    days_target_hit: z.number(),
    days_logged: z.number(),
    series: z.array(TrendPoint),
  }),
  exercise: z.object({
    sessions: z.number(),
    total_kcal: z.number(),
    /** Per-day burn. A rest day is 0 here, not null — it is data, not a gap. */
    series: z.array(TrendPoint),
  }),
  /**
   * Diet quality over the window. Daily means rather than totals, because a
   * fortnight of fiber is not a number anybody has an intuition for.
   *
   * All four series travel, but the card still draws one line at a time —
   * whichever nutrient was asked for. Four curves at once would be a dashboard
   * nobody opens twice; four curves to choose between is a question you can
   * answer without leaving the card, and the window is already loaded.
   */
  quality: z.object({
    average: DietQuality,
    targets: QualityTargets,
    /** 0-1 across the whole window; the averages mean little when it is low. */
    coverage: z.number(),
    /** Days in the window whose panel was estimated at all. */
    days_measured: z.number(),
    /** Keyed as `average` is, so a screen can pick one by the same name. */
    series: z.object({
      fiber_g: z.array(TrendPoint),
      sodium_mg: z.array(TrendPoint),
      sat_fat_g: z.array(TrendPoint),
      sugar_g: z.array(TrendPoint),
    }),
  }),
});
export type Progress = z.infer<typeof Progress>;

// ---- Calendar --------------------------------------------------------------

/**
 * One cell of the History grid. `target_kcal` travels per day because targets
 * are effective-from rows — colouring a March day against today's target would
 * misreport every day before the last adaptive change.
 */
export const CalendarDay = z.object({
  local_date: z.string(),
  kcal: z.number(),
  protein_g: z.number(),
  target_kcal: z.number(),
  burned_kcal: z.number(),
  weight_kg: z.number().nullable(),
  /** Distinguishes a day at zero from a day nobody logged. */
  logged: z.boolean(),
});
export type CalendarDay = z.infer<typeof CalendarDay>;

export const Calendar = z.object({
  from: z.string(),
  to: z.string(),
  days: z.array(CalendarDay),
});
export type Calendar = z.infer<typeof Calendar>;

// ---- Exercise --------------------------------------------------------------

export const ExerciseSummary = z.object({
  days: z.number(),
  sessions: z.number(),
  total_kcal: z.number(),
  /** Null rather than 0 when nothing in the window covered ground. */
  total_distance_km: z.number().nullable(),
  total_duration_min: z.number().nullable(),
  active_days: z.number(),
  /** Per-day burn, so the chart can show the shape of a training week. */
  series: z.array(TrendPoint),
  entries: z.array(ExerciseEntry),
});
export type ExerciseSummary = z.infer<typeof ExerciseSummary>;

/** Rounds an estimate the way §5 asks for: useful, not falsely precise. */
export function roundEstimate(kcal: number): number {
  return kcal >= 100 ? Math.round(kcal / 10) * 10 : Math.round(kcal);
}

export function formatKcal(kcal: number, confidence: Confidence = 'medium'): string {
  const n = Math.round(kcal).toLocaleString('en-US');
  return confidence === 'high' ? `${n} kcal` : `~${n} kcal`;
}

/**
 * The amounts people actually eat a packet in.
 *
 * Half a tin, three quarters of a bar, a third of a pizza — the portions that
 * come out of someone's mouth when you ask how much they had. The portion
 * picker walks this ladder instead of stepping by a fixed half serving, so the
 * common answers are one or two taps from the default rather than unreachable:
 * nothing on a linear half-serving step can say a quarter or a third at all.
 *
 * It thins out as it climbs on purpose. The difference between ¼ and ⅓ of a
 * chocolate bar is a distinction someone can see on the wrapper; the difference
 * between 7 and 7¼ servings of anything is noise.
 */
export const SERVING_STEPS = [
  1 / 4,
  1 / 3,
  1 / 2,
  2 / 3,
  3 / 4,
  1,
  1.25,
  1.5,
  1.75,
  2,
  2.5,
  3,
  3.5,
  4,
  5,
  6,
  7,
  8,
  10,
  12,
  16,
  20,
];

/** Written the way the ladder offered it: ½ rather than 0.5, 1¾ rather than 1.8. */
const SERVING_GLYPHS: [number, string][] = [
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

/**
 * A serving count as a person would write it.
 *
 * Thirds are the reason this is not a `toFixed`. ⅓ arrives over the wire as
 * 0.3333…, and rounding that to one decimal gives "0.3 servings" — a number the
 * user never chose and cannot get back to. So the fractions are matched with a
 * tolerance and printed as themselves, and only genuinely odd amounts fall
 * through to a decimal.
 */
export function formatServings(servings: number): string {
  const whole = Math.floor(servings + 1e-6);
  const rest = servings - whole;
  const glyph = SERVING_GLYPHS.find(([value]) => Math.abs(rest - value) < 0.02)?.[1];
  if (glyph) return whole === 0 ? glyph : `${whole}${glyph}`;
  if (rest < 0.02) return String(whole);
  return String(Math.round(servings * 100) / 100);
}

// ---- Adaptive targets ------------------------------------------------------

/**
 * What the last N days of logging plus the weight trend say the user's real
 * maintenance is. Mifflin-St Jeor predicts a population; this measures a person.
 *
 * It calibrates against *logged* intake, not true intake, so a consistent
 * under-logger converges on a target that works for the way they log. That is a
 * feature: the number that matters is the one that produces the intended weight
 * trend.
 */
export const TdeeEstimate = z.object({
  /** kcal/day the data implies, before the goal delta is applied. */
  observed_tdee_kcal: z.number(),
  /** What the profile formula predicts, for comparison. */
  predicted_tdee_kcal: z.number(),
  /** Confidence-weighted mean of logged intake over the window. */
  mean_intake_kcal: z.number(),
  /** Regression slope of bodyweight over the window. Negative is loss. */
  weight_change_kg_per_week: z.number(),
  window_days: z.number(),
  days_logged: z.number(),
  weigh_ins: z.number(),
  /** 0-1. Drives how far the target is allowed to move this week. */
  quality: z.number(),
});
export type TdeeEstimate = z.infer<typeof TdeeEstimate>;

export const ADAPTIVE_BLOCKERS = [
  'not_enough_logged_days',
  'not_enough_weigh_ins',
  'weigh_in_span_too_short',
  'custom_targets',
  'estimate_out_of_range',
  'change_too_small',
  /**
   * They are already eating under the floor, so the pass will not lower the
   * target further however the arithmetic comes out. The only blocker here that
   * is about the person rather than about the quality of the data.
   */
  'intake_below_floor',
] as const;
export const AdaptiveBlocker = z.enum(ADAPTIVE_BLOCKERS);
export type AdaptiveBlocker = z.infer<typeof AdaptiveBlocker>;

/** The result of the adaptive pass, whether or not it can act. */
export const AdaptiveProposal = z.object({
  eligible: z.boolean(),
  /** Populated when `eligible` is false. */
  blocked_by: AdaptiveBlocker.nullable(),
  /** Null when there was not enough data to estimate at all. */
  estimate: TdeeEstimate.nullable(),
  current: Targets,
  /** The targets that would be written. Equal to `current` when not eligible. */
  proposed: Targets,
  /** Signed kcal difference, proposed minus current. */
  delta_kcal: z.number(),
  /** One sentence, suitable for the `reason` column and for the UI. */
  explanation: z.string(),
});
export type AdaptiveProposal = z.infer<typeof AdaptiveProposal>;

// ---- Weekly review ---------------------------------------------------------

/** The deterministic half of a review: computed in SQL, never by the model. */
export const ReviewStats = z.object({
  week_start: z.string(),
  week_end: z.string(),
  days_logged: z.number(),
  mean_kcal: z.number().nullable(),
  mean_protein_g: z.number().nullable(),
  target_kcal: z.number(),
  target_protein_g: z.number(),
  /** Days within ±10% of the calorie target. */
  days_on_target: z.number(),
  days_protein_hit: z.number(),
  /** Same fields for the week before, so the review can say "up from". */
  previous_mean_kcal: z.number().nullable(),
  previous_days_logged: z.number(),
  weight_start_kg: z.number().nullable(),
  weight_end_kg: z.number().nullable(),
  weight_change_kg: z.number().nullable(),
  exercise_sessions: z.number(),
  exercise_kcal: z.number(),
  /** Most-logged foods this week, by number of entries they appear in. */
  top_foods: z.array(z.object({ name: z.string(), times: z.number(), kcal: z.number() })),
  /** Highest and lowest calorie days, for "the weekend is where it goes". */
  highest_day: z.object({ local_date: z.string(), kcal: z.number() }).nullable(),
  lowest_day: z.object({ local_date: z.string(), kcal: z.number() }).nullable(),
  adaptive: AdaptiveProposal.nullable(),
});
export type ReviewStats = z.infer<typeof ReviewStats>;

export const WeeklyReview = z.object({
  id: z.string().uuid(),
  week_start: z.string(),
  week_end: z.string(),
  content: z.string(),
  stats: ReviewStats,
  message_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type WeeklyReview = z.infer<typeof WeeklyReview>;

// ---- Nudges ----------------------------------------------------------------

/**
 * The four things worth speaking first about.
 *
 * Every one of them is a pattern over days rather than a fact about today,
 * which is exactly why the app has to raise them — nobody notices a fortnight
 * of flat weight from inside it, and the journal only ever sees one turn.
 *
 * Deliberately short, and it should stay short. Each entry here is a licence to
 * interrupt somebody, and a list of twenty is a notification stream.
 */
export const NUDGE_KINDS = [
  /** Nothing logged for several days, after a stretch of logging regularly. */
  'dormant',
  /** Goal is to lose, a fortnight of data, and the scale has not moved. */
  'stalled',
  /** Protein under target every logged day of the week. */
  'protein_short',
  /** Fiber under its floor all week, on a week that was actually measured. */
  'quality_short',
] as const;
export const NudgeKind = z.enum(NUDGE_KINDS);
export type NudgeKind = z.infer<typeof NudgeKind>;

/**
 * The deterministic half of a nudge: which pattern fired and the numbers behind
 * it. Same split as the weekly review, for the same reason — the model decides
 * how to word it and never whether to send it.
 */
export const NudgeStats = z.object({
  kind: NudgeKind,
  /** Days since anything was logged. `dormant` only. */
  days_since_logged: z.number().nullable(),
  /** Days of the window that carried a log at all. */
  days_logged: z.number(),
  mean_kcal: z.number().nullable(),
  target_kcal: z.number(),
  mean_protein_g: z.number().nullable(),
  target_protein_g: z.number(),
  /** Signed kg per week off the weight trend. `stalled` reads this. */
  weight_change_kg_per_week: z.number().nullable(),
  /** Mean daily fiber and its floor. `quality_short` reads these. */
  mean_fiber_g: z.number().nullable(),
  target_fiber_g: z.number(),
});
export type NudgeStats = z.infer<typeof NudgeStats>;

export const Nudge = z.object({
  id: z.string().uuid(),
  kind: NudgeKind,
  local_date: z.string(),
  content: z.string(),
  message_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type Nudge = z.infer<typeof Nudge>;

// ---- The week ahead --------------------------------------------------------

/**
 * One dinner in a planned week.
 *
 * `recipe` is nullable and that is a feature rather than a loose end: a night
 * somebody is eating out is a real answer, and a plan that cannot express it
 * would have to be lied to.
 */
export const MealPlanSlot = z.object({
  id: z.string().uuid(),
  local_date: z.string(),
  /** Which day of the week it is, so a card need not compute it. */
  weekday: z.string(),
  recipe: Recipe.nullable(),
  /**
   * How many portions this cook makes. More than one is the batch — the same
   * cook filling more than one night — and `covers` below says which.
   */
  portions: z.number().int(),
  /**
   * The other dates this slot's cook is meant to cover, empty for most slots.
   * Derived from the batch rather than stored, so swapping one night cannot
   * leave another pointing at a meal that is no longer being made.
   */
  covers: z.array(z.string()),
  cooked_at: z.string().nullable(),
});
export type MealPlanSlot = z.infer<typeof MealPlanSlot>;

/** What the week was asked for. The persistent half still lives on the profile. */
export const MealPlanBrief = z.object({
  wants: z.string().max(300).optional(),
  /** The longest a single dinner may take. Caps every night, weekends included. */
  minutes: z.number().int().min(5).max(240).nullable().optional(),
  /** How many people each dinner feeds. */
  servings: z.number().int().min(1).max(8).nullable().optional(),
  /** Whether to let one cook cover more than one night. */
  batch: z.boolean().optional(),
});
export type MealPlanBrief = z.infer<typeof MealPlanBrief>;

export const MealPlan = z.object({
  id: z.string().uuid(),
  week_start: z.string(),
  brief: MealPlanBrief.nullable(),
  slots: z.array(MealPlanSlot),
  created_at: z.string(),
});
export type MealPlan = z.infer<typeof MealPlan>;

/**
 * The shopping list, derived and never stored.
 *
 * A stored list drifts out of date the moment a slot is swapped, and a shopping
 * list that is wrong in one line is a shopping list nobody trusts in any line.
 * It is cheap to recompute — the ingredients are already in the slots.
 */
export const ShoppingItem = z.object({
  name: z.string(),
  /** Summed where the quantities are weights; null where they never were. */
  quantity_g: z.number().nullable(),
  /** The amounts as each recipe wrote them, for anything not weighed. */
  quantity_descs: z.array(z.string()),
  /** Which nights need it, so a part-week shop is possible. Empty on a line
      nobody's recipe asked for — the shop is the reason, and there is no date. */
  for_dates: z.array(z.string()),
  /** True when nothing in the pantry covers it. Always true for a written line:
      putting something on the list by hand *is* the claim that it is needed. */
  missing: z.boolean(),
  /**
   * Set when a line somebody wrote themselves is part of this row.
   *
   * The one piece of state on an otherwise derived object, and the only handle
   * a client has for ticking a line off or taking it back off the list. Null on
   * a row that came purely out of the week's recipes, which is what makes those
   * rows unremovable by design: the way to settle one is to cook the night or
   * change it, not to argue with the list.
   */
  extra_id: z.string().uuid().nullable(),
  /** Ticked off. Only ever true on a row with an `extra_id`. */
  bought: z.boolean(),
});
export type ShoppingItem = z.infer<typeof ShoppingItem>;

export const ShoppingList = z.object({
  week_start: z.string(),
  items: z.array(ShoppingItem),
  /** Names dropped because the pantry already has them, so the omission is visible. */
  have_already: z.array(z.string()),
});
export type ShoppingList = z.infer<typeof ShoppingList>;

/**
 * A line on the shopping list that no recipe produced.
 *
 * Kitchen roll, nappies, the wine for Saturday. The derived list is a function
 * of the planned week and can only ever contain ingredients; this is how
 * anything else gets on it, and it is the only part of the list that is stored.
 */
export const ShoppingExtra = z.object({
  id: z.string().uuid(),
  name: z.string(),
  quantity_desc: z.string().nullable(),
  /** The Monday it was written for. Pending lines still show on later weeks. */
  week_start: z.string(),
  bought: z.boolean(),
  created_at: z.string(),
});
export type ShoppingExtra = z.infer<typeof ShoppingExtra>;

/** Writing a line. Matching is on the name, case-insensitively, as the pantry's is. */
export const ShoppingExtraInput = z.object({
  name: z.string().min(1).max(80),
  quantity_desc: z.string().max(120).nullable().optional(),
});
export type ShoppingExtraInput = z.infer<typeof ShoppingExtraInput>;

export const ShoppingExtrasRequest = z.object({
  items: z.array(ShoppingExtraInput).min(1).max(40),
  /** Any date in the week it is for. Defaults to the week being shopped for. */
  week_start: z.string().optional(),
});
export type ShoppingExtrasRequest = z.infer<typeof ShoppingExtrasRequest>;

export const ShoppingExtraUpdate = z.object({
  name: z.string().min(1).max(80).optional(),
  quantity_desc: z.string().max(120).nullable().optional(),
  /** True ticks it off, false puts it back on the list. */
  bought: z.boolean().optional(),
});
export type ShoppingExtraUpdate = z.infer<typeof ShoppingExtraUpdate>;

// ---- Repeat a meal ---------------------------------------------------------

/**
 * A meal the user has eaten before, collapsed across repeats. `times` is what
 * makes the list useful: the point is to surface the eight things someone
 * actually eats, not their last eight entries.
 */
export const MealTemplate = z.object({
  /** The most recent entry with this description — the one that gets cloned. */
  entry_id: z.string().uuid(),
  description: z.string(),
  meal: Meal,
  times: z.number(),
  last_eaten: z.string(),
  ...Nutrition.shape,
  items: z.array(z.object({
    name: z.string(),
    quantity_g: z.number().nullable(),
    quantity_desc: z.string().nullable(),
    kcal: z.number(),
  })),
});
export type MealTemplate = z.infer<typeof MealTemplate>;

export const RepeatRequest = z.object({
  /** Defaults to the meal slot inferred from the time it is being logged. */
  meal: Meal.optional(),
  /** ISO timestamp. Defaults to now. */
  eaten_at: z.string().optional(),
  /** See `LogFoodRequest.client_id` — repeat is the offline path people use. */
  client_id: z.string().uuid().optional(),
});
export type RepeatRequest = z.infer<typeof RepeatRequest>;

// ---- Logging a meal by hand ------------------------------------------------

/**
 * One item as somebody typing it can supply it.
 *
 * `FoodItem` minus the two ids the database owns. The quality panel is
 * optional here in a way it is not on the way out: a person typing a packet's
 * calories has the macros in front of them and almost never has the fiber, and
 * demanding four more numbers to log a sandwich is how a manual path goes
 * unused. Absent stays null, which is "nobody estimated this" — the same claim
 * the model makes when it cannot tell.
 */
export const FoodItemInput = z.object({
  name: z.string().min(1),
  quantity_g: z.number().nullable().default(null),
  quantity_desc: z.string().nullable().default(null),
  kcal: z.number().min(0),
  protein_g: z.number().min(0).default(0),
  carbs_g: z.number().min(0).default(0),
  fat_g: z.number().min(0).default(0),
  fiber_g: z.number().min(0).nullable().default(null),
  sodium_mg: z.number().min(0).nullable().default(null),
  sat_fat_g: z.number().min(0).nullable().default(null),
  sugar_g: z.number().min(0).nullable().default(null),
});
export type FoodItemInput = z.infer<typeof FoodItemInput>;

/**
 * A meal logged without asking the model anything.
 *
 * The door that was never cut. `source: 'manual'` has been in `ENTRY_SOURCES`
 * since `001_init` and nothing has ever written it — every create path went
 * through a tool call, a barcode lookup or a clone of something already
 * logged, all of which need a server that is reachable and thinking.
 *
 * This one needs neither, which is what makes it the floor the offline path
 * stands on. See OFFLINE.md.
 */
export const LogFoodRequest = z.object({
  meal: Meal.optional(),
  /** ISO timestamp. Defaults to now, and decides which day it counts toward. */
  eaten_at: z.string().optional(),
  description: z.string().min(1).max(200),
  note: z.string().max(2000).nullable().optional(),
  items: z.array(FoodItemInput).min(1).max(50),
  /**
   * The id the client gave this meal before it had a network to send it over.
   *
   * Sending it twice with the same key logs it once. An outbox exists to
   * resend, and the request it resends most is one the server already wrote —
   * the row committed and the reply was lost. Without a key that retry becomes
   * a second breakfast, which looks exactly like a first one.
   */
  client_id: z.string().uuid().optional(),
});
export type LogFoodRequest = z.infer<typeof LogFoodRequest>;

// ---- The recipe library ----------------------------------------------------

/**
 * A recipe somebody else wrote, shipped with the app.
 *
 * The cold start for Cook. A generated recipe needs a stocked kitchen and a
 * model call; this needs neither, so there is something real on the screen the
 * first time anyone opens the tab — and the ranking still answers the app's
 * question rather than a recipe site's, because it is ordered by what you have
 * and what is left of your day.
 *
 * Source: USDA MyPlate Kitchen, a work of the US government and therefore in
 * the public domain. `source_url` travels with every recipe so the attribution
 * is in the data and not only in a comment.
 */

/** One line of the ingredient list, as a cook reads it. */
export const LibraryIngredient = z.object({
  text: z.string(),
  note: z.string().nullable(),
});
export type LibraryIngredient = z.infer<typeof LibraryIngredient>;

export const LibraryRecipe = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  category: z.string(),
  portions: z.number().int(),
  /** What one portion is, in the source's words — "1/8 of recipe". */
  serving_size: z.string().nullable(),
  ingredients: z.array(LibraryIngredient),
  steps: z.array(z.string()),
  /**
   * Per portion, as published. Unlike a generated recipe these are measured for
   * the finished dish rather than summed from priced ingredients, so there is
   * no per-ingredient breakdown to show — and inventing one to sit beside
   * measured numbers would be worse than not having it.
   */
  ...Nutrition.shape,
  image_path: z.string().nullable(),
  source: z.string(),
  source_url: z.string().nullable(),
  rating: z.number().nullable(),
  saved: z.boolean(),
  /**
   * Why this one is being shown, resolved per request against the kitchen and
   * the day. `have` names the pantry items it would use, which is the sentence
   * the card actually wants to say.
   */
  have: z.array(z.string()),
  missing: z.number().int(),
  /** Whether one portion fits inside what is left of today. */
  fits_today: z.boolean(),
});
export type LibraryRecipe = z.infer<typeof LibraryRecipe>;

export const LibraryQuery = z.object({
  q: z.string().max(80).optional(),
  category: z.string().max(40).optional(),
  saved: z.boolean().optional(),
  limit: z.number().int().min(1).max(60).optional(),
});
export type LibraryQuery = z.infer<typeof LibraryQuery>;

// ---- Admin -----------------------------------------------------------------

/**
 * The admin panel's contract. It lives here for the same reason everything else
 * does — the panel is a client of the API like any other, and putting its types
 * anywhere else would let the two drift.
 */

export const AdminOverview = z.object({
  users: z.object({
    total: z.number(),
    onboarded: z.number(),
    disabled: z.number(),
    active_7d: z.number(),
  }),
  data: z.object({
    food_entries: z.number(),
    exercise_entries: z.number(),
    weight_entries: z.number(),
    chat_messages: z.number(),
    photos: z.number(),
    reviews: z.number(),
  }),
  storage: z.object({
    database_bytes: z.number(),
    uploads_bytes: z.number(),
    photo_count: z.number(),
  }),
  config: z.object({
    provider: z.string(),
    auth: z.string(),
    signup_allowed: z.boolean(),
    secure_cookies: z.boolean(),
    admin_source: z.enum(['env', 'first-account']),
    /** Where new meal photos are written: `local-disk`, or `bucket:<name>`. */
    photo_storage: z.string(),
    openai_rate: z.object({ input: z.number(), output: z.number() }).nullable(),
  }),
});
export type AdminOverview = z.infer<typeof AdminOverview>;

export const AdminUser = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  timezone: z.string(),
  is_setup_complete: z.boolean(),
  /** ISO timestamp when the account was suspended, or null. */
  disabled_at: z.string().nullable(),
  created_at: z.string(),
  last_seen_at: z.string().nullable(),
  food_entries: z.number(),
  chat_messages: z.number(),
  last_entry_at: z.string().nullable(),
  ai_turns: z.number(),
  ai_cost_usd: z.number(),
});
export type AdminUser = z.infer<typeof AdminUser>;

/**
 * A message somebody sent to the support address.
 *
 * Admin-only, and shaped as a record rather than a conversation: there is no
 * reply field, because replying is what a mail client is for. `user_id` is the
 * account matched at the moment it arrived — the question support is actually
 * asking is who this was when they wrote in, not who owns that address today.
 */
export const SupportEmail = z.object({
  id: z.string().uuid(),
  from_email: z.string(),
  /** The display name the sender chose. Only the address beside it is a fact. */
  from_name: z.string().nullable(),
  to_email: z.string(),
  subject: z.string().nullable(),
  text_body: z.string().nullable(),
  html_body: z.string().nullable(),
  /** Why the body is missing, when it is. The webhook carries metadata only. */
  body_error: z.string().nullable(),
  user_id: z.string().uuid().nullable(),
  user_name: z.string().nullable(),
  attachments: z.number(),
  received_at: z.string(),
  handled_at: z.string().nullable(),
});
export type SupportEmail = z.infer<typeof SupportEmail>;

export const SupportInbox = z.object({
  emails: z.array(SupportEmail),
  unhandled: z.number(),
});
export type SupportInbox = z.infer<typeof SupportInbox>;

export const TableSummary = z.object({
  name: z.string(),
  rows: z.number(),
  bytes: z.number(),
});
export type TableSummary = z.infer<typeof TableSummary>;

export const TablePage = z.object({
  table: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  /** Columns deliberately withheld — password hashes, session tokens. */
  redacted: z.array(z.string()),
});
export type TablePage = z.infer<typeof TablePage>;

/** How much to trust a cost figure. See `ai_usage.cost_source`. */
export const COST_SOURCES = ['reported', 'estimated', 'unknown'] as const;
export const CostSource = z.enum(COST_SOURCES);
export type CostSource = z.infer<typeof CostSource>;

export const CostTotals = z.object({
  turns: z.number(),
  failed_turns: z.number(),
  cost_usd: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_tokens: z.number(),
  cache_write_tokens: z.number(),
  avg_cost_usd: z.number(),
  p95_duration_ms: z.number().nullable(),
  active_users: z.number(),
});
export type CostTotals = z.infer<typeof CostTotals>;

export const CostByKind = CostTotals.extend({
  kind: z.string(),
  model: z.string(),
});
export type CostByKind = z.infer<typeof CostByKind>;

export const CostDay = z.object({
  date: z.string(),
  turns: z.number(),
  cost_usd: z.number(),
  active_users: z.number(),
});
export type CostDay = z.infer<typeof CostDay>;

export const CostByUser = z.object({
  user_id: z.string().nullable(),
  email: z.string().nullable(),
  turns: z.number(),
  cost_usd: z.number(),
  last_turn_at: z.string().nullable(),
});
export type CostByUser = z.infer<typeof CostByUser>;

/**
 * The viability numbers. `cost_per_user_month_usd` is the headline; the
 * projection is that figure multiplied out, which is only as good as the
 * window it was measured over — hence `window_days` travelling with it.
 */
export const Economics = z.object({
  window_days: z.number(),
  active_users: z.number(),
  cost_usd: z.number(),
  turns: z.number(),
  cost_per_turn_usd: z.number(),
  cost_per_user_month_usd: z.number(),
  heaviest_user_month_usd: z.number(),
  turns_per_user_day: z.number(),
  projection: z.array(z.object({ users: z.number(), monthly_usd: z.number() })),
  /** 0–1. Anything above zero means the headline is an undercount. */
  unpriced_share: z.number(),
});
export type Economics = z.infer<typeof Economics>;

export const UsageTurn = z.object({
  id: z.string().uuid(),
  user_id: z.string().nullable(),
  email: z.string().nullable(),
  occurred_at: z.string(),
  provider: z.string(),
  kind: z.string(),
  model: z.string(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_tokens: z.number(),
  cache_write_tokens: z.number(),
  cost_usd: z.number(),
  cost_source: CostSource,
  duration_ms: z.number().nullable(),
  num_turns: z.number(),
  ok: z.boolean(),
  error: z.string().nullable(),
});
export type UsageTurn = z.infer<typeof UsageTurn>;

export const CostReport = z.object({
  days: z.number(),
  totals: CostTotals,
  by_kind: z.array(CostByKind),
  by_day: z.array(CostDay),
  by_user: z.array(CostByUser),
  economics: Economics,
});
export type CostReport = z.infer<typeof CostReport>;
