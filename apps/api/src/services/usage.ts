import { query, queryOne } from '../db.ts';
import { anthropicRate, openAiRate, priceUsage, round6 } from '../ai/pricing.ts';
import { MODELS } from '../ai/client.ts';
import type { ProviderId } from '../ai/providers/index.ts';
import type { CostSource, Outcome, TurnKind } from '../ai/providers/types.ts';
import { freeMeter, freeStage, limitsFor, meterFor } from './plans.ts';
import { creditBalance, spendCredit } from './credits.ts';
import { trialNeverEnds } from './trial.ts';
import {
  CREDIT_METERS,
  FREE_TURNS,
  TRIAL,
  TRIAL_LEGACY,
  planLimitCode,
  trialTerms,
  type Allowance,
  type ChatAction,
  type MeterName,
  type PlanLimitCode,
  type PlanName,
  type TrialStage,
  type TrialTerms,
} from '@ct/shared';

/**
 * Recording and reading what the AI layer costs.
 *
 * The recording half is deliberately unconditional and non-throwing: every turn
 * writes a row, including the ones that failed, and a write that fails must not
 * take the turn down with it. Cost accounting that can break the product it is
 * measuring gets turned off, and then there is no accounting.
 */

export interface RecordUsageInput {
  userId: string;
  kind: TurnKind;
  outcome: Outcome;
  /**
   * Which lane actually ran the turn, which is no longer the same question as
   * which lane the deployment is configured for.
   *
   * This used to be read off `providerId()` at insert time, and that was
   * correct for exactly as long as a deployment had one lane. It stopped being
   * correct the day `SUBSCRIPTION_EMAILS` arrived and did not announce it: every
   * subscription-lane turn was filed under `anthropic-api`, silently, and the
   * cost column went on mixing money that was really billed with money that a
   * subscription had already covered. Nothing broke, which is why it took a
   * person asking "did my turn use the subscription?" to find it.
   *
   * Required rather than defaulted for that reason. A caller that forgets it is
   * a compile error now, instead of a plausible-looking row.
   */
  provider: ProviderId;
  /**
   * Whether this turn counts against the account's grant.
   *
   * Defaulted rather than required, and the opposite way round to `provider`:
   * every caller here but the two journal lanes is a turn nobody asked for in
   * a sentence — a review, a nudge, a recipe, a fridge scan — and each of those
   * either has no grant behind it or has one that its own route already
   * decided. `true` is what the table did before this field existed and what
   * all of them still mean.
   */
  metered?: boolean;
  /**
   * The person's own words for this turn, for the cost panel to show beside
   * the price.
   *
   * Only passed by the callers that have any. The photo lane's `text` is a
   * sentence this program wrote, the review's is a template, and filing either
   * under "what they asked" would make the column a list of our own prompts —
   * so those pass nothing and the row reads as the unasked-for turn it is.
   */
  prompt?: string | null;
  /**
   * Whether a tool wrote anything into the journal this turn.
   *
   * A different question from `metered` and stored separately, because it is
   * what *earns* the next free turn — see `spendsGrant`. Left undefined by the
   * callers with no journal behind them, where it lands as null rather than as
   * a false that would read like a journal turn which logged nothing.
   */
  changed?: boolean;
}

/**
 * How many turns of a kind this account has run recently.
 *
 * The route limiter cannot see a recipe run started from inside a journal tool
 * — it counts requests to `/recipes/suggest`, and this one never goes there. So
 * the ceiling is enforced against the cost ledger instead, which is the more
 * honest instrument anyway: it counts what was actually spent rather than what
 * was asked for, and it already records every run from every entry point.
 *
 * A rolling window rather than a calendar day, because there is no timezone
 * involved and "three in the last day" is what a person means by the limit.
 */
