import type { Streak, Streaks } from '@ct/shared';
import { streakFrom, weekStreakFrom } from '@ct/shared';
import { query } from '../db.ts';

/**
 * The two runs, read from the log rather than counted in a column.
 *
 * This file is two SQL statements and no arithmetic. The walk lives in
 * `shared/day.ts` for the reason that file states about itself: an offline phone
 * adds up a day from its cache plus its outbox and cannot ask the server, and
 * two implementations of the same arithmetic disagree eventually. A streak that
 * jumps the moment the network returns is one nobody believes again.
 *
 * **Nothing here is stored, and that is deliberate.** The obvious design is a
 * counter on `users`, incremented on log. It is wrong for this app specifically:
 * the outbox replays meals logged with no signal, carrying their original
 * `eaten_at` and therefore their original `local_date`, so a counter would be
 * wrong from the moment the phone lost signal until the moment it synced — and
 * would need a repair path nobody would remember to run. Deriving gives the
 * right behaviour for free: **a late entry retroactively repairs the run it
 * filled in.**
 *
 * The cost is one index-only scan per read, against `food_entries_day` and
 * `exercise_entries_day`. Three years of daily logging is about eleven hundred
 * rows. This is not the query to optimise before it has been measured.
 */

/**
 * Every day this person has logged food, ever.
 *
 * No window, unlike the 400-day horizon this replaces in `alerts.ts`. That
 * bound existed to cap a scan whose answer was a single current run; `best` is a
 * claim about the whole history, and a window would silently retire somebody's
 * best year the moment it slid out of view.
 */
async function loggedDates(userId: string): Promise<string[]> {
  const rows = await query<{ local_date: string }>(
    'SELECT DISTINCT local_date FROM food_entries WHERE user_id = $1 ORDER BY local_date',
    [userId],
  );
  return rows.map((row) => row.local_date);
}

/** Every day with a session on it. Distinct dates, so how finely somebody logs
 * a workout cannot change the answer — see `weekStreakFrom`. */
async function trainedDates(userId: string): Promise<string[]> {
  const rows = await query<{ local_date: string }>(
    'SELECT DISTINCT local_date FROM exercise_entries WHERE user_id = $1 ORDER BY local_date',
    [userId],
  );
  return rows.map((row) => row.local_date);
}

/**
 * Every day this person has put anything in the log, in both senses of it.
 *
 * Fetched as one thing and passed around rather than re-read, because the badge
 * pass wants exactly the same two lists: `days_100` is `logged.length` and
 * `workouts_100` is `trained.length`, so a separate `count(DISTINCT ...)` for
 * each would be two more scans of the rows already in hand.
 */
export interface LogHistory {
  /** Distinct days with food logged, oldest first. */
  logged: string[];
  /** Distinct days with a session on them, oldest first. */
  trained: string[];
}

export async function logHistory(userId: string): Promise<LogHistory> {
  const [logged, trained] = await Promise.all([loggedDates(userId), trainedDates(userId)]);
  return { logged, trained };
}

/** Both runs, from history already in hand. Pure. */
export function streaksOf(history: LogHistory, today: string): Streaks {
  return {
    logging: streakFrom(history.logged, today),
    training: weekStreakFrom(history.trained, today),
  };
}

export async function streaksFor(userId: string, today: string): Promise<Streaks> {
  return streaksOf(await logHistory(userId), today);
}

/** Consecutive logged days, ending today or — while today is still empty — yesterday. */
export async function loggingStreak(userId: string, today: string): Promise<Streak> {
  return streakFrom(await loggedDates(userId), today);
}
