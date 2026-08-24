import type { Nudge, NudgeKind, NudgeStats } from '@ct/shared';
import { QUALITY_COVERAGE_FLOOR } from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { addDays, type DayContext, localDateFor } from '../time.ts';
import { dailyIntake, estimateTdee } from './adaptive.ts';
import { dailyTotals } from './summary.ts';
import { qualityTargetsFor, targetsForDate } from './targets.ts';
import { unmeteredFor } from '../ai/lane.ts';
import { limitsFor } from './plans.ts';
import { getUser } from './user.ts';

/**
 * Deciding whether to speak first, and remembering that we did.
 *
 * The split here is the same one the weekly review makes and it is the whole
 * design: **the model decides how to word a nudge and never whether to send
 * one.** Everything in this file is arithmetic over the log. A model asked
 * "should I message this person?" will say yes, warmly and often, which is how
 * an app that meant to be helpful becomes the one you turn notifications off
 * for and then delete.
 *
 * The rate limits below are code rather than prompt guidance for exactly that
 * reason. Guidance is advice; a unique index is a fact.
 */

/** Local hour a nudge is published at. Evening — after dinner, before bed. */
export const NUDGE_HOUR = 18;

/** At most one, ever, in a rolling week. A coach that pings four times a week gets uninstalled. */
export const MIN_DAYS_BETWEEN_NUDGES = 7;

/**
 * And never in the day after the Monday review.
 *
 * The review is the one thing the app already sends unprompted, and it says
 * everything a nudge would in more detail. Two messages about the same week,
 * a day apart, reads as an app that has lost track of itself.
 */
export const QUIET_DAYS_AFTER_REVIEW = 1;

/** Nothing logged for this many days is worth mentioning. */
export const DORMANT_AFTER_DAYS = 3;

/**
 * And past this it stops being a lapse and starts being a decision.
 *
 * Somebody three weeks gone has left, and a weekly "we miss you" is the exact
 * behaviour that makes leaving feel like a good idea in retrospect. The app
 * says something once or twice and then lets them be.
 */
export const DORMANT_UNTIL_DAYS = 14;

/** Before this much history, a gap is not a change in behaviour. */
const MIN_PRIOR_LOGGED_DAYS = 5;

/** Weekly weight movement smaller than this, against a goal of losing, is flat. */
const STALLED_KG_PER_WEEK = 0.15;

const WINDOW_DAYS = 7;

/**
 * The order they are checked in, most urgent first, and only ever one fires.
 *
 * Someone who has not logged for four days does not need to hear about their
 * fiber. The ordering is "can they act on it at all" — logging comes before the
 * scale, the scale before a macro, a macro before a nutrient.
 */
const PRECEDENCE: NudgeKind[] = ['dormant', 'stalled', 'protein_short', 'quality_short'];

export interface NudgeTrigger {
  kind: NudgeKind;
  stats: NudgeStats;
}

/**
 * The one nudge this user is due, or null.
 *
 * Reads the log and nothing else — no model, no state beyond the `nudges`
 * table. Every branch returns null by default, which is the right bias: the
 * cost of a missed nudge is nothing and the cost of an unwanted one is an
 * uninstall.
 */
export async function dueNudge(
  userId: string,
  ctx: DayContext,
  today = localDateFor(new Date(), ctx),
): Promise<NudgeTrigger | null> {
  const user = await getUser(userId);
  // Cheapest question first, and the one that answers for most people on most
  // days: the rate limit needs two indexed lookups, and everything below it is
  // a week of the log.
  const perWeek = limitsFor(user.plan, unmeteredFor(user.email)).nudgesPerWeek;
  if (!(await withinRateLimit(userId, today, perWeek))) return null;

  const from = addDays(today, -WINDOW_DAYS);
  const to = addDays(today, -1);

  const [targets, intake, totals, lastLogged] = await Promise.all([
    targetsForDate(userId, to),
    dailyIntake(userId, from, to),
    dailyTotals(userId, from, to),
    lastLoggedDate(userId),
  ]);

  const quality = qualityTargetsFor(targets.kcal);
  const base: NudgeStats = {
    kind: 'dormant',
    days_since_logged: lastLogged === null ? null : daysBetween(lastLogged, today),
    days_logged: intake.length,
    mean_kcal: mean(intake.map((d) => d.kcal)),
    target_kcal: targets.kcal,
    mean_protein_g: mean(intake.map((d) => d.protein_g)),
    target_protein_g: targets.protein_g,
    weight_change_kg_per_week: null,
    mean_fiber_g: null,
    target_fiber_g: quality.fiber_g.value,
  };

  for (const kind of PRECEDENCE) {
    switch (kind) {
      case 'dormant': {
        const gap = base.days_since_logged;
        if (gap === null || gap < DORMANT_AFTER_DAYS || gap > DORMANT_UNTIL_DAYS) break;
        // A gap only means something against a habit. Someone who logged twice
        // ever has not lapsed; they have not started, and that is a different
        // message this feature is not the place for.
        const prior = await loggedDaysBefore(userId, lastLogged!, 14);
        if (prior < MIN_PRIOR_LOGGED_DAYS) break;
        return { kind, stats: { ...base, kind } };
      }

      case 'stalled': {
        if (user.goal !== 'lose') break;
        // Needs the fortnight the adaptive pass needs, and for the same reason:
        // below that a flat week is water, not a plateau.
        const { estimate } = await estimateTdee(userId, ctx, 14, today);
        if (!estimate) break;
        if (Math.abs(estimate.weight_change_kg_per_week) > STALLED_KG_PER_WEEK) break;
        return {
          kind,
          stats: {
            ...base,
            kind,
            weight_change_kg_per_week: estimate.weight_change_kg_per_week,
          },
        };
      }

      case 'protein_short': {
        // Every logged day of a fully logged week. Anything looser and this
        // fires on a week that had one big day and six gaps.
        if (intake.length < WINDOW_DAYS) break;
        if (!intake.every((d) => d.protein_g < targets.protein_g)) break;
        return { kind, stats: { ...base, kind } };
      }

      case 'quality_short': {
        const measured = totals.filter(
          (d) => d.fiber_g !== null && d.coverage >= QUALITY_COVERAGE_FLOOR,
        );
        // A partly-measured week cannot say anything about fiber, and saying it
        // anyway would be telling someone off for what the app failed to
        // estimate.
        if (measured.length < WINDOW_DAYS) break;
        if (!measured.every((d) => d.fiber_g! < quality.fiber_g.value)) break;
        return {
          kind,
          stats: {
            ...base,
            kind,
            mean_fiber_g: mean(measured.map((d) => d.fiber_g!)),
          },
        };
      }
    }
  }

  return null;
}