export async function turnsInLastDay(userId: string, kind: TurnKind): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM ai_usage
      WHERE user_id = $1 AND metered AND kind = $2
        AND occurred_at > now() - interval '1 day'`,
    [userId, kind],
  );
  return Number(row?.n ?? 0);
}

/**
 * The same count over a week. For the ceilings that are weekly rather than
 * daily, which so far means the meal plan — a rolling window rather than a
 * calendar week, so nobody gets two plans by asking on Sunday night and again
 * on Monday morning.
 */
/**
 * When the oldest run still inside the window falls out of it.
 *
 * The ceiling is a rolling twenty-four hours, not a calendar day, so "resets at
 * midnight" would be a lie — and a specific lie is worse than a vague truth,
 * because somebody comes back at midnight and finds nothing. What actually
 * happens is that the earliest run ages out, and this is when.
 *
 * Null when nothing is in the window, which means nothing is waiting.
 */
export async function oldestTurnInLastDay(
  userId: string,
  kind: TurnKind,
): Promise<Date | null> {
  const row = await queryOne<{ at: Date | null }>(
    `SELECT min(occurred_at) AS at FROM ai_usage
      WHERE user_id = $1 AND metered AND kind = $2
        AND occurred_at > now() - interval '1 day'`,
    [userId, kind],
  );
  return row?.at ? new Date(row.at) : null;
}

/**
 * The turn kinds each sold meter is counted over.
 *
 * `chat` covers `setup` as well as `text_log`. Nothing runs a setup turn any
 * more — the profile questions are a form now — but the rows written while it
 * was a conversation are still in `ai_usage`, and a lifetime allowance that
 * stopped counting them would quietly hand somebody back turns they had
 * already spent.
 *
 * `photo_log` is deliberately *not* in `chat`, despite being a journal turn
 * through the same route. It is metered on its own because it costs six times
 * as much, and a meter that averages the two would price neither.
 */
const METER_KINDS: Record<MeterName, TurnKind[]> = {
  chat: ['text_log', 'setup'],
  photo: ['photo_log'],
  pantry_scan: ['pantry_scan'],
  recipe: ['recipe'],
  meal_plan: ['meal_plan'],
};

/**
 * How many turns of these kinds this account has run inside the window.
 *
 * `null` days means all of time, which is what a lifetime allowance needs. The
 * free tier is built out of those, so this is not an edge case — it is the
 * common path for the majority of accounts.
 *
 * `metered` is on this query and on every other one that measures a grant, and
 * on none of the cost reports below. A grant is sold as meals logged rather
 * than as sentences sent, so a turn that wrote nothing into the journal is
 * recorded in full and counted by nobody — see `spendsGrant` for the rule and
 * `063_ai_usage_metered.sql` for the guest it was written for.
 *
 * The index added in `034` is what makes the monthly form affordable: it runs
 * *before* the turn rather than after, so unlike the cost rollups it is latency
 * somebody is standing there waiting for.
 */
export async function turnsInWindow(
  userId: string,
  kinds: TurnKind[],
  days: number | null,
): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM ai_usage
      WHERE user_id = $1 AND metered AND kind = ANY($2::text[])
        AND ($3::int IS NULL OR occurred_at > now() - ($3 || ' days')::interval)`,
    [userId, kinds, days],
  );
  return Number(row?.n ?? 0);
}

