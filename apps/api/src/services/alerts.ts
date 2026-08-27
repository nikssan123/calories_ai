import type { Alert, AlertKind, Locale, PlanName, UnitSystem } from '@ct/shared';
import { formatBodyWeight, formatNumber } from '@ct/shared';
import { emailMessages } from '../email/messages.ts';
import { query, queryOne } from '../db.ts';
import { addDays } from '../time.ts';
import { withinInterruptionBudget } from './interruptions.ts';
import { loggingStreak } from './streaks.ts';
import { dailyTotals } from './summary.ts';
import { targetsForDate } from './targets.ts';

/**
 * The things worth saying that nobody has to write.
 *
 * `nudges.ts` splits deciding from wording and gives the wording to a model.
 * This file makes the same split and then declines the second half, because for
 * these four there is nothing to decide about the wording: a hundred logged
 * days in a row is a sentence before anyone writes it. Handing it to a model
 * would buy latency, a metered turn, and the small chance of it saying
 * something other than what happened.
 *
 * That is what makes these the first thing the app says to a free account. The
 * review and the nudge are inference and are therefore sold; arithmetic is not,
 * so `plans.ts` is not consulted anywhere below.
 *
 * Three rules hold everything here together.
 *
 * **The clock is the caller's.** Every check takes the reader's local hour
 * rather than reading a clock, so the scheduler stays the only thing that knows
 * what time it is anywhere — the same division `isNudgeTime` already makes.
 *
 * **Preferences are decided here, not at the sender.** That inverts what
 * `push/notify.ts` does for reviews and nudges, and the reason is the row: an
 * alert is the *record of having spoken*, and two of these kinds spend a
 * frequency budget shared with nudges when they are written. A row written for
 * somebody who was never going to be told would quietly cost them their week's
 * one message. So nothing that will not be sent is ever written down.
 *
 * **One per pass.** Several can come due in the same evening, and a phone that
 * buzzes three times in a minute has said less than one that buzzes once.
 * `PRECEDENCE` picks; the rest keep, because every window below is "from this
 * hour onward" and the next tick is an hour away.
 */

/**
 * Local hours these go out at, and they are staggered on purpose.
 *
 * The account warning is a daytime thing — it asks somebody to go and renew a
 * subscription, which is not a 21:00 request. The celebrations sit at 20:00,
 * after the last meal is logged and while the day is still worth talking about.
 * The recap is last because it is a summary of a day, and 21:00 is the earliest
 * hour that claim is honest.
 */
export const ACCOUNT_HOUR = 10;
export const MILESTONE_HOUR = 20;
export const RECAP_HOUR = 21;

/**
 * The streaks worth a word, and the list is short for the usual reason.
 *
 * Every entry is one interruption in somebody's life, so the gaps widen as the
 * numbers do: a fortnight matters when a week just did, and the difference
 * between day 201 and day 202 does not.
 */
export const STREAK_MILESTONES = [7, 14, 30, 60, 100, 200, 365] as const;

/**
 * How stale a weigh-in may be and still be news.
 *
 * Without this, the day the feature ships, everybody who reached their goal at
 * any point in the past and then stopped weighing gets told they are there —
 * about a number from last spring. A fortnight is the same window the adaptive
 * pass treats as current.
 */
const GOAL_WEIGH_IN_WINDOW_DAYS = 14;

/** How far ahead a lapsing subscription is worth mentioning. */
export const EXPIRY_WARNING_DAYS = 3;

/** Calories either side of target that count as having hit it. */
const RECAP_ON_TARGET_KCAL = 50;

export interface AlertPrefs {
  units: UnitSystem;
  /**
   * Which language the phone is read in.
   *
   * The `alerts` row stores rendered prose rather than its inputs, which is
   * right for the reason 037 gives — the wording is a format string over
   * numbers that keep moving, so a row holding only inputs would render
   * tomorrow's sentence when asked what yesterday's said. What it got wrong was
   * assuming one language: every title and body below was an English literal,
   * so a phone set to Bulgarian got a Bulgarian badge wall and an English push
   * about the same streak.
   *
   * Rendering at write time keeps the row honest and picks the language once.
   * Somebody who switches language keeps the sentences they were actually sent,
   * which is what a record of having spoken should say.
   */
  locale: Locale;
  notifyMilestones: boolean;
  notifyDailyRecap: boolean;
}

/** An alert that has come due but has not been written down yet. */
export interface DueAlert {
  kind: AlertKind;
  subject: string;
  title: string;
  body: string;
}

/**
 * The one alert this person is due, or null.
 *
 * Reads the log, the scale and the subscription, and nothing else. Every branch
 * defaults to null, which is the same bias `dueNudge` takes and for the same
 * reason: a missed one costs nothing and an unwanted one costs the app.
 */
