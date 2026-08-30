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
  Streak,
  Targets,
  TrainingWeek,
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

/**
 * When the day this instant belongs to gives way to the next one.
 *
 * Needed because some surfaces have to be told in advance. A phone screen can
 * ask what day it is every time it draws; an iOS widget cannot — it is handed a
 * timeline of entries and their dates, and WidgetKit turns the page on its own
 * while the app is not running. So the app has to say when the page turns, and
 * the answer is not midnight: this app's day runs from `day_start_hour`, and
 * the timezone may be one whose clocks move.
 *
 * Which is why this searches rather than calculates. Adding 24 hours is wrong
 * across a DST boundary — one day a year is 23 hours long and another 25 — and
 * constructing the local wall-clock time of the next boundary means reasoning
 * about an offset that changes at the very moment being reasoned about. A
 * bisection over `localDateFor` asks the only question that matters, which is
 * the same question the rest of the app asks, and cannot disagree with it.
 *
 * The window is 48 hours because a day is never longer than that under any
 * timezone rule, and the bisection settles to the minute in about eleven steps.
 */
export function nextDayStart(instant: Date, context: DayContext): Date {
  const today = localDateFor(instant, context);
  const MINUTE = 60 * 1000;
  let low = instant.getTime();
  let high = low + 48 * 60 * 60 * 1000;

  /* A clock so far adrift that two days have already passed is not something to
   * guess around; hand back the far edge and let the next draw correct it. */
  if (localDateFor(new Date(high), context) === today) return new Date(high);

  while (high - low > MINUTE) {
    const middle = low + Math.floor((high - low) / 2);
    if (localDateFor(new Date(middle), context) === today) low = middle;
    else high = middle;
  }
  return new Date(high);
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

/**
 * The Monday on or before this date.
 *
 * Monday because the review already starts its week there (`REVIEW_WEEKDAY`),
 * and because a training split is described in weekdays — a week that began on
 * a Sunday would put a Saturday session in the wrong one.
 *
 * Takes a `local_date` rather than an instant, which is what makes the 04:00 day
 * boundary carry through to the week boundary for nothing: the date has already
 * had `day_start_hour` subtracted, so a Sunday-night session logged at 01:00 is
 * already a Sunday, and lands in the week that is ending rather than the one
 * beginning.
 */
export function weekStartFor(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  // `getUTCDay` is 0 for Sunday; rotate so Monday is 0 and Sunday is 6.
  const sinceMonday = (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
  return addDays(localDate, -sinceMonday);
}

/** §6: pick a sensible meal rather than asking which one it was. */
export function inferMeal(instant: Date, timezone: string): Meal {
  const hour = Number(localPartsFor(instant, timezone).time.slice(0, 2));
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

// ---- Streaks ---------------------------------------------------------------

/**
 * Active days a week has to have before it counts toward the training streak.
 *
 * Fixed rather than read off `routine_days`, and that is the whole design
 * decision. Taking the bar from somebody's declared split reads as generous —
 * "you did what you said you would" — right up until they add a sixth training
 * day in March and retroactively break a twelve-week run, because every past
 * week is now judged against a bar it never had. A bar that moves under the
 * history is not a bar.
 *
 * Three is roughly the WHO 150-minutes-a-week floor and is one constant to
 * change. Somebody training six days a week clears it without noticing, which is
 * correct: this measures consistency, not volume, and there is no leaderboard
 * for it to be unfair against.
 */
export const TRAINING_WEEK_DAYS = 3;

interface Run {
  start: string;
  end: string;
  length: number;
}

/**
 * Consecutive spans in a sorted, de-duplicated list of dates.
 *
 * `step` is what makes this serve both streaks: 1 for a run of days, 7 for a run
 * of Mondays. The gaps are the entire question, which is why this is a walk and
 * not SQL — `count(DISTINCT ...)` cannot see a hole, and the window function
 * that can is a page of it to answer what a loop answers in a millisecond.
 */
function runsOf(sorted: string[], step: number): Run[] {
  const runs: Run[] = [];
  for (const date of sorted) {
    const last = runs.at(-1);
    if (last && addDays(last.end, step) === date) {
      last.end = date;
      last.length += 1;
    } else {
      runs.push({ start: date, end: date, length: 1 });
    }
  }
  return runs;
}

/**
 * The run in progress, and the longest there has ever been.
 *
 * `head` is the current period and `previous` the one before it. A run ending at
 * `head` is alive; one ending at `previous` is intact but unfed, which is the
 * state that exists for the sixteen hours of every day before anybody has logged
 * anything. Preferring `head` matters: on an evening that has been logged, both
 * lookups would hit the same run, and reporting it as at-risk would tell
 * somebody to do a thing they have already done.
 */
function streakOf(runs: Run[], head: string, previous: string): Streak {
  const best = runs.reduce((longest, run) => Math.max(longest, run.length), 0);

  const alive = runs.find((run) => run.end === head);
  const atRisk = alive ? undefined : runs.find((run) => run.end === previous);
  const current = alive ?? atRisk;

  return {
    current: current?.length ?? 0,
    best,
    start: current?.start ?? null,
    state: alive ? 'alive' : atRisk ? 'at_risk' : 'none',
  };
}

/**
 * Dates worth counting: unique, in order, and never past `today`.
 *
 * The filter is not paranoia. A meal can be logged with a time hint — "yesterday
 * 8pm", or an explicit timestamp from the model — and nothing stops that landing
 * in the future. Without this, one mistyped date creates a phantom run and a
 * `best` that never comes back down.
 */
function countableDates(dates: Iterable<string>, today: string): string[] {
  return [...new Set(dates)].filter((date) => date <= today).sort();
}

/**
 * Consecutive days with something logged, ending today or yesterday.
 *
 * Takes the dates rather than fetching them, which is what lets the server pass
 * a `DISTINCT local_date` scan and an offline phone pass its cache plus whatever
 * is still sitting in the outbox. One implementation, so the number does not
 * jump when the network comes back — the same bargain the rest of this file was
 * moved out of `apps/api` to get.
 */
export function streakFrom(dates: Iterable<string>, today: string): Streak {
  const days = countableDates(dates, today);
  return streakOf(runsOf(days, 1), today, addDays(today, -1));
}

/**
 * Consecutive weeks with at least `minDays` active days, ending this week or
 * last.
 *
 * Distinct dates rather than entry count, because `sessions` is
 * `entries.length` and somebody who logs bench, squat and deadlift separately
 * has three of those from one visit to the gym. What the streak is about is
 * turning up, and turning up is a day.
 */
/**
 * The week in progress, and how much of the bar it has cleared.
 *
 * Separate from the streak rather than folded into it, because they answer
 * different questions: the streak is "how long have you kept this up", and this
 * is "is this week on course" — the one somebody can still do something about.
 * Without it a weekly streak is a number that only resolves on Sunday, which is
 * too late to be a nudge and too vague to be a reward.
 */
export function trainingWeekOf(
  dates: Iterable<string>,
  today: string,
  minDays: number = TRAINING_WEEK_DAYS,
): TrainingWeek {
  const weekStart = weekStartFor(today);
  return {
    week_start: weekStart,
    // `countableDates` has already dropped anything past today, so this is the
    // week so far and never the week as somebody hopes it will end up.
    days: countableDates(dates, today).filter((date) => date >= weekStart),
    needed: minDays,
  };
}

export function weekStreakFrom(
  dates: Iterable<string>,
  today: string,
  minDays: number = TRAINING_WEEK_DAYS,
): Streak {
  const byWeek = new Map<string, number>();
  for (const date of countableDates(dates, today)) {
    const week = weekStartFor(date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
  }

  const qualifying = [...byWeek.entries()]
    .filter(([, activeDays]) => activeDays >= minDays)
    .map(([week]) => week)
    .sort();

  const thisWeek = weekStartFor(today);
  return streakOf(runsOf(qualifying, 7), thisWeek, addDays(thisWeek, -7));
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
  /**
   * Only ever set for the reader's today, and absent everywhere else — an
   * offline phone rolling up a cached day has no streak to hand, and a History
   * cell in March has no use for one.
   */
  streak?: Streak | null;
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
  streak = null,
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
    streak,
  };
}