/** The same count from a moment rather than over a window — the trial's week. */
async function turnsSince(userId: string, kinds: TurnKind[], since: Date): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM ai_usage
      WHERE user_id = $1 AND metered AND kind = ANY($2::text[]) AND occurred_at >= $3`,
    [userId, kinds, since],
  );
  return Number(row?.n ?? 0);
}

/**
 * When this account's trial began and what it was sold as, or null for a guest.
 *
 * `email_verified_at` stands in for accounts that proved an address without
 * `startTrial` having run — the sign-up paths that predate it. It is the same
 * moment by definition: the trial starts when the account is saved, and saving
 * is proving the address.
 *
 * `trial_terms` is how long that trial runs and how much is in it. Null on a row
 * whose trial has not started, which `trialTerms` reads as today's — migration
 * `059` stamped every trial that was already running, including the ones that
 * only have a confirmation date, so an unstamped row here has genuinely not
 * started one.
 */
async function trialAccount(
  userId: string,
): Promise<{ started: Date | null; terms: TrialTerms; endless: boolean; daysLogged: number }> {
  /*
   * `days_logged` is what spends the trial — see `freeStage`. Distinct
   * `local_date`, so three meals in one evening are one day, and counted from
   * `created_at` rather than by comparing dates: `local_date` is the reader's
   * logging day and the trial began at an instant, and an entry written at one
   * in the morning belongs to the day it was typed on whichever of the two you
   * ask. Comparing the timestamps needs no timezone and cannot be off by one.
   *
   * In the same round trip as the row it belongs to. This runs on the hot path
   * of every chat turn, and a second query to count at most a handful of rows
   * would be a network wait bought for nothing.
   */
  const row = await queryOne<{
    started: Date | null;
    terms: unknown;
    email: string | null;
    days_logged: number;
  }>(
    `SELECT COALESCE(u.trial_started_at, u.email_verified_at) AS started,
            u.trial_terms AS terms,
            u.email,
            (SELECT count(DISTINCT f.local_date)
               FROM food_entries f
              WHERE f.user_id = u.id
                AND f.created_at >= COALESCE(u.trial_started_at, u.email_verified_at))::int
              AS days_logged
       FROM users u WHERE u.id = $1`,
    [userId],
  );
  return {
    started: row?.started ? new Date(row.started) : null,
    terms: trialTerms(row?.terms),
    endless: trialNeverEnds(row?.email),
    // Null `started` makes the subselect's comparison null and the count zero,
    // which is also the right answer for a guest: nothing has been spent.
    daysLogged: row?.days_logged ?? 0,
  };
}

/**
 * What is left of one meter, for a screen that has to say so *before* the
 * button is pressed.
 *
 * The ceiling was only ever discovered by hitting it: the client had no way to
 * ask, so a spent account got an enabled button, a request, and a toast that
 * slid away — which reads as the button being broken rather than as a limit
 * being reached. Nothing about the number is secret, and a limit you can see is
 * a feature of the plan rather than a trap in the interface.
 *
 * A month is a rolling thirty days, not a calendar one, for the same reason the
 * daily ceilings are rolling: there is no billing period to anchor to yet, and
 * a rolling window has no cliff — the allowance comes back a turn at a time
 * instead of all at once on a date the user has to remember. When Stripe
 * arrives and there *is* a period, this is the one function that has to learn
 * about it.
 */
export async function allowanceFor(
  userId: string,
  plan: PlanName,
  meter: MeterName,
  unmetered = false,
  now = new Date(),
): Promise<Allowance> {
  let { allowed, period, unlimited } = meterFor(plan, meter, unmetered);
  const kinds = METER_KINDS[meter];

  /*
   * Free's chat and photo are a road rather than a table row — guest, a few
   * days of trial, then nothing — so the meter is redrawn for where this
   * account is on it. `LIMITS.free` in `plans.ts` has the numbers and the
   * argument, and `users.trial_terms` carries the one case where they are not
   * today's: a trial that started before the week was shortened keeps the week.
   * That is why the account's own terms are handed to `freeMeter` and
   * `freeStage` rather than the stage alone.
   */
  let trial: TrialStage | null = null;
  let trialEnds: string | null = null;
  let since: Date | null = null;
  let terms: TrialTerms = TRIAL;
  let windowDays: number | null = period === 'month' ? 30 : null;
  if (plan === 'free' && !unmetered && (meter === 'chat' || meter === 'photo')) {
    const account = await trialAccount(userId);
    if (account.endless) {
      /*
       * A store reviewer: the trial's allowance over a rolling window, with no
       * end. Deliberately the *old* allowance — 28 over seven days rather than
       * 9 over three. A reviewer works through the app in one sitting and a
       * refusal halfway is a rejection, and the whole reason this branch exists
       * is that the journal must still answer on every later review. Stated here
       * rather than read off the row, because a reviewer account created next
       * year would be stamped with today's terms and must not inherit them.
       */
      trial = 'trial';
      terms = TRIAL_LEGACY;
      windowDays = TRIAL_LEGACY.days;
    } else {
      terms = account.terms;
      trial = freeStage(account.started, account.daysLogged, terms);
      if (account.started) {
        since = account.started;
        /*
         * No date, on purpose. The trial is spent in days used now, so there is
         * no instant at which it runs out and nothing honest to put here — a
         * projected one would be the app naming a deadline it does not enforce.
         * Both screens that read this already fall back when it is null: the
         * plans sheet says how many are left instead of when they go, and the
         * You tab drops the date from the same row.
         */
        trialEnds = null;
      }
    }
    ({ allowed, period } = freeMeter(trial, meter, terms)!);
  }
  const road = { trial, trial_ends_at: trialEnds };

  /*
   * Bought stock, which sits outside the plan entirely.
   *
   * Photos and messages are sold this way — see `BUNDLES` — so the other three
   * meters skip the query rather than paying for a sum that is always zero. It
   * is read even when the monthly grant still has room, because a screen that
   * has to say "10 left this month, plus 12 you bought" needs both halves
   * before the button is pressed, not after.
   */
  const credits = CREDIT_METERS.includes(meter) ? await creditBalance(userId, meter) : 0;

  /*
   * Nobody is billed for this account's turns, so there is nothing to count and
   * no window to count it in. `used` is zero because no count was run, not
   * because none happened — the ledger still records every turn, which is the
   * only way a subscription's consumption is visible at all.
   *
   * After the credit balance rather than before it: bought scans are stock this
   * person owns, and a settings screen that reported none because they happen
   * to be unmetered would be wrong about something they paid for. They are
   * simply never spent — `requireAllowance` returns above the line that would.
   */
  if (unlimited) {
    return { meter, allowed: null, unlimited: true, used: 0, period, resets_at: null, credits, ...road };
  }

  // A meter the plan does not carry at all. No count is run: the answer does
  // not depend on it, and this is on the hot path.
  if (allowed === null) {
    return { meter, allowed: null, unlimited: false, used: 0, period, resets_at: null, credits, ...road };
  }

  // A trial counts from the day the account was saved, so the guest's turns
  // before it are not charged against the week.
  const used = since
    ? await turnsSince(userId, kinds, since)
    : await turnsInWindow(userId, kinds, windowDays);
  if (used < allowed || period === 'ever') {
    return { meter, allowed, unlimited: false, used, period, resets_at: null, credits, ...road };
  }

  // Spent, and on a window that moves. When the oldest run still inside it
  // falls out is when one comes back — which is a truthful thing to say, and
  // "resets on the 1st" would not be.
  const row = await queryOne<{ at: Date | null }>(
    `SELECT min(occurred_at) AS at FROM ai_usage
      WHERE user_id = $1 AND metered AND kind = ANY($2::text[])
        AND occurred_at > now() - interval '30 days'`,
    [userId, kinds],
  );
  return {
    meter,
    allowed,
    unlimited: false,
    used,
    period,
    resets_at: row?.at ? new Date(new Date(row.at).getTime() + 30 * 86_400_000).toISOString() : null,
    credits,
    ...road,
  };
}

/**
 * Raised when an account has spent a meter.
 *
 * A typed error rather than a boolean return, because every caller has to react
 * to it and none of them can sensibly carry on: a route answers 402, and a
 * journal tool tells the model to say so and answer from the log instead.
 *
 * 402 rather than 429, and the distinction matters to the client: 429 means
 * come back later, 402 means this is what your plan is. The phone shows a
 * paywall for one and a retry for the other.
 */
export class PlanLimitError extends Error {
  /** Which door the client opens — see `PLAN_LIMIT_CODES`. */
  readonly code: PlanLimitCode;

  constructor(
    readonly allowance: Allowance,
    message = sentenceFor(allowance),
  ) {
    super(message);
    this.name = 'PlanLimitError';
    this.code = planLimitCode(allowance);
  }
}

/**
 * What the wall actually says.
 *
 * One sentence, in the second person, naming the number. `SUBSCRIPTIONS.md` is
 * right that this is a product surface rather than an error state — it is the
 * screen that earns the revenue — so the words live next to the accounting
 * rather than being assembled at four call sites.
 */
function sentenceFor({ meter, allowed, period, trial }: Allowance): string {
  const thing: Record<MeterName, [string, string]> = {
    chat: ['message', 'messages'],
    photo: ['photo scan', 'photo scans'],
    pantry_scan: ['fridge scan', 'fridge scans'],
    recipe: ['recipe', 'recipes'],
    meal_plan: ['meal plan', 'meal plans'],
  };
  const [one, many] = thing[meter];

  /*
   * The journal's door, said on every refusal of a chat meter — including the
   * trial that has ended, which is the refusal it matters most on. Manual
   * entry, repeat and barcode are what is left when the model is gone, and
   * that is rule 2 in `plan-copy.ts`: never end on the refusal.
   */
  const open = meter === 'chat' ? ' Typing a meal in is still unlimited.' : '';

  if (trial === 'ended') return `Your free trial has ended.${open}`;
  if (allowed === null) return `Your plan does not include ${many}.`;
  const noun = allowed === 1 ? one : many;

  /*
   * Photos are the one meter you can buy more of without changing plan, so
   * theirs is the one sentence that ends in an offer rather than a date. Said
   * here and not in the client for the reason the rest of this function is
   * here: a wall that advertises a bundle the server has stopped selling is a
   * dead end with a button on it.
   */
  // Packs are for subscribers only, so Free's photo wall sells the plan instead.
  const more = meter === 'photo' && trial === null ? ' You can add more without changing plan.' : '';

  if (trial === 'guest') {
    return `That is your ${allowed} guest ${noun}. Save your account to start a free ${TRIAL.days}-day trial.${open}`;
  }
  if (trial === 'trial') return `That is all ${allowed} ${noun} in your free trial.${open}${more}`;

  return period === 'ever'
    ? `That is your ${allowed} free ${noun}.${open}${more}`
    : `That is all ${allowed} ${noun} for this month.${open}${more}`;
}

/**
 * What every guest together may spend on the model in a day, in USD.
 *
 * A guest's own grant is small — four messages and a photo, about $0.36 — but a
 * reinstall is a new guest, and a script is a lot of reinstalls. This is the
 * ceiling on all of them at once: past it, a guest who still has messages left
 * is asked to save the account instead, which is the same door the grant
 * running out opens (GUEST-ACCOUNTS.md). Saved accounts are never counted.
 */
export const GUEST_DAILY_CAP_USD = 5;

/** The last day's model spend by accounts that are still guests. */
async function guestSpendToday(): Promise<number> {
  const row = await queryOne<{ spent: string | null }>(
    `SELECT sum(a.cost_usd) AS spent
       FROM ai_usage a JOIN users u ON u.id = a.user_id
      WHERE u.guest_since IS NOT NULL AND a.occurred_at > now() - interval '1 day'`,
  );
  return Number(row?.spent ?? 0);
}

/**
 * The gate itself. Throws when the meter is spent, returns what is left when it
 * is not, so a caller that wants to show the remainder does not count twice.
 */
export async function requireAllowance(
  userId: string,
  plan: PlanName,
  meter: MeterName,
  unmetered = false,
): Promise<Allowance> {
  const allowance = await allowanceFor(userId, plan, meter, unmetered);
  // No ceiling, so nothing to be past. Ahead of the comparison because a null
  // `allowed` reads as "not on this plan" to the line below, and on this
  // account it means the opposite.
  if (allowance.unlimited) return allowance;
  if (allowance.allowed !== null && allowance.used < allowance.allowed) {
    if (allowance.trial === 'guest' && (await guestSpendToday()) >= GUEST_DAILY_CAP_USD) {
      throw new PlanLimitError(
        allowance,
        `Guest logs are paused for today. Save your account to start a free ${TRIAL.days}-day trial.`,
      );
    }
    return allowance;
  }

  /*
   * The month's grant is gone. Bought scans are what stands between here and
   * the wall, and they are spent at *permission* time rather than after the
   * turn succeeds.
   *
   * That looks harsh and it is the consistent choice: a failed turn already
   * counts against the monthly meter, because `recordUsage` writes a row for
   * every turn including the ones that failed and `spendsGrant` keeps those
   * rows metered. Spending a credit only on success would make the two halves
   * of the same allowance behave differently — bought stock quietly more
   * forgiving than granted units — which is the sort of difference nobody can
   * predict from the outside and everybody notices once.
   *
   * `spendCredit` re-checks the balance inside its own statement, so two turns
   * racing for the last credit cannot both win. A false return is the wall, not
   * an error.
   *
   * No plan is consulted, deliberately, and it matters most for the message
   * packs `subscriberOnly` keeps off the wall on Free. Credits do not expire,
   * so a subscriber who buys a hundred messages and later lapses still owns
   * them — refusing to spend them at that point would be keeping the money and
   * withholding the thing it bought, which is the one behaviour a top-up must
   * never have. Free accounts do not accumulate these because they are never
   * sold one, not because a check here stops them.
   */
  if (allowance.credits > 0 && (await spendCredit(userId, meter))) {
    return { ...allowance, credits: allowance.credits - 1 };
  }

  throw new PlanLimitError(allowance);
}

/**
 * Whether the turn that just ran spends one of the account's units.
 *
 * The grant is sold as meals logged. A turn that called no tool wrote nothing
 * into the journal — a greeting, a question about yesterday answered from the
 * day context, a sentence the model could not make a meal out of — and taking a
 * unit for it charges somebody for the app being conversational. On 2026-09-22
 * that cost a guest a third of their grant on "Здрасти" and put the wall a meal
 * early; `063_ai_usage_metered.sql` has that walk in full.
 *
 * Four clauses, in the order they are cheap:
 *
 * `unlimited` first, and it is the only one that answers `true` for a reason
 * that is not about the grant: there is no grant. Nothing is counted on those
 * accounts, so the flag is decoration — and asking the database to help decide
 * the value of a column nobody will read is pure latency on the lane that
 * exists to be fast.
 *
 * `failed` next, because a turn that burned tokens and then errored stays
 * metered. That is not an oversight carried forward — it is the choice `006`
 * and the credit branch above both rest on, and the alternative is a meter that
 * a broken provider silently switches off.
 *
 * `changed` after it, which is the ordinary path and costs no query at all: the
 * turn touched the journal, so it is what the unit was sold for.
 *
 * Only then the budget, so the count runs on the minority of turns that stand
 * to be free — about one in seven of the deployment's text turns — and never on
 * a photo that logged a plate.
 *
 * ---- The budget is earned, and that is the whole anti-abuse argument ---------
 *
 * `FREE_TURNS.starter` free turns to begin with, and one more for every turn
 * that actually logged something. The flat version of this does not survive
 * contact: a guest row is made by the phone on first launch, so a daily
 * allowance is really an allowance per reinstall, and somebody willing to
 * automate that has a free model.
 *
 * Earning is counted off `changed_journal` rather than off `metered`, and the
 * difference is the exploit. A chatter turn charged because the budget ran out
 * is metered and logged nothing; if *that* earned the next free turn, hello and
 * hello would alternate for as long as the grant lasted and every guest would
 * cost twice what they used to. So only the turns that wrote something buy the
 * next free one, which bounds the whole thing at `starter` plus the grant —
 * a ceiling nobody had to pick, because earning one costs a unit.
 *
 * One budget across both journal lanes rather than one each, for the same
 * reason: it is not a grant, it is the bound on how much a stranger can spend
 * saying hello, and a stranger with two ways of saying it is the same stranger.
 *
 * Nothing filters on `ok`. A failed turn takes the second clause and is
 * recorded metered with no journal fact on it, so it can neither spend the
 * budget nor earn it — a spell of failures leaves both counts where they were.
 */
/**
 * Whether a turn's actions changed anything — the `changed` `spendsGrant` reads.
 *
 * Every action but one is something the turn did to the journal or drew from
 * it. The exception is the plan card: a turn whose only act was answering "how
 * many messages have I got left?" is exactly the turn the free budget exists
 * for, and counting its card as work would charge a unit for the question
 * about units — and, the other way round, earn a free turn for asking it.
 */
export function journalChanged(actions: readonly ChatAction[]): boolean {
  return actions.some((action) => action.kind !== 'allowance_shown');
}

export async function spendsGrant(
  userId: string,
  { changed, failed, unlimited }: { changed: boolean; failed: boolean; unlimited: boolean },
): Promise<boolean> {
  if (unlimited || failed || changed) return true;
  const row = await queryOne<{ spent: string; earned: string }>(
    `SELECT count(*) FILTER (WHERE NOT metered)     AS spent,
            count(*) FILTER (WHERE changed_journal) AS earned
       FROM ai_usage
      WHERE user_id = $1 AND occurred_at > now() - interval '1 day'`,
    [userId],
  );
  const budget = FREE_TURNS.starter + FREE_TURNS.perLogged * Number(row?.earned ?? 0);
  return Number(row?.spent ?? 0) >= budget;
}

/**
 * The allowance as it stands *after* a turn, for the reply to carry back.
 *
 * The gate counted what had been spent before the turn was permitted, so the
 * number it returned is one behind by the time there is anything to send. This
 * adds the turn rather than counting again, for the reason the route gives at
 * length: the ledger row is written inside the turn, and a second count would
 * race it and could truthfully report a turn that has already happened as not
 * having.
 *
 * Nothing is added on an unmetered account, where no count was run in the first
 * place, or on a turn that did not spend a unit — which is the whole point of
 * the flag, and the one number the client would otherwise draw wrong for a
 * turn until the next reply corrected it.
 */
export function spend(allowance: Allowance, metered: boolean): Allowance {
  return allowance.unlimited || !metered ? allowance : { ...allowance, used: allowance.used + 1 };
}

export async function turnsInLastWeek(userId: string, kind: TurnKind): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM ai_usage
      WHERE user_id = $1 AND metered AND kind = $2
        AND occurred_at > now() - interval '7 days'`,
    [userId, kind],
  );
  return Number(row?.n ?? 0);
}

