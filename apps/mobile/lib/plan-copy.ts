import type { Allowance, MeterName, PlanName, PlanTier } from '@ct/shared';
import { meterLocked } from '@ct/shared';
import { untilWords } from '@ct/shared/words';

/**
 * The words the app uses about money, in one file.
 *
 * A paywall is the one surface where a careless sentence costs something
 * measurable, and it is also the surface most likely to be assembled inline at
 * four call sites because each one only needed a fragment. So the fragments
 * live here, and every wall, chip and locked panel reads from the same
 * vocabulary.
 *
 * Three rules run through all of it:
 *
 * 1. **Name the number.** "You've run out" is an error; "that's your 20 free
 *    messages" is a plan somebody can reason about.
 * 2. **Never end on the refusal.** Every sentence that closes a door names the
 *    one still open — and on the free tier there genuinely is one, because
 *    `OFFLINE.md` shipped: typing a meal in, repeating one, scanning a barcode
 *    and the whole history cost nothing and are never metered.
 * 3. **No urgency, no countdown, no red.** This is a limit, not an alarm. The
 *    app is asking to be paid for, not warning somebody that something is
 *    wrong.
 */

/** Singular and plural, per meter. Matches `sentenceFor` on the API. */
const NOUNS: Record<MeterName, [string, string]> = {
  chat: ['message', 'messages'],
  photo: ['photo scan', 'photo scans'],
  pantry_scan: ['fridge scan', 'fridge scans'],
  recipe: ['recipe', 'recipes'],
  meal_plan: ['meal plan', 'meal plans'],
};

export function meterNoun(meter: MeterName, count: number): string {
  const [one, many] = NOUNS[meter];
  return count === 1 ? one : many;
}

export const TIER_NAMES: Record<PlanName, string> = {
  free: 'Free',
  plus: 'Plus',
  coach: 'Coach',
};

/**
 * One line on what a tier is *for*, above the list of what it holds.
 *
 * One short line, because on the wall it sits above a price and a list that
 * both say something concrete — a second sentence here is read by nobody and
 * pushes the tier below it off the screen. Coach's does not open with "Plus,
 * and": the card says that itself, in its own row, from the tier below it
 * rather than from a string that has to be kept in step by hand.
 */
export const TIER_PITCHES: Record<PlanName, string> = {
  free: 'A complete food diary, offline and unmetered.',
  plus: 'The journal every day, and a weekly read on it.',
  coach: 'The kitchen too: cook from your fridge, plan the week.',
};

/**
 * Which tier is the answer to a spent meter.
 *
 * The cheapest one that carries the thing they just tried to do, rather than
 * always the top one. Somebody who ran out of messages is being asked for
 * $79.99; upselling them to $149.99 in the same breath is how a wall stops
 * being read.
 */
export function tierFor(meter: MeterName, tiers: PlanTier[], current: PlanName): PlanName | null {
  const ladder: PlanName[] = ['free', 'plus', 'coach'];
  const above = ladder.slice(ladder.indexOf(current) + 1);
  for (const plan of above) {
    const tier = tiers.find((candidate) => candidate.plan === plan);
    const carried = tier?.meters.find((entry) => entry.meter === meter);
    if (carried && carried.allowed !== null && carried.allowed > 0) return plan;
  }
  return null;
}

/**
 * The headline: what just happened, with the number in it.
 *
 * Second person and past tense, because that is what it is — a thing they have
 * finished using, not a thing the app is refusing to do. The distinction is the
 * whole difference between a paywall and an error dialog.
 */
export function wallTitle(allowance: Allowance): string {
  const { meter, allowed, period } = allowance;
  if (meterLocked(allowance)) {
    const [, many] = NOUNS[meter];
    return `${capitalise(many)} aren't on your plan`;
  }
  const count = allowed ?? 0;
  const noun = meterNoun(meter, count);
  return period === 'ever'
    ? `That's your ${count} free ${noun}`
    : `That's all ${count} ${noun} this month`;
}

/**
 * The line under it: the door that is still open.
 *
 * Which door depends on the meter. The journal's is the strong one and it is
 * strong because it is true — a spent account still has a working food diary,
 * which is exactly the argument `plans.ts` makes for the free tier being as
 * small as it is. The kitchen has no such fallback, so it says what comes back
 * and when instead of inventing one.
 */
