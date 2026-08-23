import type {
  DayQuality,
  DaySummary,
  DietQuality,
  ExerciseEntry,
  FoodEntry,
  FoodItem,
  Meal,
  Nutrition,
  QualityTargets,
  Targets,
  WeightEntry,
} from './index.ts';

/**
 * What a day adds up to, worked out from rows rather than fetched.
 *
 * All of this used to live in `apps/api` — `dayQuality` in `services/summary`,
 * `qualityTargetsFor` in `services/targets`, the day-boundary helpers in
 * `time.ts` — which was the right home for as long as the server was the only
 * thing that ever needed to add a day up. An offline phone needs to add up a
 * day it has cached plus the meals still sitting in its outbox, and it cannot
 * ask the server to do it, because asking the server is the thing that is not
 * working.
 *
 * The alternative to moving it was writing it twice, and two implementations of
 * the same arithmetic disagree eventually. That disagreement would surface as a
 * ring that jumps the moment the network returns — and somebody who has watched
 * their calories change on sync has no reason to believe either figure again.
 * One copy, in the only package both sides can import.
 *
 * Everything here is pure. Nothing reaches for a clock it was not handed, which
 * is what makes it testable on the server and correct on a phone whose idea of
 * "now" is the only one available.
 */

// ---- Day boundaries --------------------------------------------------------

/**
 * "Today" is not a UTC day and not even a calendar day in the user's timezone —
 * it runs from `day_start_hour` to `day_start_hour`, so a 1am snack lands on
 * the evening it belongs to.
 */
export interface DayContext {
  timezone: string;
  dayStartHour: number;
}

/** The YYYY-MM-DD this instant counts toward. */
export function localDateFor(instant: Date, { timezone, dayStartHour }: DayContext): string {
  const shifted = new Date(instant.getTime() - dayStartHour * 60 * 60 * 1000);
  return formatInTimeZone(shifted, timezone);
}

/** Wall-clock parts in the user's timezone, for prompting the model. */
export function localPartsFor(instant: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday ?? '',
  };
}

export function formatInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // en-CA yields YYYY-MM-DD
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive list of dates from `start` to `end`. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** §6: pick a sensible meal rather than asking which one it was. */
export function inferMeal(instant: Date, timezone: string): Meal {
  const hour = Number(localPartsFor(instant, timezone).time.slice(0, 2));
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

// ---- Adding a day up -------------------------------------------------------

/**
 * The diet-quality panel that goes with an energy target.
 *
 * Derived, never stored: these are a deterministic function of the calorie
 * number with nothing personal in them, so keeping a row per user would only
 * create a copy that could disagree with the target it was computed from.
 *
 * Three of the four are ceilings and one is a floor, and each says so in its
 * own shape rather than leaving a screen to remember which is which. The
 * figures are the ordinary population guidance:
 *
 * - fiber   14 g per 1000 kcal, which is where every dietary guideline lands.
 * - sodium  2300 mg flat, and flat on purpose — salt intake does not scale with
 *           appetite, and scaling it would hand a bigger allowance to exactly
 *           the person eating the most processed food.
 * - sat fat under 10% of energy.
 * - sugar   under 10% of energy, counting what is added rather than what is in
 *           a piece of fruit. Nothing here can tell those apart, which is why
 *           this is the softest of the four and the prompt says so.
 */
export function qualityTargetsFor(kcal: number): QualityTargets {
  return {
    fiber_g: { value: Math.round((kcal / 1000) * 14), direction: 'floor' },
    sodium_mg: { value: 2300, direction: 'ceiling' },
    sat_fat_g: { value: Math.round((kcal * 0.1) / 9), direction: 'ceiling' },
    sugar_g: { value: Math.round((kcal * 0.1) / 4), direction: 'ceiling' },
  };
}

/** The macros of a set of entries, unrounded so callers can round once. */
export function sumNutrition(entries: Pick<FoodEntry, keyof Nutrition>[]): Nutrition {
  return entries.reduce(
    (acc, entry) => ({
      kcal: acc.kcal + entry.kcal,
      protein_g: acc.protein_g + entry.protein_g,
      carbs_g: acc.carbs_g + entry.carbs_g,
      fat_g: acc.fat_g + entry.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

/**
 * A day's quality panel, summed from the items rather than from the entries.
 *
 * Items, because coverage is a share of calories and only an item knows how
 * many of the day's calories it brought. `fiber_g` is the sentinel for the
 * whole panel: the four are estimated together or not at all — one tool call
 * fills all of them — so tracking four separate coverages would be four copies
 * of the same number and a way for them to disagree.
 */
export function dayQuality(items: FoodItem[], targetKcal: number): DayQuality {
  const measured = items.filter((item) => item.fiber_g !== null);
  const totalKcal = items.reduce((sum, item) => sum + item.kcal, 0);
  const measuredKcal = measured.reduce((sum, item) => sum + item.kcal, 0);

  // No food at all is full coverage of nothing, not a gap: an empty day should
  // not be reported as "partly measured" when there is nothing to measure.
  const coverage = totalKcal > 0 ? measuredKcal / totalKcal : 1;

  const sum = (field: keyof DietQuality): number | null => {
    const values = items
      .map((item) => item[field])
      .filter((value): value is number => value !== null);
    if (values.length === 0) return null;
    return Math.round(values.reduce((a, b) => a + b, 0));
  };

  return {
    fiber_g: sum('fiber_g'),
    sodium_mg: sum('sodium_mg'),
    sat_fat_g: sum('sat_fat_g'),
    sugar_g: sum('sugar_g'),
    coverage: Math.round(coverage * 100) / 100,
    targets: qualityTargetsFor(targetKcal),
  };
}

export interface DayParts {
  localDate: string;
  foodEntries: FoodEntry[];
  exerciseEntries: ExerciseEntry[];
  targets: Targets;
  weight: WeightEntry | null;
}

/**
 * The parts of a day, assembled.
 *
 * §9: food and exercise are reported separately. `net_kcal` is derived for
 * callers that want it, but the UI leads with food vs target.
 */
export function rollUpDay({
  localDate,
  foodEntries,
  exerciseEntries,
  targets,
  weight,
}: DayParts): DaySummary {
  const consumed = sumNutrition(foodEntries);
  const burned_kcal = exerciseEntries.reduce((sum, e) => sum + e.kcal_burned, 0);

  return {
    local_date: localDate,
    consumed: {
      kcal: Math.round(consumed.kcal),
      protein_g: Math.round(consumed.protein_g),
      carbs_g: Math.round(consumed.carbs_g),
      fat_g: Math.round(consumed.fat_g),
    },
    quality: dayQuality(
      foodEntries.flatMap((entry) => entry.items),
      targets.kcal,
    ),
    burned_kcal: Math.round(burned_kcal),
    net_kcal: Math.round(consumed.kcal - burned_kcal),
    targets,
    food_entries: foodEntries,
    exercise_entries: exerciseEntries,
    weight,
  };
}
