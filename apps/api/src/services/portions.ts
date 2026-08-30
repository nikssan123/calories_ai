import { query } from '../db.ts';
import { addDays, type DayContext, localDateFor } from '../time.ts';

/**
 * How much of a thing this person actually eats.
 *
 * The measurement in `PHOTO_ESTIMATION_PROMPT` decomposed the photo error and
 * found the whole of it in one place: calorie density came out at 1.00x of
 * truth and weight at 1.36x. The model knows what a gram of rice costs. It does
 * not know how many grams this person puts on a plate, and it reads high.
 *
 * That is not a question a food catalogue can answer, because it is not a
 * question about food. It is a question about a household — whose bowl of rice
 * is 180g and whose is 320g — and the only place the answer exists is in what
 * they have already logged and already corrected. A number this app arrived at
 * with them, once, and then had to guess again from scratch every time since.
 *
 * So: the median grams they have settled on per food, over their own history.
 * `dayContextPrompt` carries a dozen of them on every turn for the same reason
 * it carries their saved workout names — a handful of short lines costs a few
 * dozen tokens, and the round trip it saves is the model asking a tool what a
 * normal portion is for somebody it has already been told about.
 */

export interface UsualPortion {
  /** The food, spelled the most recent way they spelled it. */
  name: string;
  /** The median grams across every time they logged it. */
  grams: number;
  /** The median energy density they settled on — their milk, not milk. */
  kcal_100g: number;
  /** How many logged items this was drawn from. */
  times: number;
}

export interface UsualPortionOptions {
  /** How far back to look. Ninety days is a season of eating. */
  daysBack?: number;
  /**
   * How many separate logs a food needs before it counts as a habit.
   *
   * Two, and the floor matters more than it looks. One log is not a portion
   * they settled on, it is the single estimate a model once made — handing that
   * back on every future turn would launder a guess into a fact about them and
   * then anchor every later guess to it.
   */
  minTimes?: number;
  limit?: number;
}

/**
 * The foods they log often enough for their own number to beat a default.
 *
 * Median rather than mean, and that is the load-bearing choice: one holiday
 * dinner or one mistyped 1500g should not move what "their usual rice" means.
 * The median is also what makes a correction count properly — a portion they
 * fixed by hand is one honest observation among several, not an outlier to be
 * averaged away.
 *
 * Items with no weight on them are skipped entirely rather than counted as
 * zero. "A black coffee" is logged with a null `quantity_g` on purpose, and a
 * food whose portions are mostly null has no gram figure to be sure of.
 */
export async function usualPortions(
  userId: string,
  ctx: DayContext,
  options: UsualPortionOptions = {},
  today = localDateFor(new Date(), ctx),
): Promise<UsualPortion[]> {
  const from = addDays(today, -(options.daysBack ?? 90));
  const minTimes = Math.max(options.minTimes ?? 2, 2);
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);

  const rows = await query<{
    name: string;
    grams: string;
    kcal_100g: string;
    times: string;
  }>(
    `WITH logged AS (
       SELECT i.name,
              -- Case and stray spacing are spelling, not identity: "Rice" on
              -- Monday and "rice" on Tuesday are the same food and have to land
              -- in the same bucket or neither reaches the threshold below.
              lower(btrim(regexp_replace(i.name, '\\s+', ' ', 'g'))) AS key,
              i.quantity_g::numeric                                  AS grams,
              i.kcal::numeric                                        AS kcal,
              e.eaten_at
         FROM food_items i
         JOIN food_entries e ON e.id = i.entry_id
        WHERE e.user_id = $1
          AND e.local_date >= $2
          AND i.quantity_g IS NOT NULL
          AND i.quantity_g > 0
     )
     -- The most recent spelling, tidied the same way the key was. Grouping on
     -- a normalised key and then displaying a raw one puts "greek yoghurt "
     -- into a prompt line with its trailing space still on it.
     SELECT btrim(regexp_replace((array_agg(name ORDER BY eaten_at DESC))[1], '\s+', ' ', 'g')) AS name,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY grams)                AS grams,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY kcal / grams * 100)   AS kcal_100g,
            count(*)                                                          AS times
       FROM logged
      GROUP BY key
     HAVING count(*) >= $3
      ORDER BY count(*) DESC, max(eaten_at) DESC
      LIMIT $4`,
    [userId, from, minTimes, limit],
  );

  return rows.map((row) => ({
    name: row.name,
    grams: Math.round(Number(row.grams)),
    kcal_100g: Math.round(Number(row.kcal_100g)),
    times: Number(row.times),
  }));
}
