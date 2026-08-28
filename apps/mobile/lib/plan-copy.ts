import type { Allowance, Locale, MeterName, PlanName, PlanTier } from '@ct/shared';
import { meterLocked } from '@ct/shared';
import { listWords, untilWords } from '@ct/shared/words';
import type { MessageKey, StringKey, useT } from '@/lib/i18n';

/**
 * The catalogue, passed in rather than read from a hook.
 *
 * Nothing in here is a component — these are the sentences six screens
 * assemble — so `useT()` cannot be called. Threading the lookup through is the
 * price of keeping the vocabulary in one file, and it is worth paying: the
 * alternative is six components each translating their own fragment, which is
 * exactly the duplication this module exists to prevent.
 */
type T = ReturnType<typeof useT>;

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
 * 1. **Name the number.** "You've run out" is an error; "that's all 10 messages
 *    this month" is a plan somebody can reason about.
 * 2. **Never end on the refusal.** Every sentence that closes a door names the
 *    one still open — and on the free tier there genuinely is one, because
 *    `OFFLINE.md` shipped: typing a meal in, repeating one, scanning a barcode
 *    and the whole history cost nothing and are never metered.
 * 3. **No urgency, no countdown, no red.** This is a limit, not an alarm. The
 *    app is asking to be paid for, not warning somebody that something is
 *    wrong.
 */

/**
 * The noun for each meter, agreeing with a count.
 *
 * A pair of strings before, which is English's answer to plurals and nobody
 * else's — see `plural()` in `shared/locale.ts`. Each catalogue now supplies
 * whatever categories its language has, and this table only says which key
 * belongs to which meter. Matches `sentenceFor` on the API.
 */
const NOUN_KEYS = {
  chat: 'meter.chat',
  photo: 'meter.photo',
  pantry_scan: 'meter.pantryScan',
  recipe: 'meter.recipe',
  meal_plan: 'meter.mealPlan',
} as const satisfies Record<MeterName, MessageKey>;

export function meterNoun(meter: MeterName, count: number, t: T): string {
  return t(NOUN_KEYS[meter])(count);
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
export const TIER_PITCHES: Record<PlanName, StringKey> = {
  free: 'tier.pitchFree',
  plus: 'tier.pitchPlus',
  coach: 'tier.pitchCoach',
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
export function wallTitle(allowance: Allowance, t: T, locale: Locale): string {
  const { meter, allowed, period } = allowance;
  if (meterLocked(allowance)) {
    // Two, so every language picks its plural category rather than English's.
    return t('wall.notOnPlan')(capitalise(meterNoun(meter, 2, t), locale));
  }
  const count = allowed ?? 0;
  const noun = meterNoun(meter, count, t);
  return period === 'ever'
    ? t('wall.freeGrant')(count, noun)
    : t('wall.monthlyGrant')(count, noun);
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
const BODY_KEYS = {
  chat: 'wall.bodyChat',
  photo: 'wall.bodyPhoto',
  pantry_scan: 'wall.bodyPantryScan',
  recipe: 'wall.bodyRecipe',
  meal_plan: 'wall.bodyMealPlan',
} as const satisfies Record<MeterName, StringKey>;

export function wallBody(allowance: Allowance, t: T, locale: Locale): string {
  const back = allowance.resets_at
    ? t('wall.comeBack')(untilWords(allowance.resets_at, locale))
    : '';
  return `${t(BODY_KEYS[allowance.meter])}${back}`;
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

export function tierLines(tier: PlanTier, t: T, locale: Locale, below?: PlanTier): string[] {
  const lines = [
    ...meterLines(tier, JOURNAL, t, locale),
    ...meterLines(tier, KITCHEN, t, locale),
  ];

  // The two unmetered extras, on one line and only where they are new. Both
  // are a sentence rather than a count, so joining them costs no clarity and
  // saves the taller card its seventh row.
  const review = tier.reviews_per_day > 0 && !(below && below.reviews_per_day > 0);
  const nudge = tier.nudges_per_week > 0 && !(below && below.nudges_per_week > 0);
  if (review && nudge) lines.push(t('tier.reviewAndNudge'));
  else if (review) lines.push(t('tier.review'));
  else if (nudge) lines.push(t('tier.nudge'));

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
function meterLines(tier: PlanTier, group: MeterName[], t: T, locale: Locale): string[] {
  const byPeriod = new Map<'month' | 'ever', string[]>();
  for (const meter of group) {
    const entry = tier.meters.find((candidate) => candidate.meter === meter);
    if (!entry || entry.allowed === null || entry.allowed === 0) continue;
    const parts = byPeriod.get(entry.period) ?? [];
    parts.push(t('tier.countNoun')(entry.allowed, meterNoun(meter, entry.allowed, t)));
    byPeriod.set(entry.period, parts);
  }
  // `listWords` rather than a hand-rolled join: the conjunction and the serial
  // comma are a per-language question, and `Intl.ListFormat` already answers it.
  return [...byPeriod].map(([period, parts]) =>
    period === 'ever'
      ? t('tier.toTry')(listWords(parts, locale))
      : t('tier.aMonth')(listWords(parts, locale)),
  );
}

/**
 * The one row that says a tier contains the cheaper one whole.
 *
 * Null for the cheapest paid tier, which contains nothing below it worth
 * naming — free is not a thing anybody upgrades *from* on this screen, it is
 * the list at the bottom of it.
 */
export function carriesFrom(below: PlanTier | undefined, t: T): string | null {
  return below && below.plan !== 'free' ? t('tier.everythingIn')(TIER_NAMES[below.plan]) : null;
}

/**
 * What every account keeps, priced at nothing.
 *
 * On the wall under the tiers, and it is not a consolation prize — it is the
 * reason the metered allowances can be small. Worth stating plainly next to the
 * price, because somebody deciding whether to pay is entitled to know exactly
 * what happens if they do not.
 */
export const ALWAYS_FREE: StringKey[] = [
  'free.typing',
  'free.repeat',
  'free.history',
  'free.offline',
];

/**
 * A meter that is gone, said in passing rather than announced.
 *
 * `wallTitle` is the headline version of this and cannot be borrowed for it:
 * "That's all 10 messages this month" is a sentence about a thing that just
 * happened, and it reads as a non-sequitur on a surface the reader arrived at
 * for some other reason — the empty diet-quality panel, days later. Same
 * number, same distinction between a lifetime grant and a monthly one, no
 * event.
 */
export function spentLine(allowance: Allowance, t: T): string {
  const count = allowance.allowed ?? 0;
  const noun = meterNoun(allowance.meter, count, t);
  // The verb agrees inside each catalogue rather than out here: English needs
  // is/are, Bulgarian needs neither, and a verb chosen in this file would be
  // English's answer imposed on every language.
  return allowance.period === 'ever'
    ? t('spent.everGrant')(count, noun)
    : t('spent.monthly')(count, noun);
}

/**
 * The quiet line, shown while there is still something left.
 *
 * Only ever a count and a noun. No "upgrade now", no exclamation mark — the
 * whole design of this warning is that it appears well before the wall does, so
 * it has time to be a fact rather than an interruption. How early is
 * `showFrom`'s question, not this one's.
 */
export function remainingLine(allowance: Allowance, left: number, t: T): string {
  return t('wall.remaining')(left, meterNoun(allowance.meter, left, t));
}

/** Locale-aware, because `toUpperCase()` is not the same map everywhere. */
function capitalise(word: string, locale: Locale): string {
  return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1);
}
