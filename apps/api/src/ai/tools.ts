import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type {
  ChatAction,
  ChatCard,
  Confidence,
  EntrySource,
  ExerciseEntry,
  FoodEntry,
  Meal,
  Progress,
} from '@ct/shared';
import { query } from '../db.ts';
import { addDays, type DayContext, inferMeal, localDateFor, resolveWhen } from '../time.ts';
import {
  createExerciseEntry,
  createFoodEntry,
  deleteExerciseEntry,
  deleteFoodEntry,
  getFoodEntry,
  logWeight,
  updateFoodEntry,
} from '../services/log.ts';
import { buildDaySummary, buildProgress } from '../services/summary.ts';
import { getUser, markOnboarded, missingProfileFields, updateUser } from '../services/user.ts';
import { addNote, forgetNote, MAX_NOTE_LENGTH } from '../services/notes.ts';
import { calculateTargets, setTargets, targetsForDate } from '../services/targets.ts';
import { latestWeight } from '../services/log.ts';

/**
 * §17 in the plan splits the AI into logging / analysis / coaching. That split is
 * expressed here as two groups of tools — writes and reads — over one agent,
 * rather than three prompts. Coaching falls out of the read tools plus the
 * system prompt.
 *
 * These run as an in-process MCP server: no subprocess, no network hop, direct
 * calls into the same services the REST routes use.
 */

export const SERVER_NAME = 'nutrition';

export interface ToolContext {
  userId: string;
  ctx: DayContext;
  now: Date;
  /** Set when the turn included a photo, so logged entries link back to it. */
  photoId: string | null;
  /** Collected during the turn and returned to the client for rendering. */
  actions: ChatAction[];
}

const itemShape = {
  name: z.string().describe('The food, as the user would say it. "Chicken breast", not "Poultry, broilers".'),
  quantity_g: z
    .number()
    .nullable()
    .default(null)
    .describe('Estimated weight in grams. Null for things not sensibly weighed, like a black coffee.'),
  quantity_desc: z
    .string()
    .nullable()
    .default(null)
    .describe('The assumption in plain words — "1 medium banana", "2 slices", "a large handful".'),
  kcal: z.number().describe('Estimated calories for this item at this quantity.'),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
};

const FoodItemSchema = z.object(itemShape);
type FoodItemInput = z.infer<typeof FoodItemSchema>;

const confidenceField = z
  .enum(['high', 'medium', 'low'])
  .describe(
    'high = packaged or weighed; medium = a normally described meal; low = a vague description or an unfamiliar restaurant dish.',
  );

const mealField = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

const whenField = z
  .string()
  .nullable()
  .default(null)
  .describe(
    'When it happened, if not now. Accepts an ISO timestamp or plain language ("yesterday 8pm", "this morning"). Null means now.',
  );

const ok = (payload: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
});
const fail = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

function toItems(items: FoodItemInput[]) {
  return items.map((i) => ({
    name: i.name,
    quantity_g: i.quantity_g,
    quantity_desc: i.quantity_desc,
    kcal: i.kcal,
    protein_g: i.protein_g,
    carbs_g: i.carbs_g,
    fat_g: i.fat_g,
  }));
}

function pickTotals(entry: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }) {
  return {
    kcal: Math.round(entry.kcal),
    protein_g: Math.round(entry.protein_g),
    carbs_g: Math.round(entry.carbs_g),
    fat_g: Math.round(entry.fat_g),
  };
}

/**
 * Cards are built here, from the entry the database just returned, rather than
 * from the arguments the model passed in. The two differ more often than it
 * looks — the meal is inferred from the clock when the model leaves it null,
 * quantities round, and an update returns the merged entry rather than the
 * patch — and a card showing the request instead of the result would be a
 * confident picture of something that did not happen.
 */
function foodCard(entry: FoodEntry): ChatCard {
  return {
    type: 'food',
    entry_id: entry.id,
    meal: entry.meal,
    description: entry.description,
    confidence: entry.confidence,
    items: entry.items.map((item) => ({
      name: item.name,
      quantity:
        item.quantity_desc ?? (item.quantity_g === null ? null : `${Math.round(item.quantity_g)}g`),
    })),
    ...pickTotals(entry),
  };
}

function exerciseCard(entry: ExerciseEntry): ChatCard {
  return {
    type: 'exercise',
    entry_id: entry.id,
    description: entry.description,
    confidence: entry.confidence,
    kcal_burned: Math.round(entry.kcal_burned),
    duration_min: entry.duration_min,
    distance_km: entry.distance_km,
  };
}

