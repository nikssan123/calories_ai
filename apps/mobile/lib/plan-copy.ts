import type { Allowance, Locale, MeterName, PlanName, PlanTier } from '@ct/shared';
import { meterLocked, TRIAL } from '@ct/shared';
import { listWords, untilWords } from '@ct/shared/words';
import type { IntroPhase } from '@/lib/billing';
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
 * The state, as a label: three or four words over the headline.
 *
 * This is where the *count* went. It used to be the headline — "That's all 3
 * messages this month" — and that spent the one serif line on the card saying
 * a number the reader had just watched run out, in a sentence about the past.
 * A bar and a label say it in a glance and without a verb, which is what frees
 * the headline to be about what happens next. See `PlanWall`.
 */
export function wallEyebrow(allowance: Allowance, t: T): string {
  if (allowance.trial === 'ended') return t('wall.eyebrowTrialOver');
  if (meterLocked(allowance)) return t('wall.eyebrowLocked');
  const count = allowance.allowed ?? 0;
  return t('wall.eyebrowUsed')(count, meterNoun(allowance.meter, count, t));
}

/**
 * The headline: what happens next, now that the count is drawn above it.
 *
 * For everyone but a guest this is still what it was — second person, past
 * tense, a thing they have finished using rather than a thing the app is
 * refusing to do, which is the whole difference between a paywall and an error
 * dialog.
 *
 * A guest gets a different sentence, and the reason is in the funnel: the
 * generic one is a statement of the app's bookkeeping, it never mentions the
 * account, and in three weeks of store installs it converted nobody. The
 * server has always had the guest sentence — `sentenceFor` in `usage.ts` writes
 * "Save your account to start a free trial" — and the client has always thrown
 * it away, because `message` is only read when no allowance came back at all.
 * So the offer is said here, where it is actually drawn, and in messages as
 * well as days: a guest who will not open the app tomorrow cannot be sold three
 * days.
 */
