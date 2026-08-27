import type { Achievement, AchievementKey } from '@ct/shared';
import { ACHIEVEMENT_KEYS } from '@ct/shared';
import { query } from '../db.ts';
import { type LogHistory, streaksOf } from './streaks.ts';

/**
 * Working out which badges somebody has earned, and writing down the new ones.
 *
 * **Where this runs is the design.** Not a scheduler pass — a badge that appears
 * at 20:00 for a thing done at lunchtime is a badge nobody connects to what they
 * did. Not a hook on the log write either, which would put a scan on the
 * latency path of the one action the whole app is built around. It runs on the
 * day-summary read for today, which every log already round-trips through
 * (`ChatResponse.day`), so the badge lands in the same response as the meal that
 * earned it and costs nothing anybody waits for.
 *
 * **Two guards keep it nearly free.** It is skipped entirely unless the day
 * being read is the reader's today, and it short-circuits on one indexed read
 * once all fourteen are held — which is the steady state for anybody who has
 * been here a while, and the only case that would otherwise run forever.
 *
 * **Nothing is ever revoked.** There is no update path and no delete path here,
 * and `achievements_once` means a key can only be written once. Deleting an
 * entry from March may move the derived `best` beside the badge; it does not
 * take the badge back.
 */

/**
 * What each badge is earned by.
 *
 * Read against `best` rather than the current run for the two ladders, because a
 * badge is a claim about what somebody has ever done. Losing a streak at 40 does
 * not un-earn the thirty; that is the whole bargain §4 of STREAKS.md strikes to
 * justify keeping the run strict.
 *
 * Every threshold here is about *having logged*, and none is about what was
 * logged. There is nothing for days under target, nothing for weight lost, and
 * nothing for a "perfect week" — see STREAKS.md §1. A badge is a small prize but
 * it is the same shape of prize as a pot of money, and the cheapest way to win
 * one keyed on a calorie ceiling is to stop logging the biscuit.
 */
interface Facts {
  /** Longest run of consecutive logged days, ever. */
  loggingBest: number;
  /** Longest run of consecutive qualifying training weeks, ever. */
  trainingBest: number;
  /** Distinct days with food logged. */
  loggedDays: number;
  /** Distinct days trained. One gym visit is one, however many entries it took. */
  trainingDays: number;
  hasPhoto: boolean;
  hasBarcode: boolean;
  hasWorkout: boolean;
  hasWeighIn: boolean;
}

const EARNED_BY: Record<AchievementKey, (f: Facts) => boolean> = {
  streak_7: (f) => f.loggingBest >= 7,
  streak_30: (f) => f.loggingBest >= 30,
  streak_100: (f) => f.loggingBest >= 100,
  streak_365: (f) => f.loggingBest >= 365,

  exercise_weeks_4: (f) => f.trainingBest >= 4,
  exercise_weeks_12: (f) => f.trainingBest >= 12,
  exercise_weeks_52: (f) => f.trainingBest >= 52,

  first_photo: (f) => f.hasPhoto,
  first_barcode: (f) => f.hasBarcode,
  first_workout: (f) => f.hasWorkout,
  first_weigh_in: (f) => f.hasWeighIn,

  days_100: (f) => f.loggedDays >= 100,
  days_365: (f) => f.loggedDays >= 365,
  // Days, not entries: somebody who logs bench, squat and deadlift separately
  // has one workout, and "a hundred workouts" should mean a hundred of them.
  workouts_100: (f) => f.trainingDays >= 100,
};

/** The four "have you ever" flags, in one statement rather than four. */
async function breadthFacts(userId: string) {
  const rows = await query<{
    has_photo: boolean;
    has_barcode: boolean;
    has_workout: boolean;
    has_weigh_in: boolean;
  }>(
    `SELECT EXISTS (SELECT 1 FROM food_entries     WHERE user_id = $1 AND source = 'photo')   AS has_photo,
            EXISTS (SELECT 1 FROM food_entries     WHERE user_id = $1 AND source = 'barcode') AS has_barcode,
            EXISTS (SELECT 1 FROM exercise_entries WHERE user_id = $1)                        AS has_workout,
            EXISTS (SELECT 1 FROM weight_entries   WHERE user_id = $1)                        AS has_weigh_in`,
    [userId],
  );
  return rows[0] ?? {
    has_photo: false,
    has_barcode: false,
    has_workout: false,
    has_weigh_in: false,
  };
}

/**
 * Evaluates the set and writes down whatever is newly true.
 *
 * Returns only the badges this call earned, so a client can celebrate them once.
 * A celebration missed to a crash costs nothing — the badge is in the grid
 * either way, which is why this is not worth an acknowledgement protocol.
 */
export async function evaluateAchievements(
  userId: string,
  history: LogHistory,
  today: string,
): Promise<Achievement[]> {
  const held = new Set((await heldKeys(userId)).map(String));
  const missing = ACHIEVEMENT_KEYS.filter((key) => !held.has(key));
  // The steady state for anybody who has been here a while, and the only reason
  // this is cheap enough to run on an ordinary read.
  if (missing.length === 0) return [];

  const streaks = streaksOf(history, today);
  const facts: Facts = {
    loggingBest: streaks.logging.best,
    trainingBest: streaks.training.best,
    loggedDays: history.logged.length,
    trainingDays: history.trained.length,
    ...toBreadth(await breadthFacts(userId)),
  };

  const deserved = missing.filter((key) => EARNED_BY[key](facts));
  if (deserved.length === 0) return [];

  const rows = await query<AchievementRow>(
    `INSERT INTO achievements (user_id, key, local_date)
     SELECT $1, key, $3::date FROM unnest($2::text[]) AS key
     ON CONFLICT (user_id, key) DO NOTHING
     RETURNING key, local_date, earned_at`,
    [userId, deserved, today],
  );
  return rows.map(toAchievement);
}

export async function listAchievements(userId: string): Promise<Achievement[]> {
  const rows = await query<AchievementRow>(
    'SELECT key, local_date, earned_at FROM achievements WHERE user_id = $1 ORDER BY earned_at',
    [userId],
  );
  return rows.map(toAchievement);
}

async function heldKeys(userId: string): Promise<string[]> {
  const rows = await query<{ key: string }>('SELECT key FROM achievements WHERE user_id = $1', [
    userId,
  ]);
  return rows.map((row) => row.key);
}

interface AchievementRow {
  key: string;
  local_date: string;
  earned_at: string | Date;
}

function toBreadth(row: {
  has_photo: boolean;
  has_barcode: boolean;
  has_workout: boolean;
  has_weigh_in: boolean;
}) {
  return {
    hasPhoto: row.has_photo,
    hasBarcode: row.has_barcode,
    hasWorkout: row.has_workout,
    hasWeighIn: row.has_weigh_in,
  };
}

function toAchievement(row: AchievementRow): Achievement {
  return {
    key: row.key as AchievementKey,
    local_date: String(row.local_date).slice(0, 10),
    earned_at: new Date(row.earned_at).toISOString(),
  };
}