/**
 * The hard limits, in code.
 *
 * Deliberately not prompt guidance and deliberately not a scheduler detail:
 * this is the rule that decides whether the feature is welcome, and it belongs
 * somewhere a future caller cannot route around by accident.
 */
async function withinRateLimit(
  userId: string,
  today: string,
  allowancePerWeek: number,
): Promise<boolean> {
  if (allowancePerWeek < 1) return false;

  const recent = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM nudges
      WHERE user_id = $1 AND local_date > $2`,
    [userId, addDays(today, -MIN_DAYS_BETWEEN_NUDGES)],
  );
  if (Number(recent?.n ?? 0) >= allowancePerWeek) return false;

  const review = await queryOne<{ created_at: string }>(
    `SELECT created_at FROM weekly_reviews
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (review) {
    const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(review.created_at)) / 86_400_000;
    if (days <= QUIET_DAYS_AFTER_REVIEW) return false;
  }

  return true;
}

async function lastLoggedDate(userId: string): Promise<string | null> {
  const row = await queryOne<{ local_date: string }>(
    'SELECT max(local_date) AS local_date FROM food_entries WHERE user_id = $1',
    [userId],
  );
  return row?.local_date ? String(row.local_date).slice(0, 10) : null;
}

/** How many of the `days` before `date` carried a log. The habit a gap is measured against. */
async function loggedDaysBefore(userId: string, date: string, days: number): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(DISTINCT local_date) AS n FROM food_entries
      WHERE user_id = $1 AND local_date BETWEEN $2 AND $3`,
    [userId, addDays(date, -days), date],
  );
  return Number(row?.n ?? 0);
}

// ---- Persistence -----------------------------------------------------------

/**
 * Writes the record of having spoken.
 *
 * `ON CONFLICT DO NOTHING` rather than an upsert: a nudge already sent today is
 * sent, and rewriting its wording would change what is in somebody's inbox
 * relative to what is in their journal. A null return means "somebody else got
 * there first", and the caller treats that as success.
 */
export async function saveNudge(
  userId: string,
  kind: NudgeKind,
  localDate: string,
  content: string,
  messageId: string | null,
): Promise<Nudge | null> {
  const row = await queryOne<any>(
    `INSERT INTO nudges (user_id, kind, local_date, content, message_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, kind, local_date) DO NOTHING
     RETURNING *`,
    [userId, kind, localDate, content, messageId],
  );
  return row ? toNudge(row) : null;
}

export async function nudgeFor(
  userId: string,
  kind: NudgeKind,
  localDate: string,
): Promise<Nudge | null> {
  const row = await queryOne<any>(
    'SELECT * FROM nudges WHERE user_id = $1 AND kind = $2 AND local_date = $3',
    [userId, kind, localDate],
  );
  return row ? toNudge(row) : null;
}

export async function listNudges(userId: string, limit = 10): Promise<Nudge[]> {
  const rows = await query<any>(
    'SELECT * FROM nudges WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, Math.min(limit, 50)],
  );
  return rows.map(toNudge);
}

function toNudge(row: any): Nudge {
  return {
    id: row.id,
    kind: row.kind,
    local_date: String(row.local_date).slice(0, 10),
    content: row.content,
    message_id: row.message_id,
    created_at: new Date(row.created_at).toISOString(),
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
