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
 *
 * ---- What a log has to be worth before it speaks for them -------------------
 *
 * The first draft of this counted logs, and two of them made a habit. That is
 * the one thing this must not do, and it took real data to see why: almost
 * every portion in the log was put there by the model, so "the portion they
 * settled on" was usually just the model's own guess read back to it. Handing
 * that forward as a fact about the person closes a loop — the model reads its
 * old estimate, logs it again, and the median that was supposed to correct a
 * 1.36x overestimate quietly preserves it forever.
 *
 * So observations are weighted by where they came from rather than counted. A
 * portion the person actually settled — one they corrected by hand, or typed
 * in, or scanned off a packet — is worth three; a bare model estimate is worth
 * one. A food speaks for them at three: one confirmed log on its own, or three
 * unconfirmed ones. On production data that is not a tightening but a
 * loosening, and both directions are the point — the single weight somebody
 * bothered to fix now counts immediately, and two unexamined guesses no longer
 * count at all.
 */

/** What one observation of a portion is worth, by where the number came from. */
const CONFIRMED_WEIGHT = 3;
const ESTIMATED_WEIGHT = 1;

/**
 * How long after an entry was created its items may still be considered part of
 * the original write.
 *
 * `updateFoodEntry` deletes and re-inserts the item rows, so an item younger
 * than its entry is one somebody came back and changed — which is the strongest
 * signal in the whole table that a number is theirs rather than the model's. Ten
 * seconds is slack for the write itself, not for a correction: nobody re-reads
 * a card, decides the rice was wrong and says so inside ten seconds.
 */
const WRITE_SETTLES_SECONDS = 10;

export interface UsualPortion {
  /** The food, spelled the most recent way they spelled it. */
  name: string;
  /** The median grams across every time they logged it, weighted by provenance. */
  grams: number;
  /** The median energy density they settled on — their milk, not milk. */
  kcal_100g: number;
  /** How many logged items this was drawn from. */
  times: number;
  /**
   * Whether any of those were theirs rather than the model's — corrected by
   * hand, typed in, or scanned. The prompt says so, because a prior somebody
   * actually set deserves more of the model's deference than one it wrote
   * itself and is now being shown.
   */
  confirmed: boolean;
}

export interface UsualPortionOptions {
  /** How far back to look. Ninety days is a season of eating. */
  daysBack?: number;
  /**
   * How much a food's observations must be worth, together, before it counts as
   * a habit — see the weights above. Three, and it cannot be argued below that:
   * anything lower is two model estimates laundered into a fact about somebody.
   */
  minEvidence?: number;
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
 *
 * Ordered by the calories the food actually accounts for rather than by how
 * often it appears. The list is capped, the cap binds on real accounts, and a
 * slot spent on their usual 20g of ketchup is a slot not spent on their usual
 * plate of rice — which is where a 36% portion error turns into real calories.
 */
export async function usualPortions(
  userId: string,
  ctx: DayContext,
  options: UsualPortionOptions = {},
  today = localDateFor(new Date(), ctx),
): Promise<UsualPortion[]> {
  const from = addDays(today, -(options.daysBack ?? 90));
  const minEvidence = Math.max(options.minEvidence ?? CONFIRMED_WEIGHT, CONFIRMED_WEIGHT);
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);

  const rows = await query<{
    name: string;
    grams: string;
    kcal_100g: string;
    times: string;
    confirmed: boolean;
  }>(
    `WITH logged AS (
       SELECT i.name,
              -- Case and stray spacing are spelling, not identity: "Rice" on
              -- Monday and "rice" on Tuesday are the same food and have to land
              -- in the same bucket or neither reaches the threshold below.
              lower(btrim(regexp_replace(i.name, '\\s+', ' ', 'g'))) AS name_key,
              nullif(lower(btrim(i.canonical)), '')                  AS canonical,
              i.quantity_g::numeric                                  AS grams,
              i.kcal::numeric                                        AS kcal,
              e.eaten_at,
              CASE
                WHEN i.created_at > e.created_at + interval '${WRITE_SETTLES_SECONDS} seconds'
                  OR e.source IN ('manual', 'barcode')
                THEN ${CONFIRMED_WEIGHT}
                ELSE ${ESTIMATED_WEIGHT}
              END AS weight
         FROM food_items i
         JOIN food_entries e ON e.id = i.entry_id
        WHERE e.user_id = $1
          AND e.local_date >= $2
          AND i.quantity_g IS NOT NULL
          AND i.quantity_g > 0
     ),
     -- What each spelling turned out to mean, learned from the turns that said.
     -- Without this the column would only help going forward: a food logged
     -- forty times as "домати" and once as "домати" with canonical 'tomato'
     -- would split into a thin new bucket rather than collecting the history it
     -- belongs to. The most recent answer wins, so a mistaken key corrects
     -- itself the next time the food is logged.
     lexicon AS (
       SELECT name_key,
              (array_agg(canonical ORDER BY eaten_at DESC))[1] AS canonical
         FROM logged
        WHERE canonical IS NOT NULL
        GROUP BY name_key
     ),
     keyed AS (
       SELECT l.*, COALESCE(l.canonical, x.canonical, l.name_key) AS key
         FROM logged l
         LEFT JOIN lexicon x ON x.name_key = l.name_key
     ),
     -- A weighted median, done the only way percentile_cont understands one:
     -- an observation worth three is three observations. Cheap at this size,
     -- and it keeps the median a median rather than turning it into a mean with
     -- extra steps.
     weighted AS (
       SELECT k.key, k.grams, k.kcal
         FROM keyed k, generate_series(1, k.weight)
     ),
     stats AS (
       SELECT key,
              -- The most recent spelling, tidied the same way the key was.
              -- Grouping on a normalised key and then displaying a raw one puts
              -- "greek yoghurt " into a prompt line with its trailing space
              -- still on it.
              btrim(regexp_replace((array_agg(name ORDER BY eaten_at DESC))[1], '\\s+', ' ', 'g')) AS name,
              count(*)                                  AS times,
              sum(weight)                               AS evidence,
              sum(kcal)                                 AS kcal_total,
              bool_or(weight > ${ESTIMATED_WEIGHT})     AS confirmed,
              max(eaten_at)                             AS last_at
         FROM keyed
        GROUP BY key
     ),
     medians AS (
       SELECT key,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY grams)              AS grams,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY kcal / grams * 100) AS kcal_100g
         FROM weighted
        GROUP BY key
     )
     SELECT s.name, m.grams, m.kcal_100g, s.times, s.confirmed
       FROM stats s
       JOIN medians m ON m.key = s.key
      WHERE s.evidence >= $3
      ORDER BY s.kcal_total DESC, s.last_at DESC
      LIMIT $4`,
    [userId, from, minEvidence, limit],
  );

  return rows.map((row) => ({
    name: row.name,
    grams: Math.round(Number(row.grams)),
    kcal_100g: Math.round(Number(row.kcal_100g)),
    times: Number(row.times),
    confirmed: row.confirmed,
  }));
}