export function wallBody(allowance: Allowance): string {
  const back = allowance.resets_at ? ` They come back ${untilWords(allowance.resets_at)}.` : '';

  switch (allowance.meter) {
    case 'chat':
      return `Typing a meal in yourself is unlimited, and always free — I'll show you where.${back}`;
    case 'photo':
      return `You can still type the meal in, repeat one you've had before, or scan its barcode. None of those are metered.${back}`;
    case 'pantry_scan':
      return `Your kitchen list still works — you can add what's in it by hand.${back}`;
    case 'recipe':
      return `Everything you've already cooked is still saved, and the recipe library is free to browse.${back}`;
    case 'meal_plan':
      return `The week you last planned is still there, and you can still cook from a saved recipe.${back}`;
  }
}

/**
 * What one tier holds, as lines for the wall.
 *
 * Generated from the server's own ceilings rather than typed out, so a tier
 * that changes cannot leave the screen selling it out of date — see
 * `PlanTier`. Meters the tier does not carry are simply absent: a list that
 * says "0 recipes" is a list of what you are not getting, which is a strange
 * thing for a page asking for money to lead with.
 *
 * **Grouped, and diffed against the tier below.** One meter per line was the
 * obvious shape and it made Coach a seven-line wall of numbers that nobody
 * read — five of them meters, two of them things Plus already had, all of them
 * the same weight. So the meters are joined into the two lines somebody
 * actually shops on, "the journal" and "the kitchen", and anything the cheaper
 * tier already carries is dropped: the card states *Everything in Plus* once,
 * above the list (see `carriesFrom`), which is both shorter and the thing a
 * repeated line was failing to say.
 */
const JOURNAL: MeterName[] = ['chat', 'photo'];
const KITCHEN: MeterName[] = ['pantry_scan', 'recipe', 'meal_plan'];

export function tierLines(tier: PlanTier, below?: PlanTier): string[] {
  const lines = [...meterLines(tier, JOURNAL), ...meterLines(tier, KITCHEN)];

  // The two unmetered extras, on one line and only where they are new. Both
  // are a sentence rather than a count, so joining them costs no clarity and
  // saves the taller card its seventh row.
  const review = tier.reviews_per_day > 0 && !(below && below.reviews_per_day > 0);
  const nudge = tier.nudges_per_week > 0 && !(below && below.nudges_per_week > 0);
  if (review && nudge) lines.push('A weekly review, and a nudge when you go quiet');
  else if (review) lines.push('A weekly review of how you ate');
  else if (nudge) lines.push('A nudge when you go quiet');

  return lines;
}

/**
 * One line per period, for a group of meters.
 *
 * Per period rather than per group, because the suffix is a claim about
 * billing: free's grants are for all time and a paid tier's come back every
 * month, and a tier that ever mixed the two would otherwise get one of them
 * wrong on a line that names both.
 */
function meterLines(tier: PlanTier, group: MeterName[]): string[] {
  const byPeriod = new Map<'month' | 'ever', string[]>();
  for (const meter of group) {
    const entry = tier.meters.find((candidate) => candidate.meter === meter);
    if (!entry || entry.allowed === null || entry.allowed === 0) continue;
    const parts = byPeriod.get(entry.period) ?? [];
    parts.push(`${entry.allowed} ${meterNoun(meter, entry.allowed)}`);
    byPeriod.set(entry.period, parts);
  }
  return [...byPeriod].map(([period, parts]) =>
    period === 'ever' ? `${sentenceList(parts)}, to try` : `${sentenceList(parts)} a month`,
  );
}

/** "a", "a and b", "a, b and c". */
function sentenceList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The one row that says a tier contains the cheaper one whole.
 *
 * Null for the cheapest paid tier, which contains nothing below it worth
 * naming — free is not a thing anybody upgrades *from* on this screen, it is
 * the list at the bottom of it.
 */
export function carriesFrom(below: PlanTier | undefined): string | null {
  return below && below.plan !== 'free' ? `Everything in ${TIER_NAMES[below.plan]}` : null;
}

/**
 * What every account keeps, priced at nothing.
 *
 * On the wall under the tiers, and it is not a consolation prize — it is the
 * reason the metered allowances can be small. Worth stating plainly next to the
 * price, because somebody deciding whether to pay is entitled to know exactly
 * what happens if they do not.
 */
export const ALWAYS_FREE = [
  'Typing meals in, and correcting them',
  'Repeat a meal, and barcode scanning',
  'Your whole history, the ring, and the streak',
  'Logging with no signal at all',
];

/**
 * The quiet line, shown while there is still something left.
 *
 * Only ever a count and a noun. No "upgrade now", no exclamation mark — the
 * whole design of this warning is that it appears three turns early, so it has
 * time to be a fact rather than an interruption.
 */
export function remainingLine(allowance: Allowance, left: number): string {
  return `${left} ${meterNoun(allowance.meter, left)} left`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