/** Turns a metric name into a plottable card, with real points behind it. */
function trendCard(
  metric: 'calories' | 'protein' | 'weight' | 'exercise',
  days: number,
  caption: string | null,
  progress: Progress,
): Extract<ChatCard, { type: 'trend' }> {
  const base = { type: 'trend' as const, metric, caption };
  const window = `last ${days} days`;

  switch (metric) {
    case 'weight':
      return {
        ...base,
        title: `Weight · ${window}`,
        unit: 'kg',
        target: null,
        average: progress.weight.average_7d_kg,
        series: progress.weight.series,
      };
    case 'protein':
      return {
        ...base,
        title: `Protein · ${window}`,
        unit: 'g',
        target: progress.protein.target_g,
        average: progress.protein.average_g,
        series: progress.protein.series,
      };
    case 'exercise':
      return {
        ...base,
        title: `Exercise · ${window}`,
        unit: 'kcal',
        target: null,
        average:
          progress.exercise.series.length === 0
            ? null
            : Math.round(progress.exercise.total_kcal / progress.exercise.series.length),
        series: progress.exercise.series,
      };
    case 'calories':
      return {
        ...base,
        title: `Calories · ${window}`,
        unit: 'kcal',
        target: progress.calories.target_kcal,
        average: progress.calories.average_kcal,
        series: progress.calories.series,
      };
  }
}

export interface ServerOptions {
  /**
   * Drop every write tool. The weekly review reads the same data through the
   * same code path as the journal, but must not be able to change it.
   */
  readOnly?: boolean;
}