export function wallTitle(allowance: Allowance, t: T, locale: Locale, guest = false): string {
  const { meter, allowed, period } = allowance;
  // Free's road — see `GUEST` and `TRIAL` in `@ct/shared`. An ended trial is a
  // locked meter to every button, and it is still not "not on your plan": it
  // was, for a week, and the sentence says so.
  if (allowance.trial === 'ended') return t('wall.trialEnded');
  if (meterLocked(allowance)) {
    // Two, so every language picks its plural category rather than English's.
    return t('wall.notOnPlan')(capitalise(meterNoun(meter, 2, t), locale));
  }
  if (guest) {
    /*
     * What the trial hands this particular meter, named. The title used to say
     * "Your next 9 are free" — nine of what, on a card whose own eyebrow is the
     * only place the noun appears — and it hardcoded the chat grant, so the
     * photo wall offered a guest nine of something it does not sell them. Both
     * come off the meter now: a guest can only ever reach this branch on chat
     * or photo, because `freeMeter` gives the other three no guest grant at all
     * and a locked meter is answered above.
     */
    const grant = meter === 'photo' ? TRIAL.photo : TRIAL.chat;
    return t('wall.guestTitle')(grant, meterNoun(meter, grant, t));
  }
  const count = allowed ?? 0;
  const noun = meterNoun(meter, count, t);
  if (allowance.trial === 'trial') return t('wall.trialGrant')(count, noun);
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

export function wallBody(allowance: Allowance, t: T, locale: Locale, guest = false): string {
  // A guest's body carries what saving keeps and what stays free either way;
  // the journal's own door is in that sentence, so the meter's line would
  // repeat it. Nothing comes back for a guest, so there is no date to add.
  if (guest) return t('wall.guestBody');
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
  if (allowance.trial === 'ended') return t('wall.trialEnded');
  const count = allowance.allowed ?? 0;
  const noun = meterNoun(allowance.meter, count, t);
  // The verb agrees inside each catalogue rather than out here: English needs
  // is/are, Bulgarian needs neither, and a verb chosen in this file would be
  // English's answer imposed on every language.
  if (allowance.trial === 'trial') return t('spent.trial')(count, noun);
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
 *
 * ---- Why the trial says its own name ----------------------------------------
 *
 * A count alone answers "how many" and leaves "of what" to be inferred, and on
 * a trial the inference people make is the wrong one: nine messages reads as
 * the shape of the product rather than as a few days of it. The word `Free
 * trial` in front of the number is the difference between a meter and a
 * countdown, and it is the only place outside the settings screen that says so
 * — the wall says it too, but the wall arrives after the decision.
 *
 * The three stages are three different facts and only one of them is a trial:
 * a guest is on a grant that saving the account replaces, and a spent or ended
 * account has no count to give. So this reads `trial` rather than testing
 * `period === 'ever'`, which is true of the guest's grant as well.
 */
export function remainingLine(allowance: Allowance, left: number, t: T): string {
  const noun = meterNoun(allowance.meter, left, t);
  return allowance.trial === 'trial'
    ? t('wall.trialRemaining')(left, noun)
    : t('wall.remaining')(left, noun);
}

/** Locale-aware, because `toUpperCase()` is not the same map everywhere. */
function capitalise(word: string, locale: Locale): string {
  return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1);
}

/**
 * "1 week", "3 days" — how long one phase of an introductory price lasts, in
 * the reader's language.
 *
 * Through `Intl` rather than the catalogue, which is the same bargain the rest
 * of this app strikes with units: a thirteen-language table of every count of
 * every period would be fifty-odd entries that ICU already holds, and gets the
 * Slavic plural categories right without anybody having to think about them.
 * `lib/i18n.ts` explains why full ICU is available here.
 *
 * **Cycles multiply.** A phase is a period *and* a number of repeats of it, and
 * the length somebody is buying is the product of the two: a pay-as-you-go
 * intro of three months arrives from StoreKit as one month over three cycles,
 * and saying "1 month" there would understate the offer by two thirds. Nothing
 * we sell today has more than one cycle, which is precisely why this is worth
 * carrying rather than assuming.
 *
 * Falls back to the bare pair rather than throwing, because a paywall that
 * renders nothing is worse than one that says "1 week" in English.
 */
export function introDuration(phase: IntroPhase, locale: string): string {
  const unit = { DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' }[phase.unit];
  const count = phase.count * phase.cycles;
  try {
    return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(
      count,
    );
  } catch {
    return `${count} ${unit}${count === 1 ? '' : 's'}`;
  }
}

/**
 * A phase as the pair `introThen` takes: its figure, and "for 1 month".
 *
 * The tail is `introFor`, the fragment the card already puts under the headline
 * figure, rather than a key of its own. Every catalogue has translated that
 * fragment and every one of them put the preposition inside it — "за 1 месец",
 * "für 1 Monat" — so a price in front of it is a phrase in each language
 * rather than an English shape with the words swapped.
 */
function rungOf(phase: IntroPhase, t: T, locale: string): [string, string] {
  return [phase.price, t('plans.introFor')(introDuration(phase, locale))];
}

/**
 * Every charge after the first one, ending with the price it becomes.
 *
 * "then €3.99 for 1 month, then €9.99 a month" — the line the card has to carry
 * the moment an offer has a second phase, as a free trial before a discounted
 * period does. With one phase, which is what is sold today, it collapses to
 * exactly what this said before: "then €9.99 a month".
 *
 * The renewal arrives as words rather than as a `Buyable['period']` because the
 * two ways of saying a period are a screen's business — `periodWord` and
 * `billedWord` in `app/upgrade.tsx` — and threading the choice in here would
 * put a third copy of that decision in the vocabulary file.
 */
export function introLadder(
  phases: IntroPhase[],
  price: string,
  periodWord: string,
  t: T,
  locale: string,
): string {
  const rungs: [string, string][] = [
    ...phases.slice(1).map((phase) => rungOf(phase, t, locale)),
    [price, periodWord],
  ];
  // A comma rather than `listWords`: these are steps in a sequence, not a list
  // of alternatives, and every language's "and" would be wrong between two
  // charges that happen one after the other.
  return rungs.map(([figure, tail]) => t('plans.introThen')(figure, tail)).join(', ');
}

/**
 * What the first payments are, for the small print: "€0.99 for 1 week, then
 * €3.99 for 1 month".
 *
 * The same rungs as `introLadder` minus the renewal, because the sentence this
 * feeds says what happens after them in its own words. The first one is stated
 * rather than introduced — it is the charge being agreed to, and "then" belongs
 * only to what follows it.
 */
export function introSteps(phases: IntroPhase[], t: T, locale: string): string {
  return phases
    .map((phase, index) => {
      const [figure, tail] = rungOf(phase, t, locale);
      return index === 0 ? `${figure} ${tail}` : t('plans.introThen')(figure, tail);
    })
    .join(', ');
}