export async function dueAlert({
  userId,
  prefs,
  now,
  hour,
  today,
}: {
  userId: string;
  prefs: AlertPrefs;
  now: Date;
  /** The reader's own local hour, 0-23. */
  hour: number;
  /** The reader's own local date. */
  today: string;
}): Promise<DueAlert | null> {
  /*
   * In order of what the reader can still act on, and the first one that is due
   * wins the pass. A subscription lapsing on Thursday needs a decision today; a
   * goal reached should be heard on the day it happened; a streak keeps
   * perfectly well until tomorrow evening; and tonight's numbers are the one
   * thing on this list they could have had by opening the app.
   */
  if (hour >= ACCOUNT_HOUR) {
    const expiring = await dueExpiry(userId, now, prefs.locale);
    if (expiring) return expiring;
  }

  /*
   * The two celebrations share a gate, because they share a budget with the
   * nudge and with each other. It is asked before either is computed rather
   * than after: the budget is two indexed lookups and these are a scan of the
   * log and of the scale.
   */
  if (prefs.notifyMilestones && hour >= MILESTONE_HOUR) {
    if (await withinInterruptionBudget(userId, today, 1)) {
      const goal = await dueGoalReached(userId, prefs, today);
      if (goal) return goal;

      const streak = await dueStreak(userId, today, prefs.locale);
      if (streak) return streak;
    }
  }

  if (prefs.notifyDailyRecap && hour >= RECAP_HOUR) {
    const recap = await dueRecap(userId, today, prefs.locale);
    if (recap) return recap;
  }

  return null;
}

// ---- The four checks -------------------------------------------------------

/**
 * A paid plan about to lapse with nothing renewing it.
 *
 * `plan_source = 'manual'` is excluded for the reason `expirePlans` excludes it:
 * that is what a comped, staff or granted account carries, and those have no
 * expiry to be warned about.
 *
 * Keyed on the expiry instant rather than the date it is sent, so a renewal
 * that moves the date earns a fresh warning next time and an unchanged one is
 * only ever mentioned once.
 */
async function dueExpiry(userId: string, now: Date, locale: Locale): Promise<DueAlert | null> {
  const m = emailMessages(locale);
  const row = await queryOne<{ plan: PlanName; plan_expires_at: string | null }>(
    `SELECT plan, plan_expires_at FROM users
      WHERE id = $1 AND plan <> 'free' AND plan_source <> 'manual' AND plan_expires_at IS NOT NULL`,
    [userId],
  );
  if (!row?.plan_expires_at) return null;

  const expiresAt = Date.parse(row.plan_expires_at);
  const days = Math.ceil((expiresAt - now.getTime()) / 86_400_000);
  // Already gone is `expirePlans`' business, not a warning's — by the next tick
  // the account is on free and there is nothing to renew in time.
  if (days < 0 || days > EXPIRY_WARNING_DAYS) return null;

  const when =
    days <= 0
      ? m['alert.expiryToday']
      : days === 1
        ? m['alert.expiryTomorrow']
        : m['alert.expiryInDays'](days);
  return {
    kind: 'plan_expiring',
    subject: new Date(expiresAt).toISOString(),
    // The plan name itself does not translate: "Coach" is what the tier is
    // called on the pricing page in every language.
    title: m['alert.planEnds'](planLabel(row.plan), when),
    body: m['alert.planBody'],
  };
}

/**
 * The scale reaching the number somebody wrote down.
 *
 * In the direction the goal points, which is the whole test: a goal of losing
 * is met from above and a goal of gaining from below, and reading it as
 * "within a kilo either way" would congratulate somebody on their way past it.
 * A goal of maintaining has no crossing to detect and is left alone.
 */
async function dueGoalReached(
  userId: string,
  prefs: AlertPrefs,
  today: string,
): Promise<DueAlert | null> {
  const m = emailMessages(prefs.locale);
  const row = await queryOne<{
    goal: string;
    target_weight_kg: number | null;
    latest_kg: number | null;
    latest_date: string | null;
  }>(
    `SELECT u.goal, u.target_weight_kg, w.weight_kg AS latest_kg, w.local_date AS latest_date
       FROM users u
       LEFT JOIN LATERAL (
         SELECT weight_kg, local_date FROM weight_entries
          WHERE user_id = u.id ORDER BY local_date DESC LIMIT 1
       ) w ON TRUE
      WHERE u.id = $1`,
    [userId],
  );

  const target = row?.target_weight_kg ?? null;
  const latest = row?.latest_kg ?? null;
  if (target === null || latest === null || !row?.latest_date) return null;
  if (row.latest_date < addDays(today, -GOAL_WEIGH_IN_WINDOW_DAYS)) return null;

  const reached =
    row.goal === 'lose' ? latest <= target : row.goal === 'gain' ? latest >= target : false;
  if (!reached) return null;

  return {
    kind: 'goal_reached',
    // The target, not the reading. Somebody who reaches 78 kg, drifts up and
    // comes back has not achieved a second thing; somebody who then sets 75 has.
    subject: `${row.goal}:${target.toFixed(1)}`,
    title: m['alert.goalTitle'],
    body: m['alert.goalBody'](formatBodyWeight(latest, prefs.units)),
  };
}