/**
 * How much of a message the cost ledger keeps.
 *
 * Enough to recognise a turn, not enough to be a second copy of the
 * conversation: a journal message is a line and a recipe import is a pasted
 * webpage, and the second one would put kilobytes on a row whose purpose is to
 * hold eight numbers. The panel truncates for the eye; this truncates for the
 * table, which is the one that matters when the reason to keep the text is a
 * turn from 90 days ago.
 */
const PROMPT_KEPT = 500;

function kept(prompt: string | null | undefined): string | null {
  const text = prompt?.trim();
  if (!text) return null;
  return text.length > PROMPT_KEPT ? `${text.slice(0, PROMPT_KEPT)}…` : text;
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const { outcome } = input;
  const usage = outcome.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const model = outcome.model ?? MODELS[input.kind].model;

  let costUsd = outcome.costUsd;
  let costSource: CostSource = outcome.costSource ?? 'unknown';

  // The provider is the better authority when it priced the turn itself. When
  // it did not — or priced it at zero while plainly having done work — fall
  // back to the rate card, so the row carries a number rather than a blank.
  if (costSource !== 'reported' || costUsd === 0) {
    const estimated = estimateCost(model, usage, outcome.cacheWriteMultiplier);
    if (estimated !== null) {
      costUsd = estimated;
      costSource = 'estimated';
    }
  }

  try {
    await query(
      `INSERT INTO ai_usage (
         user_id, provider, kind, model,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         cost_usd, cost_source, duration_ms, num_turns, ok, error, breakdown,
         metered, changed_journal, prompt
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        input.userId,
        input.provider,
        input.kind,
        model,
        Math.round(usage.inputTokens),
        Math.round(usage.outputTokens),
        Math.round(usage.cacheReadTokens),
        Math.round(usage.cacheWriteTokens),
        round6(costUsd),
        costSource,
        outcome.durationMs ?? null,
        outcome.numTurns ?? 0,
        !outcome.error,
        outcome.error ?? null,
        usage.byModel ? JSON.stringify(usage.byModel) : null,
        input.metered ?? true,
        input.changed ?? null,
        kept(input.prompt),
      ],
    );
  } catch {
    // Deliberately swallowed. See the note at the top of the file.
  }
}

/**
 * Rate-card price for a turn, or null when no rate applies to that model.
 *
 * `cacheWriteMultiplier` comes from the provider that ran the turn, because
 * what a cache write costs depends on the TTL it was written at and only the
 * writer knows which it asked for. Left unset it falls back to the rate card's
 * default, which is the one-hour TTL the Agent SDK takes.
 */
export function estimateCost(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
  cacheWriteMultiplier?: number,
): number | null {
  const rate = anthropicRate(model) ?? openAiRate();
  return rate ? priceUsage(usage, rate, cacheWriteMultiplier) : null;
}

// ---- Reading ----------------------------------------------------------------

export interface CostTotals {
  turns: number;
  failed_turns: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  /** Median-ish: the mean is dragged around by one photo turn in a small window. */
  avg_cost_usd: number;
  p95_duration_ms: number | null;
  /** Accounts that spent anything, with all deleted ones counted as one. */
  active_users: number;
}

/**
 * The shape every aggregate below returns. A `count(*)` query always produces
 * exactly one row, and every summed column is COALESCEd in SQL, so these are
 * guaranteed present — which is why nothing downstream re-checks them.
 */
interface TotalsRow {
  turns: number;
  failed_turns: number;
  cost_usd: number;
  input_tokens: string;
  output_tokens: string;
  cache_read_tokens: string;
  cache_write_tokens: string;
  avg_cost_usd: number;
  /** Null only when no turn in the window recorded a duration. */
  p95_duration_ms: number | null;
  active_users: number;
}

/**
 * Distinct accounts, with the deleted ones folded into a single anonymous user.
 *
 * `user_id` goes null when an account is deleted and its turns are not, so a
 * plain `count(DISTINCT user_id)` drops them: the day still shows the spend
 * and reports nobody spending it, and every per-user figure divides a total
 * that includes those turns by a headcount that excludes them. One bucket for
 * all of them is the conservative reading — it cannot overstate the headcount,
 * which is the direction that would flatter the economics.
 */
const ACTIVE_USERS = `(
  count(DISTINCT user_id) + (count(*) FILTER (WHERE user_id IS NULL) > 0)::int
)::int`;

const TOTALS_SELECT = `
  count(*)::int                                      AS turns,
  count(*) FILTER (WHERE NOT ok)::int                AS failed_turns,
  COALESCE(sum(cost_usd), 0)::float8                 AS cost_usd,
  COALESCE(sum(input_tokens), 0)::bigint             AS input_tokens,
  COALESCE(sum(output_tokens), 0)::bigint            AS output_tokens,
  COALESCE(sum(cache_read_tokens), 0)::bigint        AS cache_read_tokens,
  COALESCE(sum(cache_write_tokens), 0)::bigint       AS cache_write_tokens,
  COALESCE(avg(cost_usd), 0)::float8                 AS avg_cost_usd,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_duration_ms,
  ${ACTIVE_USERS}                                     AS active_users
`;

export async function costTotals(days: number): Promise<CostTotals> {
  const row = await queryOne<TotalsRow>(
    `SELECT ${TOTALS_SELECT} FROM ai_usage WHERE occurred_at >= now() - ($1 || ' days')::interval`,
    [days],
  );
  return normaliseTotals(row!);
}

export interface CostByKind extends CostTotals {
  kind: string;
  model: string;
}

/**
 * The unit-economics table: one row per (kind, model). This is where the model
 * routing in `ai/client.ts` either pays for itself or does not — a photo turn
 * costing thirty times a text turn is fine at 3% of volume and fatal at 30%.
 */
export async function costByKind(days: number): Promise<CostByKind[]> {
  const rows = await query<TotalsRow & { kind: string; model: string }>(
    `SELECT kind, model, ${TOTALS_SELECT}
       FROM ai_usage
      WHERE occurred_at >= now() - ($1 || ' days')::interval
   GROUP BY kind, model
   ORDER BY sum(cost_usd) DESC`,
    [days],
  );
  return rows.map((row) => ({ ...normaliseTotals(row), kind: row.kind, model: row.model }));
}

export interface CostDay {
  date: string;
  turns: number;
  failed_turns: number;
  cost_usd: number;
  active_users: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

/**
 * Spend per calendar day, including the days nothing ran.
 *
 * The empty days are the point of the `generate_series`. Grouping the table
 * alone yields only the days that had a turn, and a chart drawn from that
 * spaces five scattered days evenly across a month — which reads as steady
 * daily usage of a product that was in fact touched five times. The zero rows
 * cost nothing and make the shape honest.
 *
 * The series starts at the window's own lower bound rather than a whole number
 * of days back, so the partial first day still has a bucket to land in and its
 * turns are not silently dropped from a total the header counts.
 */
export async function costByDay(days: number): Promise<CostDay[]> {
  const rows = await query<any>(
    `SELECT d.day::date::text                         AS date,
            COALESCE(u.turns, 0)                      AS turns,
            COALESCE(u.failed_turns, 0)               AS failed_turns,
            COALESCE(u.cost_usd, 0)::float8           AS cost_usd,
            COALESCE(u.active_users, 0)               AS active_users,
            COALESCE(u.input_tokens, 0)               AS input_tokens,
            COALESCE(u.output_tokens, 0)              AS output_tokens,
            COALESCE(u.cache_read_tokens, 0)          AS cache_read_tokens,
            COALESCE(u.cache_write_tokens, 0)         AS cache_write_tokens
       FROM generate_series(
              (now() - ($1 || ' days')::interval)::date,
              current_date,
              interval '1 day'
            ) AS d(day)
  LEFT JOIN (
         SELECT occurred_at::date                            AS day,
                count(*)::int                                AS turns,
                count(*) FILTER (WHERE NOT ok)::int          AS failed_turns,
                COALESCE(sum(cost_usd), 0)::float8           AS cost_usd,
                ${ACTIVE_USERS}                              AS active_users,
                COALESCE(sum(input_tokens), 0)::bigint       AS input_tokens,
                COALESCE(sum(output_tokens), 0)::bigint      AS output_tokens,
                COALESCE(sum(cache_read_tokens), 0)::bigint  AS cache_read_tokens,
                COALESCE(sum(cache_write_tokens), 0)::bigint AS cache_write_tokens
           FROM ai_usage
          WHERE occurred_at >= now() - ($1 || ' days')::interval
       GROUP BY 1
       ) u ON u.day = d.day::date
   ORDER BY 1`,
    [days],
  );
  return rows.map((row) => ({
    date: row.date,
    turns: row.turns,
    failed_turns: row.failed_turns,
    cost_usd: round6(row.cost_usd),
    active_users: row.active_users,
    input_tokens: Number(row.input_tokens),
    output_tokens: Number(row.output_tokens),
    cache_read_tokens: Number(row.cache_read_tokens),
    cache_write_tokens: Number(row.cache_write_tokens),
  }));
}

export interface CostByUser {
  user_id: string | null;
  email: string | null;
  turns: number;
  cost_usd: number;
  last_turn_at: string | null;
}

export async function costByUser(days: number, limit = 50): Promise<CostByUser[]> {
  const rows = await query<any>(
    `SELECT u.user_id, users.email,
            u.turns, u.cost_usd, u.last_turn_at
       FROM (
         SELECT user_id,
                count(*)::int                      AS turns,
                COALESCE(sum(cost_usd), 0)::float8 AS cost_usd,
                max(occurred_at)                   AS last_turn_at
           FROM ai_usage
          WHERE occurred_at >= now() - ($1 || ' days')::interval
       GROUP BY user_id
       ) u
  LEFT JOIN users ON users.id = u.user_id
   ORDER BY u.cost_usd DESC
      LIMIT $2`,
    [days, limit],
  );
  return rows.map((row) => ({
    user_id: row.user_id,
    email: row.email,
    turns: row.turns,
    cost_usd: round6(row.cost_usd),
    last_turn_at: row.last_turn_at ? new Date(row.last_turn_at).toISOString() : null,
  }));
}

/**
 * Cost per active user per month, and what that implies at scale.
 *
 * This is the number the whole feature exists to produce. It is deliberately
 * built from *observed* per-user daily spend rather than dividing the total by
 * the headcount: a fortnight where one account did all the logging would
 * otherwise report a per-user cost an order of magnitude too low.
 */
export interface Economics {
  window_days: number;
  /** Ran at least one turn. Deleted accounts count as one between them. */
  active_users: number;
  cost_usd: number;
  turns: number;
  cost_per_turn_usd: number;
  /** Mean spend per active user per 30 days, extrapolated from the window. */
  cost_per_user_month_usd: number;
  /** The heaviest user's spend, scaled the same way. Sizes the worst case. */
  heaviest_user_month_usd: number;
  turns_per_user_day: number;
  /** What the AI bill would be at these unit economics, at N users. */
  projection: Array<{ users: number; monthly_usd: number }>;
  /** Share of rows whose price nobody could establish. */
  unpriced_share: number;
}

const PROJECTION_TIERS = [100, 1_000, 10_000];

export async function economics(days: number): Promise<Economics> {
  const row = (await queryOne<{
    turns: number;
    cost_usd: number;
    active_users: number;
    heaviest_user_cost: number;
    unpriced: number;
  }>(
    `SELECT count(*)::int                              AS turns,
            COALESCE(sum(cost_usd), 0)::float8         AS cost_usd,
            ${ACTIVE_USERS}                            AS active_users,
            COALESCE(
              (SELECT max(per_user) FROM (
                 SELECT sum(cost_usd)::float8 AS per_user
                   FROM ai_usage
                  WHERE occurred_at >= now() - ($1 || ' days')::interval
               GROUP BY user_id
               ) heaviest), 0)::float8                 AS heaviest_user_cost,
            count(*) FILTER (WHERE cost_source = 'unknown')::int AS unpriced
       FROM ai_usage
      WHERE occurred_at >= now() - ($1 || ' days')::interval`,
    [days],
  ))!;

  // A window with no turns has no users either, and dividing by that would
  // turn an empty deployment into an infinite per-user cost.
  const users = Math.max(1, row.active_users);
  const scaleToMonth = 30 / days;
  const perUserMonth = round6((row.cost_usd / users) * scaleToMonth);

  return {
    window_days: days,
    active_users: row.active_users,
    cost_usd: round6(row.cost_usd),
    turns: row.turns,
    cost_per_turn_usd: round6(row.turns ? row.cost_usd / row.turns : 0),
    cost_per_user_month_usd: perUserMonth,
    heaviest_user_month_usd: round6(row.heaviest_user_cost * scaleToMonth),
    turns_per_user_day: round6(row.turns ? row.turns / users / days : 0),
    projection: PROJECTION_TIERS.map((n) => ({
      users: n,
      monthly_usd: round6(perUserMonth * n),
    })),
    unpriced_share: round6(row.turns ? row.unpriced / row.turns : 0),
  };
}

export interface UsageRow {
  id: string;
  user_id: string | null;
  email: string | null;
  occurred_at: string;
  provider: string;
  kind: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  cost_source: string;
  duration_ms: number | null;
  num_turns: number;
  ok: boolean;
  error: string | null;
  prompt: string | null;
}

/** The raw log, newest first. The panel's "show me the actual turns" view. */
export async function recentUsage(limit: number, userId?: string | null): Promise<UsageRow[]> {
  const rows = await query<any>(
    `SELECT a.*, users.email
       FROM ai_usage a
  LEFT JOIN users ON users.id = a.user_id
      WHERE ($2::uuid IS NULL OR a.user_id = $2)
   ORDER BY a.occurred_at DESC
      LIMIT $1`,
    [limit, userId ?? null],
  );
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    email: row.email,
    occurred_at: new Date(row.occurred_at).toISOString(),
    provider: row.provider,
    kind: row.kind,
    model: row.model,
    input_tokens: Number(row.input_tokens),
    output_tokens: Number(row.output_tokens),
    cache_read_tokens: Number(row.cache_read_tokens),
    cache_write_tokens: Number(row.cache_write_tokens),
    cost_usd: Number(row.cost_usd),
    cost_source: row.cost_source,
    duration_ms: row.duration_ms,
    num_turns: row.num_turns,
    ok: row.ok,
    error: row.error,
    prompt: row.prompt ?? null,
  }));
}

function normaliseTotals(row: TotalsRow): CostTotals {
  return {
    turns: row.turns,
    failed_turns: row.failed_turns,
    cost_usd: round6(row.cost_usd),
    // bigint comes back as a string from pg to preserve precision; these are
    // token counts, comfortably inside float range.
    input_tokens: Number(row.input_tokens),
    output_tokens: Number(row.output_tokens),
    cache_read_tokens: Number(row.cache_read_tokens),
    cache_write_tokens: Number(row.cache_write_tokens),
    avg_cost_usd: round6(row.avg_cost_usd),
    p95_duration_ms: row.p95_duration_ms,
    active_users: row.active_users,
  };
}