export function buildNutritionServer(tc: ToolContext, options: ServerOptions = {}) {
  const logFood = tool(
    'log_food',
    'Record one meal in the nutrition log. Call it once per meal — a message describing breakfast and lunch is two calls. Break the meal into one item per distinct food so individual parts can be corrected later.',
    {
      description: z.string().describe('Short human label for the whole meal, e.g. "Chicken, rice and salad".'),
      meal: mealField.nullable().default(null).describe('Null to infer from the time it was eaten.'),
      when: whenField,
      items: z.array(FoodItemSchema).min(1),
      note: z.string().nullable().default(null).describe('Anything worth remembering about this entry.'),
      confidence: confidenceField,
    },
    async (args) => {
      const eatenAt = resolveWhen(args.when ?? undefined, tc.now, tc.ctx);
      const entry = await createFoodEntry({
        userId: tc.userId,
        meal: (args.meal as Meal | null) ?? inferMeal(eatenAt, tc.ctx.timezone),
        eatenAt,
        description: args.description,
        note: args.note,
        confidence: args.confidence as Confidence,
        source: (tc.photoId ? 'photo' : 'text') as EntrySource,
        photoId: tc.photoId,
        items: toItems(args.items),
        ctx: tc.ctx,
      });

      tc.actions.push({
        kind: 'food_logged',
        entry_id: entry.id,
        summary: `${entry.meal}: ${entry.description} — ${Math.round(entry.kcal)} kcal`,
        card: foodCard(entry),
      });

      const day = await buildDaySummary(tc.userId, entry.local_date);
      return ok({
        entry_id: entry.id,
        // Echoed back on every write. Without it the model cannot tell which day
        // it just wrote to, so a totals figure that belongs to another day reads
        // as today's and gets reported to the user as today's.
        local_date: entry.local_date,
        meal: entry.meal,
        logged: pickTotals(entry),
        day_totals: day.consumed,
        targets: day.targets,
        kcal_remaining: day.targets.kcal - day.consumed.kcal,
        protein_remaining: day.targets.protein_g - day.consumed.protein_g,
      });
    },
    { alwaysLoad: true },
  );

  const updateFood = tool(
    'update_food_entry',
    'Correct an entry that is already logged, e.g. when the user says "there was more rice" or "that was actually a large one". Replaces the item list, so send the full corrected set of items, not just the changed one. Use this instead of logging a compensating second entry.',
    {
      entry_id: z.string().describe('The id of the entry to correct.'),
      description: z.string().nullable().default(null),
      meal: mealField.nullable().default(null),
      when: whenField,
      items: z
        .array(FoodItemSchema)
        .nullable()
        .default(null)
        .describe('The complete corrected item list. Null to leave the food unchanged.'),
      confidence: confidenceField.nullable().default(null),
    },
    async (args) => {
      // Read first: a `when` that crosses a day boundary is the single most
      // damaging thing this tool can do silently, and the only way to say so is
      // to know where the entry started.
      const before = await getFoodEntry(tc.userId, args.entry_id);
      const entry = await updateFoodEntry(tc.userId, args.entry_id, {
        meal: (args.meal as Meal | null) ?? undefined,
        description: args.description ?? undefined,
        confidence: (args.confidence as Confidence | null) ?? undefined,
        eatenAt: args.when ? resolveWhen(args.when, tc.now, tc.ctx) : undefined,
        items: args.items ? toItems(args.items) : undefined,
        ctx: tc.ctx,
      });

      if (!entry) return fail('No entry with that id. Call get_day to list the ids for a date.');

      tc.actions.push({
        kind: 'food_updated',
        entry_id: entry.id,
        summary: `Updated ${entry.description} — now ${Math.round(entry.kcal)} kcal`,
        card: foodCard(entry),
      });

      const day = await buildDaySummary(tc.userId, entry.local_date);
      const movedFrom = before && before.local_date !== entry.local_date ? before.local_date : null;
      return ok({
        entry_id: entry.id,
        local_date: entry.local_date,
        ...(movedFrom
          ? {
              moved_from_date: movedFrom,
              warning: `This entry was moved from ${movedFrom} to ${entry.local_date}. Only leave it moved if the user asked for that entry to change day; otherwise move it back.`,
            }
          : {}),
        updated: pickTotals(entry),
        day_totals: day.consumed,
        kcal_remaining: day.targets.kcal - day.consumed.kcal,
      });
    },
    { alwaysLoad: true },
  );

  const logExercise = tool(
    'log_exercise',
    'Record an activity and its estimated burn. Exercise burn is inherently uncertain — prefer conservative estimates and set confidence to "low" unless the user gave real data from a device. For anything covering ground, fill in distance_km: it is the assumption the user is most likely to correct.',
    {
      description: z.string().describe('e.g. "5km run", "45 min weight training".'),
      duration_min: z.number().nullable().default(null),
      distance_km: z
        .number()
        .nullable()
        .default(null)
        .describe(
          'Distance covered, for a walk, run, ride or swim. Send the figure you actually based the burn on, including when you estimated it yourself from a described route. Null for activities that do not cover ground.',
        ),
      kcal_burned: z.number().describe('Estimated calories burned.'),
      when: whenField,
      confidence: confidenceField,
    },
    async (args) => {
      const entry = await createExerciseEntry({
        userId: tc.userId,
        description: args.description,
        performedAt: resolveWhen(args.when ?? undefined, tc.now, tc.ctx),
        durationMin: args.duration_min,
        distanceKm: args.distance_km,
        kcalBurned: args.kcal_burned,
        confidence: args.confidence as Confidence,
        source: 'text',
        ctx: tc.ctx,
      });

      tc.actions.push({
        kind: 'exercise_logged',
        entry_id: entry.id,
        summary: `${entry.description} — ~${Math.round(entry.kcal_burned)} kcal`,
        card: exerciseCard(entry),
      });
      return ok({
        entry_id: entry.id,
        local_date: entry.local_date,
        kcal_burned: entry.kcal_burned,
        distance_km: entry.distance_km,
      });
    },
    { alwaysLoad: true },
  );

  const logWeightTool = tool(
    'log_weight',
    'Record a bodyweight measurement. One per day — logging again for the same day replaces the earlier value.',
    {
      weight_kg: z.number(),
      when: whenField,
    },
    async (args) => {
      const entry = await logWeight(
        tc.userId,
        args.weight_kg,
        resolveWhen(args.when ?? undefined, tc.now, tc.ctx),
        tc.ctx,
      );
      // §12 again: a single weigh-in means very little on its own, so the card
      // shows it against the trend rather than as a number to react to.
      const trend = await buildProgress(tc.userId, tc.ctx, 30);
      tc.actions.push({
        kind: 'weight_logged',
        entry_id: entry.id,
        summary: `Weight ${entry.weight_kg} kg on ${entry.local_date}`,
        card: {
          type: 'weight',
          weight_kg: entry.weight_kg,
          change_7d_kg: trend.weight.change_7d_kg,
          series: trend.weight.series,
        },
      });
      return ok(entry);
    },
    { alwaysLoad: true },
  );

  const remember = tool(
    'remember',
    'Save a standing instruction the user gives you about how to log or how to talk to them — "don\'t log my commute walk", "I use a small plate", "skip the remaining-budget line". Only for things that apply from now on. A one-off correction to a meal is not a note: fix the entry instead, where the number itself is the record.',
    {
      note: z
        .string()
        .describe('The instruction in one short sentence, written so it still makes sense months later.'),
    },
    async (args) => {
      const saved = await addNote(tc.userId, args.note);
      if (!saved) return fail('An empty note has nothing to remember.');
      return ok({ remembered: saved.note, note_id: saved.id, max_length: MAX_NOTE_LENGTH });
    },
    { alwaysLoad: true },
  );

  const forget = tool(
    'forget',
    'Drop a standing instruction that no longer applies, by the id shown in your notes.',
    { note_id: z.string() },
    async (args) => {
      const gone = await forgetNote(tc.userId, args.note_id);
      if (!gone) return fail('No note with that id. The current notes are listed in your context.');
      return ok({ forgotten: true });
    },
    { alwaysLoad: true },
  );

  const deleteEntry = tool(
    'delete_entry',
    'Remove a logged entry the user says did not happen or was a mistake.',
    {
      entry_id: z.string(),
      kind: z.enum(['food', 'exercise']),
    },
    async (args) => {
      const existing = args.kind === 'food' ? await getFoodEntry(tc.userId, args.entry_id) : null;
      const deleted =
        args.kind === 'food'
          ? await deleteFoodEntry(tc.userId, args.entry_id)
          : await deleteExerciseEntry(tc.userId, args.entry_id);

      if (!deleted) return fail('No entry with that id. Call get_day to list the ids for a date.');

      tc.actions.push({
        kind: 'food_deleted',
        entry_id: args.entry_id,
        summary: `Removed ${existing?.description ?? 'entry'}`,
        // Nothing to draw: the entry it referred to no longer exists.
        card: null,
      });
      return ok({ deleted: true, local_date: existing?.local_date ?? null });
    },
    { alwaysLoad: true },
  );

  const getDay = tool(
    'get_day',
    'Read a full day: totals, targets, every entry with its id, and the weigh-in. Call this before correcting or deleting an entry whose id you do not already have. Defaults to today.',
    {
      date: z.string().nullable().default(null).describe('YYYY-MM-DD. Null for today.'),
      days_ago: z.number().nullable().default(null).describe('Alternative to date — 1 means yesterday.'),
    },
    async (args) => {
      const today = localDateFor(tc.now, tc.ctx);
      const date = args.date ?? (args.days_ago ? addDays(today, -args.days_ago) : today);
      const day = await buildDaySummary(tc.userId, date);
      return ok({
        local_date: day.local_date,
        consumed: day.consumed,
        targets: day.targets,
        burned_kcal: day.burned_kcal,
        weight_kg: day.weight?.weight_kg ?? null,
        food: day.food_entries.map((e) => ({
          id: e.id,
          meal: e.meal,
          description: e.description,
          kcal: Math.round(e.kcal),
          protein_g: Math.round(e.protein_g),
          confidence: e.confidence,
          items: e.items.map((i) => ({
            name: i.name,
            quantity_g: i.quantity_g,
            quantity_desc: i.quantity_desc,
            kcal: Math.round(i.kcal),
          })),
        })),
        exercise: day.exercise_entries.map((e) => ({
          id: e.id,
          description: e.description,
          duration_min: e.duration_min,
          distance_km: e.distance_km,
          kcal_burned: Math.round(e.kcal_burned),
        })),
      });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  const searchHistory = tool(
    'search_food_history',
    'Search past meals by keyword and/or meal slot. This is how you answer "what do I normally have for breakfast?" and how you resolve shorthand like "my usual" — look up what they actually ate before and reuse those quantities.',
    {
      query: z.string().nullable().default(null).describe('Matches the meal description and item names.'),
      meal: mealField.nullable().default(null),
      days_back: z.number().nullable().default(null).describe('How far back to search. Null means 90.'),
      limit: z.number().nullable().default(null).describe('Max entries to return. Null means 10.'),
    },
    async (args) => {
      const today = localDateFor(tc.now, tc.ctx);
      const from = addDays(today, -(args.days_back ?? 90));
      const limit = Math.min(args.limit ?? 10, 30);

      const rows = await query<any>(
        `SELECT e.id, e.meal, e.local_date, e.description,
                COALESCE(SUM(i.kcal), 0)      AS kcal,
                COALESCE(SUM(i.protein_g), 0) AS protein_g,
                json_agg(
                  json_build_object('name', i.name, 'quantity_g', i.quantity_g,
                                    'quantity_desc', i.quantity_desc, 'kcal', i.kcal)
                  ORDER BY i.position
                ) FILTER (WHERE i.id IS NOT NULL) AS items
           FROM food_entries e
           LEFT JOIN food_items i ON i.entry_id = e.id
          WHERE e.user_id = $1
            AND e.local_date >= $2
            AND ($3::text IS NULL OR e.meal = $3)
            AND ($4::text IS NULL OR e.description ILIKE '%' || $4 || '%'
                 OR EXISTS (SELECT 1 FROM food_items fi
                             WHERE fi.entry_id = e.id AND fi.name ILIKE '%' || $4 || '%'))
       GROUP BY e.id
       ORDER BY e.local_date DESC, e.eaten_at DESC
          LIMIT $5`,
        [tc.userId, from, args.meal, args.query, limit],
      );

      return ok({
        matches: rows.map((r) => ({
          id: r.id,
          date: r.local_date,
          meal: r.meal,
          description: r.description,
          kcal: Math.round(Number(r.kcal)),
          protein_g: Math.round(Number(r.protein_g)),
          items: r.items ?? [],
        })),
      });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  const setProfile = tool(
    'set_profile',
    'Save what you have learned about the user during setup: sex, date of birth, height, activity level, goal, target weight. Call it as soon as you learn a value — do not wait until you have them all. Targets are recalculated automatically each time. To record their current weight use log_weight instead; that is a measurement, not a profile field.',
    {
      sex: z.enum(['male', 'female']).nullable().default(null),
      birth_date: z.string().nullable().default(null).describe('YYYY-MM-DD. If they give only an age, convert it to an approximate birth date.'),
      height_cm: z.number().nullable().default(null).describe('Height in centimetres. Convert from feet/inches if needed.'),
      target_weight_kg: z.number().nullable().default(null).describe('Goal weight in kilograms.'),
      activity_level: z
        .enum(['sedentary', 'light', 'moderate', 'active', 'very_active'])
        .nullable()
        .default(null)
        .describe('sedentary = desk job; light = 1-3 sessions/week; moderate = 3-5; active = 6-7; very_active = physical job or twice daily.'),
      goal: z.enum(['lose', 'maintain', 'gain']).nullable().default(null),
      display_name: z.string().nullable().default(null).describe('What they want to be called.'),
      timezone: z.string().nullable().default(null).describe('IANA name, e.g. Europe/Sofia.'),
      day_start_hour: z
        .number()
        .nullable()
        .default(null)
        .describe('Hour their day rolls over, 0-12. Default 4 — only set it if they say something about late-night eating.'),
    },
    async (args) => {
      // Only forward the fields actually supplied; null means "not mentioned".
      const patch = Object.fromEntries(
        Object.entries(args).filter(([, value]) => value !== null),
      );
      const profile = await updateUser(tc.userId, patch);

      // Recalculate targets from whatever is now known, unless the user has
      // taken manual control of them.
      const today = localDateFor(tc.now, tc.ctx);
      const existing = await targetsForDate(tc.userId, today);
      if (!existing.is_custom) {
        const weight = await latestWeight(tc.userId);
        await setTargets(
          tc.userId,
          today,
          calculateTargets({
            sex: profile.sex,
            birth_date: profile.birth_date,
            height_cm: profile.height_cm,
            weight_kg: weight?.weight_kg ?? null,
            activity_level: profile.activity_level,
            goal: profile.goal,
          }),
          'set during conversation',
        );
      }

      const missing = missingProfileFields(profile);
      const weight = await latestWeight(tc.userId);
      if (missing.length === 0 && weight && !profile.is_setup_complete) {
        await markOnboarded(tc.userId);
      }

      const targets = await targetsForDate(tc.userId, today);
      return ok({
        saved: Object.keys(patch),
        still_missing: missing,
        current_weight_kg: weight?.weight_kg ?? null,
        needs_current_weight: !weight,
        targets,
      });
    },
    { alwaysLoad: true },
  );

  const getProgress = tool(
    'get_progress',
    'Read trends over a window: average calories and protein, weight trend, adherence, exercise volume. Use this for "am I on track?", "why have I not lost weight?", and anything about averages rather than a single day.',
    {
      days: z.number().nullable().default(null).describe('Window size in days. Null means 30.'),
    },
    async (args) => {
      const progress = await buildProgress(tc.userId, tc.ctx, Math.min(args.days ?? 30, 365));
      // Trim the per-day series: the model needs the aggregates, not 30 rows.
      return ok({
        weight: {
          current_kg: progress.weight.current_kg,
          average_7d_kg: progress.weight.average_7d_kg,
          change_7d_kg: progress.weight.change_7d_kg,
          change_since_start_kg: progress.weight.change_since_start_kg,
          to_target_kg: progress.weight.to_target_kg,
        },
        calories: {
          average_kcal: progress.calories.average_kcal,
          target_kcal: progress.calories.target_kcal,
        },
        protein: progress.protein,
        exercise: progress.exercise,
      });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  /**
   * The display tools.
   *
   * They take no data — only a choice of what to draw — and the series is read
   * from Postgres here. That asymmetry is the whole design: the model is good
   * at knowing when a picture answers better than a paragraph, and a model that
   * could also supply the points could draw a weight loss that never happened.
   * A wrong sentence invites argument; a wrong chart is just believed.
   */
  const showChart = tool(
    'show_chart',
    'Draw a chart in the conversation. Use it when the answer is about a shape over time — "am I on track?", "how has my weight moved?", "have I been eating more at weekends?" — where a trend line says it better than a sentence. The data is read from the log; you choose only the metric and the window. Say your point in words too: the chart supports the answer, it is not the answer. Do not call this for a single day or when the user asked something a number answers.',
    {
      metric: z
        .enum(['calories', 'protein', 'weight', 'exercise'])
        .describe('Which series to plot.'),
      days: z.number().nullable().default(null).describe('Window size in days. Null means 30.'),
      caption: z
        .string()
        .nullable()
        .default(null)
        .describe('One short line under the title saying what it shows. Null for none.'),
    },
    async (args) => {
      const days = Math.min(Math.max(args.days ?? 30, 7), 365);
      const progress = await buildProgress(tc.userId, tc.ctx, days);
      const card = trendCard(args.metric, days, args.caption, progress);

      tc.actions.push({
        kind: 'card_shown',
        entry_id: null,
        summary: card.title,
        card,
      });
      // Deliberately terse: the numbers went to the user, not to the model. The
      // model already has get_progress when it needs to reason about them.
      return ok({ shown: args.metric, days });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  const showDay = tool(
    'show_day',
    'Draw one day as a card — calories against target, macros, and any burn. Use it when the user asks how a day went, or after a log when the state of the day is the point rather than the meal. Do not call it after every single log; the app already shows the running total.',
    {
      date: z
        .string()
        .nullable()
        .default(null)
        .describe('YYYY-MM-DD. Null means today.'),
      caption: z.string().nullable().default(null).describe('One short line under the title.'),
    },
    async (args) => {
      const date = args.date ?? localDateFor(tc.now, tc.ctx);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('date must be YYYY-MM-DD.');

      const day = await buildDaySummary(tc.userId, date);
      tc.actions.push({
        kind: 'card_shown',
        entry_id: null,
        summary: `${date} — ${day.consumed.kcal} of ${day.targets.kcal} kcal`,
        card: {
          type: 'day',
          local_date: day.local_date,
          caption: args.caption,
          consumed: day.consumed,
          targets: day.targets,
          burned_kcal: day.burned_kcal,
        },
      });
      return ok({ shown: date });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  const reads = [getDay, searchHistory, getProgress];
  const shows = [showChart, showDay];
  const writes = [
    logFood,
    updateFood,
    logExercise,
    logWeightTool,
    deleteEntry,
    setProfile,
    // Notes outlive the session, which is the whole reason they exist — so they
    // are writes, and the read-only review agent cannot touch them.
    remember,
    forget,
  ];
  // The display tools stay out of the read-only set: the weekly review renders
  // as markdown on its own screen, where a chat card has nowhere to appear.
  const tools = options.readOnly ? reads : [...writes, ...reads, ...shows];

  return {
    server: createSdkMcpServer({ name: SERVER_NAME, version: '1.0.0', tools }),
    /** Fully-qualified names, so every tool is pre-approved and never prompts. */
    toolNames: tools.map((t) => `mcp__${SERVER_NAME}__${t.name}`),
    /** The definitions themselves, so a handler can be called without an agent. */
    tools,
  };
}