/**
 * Consecutive logged days, and whether this run has passed a round number.
 *
 * The streak has to run up to today. A run that ended on Tuesday is not a
 * streak, it is history, and congratulating it on Friday would be telling
 * somebody they are doing something they have stopped doing.
 */
async function dueStreak(userId: string, today: string, locale: Locale): Promise<DueAlert | null> {
  const run = await loggingStreak(userId, today);
  // `alive` rather than "not none", and the distinction is the whole of the
  // paragraph above. A run in the `at_risk` state is one that ended yesterday
  // and has nothing in it today — intact enough for a screen to draw and
  // encourage, and not something to congratulate at 20:00.
  if (run.state !== 'alive' || !run.start) return null;

  // The largest milestone the run has passed, rather than an exact match on
  // today's count. An exact test would silently skip the whole thing if the
  // 20:00 tick were missed on the one evening it mattered.
  const reached = [...STREAK_MILESTONES].reverse().find((days) => run.current >= days);
  if (reached === undefined) return null;

  const m = emailMessages(locale);
  return {
    kind: 'streak',
    // The run's first day, so that a streak broken and rebuilt is a new subject
    // and can be celebrated again — while this one cannot be celebrated twice.
    subject: `${run.start}:${reached}`,
    // Indexed rather than keyed, because the titles are bespoke per milestone
    // and a record of seven numbers would not survive the catalogue's type
    // derivation. Parallel arrays, and the test below pins their lengths.
    title: m['alert.streakTitles'][STREAK_MILESTONES.indexOf(reached)] ?? '',
    body: m['alert.streakBody'](reached),
  };
}

/**
 * Tonight, in one line.
 *
 * Only for a day that has something in it. A recap of a day nobody logged is
 * the app telling somebody off for not using it, which is not what they asked
 * for when they turned this on.
 */
async function dueRecap(userId: string, today: string, locale: Locale): Promise<DueAlert | null> {
  const m = emailMessages(locale);
  const [totals, targets] = await Promise.all([
    dailyTotals(userId, today, today),
    targetsForDate(userId, today),
  ]);

  const day = totals[0];
  if (!day || day.kcal <= 0) return null;

  const kcal = Math.round(day.kcal);
  const protein = Math.round(day.protein_g);
  const delta = kcal - targets.kcal;
  // Through `formatNumber` rather than `toLocaleString('en-US')`: the separator
  // is the reader's, so 1,840 in English is 1 840 in Bulgarian.
  const num = (value: number) => formatNumber(value, locale);
  const line =
    Math.abs(delta) <= RECAP_ON_TARGET_KCAL
      ? m['alert.recapOnTarget']
      : delta < 0
        ? m['alert.recapUnder'](num(-delta))
        : m['alert.recapOver'](num(delta));

  return {
    kind: 'daily_recap',
    subject: today,
    title: m['alert.recapTitle'](num(kcal), num(targets.kcal)),
    body: `${line} ${m['alert.recapProtein'](num(protein), num(Math.round(targets.protein_g)))}`,
  };
}

// ---- The arithmetic --------------------------------------------------------

function planLabel(plan: PlanName): string {
  return plan === 'coach' ? 'Coach' : plan === 'plus' ? 'Plus' : 'free';
}

// ---- Persistence -----------------------------------------------------------

/**
 * Writes the record of having spoken, or returns null because somebody else
 * already did.
 *
 * Written *before* the send rather than after, which is the opposite of what it
 * looks like it should be. The failure that matters is not "written but never
 * arrived" — that costs one missed sentence. It is "sent twice", which is two
 * replicas both passing the same due check and both making a phone buzz. Only
 * the index can settle that, so the index goes first and the loser stays quiet.
 */
export async function saveAlert(userId: string, due: DueAlert, localDate: string): Promise<Alert | null> {
  const row = await queryOne<any>(
    `INSERT INTO alerts (user_id, kind, subject, local_date, title, body)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, kind, subject) DO NOTHING
     RETURNING *`,
    [userId, due.kind, due.subject, localDate, due.title, due.body],
  );
  return row ? toAlert(row) : null;
}

export async function listAlerts(userId: string, limit = 10): Promise<Alert[]> {
  const rows = await query<any>(
    'SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, Math.min(limit, 50)],
  );
  return rows.map(toAlert);
}

function toAlert(row: any): Alert {
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    local_date: String(row.local_date).slice(0, 10),
    title: row.title,
    body: row.body,
    created_at: new Date(row.created_at).toISOString(),
  };
}
